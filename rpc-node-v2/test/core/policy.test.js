const test = require('node:test');
const assert = require('node:assert/strict');
const { Policy } = require('../../src/core/policy');

test('requireSender accepts matching sender', () => {
  const policy = new Policy({ bridgeOperatorAddress: '0x337d7730a281efE851dbEDf5F4eD0D2610E59639' });
  assert.doesNotThrow(() => policy.requireSender('0x337d7730a281efE851dbEDf5F4eD0D2610E59639', '0x337d7730a281efE851dbEDf5F4eD0D2610E59639'));
});

test('requireSender rejects non matching sender', () => {
  const policy = new Policy({ bridgeOperatorAddress: '0x337d7730a281efE851dbEDf5F4eD0D2610E59639' });
  assert.throws(() => policy.requireSender('0x742d35cc6634c0532925a3b844bc9e7595f0beb7', '0x337d7730a281efE851dbEDf5F4eD0D2610E59639'), /Unauthorized sender/);
});

test('nonce policy validates exact nonce', () => {
  const policy = new Policy({ bridgeOperatorAddress: '0x337d7730a281efE851dbEDf5F4eD0D2610E59639' });
  assert.doesNotThrow(() => policy.requireExpectedNonce(2, 2));
  assert.throws(() => policy.requireExpectedNonce(2, 1), /Invalid nonce/);
});
