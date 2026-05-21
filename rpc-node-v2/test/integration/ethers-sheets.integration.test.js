const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ethers } = require('ethers');
const { createServer } = require('../../src/rpc/server');
const { InMemorySheetsClient } = require('../../src/sync/clients/in-memory-sheets-client');
const { makeTempDir } = require('../helpers');

function nowMs() {
  return Number(process.hrtime.bigint() / 1000000n);
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

test('integration: ethers user tx syncs to sheets adapter', async () => {
  const dir = makeTempDir();
  const journalPath = path.join(dir, 'journal.jsonl');
  const genesisPath = path.join(dir, 'genesis.json');
  const syncClient = new InMemorySheetsClient();

  const sender = ethers.Wallet.createRandom();
  const recipient = ethers.Wallet.createRandom();

  fs.writeFileSync(genesisPath, JSON.stringify({
    accounts: [
      { address: sender.address, balance: '1000000000000000000', nonce: 0 }
    ]
  }));

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

    const txCount = 10;
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

    assert.equal(context.state.getBalance(recipient.address), 10n);
    const flushResult = await context.syncWorker.flushOnce();
    assert.equal(flushResult.flushed, txCount);
    assert.equal(syncClient.getTransactionsCount(), txCount);
    assert.ok(syncClient.getGenesisCount() >= 1);
    assert.ok(syncClient.getBalancesCount() >= 1);

    for (const txHash of context.finalizer.getPendingTxHashes()) {
      assert.fail(`Unexpected pending tx after sync: ${txHash}`);
    }
  } finally {
    await new Promise((resolve, reject) => {
      httpServer.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test('integration: throughput measurement for rpc + sheets sync path', async () => {
  const dir = makeTempDir();
  const journalPath = path.join(dir, 'journal.jsonl');
  const genesisPath = path.join(dir, 'genesis.json');
  const syncClient = new InMemorySheetsClient();

  const sender = ethers.Wallet.createRandom();
  const recipient = ethers.Wallet.createRandom();

  const txCount = 100;
  fs.writeFileSync(genesisPath, JSON.stringify({
    accounts: [
      { address: sender.address, balance: String(1000000n), nonce: 0 }
    ]
  }));

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
    const syncResult = await context.syncWorker.flushOnce();
    const syncElapsedMs = nowMs() - syncStartMs;

    assert.equal(syncResult.flushed, txCount);
    assert.equal(syncClient.getTransactionsCount(), txCount);

    const rpcTps = txCount / (rpcElapsedMs / 1000);
    const syncWritesPerSec = txCount / (syncElapsedMs / 1000 || 1);
    const rpcTpm = rpcTps * 60;
    const syncWritesPerMin = syncWritesPerSec * 60;

    console.log('[throughput] txCount=', txCount);
    console.log('[throughput] rpcElapsedMs=', rpcElapsedMs, 'rpcTps=', rpcTps.toFixed(2), 'rpcTpm=', rpcTpm.toFixed(2));
    console.log('[throughput] syncElapsedMs=', syncElapsedMs, 'syncWritesPerSec=', syncWritesPerSec.toFixed(2), 'syncWritesPerMin=', syncWritesPerMin.toFixed(2));

    assert.ok(rpcTps > 0);
    assert.ok(syncWritesPerSec > 0);
  } finally {
    await new Promise((resolve, reject) => {
      httpServer.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test('integration: synced sheet rows carry block numbers and match synced checkpoint', async () => {
  const dir = makeTempDir();
  const journalPath = path.join(dir, 'journal.jsonl');
  const genesisPath = path.join(dir, 'genesis.json');
  const dbPath = path.join(dir, 'state.sqlite3');
  const syncClient = new InMemorySheetsClient();

  const sender = ethers.Wallet.createRandom();
  const recipient = ethers.Wallet.createRandom();

  const txCount = 12;
  fs.writeFileSync(genesisPath, JSON.stringify({
    accounts: [
      { address: sender.address, balance: '1000000000000000000', nonce: 0 }
    ]
  }));

  const { app, context } = createServer({
    journalPath,
    genesisPath,
    syncClient,
    env: { CHAIN_ID: '12345', PORT: '8545', SQLITE_ENABLED: '1', SQLITE_DB_PATH: dbPath }
  });

  const httpServer = await new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });

  try {
    const port = httpServer.address().port;
    const provider = new ethers.JsonRpcProvider(`http://127.0.0.1:${port}`);

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

    const flushResult = await context.syncWorker.flushOnce();
    assert.equal(flushResult.flushed, txCount);

    const rows = syncClient.getAllTransactions();
    assert.equal(rows.length, txCount);
    const blockNumbers = rows.map((row) => Number.parseInt(String(row.blockNumber), 10));
    assert.ok(blockNumbers.every((num) => Number.isInteger(num) && num > 0));

    const maxSyncedBlock = Math.max(...blockNumbers);
    const minSyncedBlock = Math.min(...blockNumbers);
    assert.equal(minSyncedBlock, 1);
    assert.equal(maxSyncedBlock, txCount);

    const status = context.sqliteStore.getStatus();
    assert.equal(status.lastSyncedBlock, maxSyncedBlock);
    assert.equal(status.latestBlockNumber, txCount);
    assert.equal(status.syncLagBlocks, 0);
  } finally {
    await new Promise((resolve, reject) => {
      httpServer.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test('integration: benchmark rpc ingest, sheets flush throughput, and e2e sync latency', async () => {
  const dir = makeTempDir();
  const journalPath = path.join(dir, 'journal.jsonl');
  const genesisPath = path.join(dir, 'genesis.json');
  const dbPath = path.join(dir, 'state.sqlite3');
  const syncClient = new InMemorySheetsClient();

  const sender = ethers.Wallet.createRandom();
  const recipient = ethers.Wallet.createRandom();
  const txCount = Number.parseInt(process.env.BENCH_TX_COUNT || '120', 10);

  fs.writeFileSync(genesisPath, JSON.stringify({
    accounts: [{ address: sender.address, balance: String(10_000_000n), nonce: 0 }]
  }));

  const { app, context } = createServer({
    journalPath,
    genesisPath,
    syncClient,
    env: {
      CHAIN_ID: '12345',
      PORT: '8545',
      SQLITE_ENABLED: '1',
      SQLITE_DB_PATH: dbPath,
      BLOCK_TXS_PER_BLOCK: '20'
    }
  });

  const httpServer = await new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });

  try {
    const port = httpServer.address().port;
    const provider = new ethers.JsonRpcProvider(`http://127.0.0.1:${port}`);
    const acceptedAt = new Map();

    let flushedTotal = 0;
    let flushElapsedMs = 0;
    let flushing = true;
    const flusher = (async () => {
      while (flushing) {
        const start = nowMs();
        const result = await context.syncWorker.flushOnce();
        flushElapsedMs += (nowMs() - start);
        flushedTotal += result.flushed;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    })();

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
      const txHash = await provider.send('eth_sendRawTransaction', [signed]);
      acceptedAt.set(String(txHash).toLowerCase(), Date.now());
    }
    const rpcElapsedMs = nowMs() - rpcStartMs;

    const syncStartMs = nowMs();
    let synced = 0;
    while (synced < txCount) {
      synced = 0;
      for (const txHash of acceptedAt.keys()) {
        if (context.state.getSyncStatus(txHash).status === 'synced') synced += 1;
      }
      if (synced < txCount) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    const e2eElapsedMs = nowMs() - syncStartMs;
    flushing = false;
    await flusher;

    const latencies = [];
    for (const [txHash, acceptedMs] of acceptedAt.entries()) {
      const syncStatus = context.state.getSyncStatus(txHash);
      assert.equal(syncStatus.status, 'synced');
      const syncedMs = Date.parse(syncStatus.syncedAt);
      latencies.push(Math.max(0, syncedMs - acceptedMs));
    }
    latencies.sort((a, b) => a - b);

    const rpcTps = txCount / (rpcElapsedMs / 1000);
    const rpcTpm = rpcTps * 60;
    const flushTps = flushedTotal / Math.max(flushElapsedMs / 1000, 0.001);
    const flushTpm = flushTps * 60;

    const p50 = percentile(latencies, 50);
    const p95 = percentile(latencies, 95);
    const p99 = percentile(latencies, 99);

    console.log('[benchmark] txCount=', txCount);
    console.log('[benchmark] rpcElapsedMs=', rpcElapsedMs, 'rpcTps=', rpcTps.toFixed(2), 'rpcTpm=', rpcTpm.toFixed(2));
    console.log('[benchmark] flushElapsedMs=', flushElapsedMs, 'flushed=', flushedTotal, 'flushTps=', flushTps.toFixed(2), 'flushTpm=', flushTpm.toFixed(2));
    console.log('[benchmark] syncConvergeMs=', e2eElapsedMs, 'latencyMs_p50=', p50, 'latencyMs_p95=', p95, 'latencyMs_p99=', p99);

    assert.equal(syncClient.getTransactionsCount(), txCount);
    assert.ok(rpcTps > 0);
    assert.ok(flushTps > 0);
    assert.ok(p99 >= p95);
    assert.ok(p95 >= p50);
  } finally {
    await new Promise((resolve, reject) => {
      httpServer.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
