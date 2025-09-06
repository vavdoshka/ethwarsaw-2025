const NodeCache = require('node-cache');
const { ethers } = require('ethers');
const axios = require('axios');

class SheetOperations {
  constructor(sheetsClient) {
    this.client = sheetsClient;
    this.cache = new NodeCache({
      stdTTL: parseInt(process.env.CACHE_TTL || '60'),
      checkperiod: 120
    });
    this.cacheEnabled = process.env.ENABLE_CACHE === 'true';
  }

  async getBalance(address) {
    address = address.toLowerCase();
    // const cacheKey = `balance_${address}`;

    // if (this.cacheEnabled) {
    //   const cached = this.cache.get(cacheKey);
    //   if (cached !== undefined) return cached;
    // }

    // return 5000000000000000000;

    const rows = await this.client.readRange('Balances!A:C');
    const addressRow = rows.find(row => row[0] && row[0].toLowerCase() === address);
    const balance = addressRow && addressRow[1] ? BigInt(addressRow[1]) : BigInt(0);


    // if (this.cacheEnabled) {
    //   this.cache.set(cacheKey, balance);
    // }

    return balance;
  }

  async getNonce(address) {
    address = address.toLowerCase();

    const rows = await this.client.readRange('Balances!A:C');
    const addressRow = rows.find(row => row[0] && row[0].toLowerCase() === address);
    return addressRow && addressRow[2] ? parseInt(addressRow[2]) : 0;
  }

  async updateBalance(address, newBalance, newNonce) {
    address = address.toLowerCase();

    const rows = await this.client.readRange('Balances!A:C');
    let rowIndex = rows.findIndex(row => row[0] && row[0].toLowerCase() === address);

    if (rowIndex === -1) {
      await this.client.appendRow('Balances', [address, newBalance.toString(), newNonce.toString()]);
    } else {
      await this.client.updateRange(
        `Balances!A${rowIndex + 1}:C${rowIndex + 1}`,
        [[address, newBalance.toString(), newNonce.toString()]]
      );
    }

    if (this.cacheEnabled) {
      this.cache.del(`balance_${address}`);
      this.cache.del(`nonce_${address}`);
    }
  }

  async processTransaction(tx) {
    const from = tx.from.toLowerCase();
    const to = tx.to ? tx.to.toLowerCase() : null;
    const value = BigInt(tx.value || 0);
    const nonce = await this.getNonce(from);

    const fromBalance = await this.getBalance(from);
    const gasLimit = BigInt(tx.gasLimit || 21000);
    const gasPrice = BigInt(tx.gasPrice || tx.maxFeePerGas || 1000000000);
    const totalCost = value + (gasLimit * gasPrice);

    if (fromBalance < totalCost) {
      throw new Error(`Insufficient balance. Required: ${totalCost}, Available: ${fromBalance}`);
    }

    const txHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({
      from,
      to,
      value: value.toString(),
      nonce,
      timestamp: Date.now()
    })));

    const blockNumber = await this.getLatestBlockNumber() + 1;

    if (to) {
      const toBalance = await this.getBalance(to);
      await this.updateBalance(to, toBalance + value, await this.getNonce(to));
    }

    await this.updateBalance(from, fromBalance - totalCost, nonce + 1);

    // Fetch current crypto prices
    const cryptoPrices = await this.fetchCryptoPrices();

    await this.client.appendRow('Transactions', [
      new Date().toISOString(),
      txHash,
      from,
      to || 'Contract Creation',
      value.toString(),
      nonce.toString(),
      'Success',
      blockNumber.toString(),
      gasLimit.toString(),
      cryptoPrices.btcPrice.toString(),
      cryptoPrices.ethPrice.toString()
    ]);

    return {
      transactionHash: txHash,
      blockNumber,
      from,
      to,
      value: value.toString(),
      nonce,
      gasUsed: gasLimit.toString(),
      status: '0x1',
      btcPrice: cryptoPrices.btcPrice.toString(),
      ethPrice: cryptoPrices.ethPrice.toString()
    };
  }

  async getTransaction(txHash) {
    const rows = await this.client.readRange('Transactions!A:K');
    const txRow = rows.find(row => row[1] === txHash);

    if (!txRow) return null;

    return {
      hash: txRow[1],
      from: txRow[2],
      to: txRow[3] !== 'Contract Creation' ? txRow[3] : null,
      value: '0x' + BigInt(txRow[4]).toString(16),
      nonce: '0x' + parseInt(txRow[5]).toString(16),
      blockNumber: '0x' + parseInt(txRow[7]).toString(16),
      gasUsed: '0x' + BigInt(txRow[8] || 21000).toString(16),
      status: txRow[6] === 'Success' ? '0x1' : '0x0',
      btcPrice: txRow[9] || '0',
      ethPrice: txRow[10] || '0'
    };
  }

  async getTransactionReceipt(txHash) {
    const tx = await this.getTransaction(txHash);
    if (!tx) return null;

    return {
      transactionHash: tx.hash,
      transactionIndex: '0x0',
      blockHash: ethers.keccak256(ethers.toUtf8Bytes(tx.blockNumber)),
      blockNumber: tx.blockNumber,
      from: tx.from,
      to: tx.to,
      gasUsed: tx.gasUsed,
      cumulativeGasUsed: tx.gasUsed,
      contractAddress: tx.to === null ? ethers.getCreateAddress({ from: tx.from, nonce: parseInt(tx.nonce, 16) }) : null,
      logs: [],
      logsBloom: '0x' + '0'.repeat(512),
      status: tx.status
    };
  }

  async getLatestBlockNumber() {
      const rows = await this.client.readRange('Transactions!A:C');
      return rows.length;
  }

  async getTransactionsByAddress(address) {
    address = address.toLowerCase();
    const rows = await this.client.readRange('Transactions!A:K');

    return rows
      .filter(row =>
        (row[2] && row[2].toLowerCase() === address) ||
        (row[3] && row[3].toLowerCase() === address)
      )
      .map(row => ({
        timestamp: row[0],
        hash: row[1],
        from: row[2],
        to: row[3],
        value: row[4],
        nonce: row[5],
        status: row[6],
        blockNumber: row[7],
        gasUsed: row[8],
        btcPrice: row[9] || '0',
        ethPrice: row[10] || '0'
      }));
  }

  async fetchCryptoPrices() {
    try {
      const response = await axios.get('https://api.redstone.finance/prices?provider=redstone-primary-prod&symbols=BTC,ETH');
      const data = response.data;
      
      return {
        btcPrice: data.BTC?.value || 0,
        ethPrice: data.ETH?.value || 0,
        timestamp: data.BTC?.timestamp || Date.now()
      };
    } catch (error) {
      console.error('Error fetching crypto prices:', error.message);
      // Return default values if API call fails
      return {
        btcPrice: 0,
        ethPrice: 0,
        timestamp: Date.now()
      };
    }
  }

  clearCache() {
    if (this.cacheEnabled) {
      this.cache.flushAll();
    }
  }
}

module.exports = SheetOperations;