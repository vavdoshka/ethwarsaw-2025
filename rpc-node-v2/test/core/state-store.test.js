const test = require('node:test');
const assert = require('node:assert/strict');
const { StateStore } = require('../../src/core/state-store');

test('empty state returns zero balance and zero nonce', () => {
  const state = new StateStore();
  assert.equal(state.getBalance('0x337d7730a281efE851dbEDf5F4eD0D2610E59639'), 0n);
  assert.equal(state.getNonce('0x337d7730a281efE851dbEDf5F4eD0D2610E59639'), 0);
});

test('snapshot export and import preserve state', () => {
  const state = new StateStore();
  const address = '0x337d7730a281efE851dbEDf5F4eD0D2610E59639';
  state.setAccount(address, { balance: 5n, nonce: 2 });
  state.setTransaction('0xabc', { hash: '0xabc', from: address, to: address, value: '1', nonce: 1, blockNumber: 1 });
  state.setSyncStatus('0xabc', { status: 'pending', syncedAt: null });
  const snapshot = state.exportSnapshot();

  const recovered = new StateStore(snapshot);
  assert.equal(recovered.getBalance(address), 5n);
  assert.equal(recovered.getNonce(address), 2);
  assert.equal(recovered.getTransaction('0xabc').hash, '0xabc');
  assert.equal(recovered.getSyncStatus('0xabc').status, 'pending');
});
