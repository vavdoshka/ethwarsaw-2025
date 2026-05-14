const test = require('node:test');
const assert = require('node:assert/strict');
const { StateStore } = require('../../src/core/state-store');
const { Ledger } = require('../../src/core/ledger');

test('transfer debits sender and credits receiver', () => {
  const state = new StateStore();
  const ledger = new Ledger(state);
  const from = '0x337d7730a281efE851dbEDf5F4eD0D2610E59639';
  const to = '0x742d35cc6634c0532925a3b844bc9e7595f0beb7';
  state.setAccount(from, { balance: 10n, nonce: 0 });

  ledger.transfer({ from, to, amount: 3n });
  assert.equal(state.getBalance(from), 7n);
  assert.equal(state.getBalance(to), 3n);
});

test('transfer rejects insufficient balance and preserves state', () => {
  const state = new StateStore();
  const ledger = new Ledger(state);
  const from = '0x337d7730a281efE851dbEDf5F4eD0D2610E59639';
  const to = '0x742d35cc6634c0532925a3b844bc9e7595f0beb7';
  state.setAccount(from, { balance: 1n, nonce: 0 });

  assert.throws(() => ledger.transfer({ from, to, amount: 3n }), /Insufficient balance/);
  assert.equal(state.getBalance(from), 1n);
  assert.equal(state.getBalance(to), 0n);
});
