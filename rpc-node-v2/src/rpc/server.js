const express = require("express");
const { createApp } = require("../app");
const { loadConfig } = require("../config");
const { GoogleSheetsSyncClient } = require("../sync/clients/google-sheets-sync-client");

function createServer(options = {}) {
  const appContext = createApp(options);
  const app = express();
  app.use(express.json());
  let isDraining = false;
  let inFlightWrites = 0;

  const writeMethods = new Set(["eth_sendRawTransaction", "eth_sendTransaction"]);
  const isWriteRequest = (payload) => writeMethods.has(payload?.method);

  async function waitForWritesToDrain(timeoutMs = 15000) {
    const startedAt = Date.now();
    while (inFlightWrites > 0) {
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error("Timed out while waiting for in-flight writes to drain");
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  async function shutdown({ flushSync = true } = {}) {
    isDraining = true;
    await waitForWritesToDrain();
    if (flushSync && appContext.syncWorker) {
      await appContext.syncWorker.flushWithRetry(5);
    }
  }

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      chainId: appContext.config.chainId,
      latestBlockNumber: appContext.state.latestBlockNumber
    });
  });

  app.get("/status", (_req, res) => {
    const metrics = appContext.metrics ? appContext.metrics.snapshot() : {};
    if (appContext.sqliteStore) {
      const status = appContext.sqliteStore.getStatus();
      return res.json({
        ok: true,
        chainId: appContext.config.chainId,
        ...status,
        metrics
      });
    }
    return res.json({
      ok: true,
      chainId: appContext.config.chainId,
      latestBlockNumber: appContext.state.latestBlockNumber,
      acceptedTxCount: appContext.state.transactions.size,
      pendingSyncJobs: appContext.finalizer.getPendingTxHashes().length,
      inFlightSyncJobs: 0,
      deadLetterJobs: 0,
      lastSyncedBlock: 0,
      lastExportedBlock: 0,
      syncLagBlocks: 0,
      metrics
    });
  });

  app.post("/", async (req, res) => {
    const payloads = Array.isArray(req.body) ? req.body : [req.body];
    const hasWrite = payloads.some((payload) => isWriteRequest(payload));
    if (isDraining && hasWrite) {
      if (Array.isArray(req.body)) {
        return res.json(payloads.map((payload) => {
          if (isWriteRequest(payload)) {
            return {
              jsonrpc: "2.0",
              error: { code: -32000, message: "Server is draining" },
              id: payload?.id ?? null
            };
          }
          return {
            jsonrpc: "2.0",
            error: { code: -32000, message: "Batch contains blocked write method during drain" },
            id: payload?.id ?? null
          };
        }));
      }
      return res.json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Server is draining" },
        id: req.body?.id ?? null
      });
    }

    if (hasWrite) inFlightWrites += 1;
    const startedAt = Date.now();
    try {
      if (Array.isArray(req.body)) {
        const responses = await Promise.all(req.body.map((item) => appContext.router.handleRequest(item)));
        appContext.logger.info({
          event: "rpc.batch",
          size: payloads.length,
          methods: payloads.map((p) => p?.method || null),
          responses: responses.map((response) => ({
            id: response.id ?? null,
            ok: !response.error,
            error: response.error || null,
            result: response.result ?? null
          })),
          durationMs: Date.now() - startedAt
        });
        return res.json(responses);
      }
      const response = await appContext.router.handleRequest(req.body);
      appContext.logger.info({
        event: "rpc.call",
        method: req.body?.method || null,
        id: req.body?.id ?? null,
        ok: !response.error,
        errorCode: response.error ? response.error.code : null,
        response: {
          result: response.result ?? null,
          error: response.error || null
        },
        durationMs: Date.now() - startedAt
      });
      return res.json(response);
    } finally {
      if (hasWrite) inFlightWrites -= 1;
    }
  });

  appContext.shutdown = shutdown;
  appContext.getDrainState = () => ({ isDraining, inFlightWrites });

  return { app, context: appContext };
}

if (require.main === module) {
  (async () => {
    const config = loadConfig(process.env);
    let syncClient = null;
    let syncInitInfo = null;
    if (config.googleSheetId && config.googleCredentialsPath && config.googleSheetName) {
      console.log(JSON.stringify({
        ts: new Date().toISOString(),
        level: "info",
        event: "startup.sheets.init.start",
        spreadsheetId: config.googleSheetId,
        sheetName: config.googleSheetName,
        resetOnStart: config.googleSheetReset
      }));
      syncClient = new GoogleSheetsSyncClient({
        spreadsheetId: config.googleSheetId,
        credentialFilePath: config.googleCredentialsPath,
        sheetName: config.googleSheetName,
        blindAppend: config.googleBlindAppend,
        resetOnStart: config.googleSheetReset
      });
      syncInitInfo = await syncClient.initialize();
      console.log(JSON.stringify({
        ts: new Date().toISOString(),
        level: "info",
        event: "startup.sheets.init.done",
        ...syncInitInfo
      }));
    }

    const { app, context } = createServer({ syncClient });
    if (syncInitInfo) {
      context.logger.info({
        event: "startup.sheets.bound",
        spreadsheetId: syncInitInfo.spreadsheetId,
        managedSheets: syncInitInfo.managedSheets,
        resetApplied: syncInitInfo.resetApplied,
        resetInfo: syncInitInfo.resetInfo
      });
    }

    if (syncClient && config.googleSheetReset) {
      const txRows = context.sqliteStore ? context.sqliteStore.getAllTransactions() : context.state.exportSnapshot().transactions.map(([, tx]) => tx);
      if (txRows.length > 0 && typeof syncClient.writeTransactions === "function") {
        await syncClient.writeTransactions(txRows);
      }
      if (context.syncWorker) {
        await context.syncWorker.syncStateViews();
      }
      context.logger.info({
        event: "startup.sheets.backfill",
        txRows: txRows.length,
        status: context.sqliteStore ? context.sqliteStore.getStatus() : null
      });
    }

    let syncTimer = null;
    let syncRunning = false;
    if (context.syncWorker) {
      syncTimer = setInterval(async () => {
        if (syncRunning) return;
        syncRunning = true;
        try {
          const before = context.sqliteStore ? context.sqliteStore.getStatus() : null;
          const result = await context.syncWorker.flushWithRetry(5);
          const after = context.sqliteStore ? context.sqliteStore.getStatus() : null;
          context.logger.info({
            event: "sync.interval.tick",
            flushed: result ? result.flushed : 0,
            statusBefore: before,
            statusAfter: after
          });
        } catch (error) {
          context.logger.warn({
            event: "sync.interval.failed",
            error: String(error.message || error)
          });
        } finally {
          syncRunning = false;
        }
      }, context.config.syncIntervalMs);
    }

    app.listen(context.config.port, () => {
      context.logger.info({
        event: "startup.server",
        message: "rpc-node-v2 listening",
        port: context.config.port
      });
    });
    const stop = async () => {
      if (syncTimer) clearInterval(syncTimer);
      await context.shutdown({ flushSync: true });
      process.exit(0);
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  })().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  createServer
};
