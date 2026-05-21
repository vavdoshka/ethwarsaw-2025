const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { SqliteStore } = require('../../src/db/sqlite-store');
const { StateStore } = require('../../src/core/state-store');
const { Finalizer } = require('../../src/core/finalizer');
const { makeTempDir } = require('../helpers');

test('sqlite store applies genesis once and loads state', () => {
  const dbPath = path.join(makeTempDir(), 'state.sqlite3');
  const sqlite = new SqliteStore(dbPath);
  sqlite.applyGenesis({
    accounts: [{ address: '0x337d7730a281efE851dbEDf5F4eD0D2610E59639', balance: '15', nonce: 2 }]
  });
  sqlite.applyGenesis({
    accounts: [{ address: '0x337d7730a281efE851dbEDf5F4eD0D2610E59639', balance: '99', nonce: 9 }]
  });

  const state = new StateStore();
  const finalizer = new Finalizer(state);
  sqlite.loadStateInto(state, finalizer);

  assert.equal(state.getBalance('0x337d7730a281efE851dbEDf5F4eD0D2610E59639'), 15n);
  assert.equal(state.getNonce('0x337d7730a281efE851dbEDf5F4eD0D2610E59639'), 2);
});

test('sqlite store persists accepted tx and sync job', () => {
  const dbPath = path.join(makeTempDir(), 'state.sqlite3');
  const sqlite = new SqliteStore(dbPath);
  sqlite.persistAcceptedTx({
    txHash: '0xabc',
    timestamp: new Date().toISOString(),
    tx: { from: '0x337d7730a281efe851dbedf5f4ed0d2610e59639', to: '0x742d35cc6634c0532925a3b844bc9e7595f0beb7', value: '3', nonce: 0 },
    fromAccount: { address: '0x337d7730a281efe851dbedf5f4ed0d2610e59639', balance: '7', nonce: 1 },
    toAccount: { address: '0x742d35cc6634c0532925a3b844bc9e7595f0beb7', balance: '3', nonce: 0 },
    block: { blockNumber: 1, blockHash: '0x01', parentHash: null }
  });

  assert.equal(sqlite.hasTransaction('0xabc'), true);
  const statusBefore = sqlite.getStatus();
  assert.equal(statusBefore.pendingSyncJobs, 1);
  sqlite.markTxSynced('0xabc', 1);
  const statusAfter = sqlite.getStatus();
  assert.equal(statusAfter.pendingSyncJobs, 0);
  assert.equal(statusAfter.lastSyncedBlock, 1);
  assert.equal(statusAfter.lastExportedBlock, 1);
});

test('sqlite schema includes outbox/export and system state tables', () => {
  const dbPath = path.join(makeTempDir(), 'state.sqlite3');
  const sqlite = new SqliteStore(dbPath);
  const tables = sqlite.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name);
  assert.ok(tables.includes('journal_events'));
  assert.ok(tables.includes('system_contract_state'));

  const checkpointCols = sqlite.db.prepare("PRAGMA table_info(sync_checkpoints)").all().map((c) => c.name);
  assert.ok(checkpointCols.includes('last_exported_block'));
});

test('block hash changes deterministically with ordered tx hashes in same block', () => {
  const dbPath = path.join(makeTempDir(), 'state.sqlite3');
  const sqlite = new SqliteStore(dbPath, { blockTxsPerBlock: 2 });

  const alloc1 = sqlite.persistAcceptedTx({
    txHash: '0xabc1',
    timestamp: new Date().toISOString(),
    tx: { from: '0x337d7730a281efe851dbedf5f4ed0d2610e59639', to: '0x742d35cc6634c0532925a3b844bc9e7595f0beb7', value: '1', nonce: 0 },
    fromAccount: { address: '0x337d7730a281efe851dbedf5f4ed0d2610e59639', balance: '9', nonce: 1 },
    toAccount: { address: '0x742d35cc6634c0532925a3b844bc9e7595f0beb7', balance: '1', nonce: 0 }
  });
  const alloc2 = sqlite.persistAcceptedTx({
    txHash: '0xabc2',
    timestamp: new Date().toISOString(),
    tx: { from: '0x337d7730a281efe851dbedf5f4ed0d2610e59639', to: '0x742d35cc6634c0532925a3b844bc9e7595f0beb7', value: '1', nonce: 1 },
    fromAccount: { address: '0x337d7730a281efe851dbedf5f4ed0d2610e59639', balance: '8', nonce: 2 },
    toAccount: { address: '0x742d35cc6634c0532925a3b844bc9e7595f0beb7', balance: '2', nonce: 0 }
  });

  assert.equal(alloc1.blockNumber, 1);
  assert.equal(alloc2.blockNumber, 1);
  assert.notEqual(alloc1.blockHash, alloc2.blockHash);

  const sqlite2 = new SqliteStore(path.join(makeTempDir(), 'state.sqlite3'), { blockTxsPerBlock: 2 });
  const a1 = sqlite2.persistAcceptedTx({
    txHash: '0xabc1',
    timestamp: new Date().toISOString(),
    tx: { from: '0x337d7730a281efe851dbedf5f4ed0d2610e59639', to: '0x742d35cc6634c0532925a3b844bc9e7595f0beb7', value: '1', nonce: 0 },
    fromAccount: { address: '0x337d7730a281efe851dbedf5f4ed0d2610e59639', balance: '9', nonce: 1 },
    toAccount: { address: '0x742d35cc6634c0532925a3b844bc9e7595f0beb7', balance: '1', nonce: 0 }
  });
  const a2 = sqlite2.persistAcceptedTx({
    txHash: '0xabc2',
    timestamp: new Date().toISOString(),
    tx: { from: '0x337d7730a281efe851dbedf5f4ed0d2610e59639', to: '0x742d35cc6634c0532925a3b844bc9e7595f0beb7', value: '1', nonce: 1 },
    fromAccount: { address: '0x337d7730a281efe851dbedf5f4ed0d2610e59639', balance: '8', nonce: 2 },
    toAccount: { address: '0x742d35cc6634c0532925a3b844bc9e7595f0beb7', balance: '2', nonce: 0 }
  });
  assert.equal(alloc2.blockHash, a2.blockHash);
  assert.equal(alloc1.blockHash, a1.blockHash);
});
