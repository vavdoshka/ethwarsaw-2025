const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { SqliteStore } = require('../../src/db/sqlite-store');
const { StateStore } = require('../../src/core/state-store');
const { Finalizer } = require('../../src/core/finalizer');
const { GoogleSheetsSyncWorker } = require('../../src/sync/google-sheets-sync');
const { makeTempDir } = require('../helpers');

function seedTx(store, state, txHash) {
  const allocation = store.persistAcceptedTx({
    txHash,
    timestamp: new Date().toISOString(),
    tx: { from: '0x337d7730a281efe851dbedf5f4ed0d2610e59639', to: '0x742d35cc6634c0532925a3b844bc9e7595f0beb7', value: '1', nonce: 0 },
    fromAccount: { address: '0x337d7730a281efe851dbedf5f4ed0d2610e59639', balance: '9', nonce: 1 },
    toAccount: { address: '0x742d35cc6634c0532925a3b844bc9e7595f0beb7', balance: '1', nonce: 0 },
    txIndex: 0
  });
  state.setTransaction(txHash, { hash: txHash, from: '0x337d7730a281efe851dbedf5f4ed0d2610e59639', to: '0x742d35cc6634c0532925a3b844bc9e7595f0beb7', value: '1', nonce: 0, blockNumber: allocation.blockNumber, status: '0x1' });
  state.setSyncStatus(txHash, { status: 'pending', syncedAt: null });
}

function seedTxWithIndex(store, state, txHash, txIndex) {
  const allocation = store.persistAcceptedTx({
    txHash,
    timestamp: new Date().toISOString(),
    tx: { from: '0x337d7730a281efe851dbedf5f4ed0d2610e59639', to: '0x742d35cc6634c0532925a3b844bc9e7595f0beb7', value: '1', nonce: txIndex },
    fromAccount: { address: '0x337d7730a281efe851dbedf5f4ed0d2610e59639', balance: String(9 - txIndex), nonce: txIndex + 1 },
    toAccount: { address: '0x742d35cc6634c0532925a3b844bc9e7595f0beb7', balance: String(txIndex + 1), nonce: 0 },
    txIndex
  });
  state.setTransaction(txHash, { hash: txHash, from: '0x337d7730a281efe851dbedf5f4ed0d2610e59639', to: '0x742d35cc6634c0532925a3b844bc9e7595f0beb7', value: '1', nonce: txIndex, blockNumber: allocation.blockNumber, status: '0x1' });
  state.setSyncStatus(txHash, { status: 'pending', syncedAt: null });
}

test('sqlite outbox worker marks jobs synced', async () => {
  const store = new SqliteStore(path.join(makeTempDir(), 'state.sqlite3'));
  const state = new StateStore();
  const finalizer = new Finalizer(state, { onSynced: (txHash) => {
    const tx = state.getTransaction(txHash);
    store.markTxSynced(txHash, tx ? tx.blockNumber : null);
  } });

  seedTx(store, state, '0xaaa');
  seedTx(store, state, '0xbbb');

  const written = [];
  const syncClient = {
    async writeTransactions(rows) {
      written.push(...rows);
    }
  };

  const worker = new GoogleSheetsSyncWorker({ sqliteStore: store, finalizer, state, syncClient });
  const result = await worker.flushOnce();
  assert.equal(result.flushed, 2);

  const status = store.getStatus();
  assert.equal(status.pendingSyncJobs, 0);
  assert.equal(status.inFlightSyncJobs, 0);
  assert.equal(status.lastSyncedBlock, 2);
  assert.equal(written.length, 2);
  assert.ok(written.every((row) => typeof row.exportBatchId === 'string' && row.exportBatchId.length > 0));
});

test('sqlite outbox flush batches rows by block with shared exportBatchId', async () => {
  const store = new SqliteStore(path.join(makeTempDir(), 'state.sqlite3'), { blockTxsPerBlock: 2 });
  const state = new StateStore();
  const finalizer = new Finalizer(state, { onSynced: (txHash) => {
    const tx = state.getTransaction(txHash);
    store.markTxSynced(txHash, tx ? tx.blockNumber : null);
  } });

  seedTxWithIndex(store, state, '0x111', 0);
  seedTxWithIndex(store, state, '0x222', 1);

  const calls = [];
  const syncClient = {
    async writeTransactions(rows) {
      calls.push(rows);
    }
  };

  const worker = new GoogleSheetsSyncWorker({ sqliteStore: store, finalizer, state, syncClient });
  const result = await worker.flushOnce();
  assert.equal(result.flushed, 2);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].length, 2);
  const ids = new Set(calls[0].map((row) => row.exportBatchId));
  assert.equal(ids.size, 1);
});
