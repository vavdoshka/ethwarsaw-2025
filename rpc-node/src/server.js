require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const winston = require('winston');
const { ethers } = require('ethers');
const GoogleSheetsClient = require('./sheets/client');
const SheetOperations = require('./sheets/operations');
const RPCHandlers = require('./rpc/handlers');
const TransactionValidator = require('./rpc/validator');

// Smart Contract Simulation Handlers
const contractHandlers = new Map();

// Register a contract handler for specific address and selector
function registerContractHandler(contractAddress, selector, handler) {
  const key = `${contractAddress.toLowerCase()}:${selector.toLowerCase()}`;
  contractHandlers.set(key, handler);
  console.log(`📝 Registered contract handler: ${contractAddress} -> ${selector}`);
}

// Get handler for contract address and selector
function getContractHandler(contractAddress, selector) {
  const key = `${contractAddress.toLowerCase()}:${selector.toLowerCase()}`;
  return contractHandlers.get(key);
}

// Initialize default handlers
function initializeContractHandlers() {
  // EthWarsaw2025Airdrop contract handlers
  const airdropAddress = AIRDROP_CONTRACT_ADDRESS;
  
  // totalClaimants() - returns dynamic claim count
  registerContractHandler(airdropAddress, '0x87764571', () => {
    const hexCount = claimCounter.toString(16).padStart(64, '0');
    return '0x' + hexCount;
  });
  
  // totalClaimants() - correct selector
  registerContractHandler(airdropAddress, '0x3f1368de', () => {
    const hexCount = claimCounter.toString(16).padStart(64, '0');
    return '0x' + hexCount;
  });
  
  // hasClaimed(address) - correct selector 0x73b2e80e
  // This will be handled dynamically in eth_call with address decoding
  registerContractHandler(airdropAddress, '0x73b2e80e', () => {
    return '0x0000000000000000000000000000000000000000000000000000000000000000'; // placeholder
  });
  
  // AIRDROP_AMOUNT() - returns 0.01 ETH in wei
  registerContractHandler(airdropAddress, '0x18160ddd', () => {
    return '0x0000000000000000000000000000000000000000000000000000000000000000'; // 0
  });
  
  // MAX_CLAIMANTS() - returns 1000
  registerContractHandler(airdropAddress, '0x06fdde03', () => {
    return '0x00000000000000000000000000000000000000000000000000000000000003e8'; // 1000
  });
  
  // claimAirdropEthWarsaw2025() - returns success (true)
  registerContractHandler(airdropAddress, '0x75066be0', () => {
    return '0x0000000000000000000000000000000000000000000000000000000000000001'; // true
  });
  
  // claimAirdropEthWarsaw2025() - correct selector from frontend
  registerContractHandler(airdropAddress, '0xe21fa87b', () => {
    return '0x0000000000000000000000000000000000000000000000000000000000000001'; // true
  });
  
  // bridge(uint256) - function selector 0x90fd50b3
  registerContractHandler(airdropAddress, '0x90fd50b3', () => {
    return '0x0000000000000000000000000000000000000000000000000000000000000001'; // true
  });
  
  // Bridge Contract handlers (0x0000000000000000000000000000000000000003)
  const bridgeAddress = BRIDGE_CONTRACT_ADDRESS;
  
  // bridgeBalance() - returns the bridge account balance
  // Function selector: keccak256("bridgeBalance()") -> 0x...
  registerContractHandler(bridgeAddress, ethers.id('bridgeBalance()').slice(0, 10), async () => {
    // Access sheetOps at call time (it will be available after initialization)
    if (!sheetOps) return '0x' + '0'.repeat(64);
    const bridgeAccountAddress = sheetOps.getBridgeAccountAddress();
    const balance = await sheetOps.getBalance(bridgeAccountAddress);
    return '0x' + balance.toString(16).padStart(64, '0');
  });
  
  // isBridgeOperator(address) - checks if an address is a bridge operator
  // Function selector: keccak256("isBridgeOperator(address)") -> 0x...
  // Note: This is handled dynamically in eth_call with address decoding (see below)
  registerContractHandler(bridgeAddress, ethers.id('isBridgeOperator(address)').slice(0, 10), () => {
    // Placeholder - actual implementation is in eth_call handler
    return '0x0000000000000000000000000000000000000000000000000000000000000000';
  });
  
  // bridgeAccount() - returns the bridge account address
  // Function selector: keccak256("bridgeAccount()") -> 0x...
  registerContractHandler(bridgeAddress, ethers.id('bridgeAccount()').slice(0, 10), () => {
    // Access sheetOps at call time (it will be available after initialization)
    if (!sheetOps) return '0x' + '0'.repeat(64);
    const bridgeAccountAddress = sheetOps.getBridgeAccountAddress();
    // Return address padded to 32 bytes (64 hex chars)
    return '0x' + bridgeAccountAddress.slice(2).padStart(64, '0');
  });
}

// Contract addresses
const BRIDGE_CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000003';
const AIRDROP_CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000001';

// Bridge operator address (on external chain) allowed to release
// funds from the bridge contract to users on SheetChain.
// Default is the hard-coded address, but it can be overridden via env.
// Updated default to match the wallet address that has balance
let BRIDGE_OPERATOR_ADDRESS = (process.env.BRIDGE_OPERATOR_ADDRESS || '0x337d7730a281efE851dbEDf5F4eD0D2610E59639').toLowerCase();

