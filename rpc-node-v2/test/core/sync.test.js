const test = require('node:test');
const assert = require('node:assert/strict');
const { StateStore } = require('../../src/core/state-store');
const { Finalizer } = require('../../src/core/finalizer');
const { GoogleSheetsSyncWorker } = require('../../src/sync/google-sheets-sync');
const { ExportCheckpoint } = require('../../src/sync/export-checkpoint');
const { makeTempDir } = require('../helpers');
const path = require('node:path');

test('sync worker marks tx as synced', async () => {
  const state = new StateStore();
  const finalizer = new Finalizer(state);
  state.setTransaction('0xabc', { hash: '0xabc' });
  finalizer.markPending('0xabc');

  const syncClient = {
    async hasTransaction() { return false; },
    async writeTransaction() {}
  };

  const worker = new GoogleSheetsSyncWorker({ state, finalizer, syncClient });
  const result = await worker.flushOnce();
  assert.equal(result.flushed, 1);
  assert.equal(state.getSyncStatus('0xabc').status, 'synced');
});

test('sync worker retries transient failure', async () => {
  const state = new StateStore();
  const finalizer = new Finalizer(state);
  state.setTransaction('0xdef', { hash: '0xdef' });
  finalizer.markPending('0xdef');

  let attempts = 0;
  const syncClient = {
    async hasTransaction() { return false; },
    async writeTransaction() {
      attempts += 1;
      if (attempts === 1) throw new Error('quota exceeded');
    }
  };

  const worker = new GoogleSheetsSyncWorker({ state, finalizer, syncClient, retryBaseMs: 1 });
  await worker.flushWithRetry(2);
  assert.equal(attempts, 2);
  assert.equal(state.getSyncStatus('0xdef').status, 'synced');
});

test('sync worker uses blind append mode without read checks', async () => {
  const state = new StateStore();
  const finalizer = new Finalizer(state);
  state.setTransaction('0xaaa', { hash: '0xaaa' });
  state.setTransaction('0xbbb', { hash: '0xbbb' });
  finalizer.markPending('0xaaa');
  finalizer.markPending('0xbbb');

  let readCalls = 0;
  let writeCalls = 0;
  const syncClient = {
    blindAppend: true,
    async hasTransaction() {
      readCalls += 1;
      return false;
    },
    async writeTransactions(rows) {
      writeCalls += 1;
      if (rows.length !== 2) throw new Error('expected 2 rows');
    }
  };

  const worker = new GoogleSheetsSyncWorker({ state, finalizer, syncClient });
  const result = await worker.flushOnce();
  assert.equal(result.flushed, 2);
  assert.equal(readCalls, 0);
  assert.equal(writeCalls, 1);
  assert.equal(state.getSyncStatus('0xaaa').status, 'synced');
  assert.equal(state.getSyncStatus('0xbbb').status, 'synced');
});

test('sync worker writes durable checkpoint around blind append batch', async () => {
  const state = new StateStore();
  const finalizer = new Finalizer(state);
  state.setTransaction('0xaaa', { hash: '0xaaa' });
  finalizer.markPending('0xaaa');

  const checkpointPath = path.join(makeTempDir(), 'export-checkpoint.json');
  const checkpoint = new ExportCheckpoint(checkpointPath);
  const syncClient = {
    blindAppend: true,
    async writeTransactions() {}
  };

  const worker = new GoogleSheetsSyncWorker({ state, finalizer, syncClient, checkpoint });
  await worker.flushOnce();

  const reloaded = new ExportCheckpoint(checkpointPath);
  assert.deepEqual(reloaded.getInFlightTxHashes(), []);
  assert.equal(state.getSyncStatus('0xaaa').status, 'synced');
});

test('sync worker recovers in-flight checkpoint using batched dedupe', async () => {
  const state = new StateStore();
  const finalizer = new Finalizer(state);
  state.setTransaction('0xaaa', { hash: '0xaaa' });
  finalizer.markPending('0xaaa');

  const checkpointPath = path.join(makeTempDir(), 'export-checkpoint.json');
  const checkpoint = new ExportCheckpoint(checkpointPath);
  checkpoint.beginBatch(['0xaaa']);

  let reads = 0;
  const syncClient = {
    async hasTransactions(txHashes) {
      reads += 1;
      return new Set(txHashes.map((hash) => hash.toLowerCase()));
    }
  };

  const worker = new GoogleSheetsSyncWorker({ state, finalizer, syncClient, checkpoint });
  const result = await worker.recoverInFlight();

  assert.equal(result.recovered, 1);
  assert.equal(reads, 1);
  assert.equal(state.getSyncStatus('0xaaa').status, 'synced');
});
