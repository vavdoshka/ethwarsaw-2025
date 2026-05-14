const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createApp } = require('../../src/app');
const { makeTempDir } = require('../helpers');

test('journal replay applies on top of genesis state', async () => {
  const dir = makeTempDir();
  const genesisPath = path.join(dir, 'genesis.json');
  const journalPath = path.join(dir, 'journal.jsonl');

  const from = '0x337d7730a281efE851dbEDf5F4eD0D2610E59639';
  const to = '0x742d35cc6634c0532925a3b844bc9e7595f0beb7';

  fs.writeFileSync(genesisPath, JSON.stringify({
    accounts: [{ address: from, balance: '10', nonce: 0 }]
  }));

  const app1 = createApp({ journalPath, genesisPath, env: { CHAIN_ID: '12345', PORT: '8545' } });
  await app1.methods.eth_sendTransaction([{ from, to, value: '4', nonce: 0, hash: '0xgen001' }]);

  const app2 = createApp({ journalPath, genesisPath, env: { CHAIN_ID: '12345', PORT: '8545' } });
  assert.equal(app2.state.getBalance(from), 6n);
  assert.equal(app2.state.getBalance(to), 4n);
  assert.equal(app2.state.getNonce(from), 1);
});