async function handleBridgeTransferTransaction(tx) {
  // Only the bridge operator is allowed to trigger releases
  const caller = tx.from.toLowerCase();
  logger.info('🔐 Checking bridge operator authorization...', {
    caller: caller,
    expectedOperator: BRIDGE_OPERATOR_ADDRESS.toLowerCase(),
    authorized: caller === BRIDGE_OPERATOR_ADDRESS.toLowerCase()
  });
  
  if (caller !== BRIDGE_OPERATOR_ADDRESS.toLowerCase()) {
    logger.error('❌ Unauthorized bridgeTransfer caller', {
      caller,
      expected: BRIDGE_OPERATOR_ADDRESS.toLowerCase(),
      txHash: tx.hash
    });
    throw new Error('Unauthorized bridgeTransfer caller');
  }

  logger.info('✅ Bridge operator authorized');

  const bridgeTransferSelector = ethers.id('bridgeTransfer(address,uint256)').slice(0, 10);
  const iface = new ethers.Interface([
    'function bridgeTransfer(address recipient, uint256 amount)'
  ]);

  let recipient, amount;
  try {
    const decoded = iface.decodeFunctionData('bridgeTransfer', tx.data);
    recipient = decoded[0];
    amount = BigInt(decoded[1]);

    logger.info('🌉 BridgeTransfer decoded:', {
      operator: caller,
      bridgeAccount: sheetOps ? sheetOps.getBridgeAccountAddress() : null,
      recipient: recipient,
      recipientLower: recipient.toLowerCase(),
      amountWei: amount.toString(),
      amountEth: ethers.formatEther(amount) + ' ETH',
      txHash: tx.hash
    });
  } catch (decodeError) {
    logger.error('❌ Failed to decode bridgeTransfer parameters:', {
      error: decodeError.message,
      data: tx.data,
      selector: bridgeTransferSelector,
      txHash: tx.hash
    });
    throw new Error(`Failed to decode bridgeTransfer parameters: ${decodeError.message}`);
  }

  if (!sheetOps) {
    logger.error('❌ Sheet operations not initialized');
    throw new Error('Sheet operations not initialized for bridgeTransfer');
  }

  // Get balances before transfer for logging
  const bridgeAccountAddress = sheetOps.getBridgeAccountAddress();
  const bridgeBalanceBefore = await sheetOps.getBalance(bridgeAccountAddress);
  const recipientBalanceBefore = await sheetOps.getBalance(recipient.toLowerCase());
  
  logger.info('💰 Balances BEFORE bridge transfer:', {
    bridgeAccount: bridgeAccountAddress,
    bridgeBalance: bridgeBalanceBefore.toString() + ' wei (' + ethers.formatEther(bridgeBalanceBefore) + ' ETH)',
    recipient: recipient,
    recipientBalance: recipientBalanceBefore.toString() + ' wei (' + ethers.formatEther(recipientBalanceBefore) + ' ETH)',
    transferAmount: amount.toString() + ' wei (' + ethers.formatEther(amount) + ' ETH)'
  });

  // Use the outer transaction hash for bookkeeping so the
  // internal virtual transfer shares the same tx id.
  const transferResult = await sheetOps.bridgeTransfer(recipient, amount, tx.hash);

  // Get balances after transfer for logging
  const bridgeBalanceAfter = await sheetOps.getBalance(bridgeAccountAddress);
  const recipientBalanceAfter = await sheetOps.getBalance(recipient.toLowerCase());
  
  logger.info('💰 Balances AFTER bridge transfer:', {
    bridgeAccount: bridgeAccountAddress,
    bridgeBalance: bridgeBalanceAfter.toString() + ' wei (' + ethers.formatEther(bridgeBalanceAfter) + ' ETH)',
    bridgeBalanceChange: (bridgeBalanceAfter - bridgeBalanceBefore).toString() + ' wei',
    recipient: recipient,
    recipientBalance: recipientBalanceAfter.toString() + ' wei (' + ethers.formatEther(recipientBalanceAfter) + ' ETH)',
    recipientBalanceChange: (recipientBalanceAfter - recipientBalanceBefore).toString() + ' wei'
  });

  logger.info('✅ BridgeTransfer processed successfully:', {
    transactionHash: transferResult.transactionHash,
    blockNumber: transferResult.blockNumber,
    from: transferResult.from,
    to: transferResult.to,
    amount: transferResult.amount,
    bridgeAccount: transferResult.bridgeAccount
  });

  return transferResult;
}

const app = express();
const PORT = process.env.PORT || 8545;

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Initialize contract handlers
initializeContractHandlers();


app.use(cors());
app.use(bodyParser.json());

// Add cache-control headers to prevent MetaMask from caching balance responses
app.use((req, res, next) => {
  // Prevent caching of RPC responses, especially balance queries
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Add error handling for JSON parsing
app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    logger.error('JSON Parse Error:', {
      error: error.message,
      body: req.body,
      headers: req.headers,
      ip: req.ip
    });
    return res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32700,
        message: 'Parse error'
      },
      id: null
    });
  }
  next();
});

// Helper function to detect MetaMask
function isMetaMaskRequest(req) {
  const userAgent = req.get('User-Agent') || '';
  const origin = req.get('Origin') || '';
  return userAgent.includes('MetaMask') || origin.includes('metamask') || userAgent.includes('Mozilla/5.0');
}


// Enhanced logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substr(2, 9);
  const isMetaMask = isMetaMaskRequest(req);
  
  // Log incoming request body for debugging (only for non-routine methods)
  if (req.body && req.body.method) {
    const routineMethods = ['eth_getBalance', 'eth_chainId', 'net_version', 'eth_blockNumber'];
    if (!routineMethods.includes(req.body.method)) {
      logger.debug('🔍 RAW REQUEST BODY:', {
        method: req.body.method,
        params: req.body.params,
        id: req.body.id,
        jsonrpc: req.body.jsonrpc
      });
    }
  }

  // Override res.json to log response details (only for non-routine methods)
  const originalJson = res.json;
  res.json = function(data) {
    const duration = Date.now() - startTime;
    const method = req.body?.method;
    const routineMethods = ['eth_getBalance', 'eth_chainId', 'net_version', 'eth_blockNumber'];
    
    // Only log responses for non-routine methods or errors
    if (!routineMethods.includes(method) || (data && data.error)) {
      logger.debug('=== RPC RESPONSE ===', {
        requestId,
        duration: `${duration}ms`,
        statusCode: res.statusCode,
        method: method,
        response: data
      });
    }
    
    return originalJson.call(this, data);
  };
  
  next();
});

let rpcHandler;
let validator;
let sheetOps;
let isInitialized = false;
let claimCounter = 0;

async function initialize() {
  try {
    logger.info('Initializing SheetChain RPC Node...');
    
    if (!process.env.GOOGLE_SHEET_ID) {
      throw new Error('GOOGLE_SHEET_ID environment variable is required');
    }
    
    const sheetsClient = new GoogleSheetsClient();
    await sheetsClient.initialize();
    
    sheetOps = new SheetOperations(sheetsClient);
    rpcHandler = new RPCHandlers(sheetOps);
    validator = new TransactionValidator();

    // Log bridge account info
    const bridgeAccountAddress = sheetOps.getBridgeAccountAddress();
    const bridgeAccount = sheetOps.getBridgeAccount();
    if (bridgeAccount) {
      logger.info(`🌉 Bridge account configured: ${bridgeAccountAddress}`);
    } else {
      logger.warn(`⚠️  Bridge account using default address: ${bridgeAccountAddress} (BRIDGE_ACCOUNT_PRIVATE_KEY not set)`);
    }

    // Initialize claim counter from existing claims
    try {
      const existingClaims = await sheetOps.getAllClaims();
      const completedClaims = existingClaims.filter(claim => claim.status === 'completed');
      claimCounter = completedClaims.length;
      logger.info(`Initialized with ${claimCounter} existing claims`);
    } catch (error) {
      logger.warn('Could not initialize claim counter:', error);
      claimCounter = 0;
    }

    // Log top 3 accounts and balances
    try {
      const allBalances = await sheetOps.getAllBalances();
      const topAccounts = allBalances.slice(0, 3);
      
      if (topAccounts.length > 0) {
        logger.info('📊 Top 3 Accounts by Balance:');
        topAccounts.forEach((account, index) => {
          const balanceInEth = ethers.formatEther(account.balance);
          logger.info(`   ${index + 1}. ${account.address}: ${balanceInEth} ETH (Nonce: ${account.nonce})`);
        });
      } else {
        logger.info('📊 No accounts with balances found');
      }
    } catch (error) {
      logger.warn('Could not fetch top accounts:', error.message);
    }

    isInitialized = true;
    logger.info('SheetChain RPC Node initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize:', error);
    process.exit(1);
  }
}

