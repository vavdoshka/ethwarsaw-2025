const test = require('node:test');
const assert = require('node:assert/strict');
const { StateStore } = require('../../src/core/state-store');
const { Ledger } = require('../../src/core/ledger');
const { Policy } = require('../../src/core/policy');
const airdrop = require('../../src/system-contracts/airdrop');

const claimer = '0x337d7730a281efE851dbEDf5F4eD0D2610E59639';

test('first claim succeeds and second fails', async () => {
  const state = new StateStore();
  const ledger = new Ledger(state);
  const policy = new Policy({ bridgeOperatorAddress: claimer });
  const ctx = {
    tx: { from: claimer },
    args: [],
    state,
    ledger,
    policy,
    config: { airdropAmountWei: '100' }
  };

  await airdrop.transactions['claimAirdropEthWarsaw2025()'](ctx);
  assert.equal(state.getBalance(claimer), 100n);
  await assert.rejects(() => airdrop.transactions['claimAirdropEthWarsaw2025()'](ctx), /already claimed/);
});
