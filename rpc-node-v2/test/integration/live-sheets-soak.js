const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("ethers");
const { createServer } = require("../../src/rpc/server");
const { GoogleSheetsSyncClient } = require("../../src/sync/clients/google-sheets-sync-client");

function resolveDefaultCredentialPath() {
  return path.resolve(process.cwd(), "../rpc-node/cred/crypto-bots-409100-5febfadd93bc.json");
}

function isQuotaError(error) {
  return /quota|rate|throttl|429/i.test(String(error && error.message ? error.message : error));
}

async function main() {
  if (process.env.RUN_LIVE_SHEETS_SOAK !== "1") return;

  const spreadsheetId = process.env.GOOGLE_SHEET_ID || "1YNmFMqM7s2tcrJf5LXAtauy0EeDenr6KKC-7RJSWgQA";
  const credentialFilePath = process.env.GOOGLE_APPLICATION_CREDENTIALS || resolveDefaultCredentialPath();
  const durationMs = Number.parseInt(process.env.LIVE_SOAK_DURATION_MS || "60000", 10);
  const batchSize = Number.parseInt(process.env.LIVE_SOAK_BATCH_SIZE || "50", 10);
  const sheetName = `test_soak_${Date.now().toString().slice(-6)}`;

  const runtimeDir = path.resolve(process.cwd(), ".tmp-live-soak");
  fs.mkdirSync(runtimeDir, { recursive: true });
  const journalPath = path.join(runtimeDir, `journal-${sheetName}.jsonl`);
  const genesisPath = path.join(runtimeDir, `genesis-${sheetName}.json`);
  const dbPath = path.join(runtimeDir, `state-${sheetName}.sqlite3`);

  const sender = ethers.Wallet.createRandom();
  const recipient = ethers.Wallet.createRandom();
  fs.writeFileSync(genesisPath, JSON.stringify({
    accounts: [{ address: sender.address, balance: String(10_000_000_000n), nonce: 0 }]
  }));

  const syncClient = new GoogleSheetsSyncClient({
    spreadsheetId,
    credentialFilePath,
    sheetName,
    blindAppend: true
  });
  await syncClient.initialize();

  const { app, context } = createServer({
    journalPath,
    genesisPath,
    syncClient,
    env: { CHAIN_ID: "12345", PORT: "8545", SQLITE_ENABLED: "1", SQLITE_DB_PATH: dbPath }
  });

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  try {
    const provider = new ethers.JsonRpcProvider(`http://127.0.0.1:${server.address().port}`);
    const startedAt = Date.now();
    let nonce = 0;
    let accepted = 0;
    let synced = 0;
    let firstQuota = null;

    while (Date.now() - startedAt < durationMs) {
      for (let i = 0; i < batchSize; i += 1) {
        const signed = await sender.signTransaction({
          to: recipient.address,
          value: 1n,
          nonce,
          gasLimit: 21000,
          gasPrice: 1n,
          chainId: 12345
        });
        await provider.send("eth_sendRawTransaction", [signed]);
        nonce += 1;
        accepted += 1;
      }

      try {
        const flush = await context.syncWorker.flushWithRetry(2);
        synced += flush.flushed;
      } catch (error) {
        if (isQuotaError(error)) {
          firstQuota = String(error.message || error);
          break;
        }
        throw error;
      }
    }

    console.log("[live-soak] sheet=", sheetName, "accepted=", accepted, "synced=", synced, "durationMs=", Date.now() - startedAt);
    if (firstQuota) {
      console.log("[live-soak] firstQuotaFailure=", firstQuota);
      return;
    }
    console.log("[live-soak] no quota failure observed");
  } finally {
    await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
}

main().catch((error) => {
  console.error("Live sheets soak failed:", error.message);
  process.exit(1);
});