app.post('/', async (req, res) => {
  if (!isInitialized) {
    return res.status(503).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Server is initializing'
      },
      id: req.body.id
    });
  }
  
  // Handle batch requests (array of requests)
  if (Array.isArray(req.body)) {
    logger.info('📦 Batch request received:', { count: req.body.length });
    // Log all methods in batch for debugging
    const batchMethods = req.body.map(r => r.method).filter(Boolean);
    if (batchMethods.some(m => m === 'eth_sendRawTransaction')) {
      console.log('🚨🚨🚨 BATCH REQUEST CONTAINS eth_sendRawTransaction 🚨🚨🚨', {
        methods: batchMethods,
        count: req.body.length,
        timestamp: new Date().toISOString()
      });
    }
    // Process all requests in the batch and return array of responses
    const batchResults = await Promise.all(
      req.body.map(async (batchReq) => {
        const { jsonrpc: batchJsonrpc, method: batchMethod, params: batchParams, id: batchId } = batchReq;
        
        // Log eth_sendRawTransaction in batch
        if (batchMethod === 'eth_sendRawTransaction') {
          console.log('🚨🚨🚨 PROCESSING eth_sendRawTransaction IN BATCH 🚨🚨🚨', {
            id: batchId,
            hasParams: !!batchParams,
            paramLength: batchParams?.[0]?.length || 0,
            timestamp: new Date().toISOString()
          });
        }
        
        if (batchJsonrpc !== '2.0') {
          return {
            jsonrpc: '2.0',
            error: {
              code: -32600,
              message: `Invalid JSON-RPC version. Expected '2.0', got '${batchJsonrpc}'`
            },
            id: batchId || null
          };
        }
        
        try {
          // Handle bridge transfer detection for batch requests
          let batchResult;
          if (batchMethod === 'eth_sendRawTransaction' && batchParams && batchParams[0]) {
            const rawTx = batchParams[0];
            let tx;
            
            try {
              tx = ethers.Transaction.from(rawTx);
              
              console.log('📨📨📨 eth_sendRawTransaction received (BATCH):', {
                txHash: tx.hash,
                from: tx.from,
                to: tx.to,
                value: tx.value ? tx.value.toString() : '0',
                dataPrefix: tx.data ? tx.data.substring(0, 10) : 'no data',
                nonce: tx.nonce,
                timestamp: new Date().toISOString()
              });
              
              const txTo = tx.to ? tx.to.toLowerCase() : null;
              const txData = tx.data || '';
              
              // Check if this is a bridge transfer transaction
              if (txTo === BRIDGE_CONTRACT_ADDRESS.toLowerCase() && txData) {
                const bridgeTransferSelector = ethers.id('bridgeTransfer(address,uint256)').slice(0, 10);
                
                if (txData.startsWith(bridgeTransferSelector)) {
                  console.log('🌉🌉🌉 BRIDGE TRANSFER TRANSACTION DETECTED (BATCH) 🌉🌉🌉', {
                    txHash: tx.hash,
                    from: tx.from,
                    to: tx.to,
                    dataPrefix: txData.substring(0, 10),
                    timestamp: new Date().toISOString()
                  });
                  
                  // Process bridge transfer directly
                  const transferResult = await handleBridgeTransferTransaction(tx);
                  batchResult = transferResult.transactionHash;
                  
                  console.log('✅✅✅ BRIDGE TRANSFER PROCESSED (BATCH) ✅✅✅', {
                    txHash: tx.hash,
                    resultTxHash: transferResult.transactionHash,
                    timestamp: new Date().toISOString()
                  });
                }
              }
            } catch (parseError) {
              // If parsing fails, fall through to handler
              console.warn('Failed to parse transaction for bridge detection in batch, using handler:', parseError.message);
            }
          }
          
          // If result wasn't set by bridge transfer handling, use the handler
          if (batchResult === undefined) {
            batchResult = await rpcHandler.handleRequest(batchMethod, batchParams || []);
          }
          
          return {
            jsonrpc: '2.0',
            result: batchResult,
            id: batchId
          };
        } catch (error) {
          return {
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: error.message
            },
            id: batchId
          };
        }
      })
    );
    
    return res.json(batchResults);
  }
  
  const { jsonrpc, method, params, id } = req.body;
  
  // Log all RPC requests for debugging (skip routine methods)
  const routineMethods = ['eth_getBalance', 'eth_chainId', 'net_version', 'eth_blockNumber'];
  if (!routineMethods.includes(method)) {
    logger.info('📥 RPC Request:', { 
      method, 
      params: params ? JSON.stringify(params).substring(0, 200) : null, 
      id,
      jsonrpc
    });
  }
  
  // Check if jsonrpc field exists and is valid
  if (!jsonrpc) {
    logger.error('❌ Missing jsonrpc field in request:', { 
      body: JSON.stringify(req.body).substring(0, 500),
      bodyType: typeof req.body,
      isArray: Array.isArray(req.body)
    });
    return res.json({
      jsonrpc: '2.0',
      error: {
        code: -32600,
        message: 'Invalid request: missing jsonrpc field'
      },
      id: id || null
    });
  }
  
  if (jsonrpc !== '2.0') {
    logger.error('❌ Invalid JSON-RPC version:', { 
      received: jsonrpc, 
      expected: '2.0',
      requestBody: JSON.stringify(req.body).substring(0, 500)
    });
    return res.json({
      jsonrpc: '2.0',
      error: {
        code: -32600,
        message: `Invalid JSON-RPC version. Expected '2.0', got '${jsonrpc}'`
      },
      id: id || null
    });
  }
  
  // Log eth_sendRawTransaction requests at entry point
  if (method === 'eth_sendRawTransaction') {
    console.log('🚨🚨🚨 eth_sendRawTransaction REQUEST RECEIVED (single) 🚨🚨🚨', {
      id: id,
      hasParams: !!params,
      paramLength: params?.[0]?.length || 0,
      timestamp: new Date().toISOString()
    });
  }
  
  // Handle eth_sendRawTransaction BEFORE calling handler to detect bridge transfers
  let result;
  if (method === 'eth_sendRawTransaction' && params && params[0]) {
    const rawTx = params[0];
    let tx;
    
    try {
      tx = ethers.Transaction.from(rawTx);
      
      // Log all raw transactions for debugging bridge transfers
      console.log('📨📨📨 eth_sendRawTransaction received:', {
        txHash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: tx.value ? tx.value.toString() : '0',
        dataPrefix: tx.data ? tx.data.substring(0, 10) : 'no data',
        nonce: tx.nonce,
        timestamp: new Date().toISOString()
      });
      
      const txTo = tx.to ? tx.to.toLowerCase() : null;
      const txData = tx.data || '';
      
      // Check if this is a bridge transfer transaction
      if (txTo === BRIDGE_CONTRACT_ADDRESS.toLowerCase() && txData) {
        const bridgeTransferSelector = ethers.id('bridgeTransfer(address,uint256)').slice(0, 10);
        
        if (txData.startsWith(bridgeTransferSelector)) {
          console.log('🌉🌉🌉 BRIDGE TRANSFER TRANSACTION DETECTED (BEFORE HANDLER) 🌉🌉🌉', {
            txHash: tx.hash,
            from: tx.from,
            to: tx.to,
            dataPrefix: txData.substring(0, 10),
            timestamp: new Date().toISOString()
          });
          
          // Process bridge transfer directly
          const transferResult = await handleBridgeTransferTransaction(tx);
          result = transferResult.transactionHash;
          
          console.log('✅✅✅ BRIDGE TRANSFER PROCESSED (BEFORE HANDLER) ✅✅✅', {
            txHash: tx.hash,
            resultTxHash: transferResult.transactionHash,
            timestamp: new Date().toISOString()
          });
        }
      }
    } catch (parseError) {
      // If parsing fails, fall through to handler
      console.warn('Failed to parse transaction for bridge detection, using handler:', parseError.message);
    }
  }
  
  // If result wasn't set by bridge transfer handling, use the handler
  try {
    if (result === undefined) {
      result = await rpcHandler.handleRequest(method, params || []);
    }
    
    // Log estimateGas requests specifically (MetaMask uses this to validate transactions)
    if (method === 'eth_estimateGas') {
      logger.info('⛽ eth_estimateGas request:', { 
        params: params ? JSON.stringify(params).substring(0, 300) : null,
        id 
      });
    }
    
    // Smart contract simulation handler
    if (method === 'eth_call' && params && params[0] && params[0].data && params[0].to) {
      const contractAddress = params[0].to.toLowerCase();
      const selector = params[0].data.substring(0, 10);
      
      
      // Special handling for hasClaimed(address) function
      if (selector === '0x73b2e80e' && contractAddress === AIRDROP_CONTRACT_ADDRESS.toLowerCase()) {
        try {
          // Decode the address parameter from the data
          // Remove the selector (first 10 chars) and get the address (padded to 32 bytes)
          const addressParam = '0x' + params[0].data.substring(34, 74); // Get 40 chars after padding
          
          // Check if this address has claimed
          const claims = await sheetOps.getClaimsByAddress(addressParam);
          const hasClaimedBefore = claims.some(claim => claim.status === 'completed');
          
          // Return boolean result (true = 1, false = 0)
          result = hasClaimedBefore 
            ? '0x0000000000000000000000000000000000000000000000000000000000000001'
            : '0x0000000000000000000000000000000000000000000000000000000000000000';
          
          logger.info('🎯 hasClaimed check:', {
            selector: selector,
            address: addressParam,
            hasClaimedBefore: hasClaimedBefore,
            claimsFound: claims.length,
            completedClaims: claims.filter(c => c.status === 'completed').length,
            result: result
          });
        } catch (error) {
          logger.error('Error checking hasClaimed:', error);
          result = '0x0000000000000000000000000000000000000000000000000000000000000000';
        }
      }
      // Special handling for isBridgeOperator(address) function
      else if (selector === ethers.id('isBridgeOperator(address)').slice(0, 10) && 
               contractAddress === BRIDGE_CONTRACT_ADDRESS.toLowerCase()) {
        try {
          // Decode the address parameter from the data
          const addressParam = '0x' + params[0].data.substring(34, 74);
          const isOperator = addressParam.toLowerCase() === BRIDGE_OPERATOR_ADDRESS.toLowerCase();
          
          // Return boolean result (true = 1, false = 0)
          result = isOperator
            ? '0x0000000000000000000000000000000000000000000000000000000000000001'
            : '0x0000000000000000000000000000000000000000000000000000000000000000';
          
          logger.info('🌉 isBridgeOperator check:', {
            selector: selector,
            address: addressParam,
            isOperator: isOperator,
            expectedOperator: BRIDGE_OPERATOR_ADDRESS,
            result: result
          });
        } catch (error) {
          logger.error('Error checking isBridgeOperator:', error);
          result = '0x0000000000000000000000000000000000000000000000000000000000000000';
        }
      } else {
        // Check if we have a handler for this contract and selector
        const handler = getContractHandler(contractAddress, selector);
        
        if (handler) {
          // Handle both sync and async handlers
          const handlerResult = handler(selector, params[0].data, params[0].to);
          if (handlerResult instanceof Promise) {
            result = await handlerResult;
          } else {
            result = handlerResult;
          }
          
          // Log bridge calls
          if (selector === '0x90fd50b3') {
            logger.info('🌉 Bridge function called');
          }
        } else {
          // Return empty result for unknown functions
          result = '0x';
        }
      }
    }
    
    // Handle eth_sendRawTransaction - process different transaction types
    if (method === 'eth_sendRawTransaction' && params && params[0]) {
      const rawTx = params[0];
      let tx;
      
      try {
        tx = ethers.Transaction.from(rawTx);
        
        // Log all raw transactions for debugging bridge transfers
        // Use console.log to ensure it always shows up
        console.log('📨📨📨 eth_sendRawTransaction received:', {
          txHash: tx.hash,
          from: tx.from,
          to: tx.to,
          value: tx.value ? tx.value.toString() : '0',
          dataPrefix: tx.data ? tx.data.substring(0, 10) : 'no data',
          nonce: tx.nonce,
          timestamp: new Date().toISOString()
        });
        logger.info('📨 eth_sendRawTransaction received:', {
          txHash: tx.hash,
          from: tx.from,
          to: tx.to,
          value: tx.value ? tx.value.toString() : '0',
          dataPrefix: tx.data ? tx.data.substring(0, 10) : 'no data',
          nonce: tx.nonce
        });
      } catch (parseError) {
        logger.error('Failed to parse raw transaction:', parseError);
        throw new Error(`Invalid transaction format: ${parseError.message}`);
      }
      
      // Verify transaction signature using the hash computed by ethers
      // Transaction.from() recovers the signer and populates tx.from for us.
      try {
        // Verify signature components exist
        if (!tx.signature || !tx.signature.r || !tx.signature.s || tx.signature.v === undefined) {
          throw new Error('Transaction missing signature components');
        }

        // Recover the signer address from the unsigned transaction hash and signature.
        // unsignedHash is the digest that was actually signed (handles legacy & EIP-1559).
        const unsignedHash = tx.unsignedHash;
        if (!unsignedHash) {
          throw new Error('Unable to compute unsigned transaction hash for verification');
        }
        const recoveredAddress = ethers.recoverAddress(unsignedHash, tx.signature);

        // Verify the recovered address matches the transaction's from address
        if (recoveredAddress.toLowerCase() !== tx.from.toLowerCase()) {
          logger.error('❌ SIGNATURE VERIFICATION FAILED:', {
            recoveredAddress: recoveredAddress.toLowerCase(),
            txFrom: tx.from.toLowerCase(),
            txHash: tx.hash
          });
          throw new Error('Invalid transaction signature: recovered address does not match sender');
        }
        
        logger.info('✅ Signature verified via ecrecover:', {
          from: tx.from,
          recoveredAddress: recoveredAddress,
          txHash: tx.hash
        });
      } catch (sigError) {
        // If signature verification fails, reject the transaction
        logger.error('❌ Signature verification error:', {
          error: sigError.message,
          from: tx.from,
          txHash: tx.hash
        });
        throw new Error(`Transaction signature verification failed: ${sigError.message}`);
      }
      
      const txTo = tx.to ? tx.to.toLowerCase() : null;
      const txData = tx.data || '';
      
      // Log all transactions to bridge contract for debugging
      if (txTo === BRIDGE_CONTRACT_ADDRESS.toLowerCase()) {
        // Use console.log to ensure it always shows up
        console.log('🌉🌉🌉 TRANSACTION TO BRIDGE CONTRACT DETECTED 🌉🌉🌉', {
          txHash: tx.hash,
          from: tx.from,
          to: tx.to,
          dataPrefix: txData.substring(0, 10),
          dataLength: txData.length,
          value: tx.value ? tx.value.toString() : '0',
          fullData: txData,
          timestamp: new Date().toISOString()
        });
        logger.info('🌉🌉🌉 TRANSACTION TO BRIDGE CONTRACT DETECTED 🌉🌉🌉', {
          txHash: tx.hash,
          from: tx.from,
          to: tx.to,
          dataPrefix: txData.substring(0, 10),
          dataLength: txData.length,
          value: tx.value ? tx.value.toString() : '0',
          fullData: txData
        });
      }
      
      // Handle claim transactions (to airdrop contract with claim selector)
      if (txTo === AIRDROP_CONTRACT_ADDRESS.toLowerCase() && 
          (txData.includes('e21fa87b') || txData.includes('75066be0'))) {
        try {
          const fromAddress = tx.from;
          const toAddress = tx.to;

          // Check if user has already claimed
          const existingClaims = await sheetOps.getClaimsByAddress(fromAddress);
          const hasClaimedBefore = existingClaims.some(claim => claim.status === 'completed');
          
          if (hasClaimedBefore) {
            logger.warn('User has already claimed:', {
              address: fromAddress,
              existingClaims: existingClaims.length
            });
            throw new Error('User has already claimed the airdrop');
          }

          const claimAmount = BigInt(5e18);

          // Get current user balance and nonce
          const currentBalance = await sheetOps.getBalance(fromAddress);
          const currentNonce = await sheetOps.getNonce(fromAddress);
          
          // Update user balance with claimed amount
          const newBalance = currentBalance + claimAmount;
          // await sheetOps.updateBalance(fromAddress, newBalance, currentNonce);

          // Create transaction record in Transactions sheet
          const txHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({
            from: fromAddress,
            to: toAddress,
            value: claimAmount.toString(),
            nonce: currentNonce,
            timestamp: Date.now(),
            type: 'claim'
          })));

          // Get crypto prices for transaction record
          const cryptoPrices = await sheetOps.fetchCryptoPrices();

          // Record transaction in Transactions sheet
          const blockNumber = await sheetOps.getLatestBlockNumber() + 1;
          await sheetOps.client.appendRow('Transactions', [
            new Date().toISOString(),
            txHash,
            toAddress,
            fromAddress,
            claimAmount.toString(),
            currentNonce.toString(),
            'Success',
            blockNumber.toString(),
            '0', // Standard gas used
            cryptoPrices.btcPrice.toString(),
            cryptoPrices.ethPrice.toString()
          ]);
          
          // Create the claim record in Claims sheet
          const claim = await sheetOps.createClaim(fromAddress, claimAmount.toString());
          
          // Process the claim immediately with the transaction hash
          await sheetOps.processClaim(claim.claimId, txHash);

          // Increment the claim counter
          claimCounter++;

          logger.info('✅ CLAIM PROCESSED:', {
            method: 'eth_sendRawTransaction',
            selector: rawTx.includes('e21fa87b') ? '0xe21fa87b' : '0x75066be0',
            function: 'claimAirdropEthWarsaw2025()',
            claimId: claim.claimId,
            txHash: txHash,
            address: fromAddress,
            amount: claimAmount.toString(),
            previousBalance: ethers.formatEther(currentBalance) + ' ETH',
            newBalance: ethers.formatEther(newBalance) + ' ETH',
            totalClaims: claimCounter,
          });
        } catch (error) {
          logger.error('Failed to process claim:', error);
          // Fallback to mock transaction hash
          const mockTxHash = '0x' + Math.random().toString(16).substr(2, 64);
          result = mockTxHash;
        }
      }
      // Handle bridgeOut transactions (Sheet Chain to other chains)
      // bridgeOut(string toAddress, uint256 destChainId)
      // Function selector: keccak256("bridgeOut(string,uint256)") -> 0x...
      // Note: MetaMask signs eth_sendTransaction client-side and sends it as eth_sendRawTransaction
      // Amount is taken from tx.value, not from function parameters
      // toAddress is a string that can be either Ethereum address (0x...) or Solana address (base58)
      else if (txTo === BRIDGE_CONTRACT_ADDRESS.toLowerCase() && txData) {
        const bridgeOutSelector = ethers.id('bridgeOut(string,uint256)').slice(0, 10);
        const bridgeTransferSelector = ethers.id('bridgeTransfer(address,uint256)').slice(0, 10);
        
        logger.info('🌉 Transaction to bridge contract detected:', {
          txHash: tx.hash,
          from: tx.from,
          to: tx.to,
          dataPrefix: txData.substring(0, 10),
          dataLength: txData.length,
          value: tx.value ? tx.value.toString() : '0',
          bridgeOutSelector: bridgeOutSelector,
          bridgeTransferSelector: bridgeTransferSelector,
          matchesBridgeOut: txData.startsWith(bridgeOutSelector),
          matchesBridgeTransfer: txData.startsWith(bridgeTransferSelector)
        });
        
        // New bridgeOut transactions (SheetChain -> other chains)
        if (txData.startsWith(bridgeOutSelector)) {
          try {
            // Decode bridgeOut parameters using ethers.js ABI decoder
            // Function signature: bridgeOut(string toAddress, uint256 destChainId)
            const iface = new ethers.Interface([
              'function bridgeOut(string toAddress, uint256 destChainId) payable'
            ]);
            
            let toAddress, destChainId;
            try {
              const decoded = iface.decodeFunctionData('bridgeOut', tx.data);
              toAddress = decoded[0]; // string toAddress
              destChainId = Number(decoded[1]); // uint256 destChainId (convert BigInt to Number)
              
              logger.debug('BridgeOut decoded:', {
                toAddress,
                destChainId,
                destChainIdType: typeof destChainId
              });
            } catch (decodeError) {
              logger.error('Failed to decode bridgeOut parameters:', {
                error: decodeError.message,
                data: tx.data,
                selector: bridgeOutSelector
              });
              throw new Error(`Failed to decode bridgeOut parameters: ${decodeError.message}`);
            }
            
            // Validate destChainId
            if (isNaN(destChainId) || destChainId < 0) {
              logger.error('Invalid destChainId:', {
                destChainId,
                toAddress
              });
              throw new Error(`Invalid destChainId: ${destChainId}`);
            }
            
            // Use transaction value as the bridge amount (simpler and matches MetaMask display)
            const bridgeAmount = tx.value ? BigInt(tx.value) : BigInt(0);
            const fromAddress = tx.from.toLowerCase();
            
            if (bridgeAmount === BigInt(0)) {
              throw new Error('Bridge amount cannot be zero');
            }
            
            logger.info('🌉 BridgeOut transaction detected:', {
              from: fromAddress,
              toAddress: toAddress,
              amount: ethers.formatEther(bridgeAmount) + ' ETH',
              destChainId: destChainId
            });
            
            // Process bridgeOut
            const bridgeResult = await sheetOps.bridgeOut(
              fromAddress,
              bridgeAmount,
              toAddress,
              destChainId
            );
            
            // Return the transaction hash
            result = bridgeResult.transactionHash;
            
            logger.info('✅ BridgeOut processed:', bridgeResult);
          } catch (bridgeError) {
            logger.error('Failed to process bridgeOut transaction:', bridgeError);
            throw bridgeError;
          }
        }
        // New bridgeTransfer transactions (other chains -> SheetChain)
        else if (txData.startsWith(bridgeTransferSelector)) {
          try {
            // Use console.log to ensure it always shows up
            console.log('🌉🌉🌉 BRIDGE TRANSFER TRANSACTION DETECTED 🌉🌉🌉', {
              txHash: tx.hash,
              from: tx.from,
              to: tx.to,
              value: tx.value ? tx.value.toString() : '0',
              data: tx.data.substring(0, 20) + '...',
              nonce: tx.nonce,
              gasLimit: tx.gasLimit ? tx.gasLimit.toString() : 'unknown',
              timestamp: new Date().toISOString()
            });
            logger.info('🌉🌉🌉 BRIDGE TRANSFER TRANSACTION DETECTED 🌉🌉🌉', {
              txHash: tx.hash,
              from: tx.from,
              to: tx.to,
              value: tx.value ? tx.value.toString() : '0',
              data: tx.data.substring(0, 20) + '...',
              nonce: tx.nonce,
              gasLimit: tx.gasLimit ? tx.gasLimit.toString() : 'unknown'
            });
            
            const transferResult = await handleBridgeTransferTransaction(tx);
            result = transferResult.transactionHash;
            
            logger.info('🌉🌉🌉 BRIDGE TRANSFER COMPLETED 🌉🌉🌉', {
              txHash: tx.hash,
              resultTxHash: transferResult.transactionHash,
              recipient: transferResult.to,
              amount: transferResult.amount,
              blockNumber: transferResult.blockNumber
            });
          } catch (bridgeError) {
            logger.error('❌❌❌ BRIDGE TRANSFER FAILED ❌❌❌', {
              txHash: tx.hash,
              from: tx.from,
              error: bridgeError.message,
              stack: bridgeError.stack
            });
            throw bridgeError;
          }
        }
        // Check for old bridge transactions (selector 0x90fd50b3) - legacy support
        else if (txData.includes('90fd50b3') && !txData.includes(bridgeOutSelector.slice(2))) {
            try {
            // Old bridge transaction handling
            const fromAddress = tx.from;
            const toAddress = tx.to;
            
            // Decode the bridge amount from the transaction data
            const oldTxData = tx.data;
            const paramsHex = oldTxData.slice(10);
            const amountHex = paramsHex.slice(0, 64);
            const bridgeAmount = BigInt('0x' + amountHex);

            // Check if user has sufficient balance for bridging
            const currentBalance = await sheetOps.getBalance(fromAddress);
            if (currentBalance < bridgeAmount) {
              logger.error('❌ INSUFFICIENT BALANCE FOR BRIDGE:', {
                address: fromAddress,
                requestedAmount: ethers.formatEther(bridgeAmount) + ' ETH',
                availableBalance: ethers.formatEther(currentBalance) + ' ETH',
                shortfall: ethers.formatEther(bridgeAmount - currentBalance) + ' ETH'
              });
              
              // Return a specific error that the frontend can recognize
              const insufficientBalanceError = {
                code: -32000,
                message: `Insufficient balance: trying to bridge ${ethers.formatEther(bridgeAmount)} ETH but only have ${ethers.formatEther(currentBalance)} ETH available`,
                data: {
                  type: 'INSUFFICIENT_BALANCE',
                  requested: bridgeAmount.toString(),
                  available: currentBalance.toString(),
                  shortfall: (bridgeAmount - currentBalance).toString()
                }
              };
              
              // Set the error response
              res.status(400).json({
                jsonrpc: '2.0',
                error: insufficientBalanceError,
                id
              });
              
              // Log the insufficient balance attempt
              await sheetOps.client.appendRow('Transactions', [
                new Date().toISOString(),
                '0x' + Math.random().toString(16).substr(2, 64), // Failed tx hash
                toAddress,
                fromAddress,
                bridgeAmount.toString(),
                (await sheetOps.getNonce(fromAddress)).toString(),
                'Failed - Insufficient Balance',
                'N/A',
                '0',
                '0',
                '0'
              ]);
              
              return; // Exit early to prevent further processing
          }
          
          // Calculate new balance after bridge (decrease balance)
          const newBalance = currentBalance - bridgeAmount;
          
          // Get current nonce
          const currentNonce = await sheetOps.getNonce(fromAddress);
          
          // Update user balance in Balances sheet (decrease by bridge amount)
          await sheetOps.updateBalance(fromAddress, newBalance, currentNonce + 1);
          
          logger.info('💰 Updated user balance after bridge:', {
            address: fromAddress,
            previousBalance: ethers.formatEther(currentBalance) + ' ETH',
            bridgeAmount: ethers.formatEther(bridgeAmount) + ' ETH',
            newBalance: ethers.formatEther(newBalance) + ' ETH'
          });
          
          // Create transaction record in Transactions sheet
          const txHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({
            from: fromAddress,
            to: toAddress,
            value: bridgeAmount.toString(),
            nonce: currentNonce,
            timestamp: Date.now(),
            type: 'bridge'
          })));
          
          // Get crypto prices for transaction record
          const cryptoPrices = await sheetOps.fetchCryptoPrices();
          
          // Record transaction in Transactions sheet
          const blockNumber = await sheetOps.getLatestBlockNumber() + 1;
          await sheetOps.client.appendRow('Transactions', [
            new Date().toISOString(),
            txHash,
            toAddress,
            fromAddress,
            bridgeAmount.toString(),
            currentNonce.toString(),
            'Success',
            blockNumber.toString(),
            '0', // Standard gas used
            cryptoPrices.btcPrice.toString(),
            cryptoPrices.ethPrice.toString()
          ]);
          
          // MINT SHEETCOIN TOKENS FOR THE BRIDGED AMOUNT
          const SHEETCOIN_CONTRACT_ADDRESS = process.env.TOKEN_CONTRACT_ADDRESS || '0x5e030a6f6218ada6b29eb46b5344386ea9765702';
          const minterPrivateKey = process.env.MINTER_PRIVATE_KEY;
          const RPC_URL = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
          
          if (!minterPrivateKey || minterPrivateKey === 'your_private_key_here') {
            logger.error('MINTER_PRIVATE_KEY not configured - cannot mint SheetCoin tokens');
          } else {
            try {
              // Connect to Arbitrum Sepolia
              const provider = new ethers.JsonRpcProvider(RPC_URL);
              
              // Create wallet from private key with provider
              const minterWallet = new ethers.Wallet(minterPrivateKey, provider);
              
              logger.info('🔗 Connected to Arbitrum Sepolia for minting');
              
              // Check minter's balance for gas
              const minterBalance = await provider.getBalance(minterWallet.address);
              if (minterBalance === 0n) {
                logger.error('Minter wallet has no ETH for gas fees!', {
                  minterAddress: minterWallet.address,
                  balance: '0 ETH'
                });
                throw new Error('Minter wallet has insufficient ETH for gas');
              }
              
              // Create contract interface
              const sheetCoinInterface = new ethers.Interface([
                "function mint(address _address, uint256 value) external returns (bool)",
                "function owner() external view returns (address)"
              ]);
              
              // Create contract instance
              const sheetCoinContract = new ethers.Contract(
                SHEETCOIN_CONTRACT_ADDRESS,
                sheetCoinInterface,
                minterWallet
              );
              
              // Verify ownership
              const contractOwner = await sheetCoinContract.owner();
              if (contractOwner.toLowerCase() !== minterWallet.address.toLowerCase()) {
                logger.error('Minter is not the contract owner!', {
                  contractOwner: contractOwner,
                  minterAddress: minterWallet.address
                });
                throw new Error('Only the contract owner can mint tokens');
              }
              
              logger.info('🪙 Sending real mint transaction to Arbitrum Sepolia:', {
                minter: minterWallet.address,
                recipient: fromAddress,
                amount: bridgeAmount.toString(),
                amountInEther: ethers.formatEther(bridgeAmount),
                contractAddress: SHEETCOIN_CONTRACT_ADDRESS,
                network: 'Arbitrum Sepolia'
              });
              
              // Estimate gas for the mint transaction
              const gasEstimate = await sheetCoinContract.mint.estimateGas(fromAddress, bridgeAmount);
              const feeData = await provider.getFeeData();
              
              logger.info('⛽ Gas estimation:', {
                gasLimit: gasEstimate.toString(),
                gasPrice: ethers.formatUnits(feeData.gasPrice, 'gwei') + ' gwei',
                estimatedCost: ethers.formatEther(gasEstimate * feeData.gasPrice) + ' ETH'
              });
              
              // Send the actual mint transaction
              const mintTx = await sheetCoinContract.mint(fromAddress, bridgeAmount, {
                gasLimit: gasEstimate * 120n / 100n, // Add 20% buffer
                gasPrice: feeData.gasPrice
              });
              
              logger.info('📝 Mint transaction sent!', {
                txHash: mintTx.hash,
                explorer: `https://sepolia.arbiscan.io/tx/${mintTx.hash}`
              });
              
              // Record pending mint transaction in sheet
              await sheetOps.client.appendRow('Transactions', [
                new Date().toISOString(),
                mintTx.hash,
                SHEETCOIN_CONTRACT_ADDRESS,
                minterWallet.address,
                '0', // No ETH value for mint
                mintTx.nonce.toString(),
                'Pending',
                'pending',
                gasEstimate.toString(),
                cryptoPrices.btcPrice.toString(),
                cryptoPrices.ethPrice.toString()
              ]);
              
              // Wait for confirmation (async - don't block the bridge response)
              mintTx.wait().then(async (receipt) => {
                logger.info('✅ Mint transaction confirmed!', {
                  txHash: receipt.hash,
                  blockNumber: receipt.blockNumber,
                  gasUsed: receipt.gasUsed.toString(),
                  status: receipt.status === 1 ? 'Success' : 'Failed'
                });
                
                // Update transaction status in sheet
                // Note: This would need a method to update existing rows in the sheet
              }).catch((error) => {
                logger.error('Mint transaction failed after sending:', error);
              });

              logger.info('✅ SheetCoin mint transaction initiated for bridge:', {
                bridgeTxHash: txHash,
                mintTxHash: mintTx.hash,
                recipient: fromAddress,
                amount: ethers.formatEther(bridgeAmount) + ' SHEET',
                explorerUrl: `https://sepolia.arbiscan.io/tx/${mintTx.hash}`
              });
              
            } catch (mintError) {
              logger.error('Failed to send mint transaction:', {
                error: mintError.message,
                minterAddress: minterPrivateKey ? new ethers.Wallet(minterPrivateKey).address : 'unknown'
              });
              // Bridge still succeeds even if mint fails
            }
          }
          
          } catch (error) {
            logger.error('Failed to process old bridge transaction:', error);
            // Fallback to mock transaction hash
            const mockTxHash = '0x' + Math.random().toString(16).substr(2, 64);
            result = mockTxHash;
          }
        }
        // Process regular transfers (if not already handled as claim or bridge transaction)
        else if (!result) {
          // This is a regular transfer - process it
          try {
            const txData = {
              from: tx.from,
              to: tx.to,
              value: tx.value ? tx.value.toString() : '0',
              nonce: tx.nonce,
              gasLimit: tx.gasLimit ? tx.gasLimit.toString() : '21000',
              gasPrice: tx.gasPrice ? tx.gasPrice.toString() : '1000000000',
              data: tx.data || '0x'
            };
            
            // Use the actual transaction hash from ethers.js instead of generating a custom one
            // This ensures the hash matches what ethers.js expects
            const actualTxHash = tx.hash;
            
            const transferResult = await sheetOps.processTransaction(txData, actualTxHash);
            result = transferResult.transactionHash;
            
            // Verify the returned hash matches the actual transaction hash
            if (result !== actualTxHash) {
              logger.warn('⚠️  Transaction hash mismatch - using actual hash from signed transaction', {
                returned: result,
                actual: actualTxHash
              });
              result = actualTxHash;
            }
            
            logger.info('💸 Regular transfer processed:', {
              from: tx.from,
              to: tx.to,
              amount: ethers.formatEther(tx.value || 0) + ' ETH',
              txHash: result
            });
          } catch (error) {
            logger.error('Failed to process regular transfer:', error);
            throw error;
          }
        }
      }
    }
    
    // Ensure result is properly formatted for balance responses
    if (method === 'eth_getBalance' && result) {
      // Verify the balance response is a valid hex string
      if (typeof result !== 'string' || !result.startsWith('0x')) {
        logger.error('❌ Invalid balance response format:', { result, type: typeof result });
      }
      // Removed verbose balance response logging - too noisy
    }
    
    res.json({
      jsonrpc: '2.0',
      result,
      id
    });
  } catch (error) {
    logger.error(`RPC Error for method ${method}:`, {
      method,
      params: params || [],
      id,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      }
    });
    
    res.json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: error.message
      },
      id
    });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: isInitialized ? 'healthy' : 'initializing',
    chainId: process.env.CHAIN_ID || '12345',
    networkName: process.env.NETWORK_NAME || 'SheetChain'
  });
});

