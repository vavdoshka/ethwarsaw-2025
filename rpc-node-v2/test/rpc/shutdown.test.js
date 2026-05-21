const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createServer } = require('../../src/rpc/server');
const { makeTempDir } = require('../helpers');

test('shutdown rejects new writes while draining', async () => {
  const dir = makeTempDir();
  const journalPath = path.join(dir, 'journal.jsonl');
  const dbPath = path.join(dir, 'state.sqlite3');
  const { app, context } = createServer({
    journalPath,
    env: { CHAIN_ID: '12345', PORT: '8545', SQLITE_ENABLED: '1', SQLITE_DB_PATH: dbPath }
  });

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  try {
    const port = server.address().port;
    await context.shutdown({ flushSync: false });

    const response = await fetch(`http://127.0.0.1:${port}/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_sendTransaction',
        params: [{ from: '0x337d7730a281efE851dbEDf5F4eD0D2610E59639', to: '0x742d35cc6634c0532925a3b844bc9e7595f0beb7', value: '1', nonce: 0 }]
      })
    });
    const body = await response.json();
    assert.equal(body.error.code, -32000);
    assert.match(body.error.message, /draining/i);
  } finally {
    await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
});
