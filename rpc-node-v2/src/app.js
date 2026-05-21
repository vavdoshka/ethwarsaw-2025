const path = require("node:path");
const fs = require("node:fs");
const { loadConfig } = require("./config");
const { StateStore } = require("./core/state-store");
const { Ledger } = require("./core/ledger");
const { Policy } = require("./core/policy");
const { Journal } = require("./core/journal");
const { Finalizer } = require("./core/finalizer");
const { resolveGenesisPath, loadGenesisFile, applyGenesisToState } = require("./core/genesis");
const { Executor } = require("./core/executor");
const { Metrics } = require("./core/metrics");
const { GoogleSheetsSyncWorker } = require("./sync/google-sheets-sync");
const { ExportCheckpoint } = require("./sync/export-checkpoint");
const { SqliteStore } = require("./db/sqlite-store");
const { createRpcMethods } = require("./rpc/methods");
const { createRpcRouter } = require("./rpc/router");
const { SystemContractRegistry } = require("./system-contracts/registry");
const bridgeContract = require("./system-contracts/bridge");
const airdropContract = require("./system-contracts/airdrop");
const { createLogger } = require("./utils/logger");

function createApp({ env = process.env, journalPath = null, genesisPath = null, syncClient = null, exportCheckpointPath = null } = {}) {
  const config = loadConfig(env);
  const logger = createLogger();
  const metrics = new Metrics();
  const resolvedJournalPath = journalPath || path.join(process.cwd(), "rpc-node-v2-data", "journal.jsonl");
  const sqliteDbPath = config.sqliteDbPath || path.join(path.dirname(resolvedJournalPath), "state.sqlite3");
  const sqliteStore = config.sqliteEnabled ? new SqliteStore(sqliteDbPath, { blockTxsPerBlock: config.blockTxsPerBlock }) : null;
  const state = new StateStore();
  const resolvedGenesisPath = resolveGenesisPath(config, genesisPath);
  const genesis = loadGenesisFile(resolvedGenesisPath);
  logger.info({
    event: "startup.genesis",
    path: resolvedGenesisPath,
    found: Boolean(genesis),
    accounts: Array.isArray(genesis && genesis.accounts) ? genesis.accounts.length : 0
  });
  if (sqliteStore) {
    sqliteStore.applyGenesis(genesis);
  } else {
    applyGenesisToState(state, genesis);
  }
  if (syncClient && typeof syncClient.writeGenesis === "function") {
    const genesisRows = Array.isArray(genesis && genesis.accounts)
      ? genesis.accounts.map((account) => ({
        address: account.address,
        balance: String(account.balance ?? "0"),
        nonce: Number.parseInt(String(account.nonce ?? 0), 10)
      }))
      : [];
    Promise.resolve(syncClient.writeGenesis(genesisRows))
      .catch((error) => logger.warn(JSON.stringify({ event: "startup.genesis.sync.failed", error: String(error.message || error) })));
  }
  const ledger = new Ledger(state);
  const policy = new Policy({
    bridgeOperatorAddress: config.bridgeOperatorAddress
  });
  const journal = new Journal(resolvedJournalPath);
  const finalizer = new Finalizer(state, {
    onSynced: (txHash) => {
      if (!sqliteStore) return;
      const tx = state.getTransaction(txHash);
      sqliteStore.markTxSynced(txHash, tx ? tx.blockNumber : null);
    }
  });
  if (sqliteStore) {
    sqliteStore.loadStateInto(state, finalizer);
    logger.info({
      event: "startup.sqlite",
      path: sqliteDbPath,
      exists: fs.existsSync(sqliteDbPath),
      sizeBytes: fs.existsSync(sqliteDbPath) ? fs.statSync(sqliteDbPath).size : 0,
      status: sqliteStore.getStatus()
    });
  }
  const executor = new Executor({ stateStore: state, ledger, policy, journal, finalizer, sqliteStore, metrics, logger });
  if (!sqliteStore) {
    executor.recoverFromJournal();
  }
  const checkpointPath = exportCheckpointPath || path.join(path.dirname(resolvedJournalPath), "export-checkpoint.json");
  const checkpoint = syncClient ? new ExportCheckpoint(checkpointPath) : null;
  const syncWorker = syncClient ? new GoogleSheetsSyncWorker({ finalizer, state, syncClient, checkpoint, sqliteStore, metrics, logger }) : null;

  const contracts = new SystemContractRegistry({
    contracts: [bridgeContract, airdropContract]
  });
  const methods = createRpcMethods({ config, state, executor, contracts, sqliteStore });
  const router = createRpcRouter(methods);
  logger.info({
    event: "startup.config",
    chainId: config.chainId,
    port: config.port,
    sqliteEnabled: config.sqliteEnabled,
    syncIntervalMs: config.syncIntervalMs,
    blockTxsPerBlock: config.blockTxsPerBlock
  });

  return {
    config,
    sqliteStore,
    state,
    ledger,
    policy,
    journal,
    finalizer,
    checkpoint,
    syncWorker,
    executor,
    contracts,
    logger,
    metrics,
    methods,
    router
  };
}

module.exports = {
  createApp
};
