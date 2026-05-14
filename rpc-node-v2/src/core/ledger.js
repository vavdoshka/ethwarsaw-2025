const { normalizeAddress } = require("../utils/addresses");
const { ValidationError } = require("./errors");

class Ledger {
  constructor(stateStore) {
    this.state = stateStore;
  }

  getBalance(address) {
    return this.state.getBalance(address);
  }

  getNonce(address) {
    return this.state.getNonce(address);
  }

  setNonce(address, nonce) {
    if (!Number.isInteger(nonce) || nonce < 0) {
      throw new ValidationError(`Invalid nonce: ${nonce}`);
    }
    this.state.setNonce(address, nonce);
  }

  transfer({ from, to, amount }) {
    const normalizedFrom = normalizeAddress(from);
    const normalizedTo = normalizeAddress(to);
    const transferAmount = BigInt(amount);
    if (transferAmount <= 0n) {
      throw new ValidationError("Transfer amount must be positive");
    }

    const fromBalance = this.state.getBalance(normalizedFrom);
    if (fromBalance < transferAmount) {
      throw new ValidationError(`Insufficient balance. Required: ${transferAmount}, Available: ${fromBalance}`);
    }

    const toBalance = this.state.getBalance(normalizedTo);
    this.state.setBalance(normalizedFrom, fromBalance - transferAmount);
    this.state.setBalance(normalizedTo, toBalance + transferAmount);
  }

  mint({ to, amount }) {
    const normalizedTo = normalizeAddress(to);
    const mintAmount = BigInt(amount);
    if (mintAmount <= 0n) {
      throw new ValidationError("Mint amount must be positive");
    }
    this.state.setBalance(normalizedTo, this.state.getBalance(normalizedTo) + mintAmount);
  }

  burn({ from, amount }) {
    const normalizedFrom = normalizeAddress(from);
    const burnAmount = BigInt(amount);
    if (burnAmount <= 0n) {
      throw new ValidationError("Burn amount must be positive");
    }
    const fromBalance = this.state.getBalance(normalizedFrom);
    if (fromBalance < burnAmount) {
      throw new ValidationError(`Insufficient balance. Required: ${burnAmount}, Available: ${fromBalance}`);
    }
    this.state.setBalance(normalizedFrom, fromBalance - burnAmount);
  }
}

module.exports = {
  Ledger
};
