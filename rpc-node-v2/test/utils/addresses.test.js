const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeAddress } = require('../../src/utils/addresses');

test('normalizeAddress lowercases valid address', () => {
  const result = normalizeAddress('0x337d7730a281efE851dbEDf5F4eD0D2610E59639');
  assert.equal(result, '0x337d7730a281efe851dbedf5f4ed0d2610e59639');
});

test('normalizeAddress rejects invalid address', () => {
  assert.throws(() => normalizeAddress('0x123'), /Invalid address/);
});
