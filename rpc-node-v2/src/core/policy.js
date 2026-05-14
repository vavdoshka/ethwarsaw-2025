const { normalizeAddress } = require("../utils/addresses");
const { ValidationError } = require("./errors");

class Policy {
  constructor({ bridgeOperatorAddress, reservedAddresses = [] }) {
    this.bridgeOperatorAddress = normalizeAddress(bridgeOperatorAddress);
    this.reservedAddressSet = new Set(reservedAddresses.map(normalizeAddress));
  }

  requireSender(actualSender, expectedSender) {
    const normalizedActual = normalizeAddress(actualSender);
    const normalizedExpected = normalizeAddress(expectedSender);
    if (normalizedActual !== normalizedExpected) {
      throw new ValidationError(`Unauthorized sender: ${actualSender}`);
    }
  }

  requireBridgeOperator(sender) {
    this.requireSender(sender, this.bridgeOperatorAddress);
  }

  ensureAddressNotReserved(address) {
    const normalized = normalizeAddress(address);
    if (this.reservedAddressSet.has(normalized)) {
      throw new ValidationError(`Address is reserved: ${address}`);
    }
  }

  requireExpectedNonce(actualNonce, submittedNonce) {
    if (!Number.isInteger(submittedNonce) || submittedNonce < 0) {
      throw new ValidationError(`Invalid nonce: ${submittedNonce}`);
    }
    if (submittedNonce !== actualNonce) {
      throw new ValidationError(`Invalid nonce. Expected: ${actualNonce}, got: ${submittedNonce}`);
    }
  }
}

module.exports = {
  Policy
};
