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
        
      case 'bridgeOut':
        return await this.bridgeOut(params);
      
      case 'eth_requestAccounts':
        // MetaMask uses this to get accounts - return empty array (accounts managed by MetaMask)
        return [];
        
      case 'wallet_requestPermissions':
        // MetaMask permission request - return empty permissions
        return [];
        
      default:
        // Log unsupported methods instead of throwing to see what MetaMask is requesting
        console.warn(`⚠️  Unsupported RPC method requested: ${method}`, { params });
        throw new Error(`Method ${method} not supported`);
    }
  }

  async getBalance(params) {
    const [address, blockTag] = params;
    // Removed verbose logging - too noisy for routine balance checks
    const balance = await this.sheetOps.getBalance(address);
    const hexBalance = '0x' + balance.toString(16);
    return hexBalance;
  }

  async getTransactionCount(params) {
    const [address, blockTag] = params;
    const nonce = await this.sheetOps.getNonce(address);
    return '0x' + nonce.toString(16);
  }

  async sendRawTransaction(params) {
    console.log('🚨🚨🚨 sendRawTransaction HANDLER CALLED 🚨🚨🚨', {
      hasParams: !!params,
      paramLength: params?.[0]?.length || 0,
      timestamp: new Date().toISOString()
    });
    
    const [signedTx] = params;
    if (!signedTx) {
      console.error('❌ No signed transaction provided to sendRawTransaction');
      throw new Error('No signed transaction provided');
    }
    
    const tx = ethers.Transaction.from(signedTx);
    console.log('🚨🚨🚨 Transaction parsed in sendRawTransaction 🚨🚨🚨', {
      txHash: tx.hash,
      from: tx.from,
      to: tx.to,
      dataPrefix: tx.data ? tx.data.substring(0, 10) : 'no data',
      timestamp: new Date().toISOString()
    });
    
    // Note: Signature verification is handled in server.js for eth_sendRawTransaction
    // This method is kept for compatibility but the main verification happens upstream
    
    // Use the actual transaction hash from the signed transaction
    const actualTxHash = tx.hash;
    
    const txData = {
      from: tx.from,
      to: tx.to,
      value: tx.value.toString(),
      nonce: tx.nonce,
      gasLimit: tx.gasLimit.toString(),
      // gasPrice: tx.gasPrice ? tx.gasPrice.toString() : tx.maxFeePerGas.toString(),
      data: tx.data
    };
    
    const result = await this.sheetOps.processTransaction(txData, actualTxHash);
    return result.transactionHash;
  }

  async sendTransaction(params) {
    const [tx] = params;
    
    if (!tx.from) {
      throw new Error('From address is required');
    }

    // Log all sendTransaction requests for debugging
    // Use console.log for now since logger isn't passed to handlers
    const logger = {
      info: (...args) => console.log('[INFO]', ...args),
      error: (...args) => console.error('[ERROR]', ...args),
      warn: (...args) => console.warn('[WARN]', ...args)
    };
    logger.info('📤 eth_sendTransaction received:', {
      from: tx.from,
      to: tx.to,
      value: tx.value ? tx.value.toString() : '0',
      dataPrefix: tx.data ? tx.data.substring(0, 10) : 'no data',
      nonce: tx.nonce
    });

    // Handle bridgeTransfer calls sent as eth_sendTransaction (e.g. from wallets)
    // by decoding the call data and delegating to SheetOperations.bridgeTransfer.
    if (tx.to && tx.data) {
      const toLower = tx.to.toLowerCase();
      const data = tx.data;
      const BRIDGE_CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000003';

      if (toLower === BRIDGE_CONTRACT_ADDRESS.toLowerCase()) {
        logger.info('🌉🌉🌉 TRANSACTION TO BRIDGE CONTRACT (sendTransaction) 🌉🌉🌉', {
          from: tx.from,
          to: tx.to,
          dataPrefix: data.substring(0, 10),
          dataLength: data.length,
          value: tx.value ? tx.value.toString() : '0',
          fullData: data
        });

        const bridgeTransferSelector = ethers.id('bridgeTransfer(address,uint256)').slice(0, 10);

        if (data.startsWith(bridgeTransferSelector)) {
          logger.info('🌉🌉🌉 BRIDGE TRANSFER TRANSACTION DETECTED (sendTransaction) 🌉🌉🌉', {
            from: tx.from,
            to: tx.to,
            dataPrefix: data.substring(0, 10),
            selector: bridgeTransferSelector
          });

          const BRIDGE_OPERATOR_ADDRESS = (process.env.BRIDGE_OPERATOR_ADDRESS || '0x337d7730a281efE851dbEDf5F4eD0D2610E59639').toLowerCase();

          const caller = tx.from.toLowerCase();
          if (caller !== BRIDGE_OPERATOR_ADDRESS) {
            logger.error('❌ Unauthorized bridgeTransfer caller:', {
              caller: caller,
              expected: BRIDGE_OPERATOR_ADDRESS
            });
            throw new Error('Unauthorized bridgeTransfer caller');
          }

          logger.info('✅ Bridge operator authorized:', {
            caller: caller
          });

          const iface = new ethers.Interface([
            'function bridgeTransfer(address recipient, uint256 amount)'
          ]);

          let recipient, amount;
          try {
            const decoded = iface.decodeFunctionData('bridgeTransfer', data);
            recipient = decoded[0];
            amount = decoded[1];
            logger.info('📋 BridgeTransfer parameters decoded:', {
              recipient: recipient,
              amount: amount.toString() + ' wei',
              amountEth: ethers.formatEther(amount) + ' ETH'
            });
          } catch (error) {
            logger.error('❌ Failed to decode bridgeTransfer parameters:', {
              error: error.message,
              data: data
            });
            throw new Error(`Failed to decode bridgeTransfer parameters: ${error.message}`);
          }

          // No canonical tx hash here (eth_sendTransaction), so let SheetOps
          // generate one for bookkeeping.
          logger.info('🔄 Calling sheetOps.bridgeTransfer...');
          const transferResult = await this.sheetOps.bridgeTransfer(recipient, amount);
          logger.info('✅ BridgeTransfer completed (sendTransaction):', {
            transactionHash: transferResult.transactionHash,
            recipient: recipient,
            amount: amount.toString() + ' wei'
          });
          return transferResult.transactionHash;
        }
      }
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
    // Removed verbose logging - too noisy for routine block number checks
    return blockNumberHex;
  }

  getGasPrice() {
    return '0x3b9aca00';
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

  async bridgeOut(params) {
    const [fromAddress, amount, toAddress, destChainId] = params;
    
    if (!fromAddress) {
      throw new Error('From address is required');
    }
    
    if (!amount || amount <= 0) {
      throw new Error('Valid amount is required');
    }
    
    if (!toAddress) {
      throw new Error('Destination address is required');
    }
    
    if (!destChainId) {
      throw new Error('Destination chain ID is required');
    }
    
    // Convert amount to BigInt if it's a string
    const amountBigInt = typeof amount === 'string' 
      ? (amount.startsWith('0x') ? BigInt(amount) : BigInt(amount))
      : BigInt(amount);
    
    // Convert destChainId to number if it's a string
    const chainId = typeof destChainId === 'string'
      ? (destChainId.startsWith('0x') ? parseInt(destChainId, 16) : parseInt(destChainId))
      : parseInt(destChainId);
    
    return await this.sheetOps.bridgeOut(fromAddress, amountBigInt, toAddress, chainId);
  }
}

module.exports = RPCHandlers;
