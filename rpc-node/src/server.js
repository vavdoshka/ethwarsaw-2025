require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const winston = require('winston');
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
  const airdropAddress = '0x0000000000000000000000000000000000000001';
  
  // totalClaimants() - returns 42
  registerContractHandler(airdropAddress, '0x87764571', () => {
    return '0x000000000000000000000000000000000000000000000000000000000000002a'; // 42
  });
  
  // totalClaimants() - correct selector
  registerContractHandler(airdropAddress, '0x3f1368de', () => {
    return '0x000000000000000000000000000000000000000000000000000000000000002a'; // 42
  });
  
  // hasClaimed(address) - returns false for any address
  registerContractHandler(airdropAddress, '0x70a08231', () => {
    return '0x0000000000000000000000000000000000000000000000000000000000000000'; // false
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
}

// Initialize contract handlers
initializeContractHandlers();

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

app.use(cors());
app.use(bodyParser.json());

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
  
  // Log incoming request details

  // Override res.json to log response details
  const originalJson = res.json;
  res.json = function(data) {
    const duration = Date.now() - startTime;
    
    logger.info('=== RPC RESPONSE ===', {
      requestId,
      duration: `${duration}ms`,
      statusCode: res.statusCode,
      response: data
    });
    
    return originalJson.call(this, data);
  };
  
  next();
});

let rpcHandler;
let validator;
let isInitialized = false;

async function initialize() {
  try {
    logger.info('Initializing SheetChain RPC Node...');
    
    if (!process.env.GOOGLE_SHEET_ID) {
      throw new Error('GOOGLE_SHEET_ID environment variable is required');
    }
    
    const sheetsClient = new GoogleSheetsClient();
    await sheetsClient.initialize();
    
    const sheetOps = new SheetOperations(sheetsClient);
    rpcHandler = new RPCHandlers(sheetOps);
    validator = new TransactionValidator();
    
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
  
  const { jsonrpc, method, params, id } = req.body;
  
  if (jsonrpc !== '2.0') {
    return res.json({
      jsonrpc: '2.0',
      error: {
        code: -32600,
        message: 'Invalid JSON-RPC version'
      },
      id
    });
  }
  
  try {
    let result = await rpcHandler.handleRequest(method, params || []);
    
    // Smart contract simulation handler
    if (method === 'eth_call' && params && params[0] && params[0].data && params[0].to) {
      const contractAddress = params[0].to.toLowerCase();
      const selector = params[0].data.substring(0, 10);
      
      // Check if we have a handler for this contract and selector
      const handler = getContractHandler(contractAddress, selector);
      if (handler) {
        result = handler(selector, params[0].data, params[0].to);
        logger.info('🎯 CONTRACT HANDLER:', {
          contractAddress,
          selector,
          result,
          handler: handler.name || 'anonymous'
        });
      }
    }
    
    // Mock transaction handler for claim function
    if (method === 'eth_sendRawTransaction' && params && params[0]) {
      const rawTx = params[0];
      // Check if this is a claim transaction by looking for the claim selector
      if (rawTx.includes('75066be0')) {
        // Generate a mock transaction hash
        const mockTxHash = '0x' + Math.random().toString(16).substr(2, 64);
        result = mockTxHash;
        logger.info('🎯 MOCKED TRANSACTION:', {
          method: 'eth_sendRawTransaction',
          selector: '0x75066be0',
          function: 'claimAirdropEthWarsaw2025()',
          mockTxHash: mockTxHash,
          explanation: 'Mocked successful claim transaction'
        });
      }
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
      'web3_clientVersion'
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

process.on('SIGINT', () => {
  logger.info('Shutting down SheetChain RPC Node...');
  process.exit(0);
});

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection:', error);
  process.exit(1);
});

start();