require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const winston = require('winston');
const GoogleSheetsClient = require('./sheets/client');
const SheetOperations = require('./sheets/operations');
const RPCHandlers = require('./rpc/handlers');
const TransactionValidator = require('./rpc/validator');

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

app.use((req, res, next) => {
  logger.info(`RPC Request: ${req.body.method} from ${req.ip}`);
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
    const result = await rpcHandler.handleRequest(method, params || []);
    
    res.json({
      jsonrpc: '2.0',
      result,
      id
    });
  } catch (error) {
    logger.error(`RPC Error for ${method}:`, error.message);
    
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
    logger.info('');
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