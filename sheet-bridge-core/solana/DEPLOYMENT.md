# Solana Program Deployment Guide

## Prerequisites

1. **Solana CLI installed**: `sh -c "$(curl -sSfL https://release.solana.com/stable/install)"`
2. **Anchor installed**: `cargo install --git https://github.com/coral-xyz/anchor avm --locked --force && avm install latest && avm use latest`
3. **Node.js and dependencies**: `yarn install` or `npm install`
4. **Wallet configured**: Set up your Solana wallet keypair

## Configuration

### Environment Variables

Create a `.env` file in the `solana` directory:

```bash
# Solana RPC endpoint (default: devnet)
RPC_URL=https://api.devnet.solana.com

# Your wallet secret key (JSON array or bs58 string)
SECRET_KEY=[1,2,3,...64 numbers]
# OR
SECRET_KEY=your_bs58_encoded_secret_key
```

### Program ID

The program ID is already configured:
- **Program ID**: `46BKi3nxgwFpc8EXE2Yem3syK5yqQRvJLasWzvsTEEgx`
- **Network**: Devnet
- **Mint Address**: `Qp8iRNXcL8bjsARWeUwpyQF8ztPLwo1gd8PM3xjrfZz`

## Deployment Steps

### 1. Set Solana CLI to Devnet

```bash
solana config set --url https://api.devnet.solana.com
```

### 2. Check Your Wallet

```bash
# Check balance
solana balance

# If balance is low, request airdrop
solana airdrop 2
```

### 3. Build the Program

```bash
anchor build
```

This will:
- Compile the Rust program
- Generate the IDL
- Create the deployable `.so` file in `target/deploy/`

### 4. Deploy the Program

**Option A: Using the deployment script (Recommended)**

```bash
yarn deploy
# or
npm run deploy
```

**Option B: Using Anchor CLI directly**

```bash
anchor deploy --provider.cluster devnet
```

**Option C: Using the npm script**

```bash
npm run deploy:anchor
```

### 5. Verify Deployment

The deployment script will automatically verify, or you can check manually:

```bash
solana program show 46BKi3nxgwFpc8EXE2Yem3syK5yqQRvJLasWzvsTEEgx
```

### 6. Initialize the Program

After deployment, initialize the lock program:

```bash
yarn initialize
# or
npm run initialize
```

This will:
- Create the lock account PDA
- Set up the vault token account
- Configure the program for the specified mint

## Program Structure

### Instructions

1. **`initialize`**: Sets up the lock account and vault for a specific token mint
2. **`lock_tokens`**: Locks user tokens and emits a `TokensLocked` event with recipient address

### Accounts

- **LockAccount**: PDA storing the mint configuration
- **VaultTokenAccount**: Program-owned ATA holding locked tokens
- **VaultAuthority**: PDA controlling the vault

### Events

- **TokensLocked**: Emitted when tokens are locked
  - `sender`: PublicKey of the user
  - `amount`: u64 amount locked
  - `recipient`: String Ethereum-style address (0x...)

## Troubleshooting

### Common Issues

1. **Insufficient SOL**: Request airdrop with `solana airdrop 2`
2. **Program ID mismatch**: Ensure `Anchor.toml` and `lib.rs` have matching program IDs
3. **Build errors**: Run `anchor clean` then `anchor build`
4. **Deployment fails**: Check that the keypair exists at `target/deploy/lock-keypair.json`

### Useful Commands

```bash
# Check program status
solana program show 46BKi3nxgwFpc8EXE2Yem3syK5yqQRvJLasWzvsTEEgx

# View account info
solana account 46BKi3nxgwFpc8EXE2Yem3syK5yqQRvJLasWzvsTEEgx

# Clean build artifacts
anchor clean

# Rebuild
anchor build

# Check wallet
solana balance
solana address
```

## Next Steps

After successful deployment:

1. ✅ Program deployed to devnet
2. ✅ Initialize the lock program
3. ✅ Mint tokens (if needed) using `yarn mint`
4. ✅ Update backend config with program ID
5. ✅ Test token locking functionality

## Production Deployment

For mainnet deployment:

1. Update `Anchor.toml` cluster to `mainnet-beta`
2. Update program ID (generate new keypair)
3. Ensure sufficient SOL for deployment fees
4. Deploy using same process with mainnet cluster

