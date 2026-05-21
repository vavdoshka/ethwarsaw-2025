const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createServer } = require('../../src/rpc/server');
const { makeTempDir } = require('../helpers');

test('status endpoint returns sqlite-backed sync stats', async () => {
  const dir = makeTempDir();
  const journalPath = path.join(dir, 'journal.jsonl');
  const dbPath = path.join(dir, 'state.sqlite3');
  const { app } = createServer({
    journalPath,
    env: { CHAIN_ID: '12345', PORT: '8545', SQLITE_ENABLED: '1', SQLITE_DB_PATH: dbPath }
  });

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  try {
    const port = server.address().port;
    const res = await fetch(`http://127.0.0.1:${port}/status`);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(typeof body.latestBlockNumber, 'number');
    assert.equal(typeof body.pendingSyncJobs, 'number');
    assert.equal(typeof body.syncLagBlocks, 'number');
    assert.equal(typeof body.lastExportedBlock, 'number');
    assert.equal(typeof body.metrics, 'object');
  } finally {
    await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
});
