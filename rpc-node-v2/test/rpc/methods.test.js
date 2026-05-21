const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createApp } = require('../../src/app');
const { createRpcRouter } = require('../../src/rpc/router');
const { makeTempDir } = require('../helpers');

function buildApp() {
  const dir = makeTempDir();
  const journalPath = path.join(dir, 'journal.jsonl');
  return createApp({ journalPath, env: { CHAIN_ID: '12345', PORT: '8545' } });
}

test('eth_chainId and net_version', async () => {
  const app = buildApp();
  assert.equal(await app.methods.eth_chainId(), '0x3039');
  assert.equal(await app.methods.net_version(), '12345');
});

test('eth_sendTransaction and lookup methods', async () => {
  const app = buildApp();
  const from = '0x337d7730a281efE851dbEDf5F4eD0D2610E59639';
  const to = '0x742d35cc6634c0532925a3b844bc9e7595f0beb7';
  app.state.setAccount(from, { balance: 10n, nonce: 0 });

  const txHash = await app.methods.eth_sendTransaction([{ from, to, value: '3', nonce: 0, hash: '0xabc001' }]);
  const tx = await app.methods.eth_getTransactionByHash([txHash]);
  const receipt = await app.methods.eth_getTransactionReceipt([txHash]);

  assert.equal(tx.hash, txHash);
  assert.equal(receipt.transactionHash, txHash);
  assert.equal(await app.methods.eth_getBalance([to]), '0x3');
});

test('batch requests preserve ids', async () => {
  const app = buildApp();
  const router = createRpcRouter(app.methods);
  const responses = await Promise.all([
    router.handleRequest({ jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 }),
    router.handleRequest({ jsonrpc: '2.0', method: 'net_version', params: [], id: 2 })
  ]);

  assert.equal(responses[0].id, 1);
  assert.equal(responses[1].id, 2);
});

test('eth_getBlockByNumber returns persisted block data', async () => {
  const dir = makeTempDir();
  const journalPath = path.join(dir, 'journal.jsonl');
  const dbPath = path.join(dir, 'state.sqlite3');
  const app = createApp({
    journalPath,
    env: { CHAIN_ID: '12345', PORT: '8545', SQLITE_ENABLED: '1', SQLITE_DB_PATH: dbPath, BLOCK_TXS_PER_BLOCK: '2' }
  });
  const from = '0x337d7730a281efE851dbEDf5F4eD0D2610E59639';
  const to = '0x742d35cc6634c0532925a3b844bc9e7595f0beb7';
  app.state.setAccount(from, { balance: 10n, nonce: 0 });

  const txHash = await app.methods.eth_sendTransaction([{ from, to, value: '3', nonce: 0, hash: '0xabc101' }]);
  const block = await app.methods.eth_getBlockByNumber(['0x1', false]);
  assert.equal(block.number, '0x1');
  assert.equal(Array.isArray(block.transactions), true);
  assert.equal(block.transactions[0], txHash);

  const fullBlock = await app.methods.eth_getBlockByNumber(['0x1', true]);
  assert.equal(fullBlock.transactions[0].hash, txHash);
  assert.equal(fullBlock.transactions[0].transactionIndex, '0x0');
});

test('unsupported RPC method returns -32601', async () => {
  const app = buildApp();
  const router = createRpcRouter(app.methods);
  const response = await router.handleRequest({
    jsonrpc: '2.0',
    method: 'eth_notExistingMethod',
    params: [],
    id: 77
  });
  assert.equal(response.id, 77);
  assert.equal(response.error.code, -32601);
});

test('gas pricing compatibility methods are available', async () => {
  const app = buildApp();
  assert.equal(await app.methods.eth_gasPrice(), '0x1');
  assert.equal(await app.methods.eth_maxPriorityFeePerGas(), '0x1');
  const fee = await app.methods.eth_feeHistory(['0x1', 'latest', []]);
  assert.equal(typeof fee, 'object');
  assert.ok(Array.isArray(fee.baseFeePerGas));
  assert.ok(Array.isArray(fee.gasUsedRatio));
});
