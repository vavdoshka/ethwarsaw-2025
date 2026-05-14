const fs = require('node:fs');
const path = require('node:path');
const { ethers } = require('ethers');
const { createServer } = require('../../src/rpc/server');
const { GoogleSheetsSyncClient } = require('../../src/sync/clients/google-sheets-sync-client');

function nowMs() {
  return Number(process.hrtime.bigint() / 1000000n);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveDefaultCredentialPath() {
  return path.resolve(process.cwd(), '../rpc-node/cred/crypto-bots-409100-5febfadd93bc.json');
}

async function runSingle({ txCount, spreadsheetId, credentialFilePath, blindAppend, runtimeDir }) {
  const suffix = `${Date.now().toString().slice(-6)}_${txCount}`;
  const sheetName = `test_limit_${suffix}`;
  const journalPath = path.join(runtimeDir, `journal-${suffix}.jsonl`);
  const genesisPath = path.join(runtimeDir, `genesis-${suffix}.json`);

  const sender = ethers.Wallet.createRandom();
  const recipient = ethers.Wallet.createRandom();

  fs.writeFileSync(genesisPath, JSON.stringify({
    accounts: [{ address: sender.address, balance: String(1000000000000000000n), nonce: 0 }]
  }));

  const syncClient = new GoogleSheetsSyncClient({
    spreadsheetId,
    credentialFilePath,
    sheetName,
    blindAppend
  });
  await syncClient.initialize();

  const { app, context } = createServer({
    journalPath,
    genesisPath,
    syncClient,
    env: { CHAIN_ID: '12345', PORT: '8545' }
  });

  const httpServer = await new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });

  try {
    const port = httpServer.address().port;
    const provider = new ethers.JsonRpcProvider(`http://127.0.0.1:${port}`);

    const rpcStartMs = nowMs();
    for (let nonce = 0; nonce < txCount; nonce += 1) {
      const signed = await sender.signTransaction({
        to: recipient.address,
        value: 1n,
        nonce,
        gasLimit: 21000,
        gasPrice: 1n,
        chainId: 12345
      });
      await provider.send('eth_sendRawTransaction', [signed]);
    }
    const rpcElapsedMs = nowMs() - rpcStartMs;

    const syncStartMs = nowMs();
    const syncResult = await context.syncWorker.flushWithRetry(5);
    const syncElapsedMs = nowMs() - syncStartMs;

    const rpcTps = txCount / (rpcElapsedMs / 1000);
    const syncTps = syncResult.flushed / (syncElapsedMs / 1000);

    return {
      ok: true,
      sheetName,
      txCount,
      rpcElapsedMs,
      syncElapsedMs,
      syncFlushed: syncResult.flushed,
      rpcTps,
      syncTps,
      rpcTpm: rpcTps * 60,
      syncTpm: syncTps * 60
    };
  } finally {
    await new Promise((resolve, reject) => {
      httpServer.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function main() {
  if (process.env.RUN_LIVE_SHEETS_SWEEP !== '1') return;

  const spreadsheetId = process.env.GOOGLE_SHEET_ID || '1YNmFMqM7s2tcrJf5LXAtauy0EeDenr6KKC-7RJSWgQA';
  const credentialFilePath = process.env.GOOGLE_APPLICATION_CREDENTIALS || resolveDefaultCredentialPath();
  const blindAppend = process.env.BENCH_BLIND_APPEND !== '0';
  const pauseMs = Number.parseInt(process.env.SWEEP_PAUSE_MS || '3000', 10);
  const sizesRaw = process.env.SWEEP_BATCH_SIZES || '10,20,50,100,200,300';
  const batchSizes = sizesRaw.split(',').map((x) => Number.parseInt(x.trim(), 10)).filter((x) => Number.isInteger(x) && x > 0);

  const runtimeDir = path.resolve(process.cwd(), '.tmp-live-sweep');
  fs.mkdirSync(runtimeDir, { recursive: true });

  console.log('--- LIVE SHEETS SWEEP ---');
  console.log('spreadsheetId=', spreadsheetId);
  console.log('blindAppend=', blindAppend);
  console.log('batchSizes=', batchSizes.join(','));

  const results = [];

  for (const txCount of batchSizes) {
    try {
      const result = await runSingle({ txCount, spreadsheetId, credentialFilePath, blindAppend, runtimeDir });
      results.push(result);
      console.log(`[ok] txCount=${txCount} sheet=${result.sheetName} rpcTps=${result.rpcTps.toFixed(2)} syncTps=${result.syncTps.toFixed(2)} syncTpm=${result.syncTpm.toFixed(2)}`);
      await sleep(pauseMs);
    } catch (error) {
      const fail = {
        ok: false,
        txCount,
        error: error.message
      };
      results.push(fail);
      console.log(`[fail] txCount=${txCount} error=${error.message}`);
      break;
    }
  }

  const okResults = results.filter((r) => r.ok);
  const bestSync = okResults.reduce((best, current) => (!best || current.syncTps > best.syncTps ? current : best), null);

  console.log('--- SWEEP SUMMARY ---');
  for (const row of results) {
    if (row.ok) {
      console.log(`tx=${row.txCount} rpcTps=${row.rpcTps.toFixed(2)} syncTps=${row.syncTps.toFixed(2)} syncTpm=${row.syncTpm.toFixed(2)} sheet=${row.sheetName}`);
    } else {
      console.log(`tx=${row.txCount} FAILED error=${row.error}`);
    }
  }
  if (bestSync) {
    console.log(`BEST syncTps=${bestSync.syncTps.toFixed(2)} at txCount=${bestSync.txCount} (sheet=${bestSync.sheetName})`);
  }
}

main().catch((error) => {
  console.error('Live sheets sweep failed:', error.message);
  process.exit(1);
});
