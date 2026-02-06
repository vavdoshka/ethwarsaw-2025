# Bridge E2E Tests

End-to-end tests for the Sheet Chain bridge infrastructure.

## Prerequisites

1. **Bridge infrastructure must be running:**
   - Bridge backend (`npm run dev` in `sheet-bridge-core/be`)
   - Sheet Chain RPC node (running on `http://localhost:8545` by default)
   - Solana RPC endpoint (devnet or mainnet)

2. **Test wallets must be funded:**
   - Sheet Chain wallet: Must have SHEET tokens for testing
   - Solana wallet: Must have SHEET SPL tokens for testing

## Configuration

### Option 1: Use Existing Funded Wallets (Recommended)

Set the following environment variables (or use `.env` file):

```bash
# RPC Endpoints
SOLANA_RPC_URL=https://api.devnet.solana.com
SHEET_RPC_URL=http://localhost:8545

# Test wallets (required for consistent testing)
TEST_SHEET_PRIVATE_KEY=0x...  # Private key of funded Sheet Chain wallet
TEST_SOLANA_PRIVATE_KEY=...   # Base64 encoded Solana private key

# Bridge configuration (should match backend config)
SOLANA_PROGRAM_ID=46BKi3nxgwFpc8EXE2Yem3syK5yqQRvJLasWzvsTEEgx
SOLANA_TOKEN_MINT=4opADvbtoEaXryZH5UoEpVXERDJoRMZoXy8yMsogsc2S
BRIDGE_OPERATOR_ADDRESS=0x337d7730a281efE851dbEDf5F4eD0D2610E59639
```

### Option 2: Generate and Fund New Wallets

1. **Generate test wallet addresses:**
   ```bash
   npm run test:fund-wallets
   ```

2. **Fund the wallets:**
   - **Sheet Chain**: Add balance in Google Sheets (Balances tab) or use the RPC node
   - **Solana**: Send SHEET SPL tokens to the generated address

3. **Add to `.env` file:**
   The script will output the private keys - copy them to your `.env` file

**Note**: If `TEST_SHEET_PRIVATE_KEY` or `TEST_SOLANA_PRIVATE_KEY` are not set, random wallets will be generated for each test run (you'll need to fund them manually each time).

## Running Tests

```bash
# Run all e2e tests
npm run test:e2e

# Run specific test file
npm run test:e2e -- sheet-to-solana
npm run test:e2e -- solana-to-sheet

# Run with verbose output
npm run test:e2e -- --verbose
```

## Test Structure

```
test/
├── setup.ts              # Test configuration and utilities
├── helpers/
│   ├── balance.ts        # Balance checking helpers
│   ├── solana.ts         # Solana transaction helpers
│   └── sheet.ts          # Sheet Chain transaction helpers
└── e2e/
    ├── sheet-to-solana.test.ts  # Sheet -> Solana bridge tests
    └── solana-to-sheet.test.ts  # Solana -> Sheet bridge tests
```

## Test Coverage

### Sheet Chain to Solana
- ✅ Successful bridge transfer
- ✅ Balance verification (before/after)
- ✅ Insufficient balance error handling
- ✅ Invalid recipient address handling

### Solana to Sheet Chain
- ✅ Successful bridge transfer
- ✅ Balance verification (before/after)
- ✅ Decimal conversion (9 decimals -> 18 decimals)
- ✅ Insufficient balance error handling
- ✅ Invalid recipient address handling

## Notes

- Tests assume the bridge backend is actively monitoring and processing events
- Tests wait for balance changes with configurable timeouts
- Test amounts are small (0.01 SHEET) to minimize costs
- Tests generate new Solana keypairs for each run (or use funded test wallets)