app.get('/claims/stats', async (req, res) => {
  if (!isInitialized || !sheetOps) {
    return res.status(503).json({
      error: 'Server is still initializing'
    });
  }
  
  try {
    const claims = await sheetOps.getAllClaims();
    const completedClaims = claims.filter(claim => claim.status === 'completed');
    const totalAmount = completedClaims.reduce((sum, claim) => {
      return sum + BigInt(claim.amount || 0);
    }, BigInt(0));
    
    res.json({
      totalClaims: claims.length,
      completedClaims: completedClaims.length,
      pendingClaims: claims.length - completedClaims.length,
      totalAmountClaimed: totalAmount.toString(),
      maxClaims: 1000,
      remainingClaims: 1000 - claims.length
    });
  } catch (error) {
    logger.error('Error fetching claim stats:', error);
    res.status(500).json({
      error: 'Failed to fetch claim statistics'
    });
  }
});

app.get('/claims/:address', async (req, res) => {
  if (!isInitialized || !sheetOps) {
    return res.status(503).json({
      error: 'Server is still initializing'
    });
  }
  
  try {
    const { address } = req.params;
    const claims = await sheetOps.getClaimsByAddress(address);
    
    res.json({
      address,
      claims: claims.map(claim => ({
        claimId: claim.claimId,
        amount: claim.amount,
        timestamp: claim.timestamp,
        status: claim.status,
        transactionHash: claim.transactionHash,
        blockNumber: claim.blockNumber
      }))
    });
  } catch (error) {
    logger.error('Error fetching claims for address:', error);
    res.status(500).json({
      error: 'Failed to fetch claims for address'
    });
  }
});

