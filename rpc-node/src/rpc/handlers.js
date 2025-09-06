const { ethers } = require('ethers');


class RPCHandlers {
  constructor(sheetOps) {
    this.sheetOps = sheetOps;
    this.chainId = parseInt(process.env.CHAIN_ID || '12345');
    this.networkName = process.env.NETWORK_NAME || 'SheetChain';
  }

  async handleRequest(method, params) {
    switch (method) {
      case 'eth_chainId':
        return '0x' + this.chainId.toString(16);
      
      case 'net_version':
        return this.chainId.toString();
      
      case 'eth_getBalance':
        return await this.getBalance(params);
      
      case 'eth_getTransactionCount':
        return await this.getTransactionCount(params);
      
      case 'eth_sendRawTransaction':
        return await this.sendRawTransaction(params);
      
      case 'eth_sendTransaction':
        return await this.sendTransaction(params);
      
      case 'eth_getTransactionByHash':
        return await this.getTransactionByHash(params);
      
      case 'eth_getTransactionReceipt':
        return await this.getTransactionReceipt(params);
      
      case 'eth_blockNumber':
        return await this.getBlockNumber();
      
      case 'eth_gasPrice':
        return this.getGasPrice();
      
      case 'eth_estimateGas':
        return this.estimateGas(params);
      
      case 'eth_getCode':
        return '0x';
      
      case 'eth_accounts':
        return [];
      
      case 'eth_sign':
      case 'personal_sign':
        throw new Error('Signing not supported in this simulation');
      
      case 'web3_clientVersion':
        return 'SheetChain/1.0.0';
      
      case 'net_listening':
        return true;
      
      case 'net_peerCount':
        return '0x0';
      
      case 'eth_getBlockByNumber':
        return await this.getBlockByNumber(params);
      
      case 'eth_getBlockByHash':
        return await this.getBlockByHash(params);
      
      case 'eth_call':
        return '0x';
      
      case 'eth_getLogs':
        return [];
      
    case 'eth_getStorageAt':
        return '0x'
        
      default:
        throw new Error(`Method ${method} not supported`);
    }
  }

  async getBalance(params) {
    const [address, blockTag] = params;
    const balance = await this.sheetOps.getBalance(address);
    return '0x' + balance.toString(16);
  }

  async getTransactionCount(params) {
    const [address, blockTag] = params;
    const nonce = await this.sheetOps.getNonce(address);
    return '0x' + nonce.toString(16);
  }

  async sendRawTransaction(params) {
    const [signedTx] = params;
    const tx = ethers.Transaction.from(signedTx);
    
    const txData = {
      from: tx.from,
      to: tx.to,
      value: tx.value.toString(),
      nonce: tx.nonce,
      gasLimit: tx.gasLimit.toString(),
      gasPrice: tx.gasPrice ? tx.gasPrice.toString() : tx.maxFeePerGas.toString(),
      data: tx.data
    };
    
    const result = await this.sheetOps.processTransaction(txData);
    return result.transactionHash;
  }

  async sendTransaction(params) {
    const [tx] = params;
    
    if (!tx.from) {
      throw new Error('From address is required');
    }
    
    if (tx.nonce === undefined) {
      tx.nonce = await this.sheetOps.getNonce(tx.from);
    } else if (typeof tx.nonce === 'string') {
      tx.nonce = parseInt(tx.nonce, 16);
    }
    
    if (typeof tx.value === 'string' && tx.value.startsWith('0x')) {
      tx.value = BigInt(tx.value).toString();
    }
    
    const result = await this.sheetOps.processTransaction(tx);
    return result.transactionHash;
  }

  async getTransactionByHash(params) {
    const [txHash] = params;
    return await this.sheetOps.getTransaction(txHash);
  }

  async getTransactionReceipt(params) {
    const [txHash] = params;
    return await this.sheetOps.getTransactionReceipt(txHash);
  }

  async getBlockNumber() {
    const blockNumber = await this.sheetOps.getLatestBlockNumber();
    const blockNumberHex = '0x' + blockNumber.toString(16);
    console.log('getBlockNumber', blockNumberHex);
    return blockNumberHex;
  }

  getGasPrice() {
    return '0x0'; // Completely gasless network
  }

  estimateGas(params) {
    return '0x5208';
  }

  async getBlockByNumber(params) {
    const [blockNumber, includeTransactions] = params;
    const number = blockNumber === 'latest' ? 
      await this.sheetOps.getLatestBlockNumber() : 
      parseInt(blockNumber, 16);
    
    return this.createBlock(number, includeTransactions);
  }

  async getBlockByHash(params) {
    const [blockHash, includeTransactions] = params;
    return this.createBlock(0, includeTransactions);
  }

  createBlock(number, includeTransactions = false) {
    const blockHash = ethers.keccak256(ethers.toUtf8Bytes(number.toString()));
    const parentHash = number > 0 ? 
      ethers.keccak256(ethers.toUtf8Bytes((number - 1).toString())) : 
      '0x' + '0'.repeat(64);
    
    return {
      number: '0x' + number.toString(16),
      hash: blockHash,
      parentHash: parentHash,
      nonce: '0x' + '0'.repeat(16),
      sha3Uncles: '0x' + '0'.repeat(64),
      logsBloom: '0x' + '0'.repeat(512),
      transactionsRoot: '0x' + '0'.repeat(64),
      stateRoot: '0x' + '0'.repeat(64),
      receiptsRoot: '0x' + '0'.repeat(64),
      miner: '0x' + '0'.repeat(40),
      difficulty: '0x0',
      totalDifficulty: '0x0',
      extraData: '0x',
      size: '0x0',
      gasLimit: '0x6691b7',
      gasUsed: '0x0',
      timestamp: '0x' + Math.floor(Date.now() / 1000).toString(16),
      transactions: includeTransactions ? [] : [],
      uncles: []
    };
  }

  async createClaim(params) {
    const [address, amount] = params;
    
    if (!address) {
      throw new Error('Address is required');
    }
    
    if (!amount || amount <= 0) {
      throw new Error('Valid amount is required');
    }
    
    const amountBigInt = typeof amount === 'string' ? BigInt(amount) : BigInt(amount);
    return await this.sheetOps.createClaim(address, amountBigInt);
  }

  async processClaim(params) {
    const [claimId, transactionHash] = params;
    
    if (!claimId) {
      throw new Error('Claim ID is required');
    }
    
    const txHash = transactionHash || ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({
      claimId,
      timestamp: Date.now()
    })));
    
    return await this.sheetOps.processClaim(claimId, txHash);
  }

  async getClaim(params) {
    const [claimId] = params;
    
    if (!claimId) {
      throw new Error('Claim ID is required');
    }
    
    return await this.sheetOps.getClaim(claimId);
  }

  async getClaimsByAddress(params) {
    const [address] = params;
    
    if (!address) {
      throw new Error('Address is required');
    }
    
    return await this.sheetOps.getClaimsByAddress(address);
  }

  async getAllClaims() {
    return await this.sheetOps.getAllClaims();
  }
}

module.exports = RPCHandlers;