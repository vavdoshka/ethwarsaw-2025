# SheetChain - Google Sheets RPC Node

A simulated Ethereum RPC node that uses Google Sheets as its blockchain state. Perfect for demos, education, and testing without real blockchain infrastructure.

## Features

- ✅ Full Ethereum JSON-RPC compatibility
- ✅ Google Sheets as persistent state storage
- ✅ MetaMask integration
- ✅ Transaction validation and processing
- ✅ Balance and nonce management
- ✅ Block simulation
- ✅ Caching for performance
- ✅ No real blockchain required

## Setup

### 1. Google Sheets Setup

1. Create a new Google Sheet
2. Note the Sheet ID from the URL: `https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit`
3. Create two tabs:
   - **Balances** with headers: `Address | Balance | Nonce`
   - **Transactions** with headers: `Timestamp | TxHash | From | To | Value | Nonce | Status | BlockNumber | GasUsed`

### 2. Google Cloud Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable Google Sheets API
4. Create a Service Account:
   - Go to IAM & Admin > Service Accounts
   - Create new service account
   - Download JSON key file
5. Share your Google Sheet with the service account email

### 3. Project Setup

```bash
# Clone and install
cd ethwarsaw
npm install

# Configure environment
cp .env.example .env
# Edit .env with your credentials:
# - GOOGLE_SHEET_ID
# - Service account credentials (either path or inline)
```

### 4. Initial Data Setup

Add some initial balances to your Google Sheet's "Balances" tab:

| Address | Balance | Nonce |
|---------|---------|-------|
| 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7 | 1000000000000000000000 | 0 |
| 0x5B38Da6a701c568545dCfcB03FcB875f56beddC4 | 500000000000000000000 | 0 |

(Balances are in wei: 1 ETH = 1000000000000000000 wei)

## Running the Node

```bash
# Start the RPC server
npm start

# Or with auto-reload for development
npm run dev
```

The server will start on port 8545 (default Ethereum RPC port).

## Testing

```bash
# Run basic connectivity test
node test.js
```

## MetaMask Configuration

1. Open MetaMask
2. Click network dropdown → "Add Network"
3. Enter:
   - **Network Name**: SheetChain
   - **RPC URL**: http://localhost:8545
   - **Chain ID**: 12345
   - **Currency Symbol**: ETH
4. Save and switch to SheetChain network

## Using with Ethers.js

```javascript
const { ethers } = require('ethers');

const provider = new ethers.JsonRpcProvider('http://localhost:8545');

// Get balance
const balance = await provider.getBalance('0x...');

// Send transaction
const wallet = new ethers.Wallet('private_key', provider);
const tx = await wallet.sendTransaction({
  to: '0x...',
  value: ethers.parseEther('1.0')
});
```

## Supported RPC Methods

- `eth_chainId` - Returns the chain ID
- `net_version` - Returns the network ID
- `eth_getBalance` - Get account balance from sheet
- `eth_getTransactionCount` - Get account nonce from sheet
- `eth_sendTransaction` - Send and process transaction
- `eth_sendRawTransaction` - Send signed transaction
- `eth_getTransactionByHash` - Get transaction details
- `eth_getTransactionReceipt` - Get transaction receipt
- `eth_blockNumber` - Get latest block number
- `eth_gasPrice` - Get current gas price
- `eth_estimateGas` - Estimate gas for transaction
- `eth_getBlockByNumber` - Get block by number
- `eth_getBlockByHash` - Get block by hash
- `web3_clientVersion` - Get client version

## How It Works

1. **State Storage**: All blockchain state (balances, nonces, transactions) is stored in Google Sheets
2. **Transaction Processing**: 
   - Validates nonce sequence
   - Checks sufficient balance
   - Updates balances atomically
   - Records to transaction history
3. **Block Simulation**: Block numbers are simulated based on transaction count
4. **Gas Simulation**: Fixed gas prices and estimates for simplicity

## Limitations

- Not a real blockchain - no consensus, mining, or cryptographic security
- Single-node only - no P2P network
- No smart contract support (returns empty for contract calls)
- No event logs or filters
- Simplified gas model
- No signature verification (accepts any signed transaction)

## Troubleshooting

### "Server is initializing"
- Check your Google Sheets credentials in .env
- Verify the Sheet ID is correct
- Ensure Sheets API is enabled in Google Cloud

### "Invalid nonce"
- Check the Balances sheet for the current nonce
- Nonces must be sequential (0, 1, 2, ...)

### "Insufficient balance"
- Add balance to the address in the Balances sheet
- Remember balances are in wei (1 ETH = 10^18 wei)

## Use Cases

- 📚 Educational demos of blockchain concepts
- 🧪 Testing dApps without real tokens
- 🎮 Hackathon projects and prototypes
- 📊 Visualization of blockchain data in spreadsheets
- 🔧 Development and debugging

## Security Note

This is a simulation tool for development/education only. Never use for production or with real funds. The Google Sheet can be edited directly, bypassing all validation.

## License

MIT