app.get('/bridge/stats', async (req, res) => {
  if (!isInitialized || !sheetOps) {
    return res.status(503).json({
      error: 'Server is still initializing'
    });
  }
  
  try {
    // Get all transactions and filter for bridge transactions
    const transactions = await sheetOps.client.getRows('Transactions');
    const bridgeTransactions = transactions.filter(tx => tx.type === 'bridge');
    
    const totalBridged = bridgeTransactions.reduce((sum, tx) => {
      return sum + BigInt(tx.value || 0);
    }, BigInt(0));
    
    res.json({
      totalBridges: bridgeTransactions.length,
      totalAmountBridged: totalBridged.toString(),
      totalAmountBridgedInEther: ethers.formatEther(totalBridged),
      averageBridgeAmount: bridgeTransactions.length > 0 
        ? ethers.formatEther(totalBridged / BigInt(bridgeTransactions.length))
        : '0',
      recentBridges: bridgeTransactions
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 10)
        .map(tx => ({
          txHash: tx.txHash,
          from: tx.from,
          to: tx.to,
          amount: tx.value,
          amountInEther: ethers.formatEther(tx.value || 0),
          timestamp: tx.timestamp,
          blockNumber: tx.blockNumber
        }))
    });
  } catch (error) {
    logger.error('Error fetching bridge stats:', error);
    res.status(500).json({
      error: 'Failed to fetch bridge statistics'
    });
  }
});

