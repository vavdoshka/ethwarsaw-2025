const { ethers } = require('ethers');

class TransactionValidator {
  constructor() {
    this.chainId = parseInt(process.env.CHAIN_ID || '12345');
  }

  validateTransaction(tx) {
    const errors = [];

    if (!tx.from || !ethers.isAddress(tx.from)) {
      errors.push('Invalid from address');
    }

    if (tx.to && !ethers.isAddress(tx.to)) {
      errors.push('Invalid to address');
    }

    if (tx.value !== undefined) {
      try {
        const value = BigInt(tx.value);
        if (value < 0) {
          errors.push('Value cannot be negative');
        }
      } catch (e) {
        errors.push('Invalid value format');
      }
    }

    if (tx.nonce !== undefined && tx.nonce < 0) {
      errors.push('Nonce cannot be negative');
    }

    if (tx.gasLimit !== undefined) {
      const gasLimit = parseInt(tx.gasLimit);
      if (gasLimit < 21000) {
        errors.push('Gas limit too low (minimum 21000)');
      }
      if (gasLimit > 10000000) {
        errors.push('Gas limit too high (maximum 10000000)');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  validateRawTransaction(rawTx) {
    try {
      const tx = ethers.Transaction.from(rawTx);
      
      if (tx.chainId && tx.chainId !== this.chainId) {
        return {
          valid: false,
          errors: [`Invalid chain ID. Expected ${this.chainId}, got ${tx.chainId}`]
        };
      }

      return {
        valid: true,
        transaction: {
          from: tx.from,
          to: tx.to,
          value: tx.value.toString(),
          nonce: tx.nonce,
          gasLimit: tx.gasLimit.toString(),
          gasPrice: tx.gasPrice ? tx.gasPrice.toString() : tx.maxFeePerGas.toString(),
          data: tx.data
        }
      };
    } catch (error) {
      return {
        valid: false,
        errors: [`Failed to parse raw transaction: ${error.message}`]
      };
    }
  }

  validateAddress(address) {
    return ethers.isAddress(address);
  }

  normalizeAddress(address) {
    if (!this.validateAddress(address)) {
      throw new Error('Invalid address');
    }
    return ethers.getAddress(address).toLowerCase();
  }

  validateHexString(value, name = 'value') {
    if (typeof value !== 'string' || !value.match(/^0x[0-9a-fA-F]*$/)) {
      throw new Error(`Invalid hex string for ${name}`);
    }
    return true;
  }

  parseHexValue(hexValue) {
    this.validateHexString(hexValue);
    return BigInt(hexValue);
  }

  toHex(value) {
    if (typeof value === 'number' || typeof value === 'bigint') {
      return '0x' + value.toString(16);
    }
    if (typeof value === 'string' && value.startsWith('0x')) {
      return value;
    }
    return '0x' + BigInt(value).toString(16);
  }
}

module.exports = TransactionValidator;