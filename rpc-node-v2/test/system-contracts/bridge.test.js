const test = require('node:test');
const assert = require('node:assert/strict');
const { StateStore } = require('../../src/core/state-store');
const { Ledger } = require('../../src/core/ledger');
const { Policy } = require('../../src/core/policy');
const bridge = require('../../src/system-contracts/bridge');

const bridgeOp = '0x337d7730a281efE851dbEDf5F4eD0D2610E59639';
const bridgeAccount = '0x0000000000000000000000000000000000000002';
const recipient = '0x742d35cc6634c0532925a3b844bc9e7595f0beb7';

function buildCtx(from) {
  const state = new StateStore();
  const ledger = new Ledger(state);
  const policy = new Policy({ bridgeOperatorAddress: bridgeOp });
  state.setAccount(bridgeAccount, { balance: 10n, nonce: 0 });
  return {
    tx: { from },
    args: [recipient, 3n],
    state,
    ledger,
    policy,
    config: { bridgeAccountAddress: bridgeAccount, bridgeOperatorAddress: bridgeOp }
  };
}

test('authorized bridgeTransfer moves funds', async () => {
  const ctx = buildCtx(bridgeOp);
  await bridge.transactions['bridgeTransfer(address,uint256)'](ctx);
  assert.equal(ctx.state.getBalance(bridgeAccount), 7n);
  assert.equal(ctx.state.getBalance(recipient), 3n);
});

test('unauthorized bridgeTransfer rejected', async () => {
  const ctx = buildCtx('0x5b38da6a701c568545dcfcb03fcb875f56beddc4');
  await assert.rejects(() => bridge.transactions['bridgeTransfer(address,uint256)'](ctx), /Unauthorized sender/);
});