app.get('/', (req, res) => {
  res.json({
    name: 'SheetChain RPC Node',
    version: '1.0.0',
    description: 'Simulated Ethereum RPC node using Google Sheets as blockchain state',
    chainId: process.env.CHAIN_ID || '12345',
    rpcUrl: `http://localhost:${PORT}`,
    methods: [
      'eth_chainId',
      'net_version',
      'eth_getBalance',
      'eth_getTransactionCount',
      'eth_sendTransaction',
      'eth_sendRawTransaction',
      'eth_getTransactionByHash',
      'eth_getTransactionReceipt',
      'eth_blockNumber',
      'eth_gasPrice',
      'eth_estimateGas',
      'eth_getBlockByNumber',
      'eth_getBlockByHash',
      'eth_call',
      'eth_getLogs',
      'web3_clientVersion',
      'claim_create',
      'claim_process',
      'claim_get',
      'claim_getByAddress',
      'claim_getAll',
      'bridge_stats',
      'bridge_process',
      'bridgeOut'
    ]
  });
});

async function start() {
  await initialize();
  
  app.listen(PORT, () => {
    logger.info(`SheetChain RPC Node running on port ${PORT}`);
    logger.info(`Chain ID: ${process.env.CHAIN_ID || '12345'}`);
    logger.info(`Network Name: ${process.env.NETWORK_NAME || 'SheetChain'}`);
    logger.info(`RPC URL: http://localhost:${PORT}`);

    logger.info('To connect MetaMask:');
    logger.info('1. Add Custom Network');
    logger.info(`2. RPC URL: http://localhost:${PORT}`);
    logger.info(`3. Chain ID: ${process.env.CHAIN_ID || '12345'}`);
    logger.info('4. Currency Symbol: ETH (or any)');
    logger.info('5. Network Name: SheetChain');
  });
}

