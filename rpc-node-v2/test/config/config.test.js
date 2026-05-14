const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig } = require('../../src/config');

test('config loads defaults', () => {
  const config = loadConfig({});
  assert.equal(config.chainId, 12345);
  assert.equal(config.port, 8545);
  assert.equal(config.networkName, 'SheetChain');
});

test('config rejects invalid chain id', () => {
  assert.throws(() => loadConfig({ CHAIN_ID: 'abc' }), /Invalid CHAIN_ID/);
});
