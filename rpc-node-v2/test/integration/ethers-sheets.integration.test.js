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
