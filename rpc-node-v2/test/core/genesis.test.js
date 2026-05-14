const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { StateStore } = require('../../src/core/state-store');
const { applyGenesisToState, loadGenesisFile } = require('../../src/core/genesis');
const { createApp } = require('../../src/app');
const { makeTempDir } = require('../helpers');

test('applyGenesisToState seeds balances and nonces', () => {
  const state = new StateStore();
  applyGenesisToState(state, {
    latestBlockNumber: 7,
    accounts: [
      { address: '0x337d7730a281efE851dbEDf5F4eD0D2610E59639', balance: '11', nonce: 3 }
    ]
  });

  assert.equal(state.getBalance('0x337d7730a281efE851dbEDf5F4eD0D2610E59639'), 11n);
  assert.equal(state.getNonce('0x337d7730a281efE851dbEDf5F4eD0D2610E59639'), 3);
  assert.equal(state.latestBlockNumber, 7);
});

test('createApp loads genesis file before replay', () => {
  const dir = makeTempDir();
  const genesisPath = path.join(dir, 'genesis.json');
  const journalPath = path.join(dir, 'journal.jsonl');
  fs.writeFileSync(genesisPath, JSON.stringify({
    latestBlockNumber: 0,
    accounts: [
      { address: '0x337d7730a281efE851dbEDf5F4eD0D2610E59639', balance: '20', nonce: 0 }
    ]
  }));

  const app = createApp({
    journalPath,
    genesisPath,
    env: { CHAIN_ID: '12345', PORT: '8545' }
  });

  assert.equal(app.state.getBalance('0x337d7730a281efE851dbEDf5F4eD0D2610E59639'), 20n);
});

test('loadGenesisFile returns null when file missing', () => {
  const dir = makeTempDir();
  const missing = path.join(dir, 'missing.json');
  assert.equal(loadGenesisFile(missing), null);
});