// Allow tests to configure a lightweight environment without touching Google Sheets
function setTestEnvironment({ rpcHandler: rpcHandlerOverride, sheetOps: sheetOpsOverride, validator: validatorOverride, bridgeOperatorAddress } = {}) {
  rpcHandler = rpcHandlerOverride || rpcHandler || { handleRequest: async () => null };
  sheetOps = sheetOpsOverride || sheetOps || null;
  validator = validatorOverride || validator || new TransactionValidator();
  if (bridgeOperatorAddress) {
    BRIDGE_OPERATOR_ADDRESS = bridgeOperatorAddress.toLowerCase();
  }
  isInitialized = true;
}

process.on('SIGINT', () => {
  logger.info('Shutting down SheetChain RPC Node...');
  process.exit(0);
});

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection:', error);
  process.exit(1);
});

// Only auto-start the server when not running tests
if (process.env.NODE_ENV !== 'test') {
  start();
}

module.exports = {
  app,
  start,
  initialize,
  setTestEnvironment,
  registerContractHandler,
  getContractHandler,
  BRIDGE_CONTRACT_ADDRESS,
  AIRDROP_CONTRACT_ADDRESS,
  BRIDGE_OPERATOR_ADDRESS,
  handleBridgeTransferTransaction
};

const abi = `interface ISheetCoin  {
    function initialize() external;

    function owner() external view returns (address);

    function transferOwnership(address new_owner) external;

    function name() external pure returns (string memory);

    function symbol() external pure returns (string memory);

    function decimals() external pure returns (uint8);

    function totalSupply() external view returns (uint256);

    function balanceOf(address owner) external view returns (uint256);

    function transfer(address to, uint256 value) external returns (bool);

    function transferFrom(address from, address to, uint256 value) external returns (bool);

    function approve(address spender, uint256 value) external returns (bool);

    function allowance(address owner, address spender) external view returns (uint256);

    function mint(address _address, uint256 value) external returns (bool);

    function burn(address _address, uint256 value) external returns (bool);

    error InsufficientBalance(address, uint256, uint256);

    error InsufficientAllowance(address, address, uint256, uint256);

    error OnlyOwner(address, address);
}`
