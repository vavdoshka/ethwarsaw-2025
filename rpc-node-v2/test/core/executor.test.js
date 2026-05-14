const test = require('node:test');
const assert = require('node:assert/strict');
const { StateStore } = require('../../src/core/state-store');
const { Ledger } = require('../../src/core/ledger');
const { Policy } = require('../../src/core/policy');
const { Journal } = require('../../src/core/journal');
const { Finalizer } = require('../../src/core/finalizer');
const { Executor } = require('../../src/core/executor');
const { makeJournalPath } = require('../helpers');

function buildExecutor() {
  const state = new StateStore();
  const ledger = new Ledger(state);
  const policy = new Policy({ bridgeOperatorAddress: '0x337d7730a281efE851dbEDf5F4eD0D2610E59639' });
  const journal = new Journal(makeJournalPath());
  const finalizer = new Finalizer(state);
  const executor = new Executor({ stateStore: state, ledger, policy, journal, finalizer });
  return { state, ledger, policy, journal, finalizer, executor };
}

test('valid value tx is accepted and included', () => {
  const { state, executor } = buildExecutor();
  const from = '0x337d7730a281efE851dbEDf5F4eD0D2610E59639';
  const to = '0x742d35cc6634c0532925a3b844bc9e7595f0beb7';
  state.setAccount(from, { balance: 10n, nonce: 0 });

  const result = executor.executeValueTx({ from, to, value: 3n, nonce: 0, hash: '0xaaa' });
  assert.equal(result.transactionHash, '0xaaa');
  assert.equal(state.getBalance(from), 7n);
  assert.equal(state.getBalance(to), 3n);
  assert.equal(state.getNonce(from), 1);
  assert.equal(state.getTransaction('0xaaa').blockNumber, 1);
});

test('insufficient balance rejects without mutation', () => {
  const { state, executor } = buildExecutor();
  const from = '0x337d7730a281efE851dbEDf5F4eD0D2610E59639';
  const to = '0x742d35cc6634c0532925a3b844bc9e7595f0beb7';
  state.setAccount(from, { balance: 1n, nonce: 0 });

  assert.throws(() => executor.executeValueTx({ from, to, value: 3n, nonce: 0, hash: '0xaab' }), /Insufficient balance/);
  assert.equal(state.getBalance(from), 1n);
  assert.equal(state.getNonce(from), 0);
  assert.equal(state.getTransaction('0xaab'), null);
});

test('duplicate tx hash is rejected', () => {
  const { state, executor } = buildExecutor();
  const from = '0x337d7730a281efE851dbEDf5F4eD0D2610E59639';
  const to = '0x742d35cc6634c0532925a3b844bc9e7595f0beb7';
  state.setAccount(from, { balance: 10n, nonce: 0 });
  executor.executeValueTx({ from, to, value: 2n, nonce: 0, hash: '0xabc123' });
  assert.throws(() => executor.executeValueTx({ from, to, value: 2n, nonce: 1, hash: '0xabc123' }), /Duplicate tx hash/);
});
