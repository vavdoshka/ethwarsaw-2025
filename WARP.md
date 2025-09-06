# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

SheetChain is a simulated Ethereum RPC node that uses Google Sheets as persistent blockchain state storage. This enables blockchain development, testing, and education without requiring actual blockchain infrastructure.

The project implements full Ethereum JSON-RPC compatibility and can be used with MetaMask, ethers.js, and other Ethereum tooling.

## Development Commands

### Setup
```bash
cd rpc-node
npm install
cp .env.example .env
# Edit .env with Google Sheets credentials and settings
```

### Running the Server
```bash
# Start RPC server (production)
npm start

# Start with auto-reload (development)
npm run dev
```

### Testing
```bash
# Run basic connectivity test
node test.js

# Test specific RPC endpoint (example)
curl -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
```

### Troubleshooting
```bash
# Check server health
curl http://localhost:8545/health

# View server info and supported methods
curl http://localhost:8545
```

## Code Architecture

### Core Components

**Server Layer (`src/server.js`)**
- Express.js HTTP server handling JSON-RPC requests on port 8545
- Initializes all services and manages request routing
- Provides health check and info endpoints
- Implements proper error handling and logging with Winston

**RPC Handler (`src/rpc/handlers.js`)**
- Implements Ethereum JSON-RPC methods (eth_*, net_*, web3_*)
- Translates between Ethereum RPC format and internal operations
- Handles block simulation and gas estimation
- Key methods: balance queries, transaction sending, block retrieval

**Google Sheets Integration (`src/sheets/`)**
- `client.js`: Google Sheets API wrapper with authentication
- `operations.js`: High-level blockchain operations using sheets as storage
- Implements atomic transaction processing with balance validation
- Uses caching (NodeCache) for performance optimization

**Transaction Processing**
- `validator.js`: Validates transaction format, addresses, and values  
- `utils/crypto.js`: Generates transaction hashes and handles crypto utilities
- Maintains nonce sequencing and balance consistency

### Data Model

The system uses two Google Sheets tabs:

**Balances Sheet**: `Address | Balance | Nonce`
- Stores account balances (in wei) and transaction nonces
- Updated atomically during transaction processing

**Transactions Sheet**: `Timestamp | TxHash | From | To | Value | Nonce | Status | BlockNumber | GasUsed`
- Immutable transaction history
- Block numbers simulated based on transaction count

### Key Architectural Patterns

**State Management**: All blockchain state persists in Google Sheets, providing human-readable and directly editable storage.

**Transaction Processing Flow**:
1. Validate transaction format and addresses
2. Check nonce sequencing and balance sufficiency  
3. Update sender/receiver balances atomically
4. Record transaction to history sheet
5. Return transaction hash and receipt

**Caching Strategy**: Optional NodeCache for balance/nonce lookups with configurable TTL, disabled during balance updates to maintain consistency.

**Error Handling**: Comprehensive validation with specific error messages for common issues (invalid nonce, insufficient balance, malformed addresses).

## Configuration

Environment variables in `.env`:
- `GOOGLE_SHEET_ID`: Target Google Sheet ID
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY`: Authentication credentials
- `CHAIN_ID`: Network identifier (default: 12345)
- `PORT`: Server port (default: 8545)
- `CACHE_TTL`: Cache duration in seconds
- `LOG_LEVEL`: Winston logging level

## Integration Notes

**MetaMask Setup**: Custom network with RPC URL `http://localhost:8545`, Chain ID from config, ETH as currency symbol.

**Ethers.js Integration**: Standard JsonRpcProvider connection to `http://localhost:8545`.

**Limitations**: No smart contract execution, event logs, or signature verification. Simplified gas model with fixed prices. Not cryptographically secure - intended for development/education only.
