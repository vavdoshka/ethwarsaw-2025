const test = require('node:test');
const assert = require('node:assert/strict');
const { ethers } = require('ethers');
const { StateStore } = require('../../src/core/state-store');
const { Ledger } = require('../../src/core/ledger');
const { Policy } = require('../../src/core/policy');
const { SystemContractRegistry } = require('../../src/system-contracts/registry');
const bridge = require('../../src/system-contracts/bridge');

test('registry loads valid contract', () => {
  const registry = new SystemContractRegistry({ contracts: [bridge] });
  assert.equal(registry.hasAddress(bridge.address), true);
});

test('duplicate address fails startup', () => {
  assert.throws(() => new SystemContractRegistry({ contracts: [bridge, bridge] }), /Duplicate system contract address/);
});

test('bridge call returns encoded balance', async () => {
  const state = new StateStore();
  const ledger = new Ledger(state);
  const policy = new Policy({ bridgeOperatorAddress: '0x337d7730a281efE851dbEDf5F4eD0D2610E59639' });
  const registry = new SystemContractRegistry({ contracts: [bridge] });
  state.setAccount('0x0000000000000000000000000000000000000002', { balance: 7n, nonce: 0 });

  const result = await registry.call({
    to: bridge.address,
    data: ethers.id('bridgeBalance()').slice(0, 10),
    context: {
      state,
      ledger,
      policy,
      config: {
        bridgeAccountAddress: '0x0000000000000000000000000000000000000002',
        bridgeOperatorAddress: '0x337d7730a281efE851dbEDf5F4eD0D2610E59639'
      }
    }
  });

  assert.equal(result, `0x${'7'.padStart(64, '0')}`);
});
