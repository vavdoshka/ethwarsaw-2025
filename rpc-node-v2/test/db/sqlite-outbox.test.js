const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { SqliteStore } = require('../../src/db/sqlite-store');
const { makeTempDir } = require('../helpers');

function mkStore() {
  return new SqliteStore(path.join(makeTempDir(), 'state.sqlite3'));
}

function seedTx(store, txHash, blockNumber = 1) {
  store.persistAcceptedTx({
    txHash,
    timestamp: new Date().toISOString(),
    tx: { from: '0x337d7730a281efe851dbedf5f4ed0d2610e59639', to: '0x742d35cc6634c0532925a3b844bc9e7595f0beb7', value: '1', nonce: 0 },
    fromAccount: { address: '0x337d7730a281efe851dbedf5f4ed0d2610e59639', balance: '9', nonce: 1 },
    toAccount: { address: '0x742d35cc6634c0532925a3b844bc9e7595f0beb7', balance: '1', nonce: 0 },
    block: { blockNumber, blockHash: `0x${blockNumber}`, parentHash: null }
  });
}

test('claimPendingSyncJobs marks jobs in_flight', () => {
  const store = mkStore();
  seedTx(store, '0xaaa', 1);
  seedTx(store, '0xbbb', 2);

  const claimed = store.claimPendingSyncJobs(10);
  assert.equal(claimed.length, 2);

  const status = store.getStatus();
  assert.equal(status.pendingSyncJobs, 0);
  assert.equal(status.inFlightSyncJobs, 2);
});

test('markSyncJobsFailed retries then dead-letters', () => {
  const store = mkStore();
  seedTx(store, '0xccc', 1);
  store.claimPendingSyncJobs(10);

  store.markSyncJobsFailed(['0xccc'], 'quota', { maxRetries: 2, retryDelayMs: 1 });
  let status = store.getStatus();
  assert.equal(status.deadLetterJobs, 0);
  assert.equal(status.pendingSyncJobs, 0);

  store.claimPendingSyncJobs(10);
  store.markSyncJobsFailed(['0xccc'], 'quota', { maxRetries: 2, retryDelayMs: 1 });
  status = store.getStatus();
  assert.equal(status.deadLetterJobs, 1);
});
