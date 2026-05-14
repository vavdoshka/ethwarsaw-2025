const test = require('node:test');
const assert = require('node:assert/strict');
const { toHexQuantity } = require('../../src/utils/hex');

test('toHexQuantity encodes bigint', () => {
  assert.equal(toHexQuantity(255n), '0xff');
});
