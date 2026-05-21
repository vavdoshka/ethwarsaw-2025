const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createApp } = require('../../src/app');
const { makeTempDir } = require('../helpers');

function buildApp() {
  const dir = makeTempDir();
  const journalPath = path.join(dir, 'journal.jsonl');
  return createApp({ journalPath, env: { CHAIN_ID: '12345', PORT: '8545' } });
}

test('README baseline RPC methods are wired in V2', async () => {
  const app = buildApp();
  const expectedMethods = [
    'eth_chainId',
    'net_version',
    'eth_getBalance',
    'eth_getTransactionCount',
    'eth_blockNumber',
    'eth_getBlockByNumber',
    'eth_sendTransaction',
    'eth_sendRawTransaction',
    'eth_getTransactionByHash',
    'eth_getTransactionReceipt',
    'eth_call'
  ];
  for (const method of expectedMethods) {
    assert.equal(typeof app.methods[method], 'function', `${method} is not implemented`);
  }
});
