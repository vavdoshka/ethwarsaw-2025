# Sheet Bridge UI

A cross-chain bridge interface for bridging tokens between SheetChain, Solana, and BSC.

## Configuration

The UI can be configured via environment variables. Create a `.env` file in the `sheet-bridge-ui` directory.

### Environment Variables

#### SheetChain RPC Endpoint

```bash
# For production/testnet (default)
VITE_SHEET_RPC_ENDPOINT=https://rpc-testnet.sheetchain.com

# For local development
VITE_SHEET_RPC_ENDPOINT=localhost:8545
# or
VITE_SHEET_RPC_ENDPOINT=http://localhost:8545
```

The URL will automatically get `http://` protocol added if you use `localhost:8545` format.

#### Other Optional Configuration

```bash
# Solana RPC (optional, defaults to devnet)
VITE_SOL_RPC_ENDPOINT=https://api.devnet.solana.com

# BSC RPC (optional, defaults to testnet)
VITE_BSC_RPC_ENDPOINT=https://data-seed-prebsc-1-s1.binance.org:8545

# Bridge Operator Address (optional, has default)
VITE_BRIDGE_OPERATOR_ADDRESS=0xfac92ecd3e2be3cb26c31dbf34948596c7159a18

# Solana transaction options (optional)
VITE_SOL_SKIP_PREFLIGHT=false
VITE_SOL_SIMULATE_BEFORE_SEND=false
VITE_SOL_LOG_SIMULATION=false
```

## Local Development

1. **Create `.env` file**:
   ```bash
   cd sheet-bridge-ui
   cp .env.example .env
   ```

2. **Configure for localhost**:
   ```bash
   # In .env file
   VITE_SHEET_RPC_ENDPOINT=localhost:8545
   ```

3. **Start development server**:
   ```bash
   npm run dev
   ```

4. **Build for production**:
   ```bash
   npm run build
   ```

## Deployment

See [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md) for Vercel deployment instructions.

## Features

- Bridge tokens between SheetChain, Solana, and BSC
- Multi-wallet support (MetaMask, Phantom, etc.)
- Real-time balance updates
- Manual refresh button for balances
- Add network to MetaMask button
