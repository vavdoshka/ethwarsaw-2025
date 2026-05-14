const fs = require('node:fs');
const path = require('node:path');
const { ethers } = require('ethers');
const { createServer } = require('../../src/rpc/server');
const { GoogleSheetsSyncClient } = require('../../src/sync/clients/google-sheets-sync-client');

function nowMs() {
  return Number(process.hrtime.bigint() / 1000000n);
}

function resolveDefaultCredentialPath() {
  return path.resolve(process.cwd(), '../rpc-node/cred/crypto-bots-409100-5febfadd93bc.json');
}

async function main() {
  if (process.env.RUN_LIVE_SHEETS_BENCHMARK !== '1') {
    return;
  }
  const spreadsheetId = process.env.GOOGLE_SHEET_ID || '1YNmFMqM7s2tcrJf5LXAtauy0EeDenr6KKC-7RJSWgQA';
  const credentialFilePath = process.env.GOOGLE_APPLICATION_CREDENTIALS || resolveDefaultCredentialPath();
  const tabSuffix = process.env.TEST_TAB_SUFFIX || Date.now().toString().slice(-6);
  const sheetName = `test_${tabSuffix}`;
  const txCount = Number.parseInt(process.env.BENCH_TX_COUNT || '50', 10);
  const blindAppend = process.env.BENCH_BLIND_APPEND === '1';

  const runtimeDir = path.resolve(process.cwd(), '.tmp-live-bench');
  fs.mkdirSync(runtimeDir, { recursive: true });
  const journalPath = path.join(runtimeDir, `journal-${sheetName}.jsonl`);
  const genesisPath = path.join(runtimeDir, `genesis-${sheetName}.json`);

  const sender = ethers.Wallet.createRandom();
  const recipient = ethers.Wallet.createRandom();

  fs.writeFileSync(genesisPath, JSON.stringify({
    accounts: [
      { address: sender.address, balance: String(1000000000000000000n), nonce: 0 }
    ]
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
    const rpcTpm = rpcTps * 60;
    const syncTps = syncResult.flushed / (syncElapsedMs / 1000);
    const syncTpm = syncTps * 60;

    console.log('--- LIVE SHEETS BENCHMARK ---');
    console.log('spreadsheetId=', spreadsheetId);
    console.log('sheetName=', sheetName);
    console.log('txCount=', txCount);
    console.log('blindAppend=', blindAppend);
    console.log('rpcElapsedMs=', rpcElapsedMs, 'rpcTps=', rpcTps.toFixed(2), 'rpcTpm=', rpcTpm.toFixed(2));
    console.log('syncElapsedMs=', syncElapsedMs, 'syncFlushed=', syncResult.flushed, 'syncTps=', syncTps.toFixed(2), 'syncTpm=', syncTpm.toFixed(2));

    if (syncResult.flushed !== txCount) {
      throw new Error(`Expected ${txCount} synced tx, got ${syncResult.flushed}`);
    }
  } finally {
    await new Promise((resolve, reject) => {
      httpServer.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

main().catch((error) => {
  console.error('Live sheets benchmark failed:', error.message);
  process.exit(1);
});
