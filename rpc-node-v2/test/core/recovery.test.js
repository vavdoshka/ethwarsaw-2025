const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { StateStore } = require('../../src/core/state-store');
const { Ledger } = require('../../src/core/ledger');
const { Policy } = require('../../src/core/policy');
const { Journal } = require('../../src/core/journal');
const { Finalizer } = require('../../src/core/finalizer');
const { Executor } = require('../../src/core/executor');
const { makeTempDir } = require('../helpers');

function build(journalPath) {
  const state = new StateStore();
  const ledger = new Ledger(state);
  const policy = new Policy({ bridgeOperatorAddress: '0x337d7730a281efE851dbEDf5F4eD0D2610E59639' });
  const journal = new Journal(journalPath);
  const finalizer = new Finalizer(state);
  const executor = new Executor({ stateStore: state, ledger, policy, journal, finalizer });
  return { state, executor };
}

test('recovery rebuilds state from journal', () => {
  const dir = makeTempDir();
  const journalPath = path.join(dir, 'journal.jsonl');
  const from = '0x337d7730a281efE851dbEDf5F4eD0D2610E59639';
  const to = '0x742d35cc6634c0532925a3b844bc9e7595f0beb7';

  const first = build(journalPath);
  first.state.setAccount(from, { balance: 10n, nonce: 0 });
  first.executor.executeValueTx({ from, to, value: 2n, nonce: 0, hash: '0xdef001' });

  const second = build(journalPath);
  second.state.setAccount(from, { balance: 10n, nonce: 0 });
  second.executor.recoverFromJournal();

  assert.equal(second.state.getBalance(from), 8n);
  assert.equal(second.state.getBalance(to), 2n);
  assert.equal(second.state.getNonce(from), 1);
  assert.equal(second.state.latestBlockNumber, 1);
});
