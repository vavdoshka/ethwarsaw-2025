# TokenLock - BSC Bridge Contract

A secure smart contract for locking ERC20 tokens on Binance Smart Chain (BSC) with cross-chain bridging functionality.

## Overview

TokenLock is a smart contract that allows users to lock ERC20 tokens and emit events for cross-chain bridge operations. The contract owner can release locked tokens to any address, enabling controlled token distribution across chains.

### Key Features

- **Token Locking**: Users can lock ERC20 tokens by calling the `lock()` function with the amount and recipient address
- **Event Emission**: Emits `TokensLocked` events containing sender, recipient, and amount information
- **Owner-Controlled Release**: Only the contract owner can release locked tokens to arbitrary addresses
- **Security**: Built with OpenZeppelin contracts, includes reentrancy protection and safe ERC20 operations
- **BSC Compatible**: Designed and optimized for Binance Smart Chain deployment

## Smart Contract Architecture

### TokenLock.sol

Main contract features:
- `lock(uint256 amount, address recipient)`: Lock tokens and emit event
- `release(address to, uint256 amount)`: Release tokens (owner only)
- `getContractBalance()`: View current token balance
- `totalLockedTokens`: Track total locked amount

## Installation

```bash
npm install
```

## Configuration

1. Copy the environment file:
```bash
cp .env.example .env
```

2. Edit `.env` with your configuration:
```env
PRIVATE_KEY=your_private_key_here
TOKEN_ADDRESS=0x_your_erc20_token_address
OWNER_ADDRESS=0x_owner_address (optional)
BSCSCAN_API_KEY=your_bscscan_api_key
```

## Development

### Compile Contracts

```bash
npm run compile
```

### Run Tests

```bash
# Run all tests
npm test

# Run with gas reporting
npm run test:gas

# Run with coverage
npm run test:coverage
```

### Deploy

#### Deploy to BSC Testnet

```bash
npm run deploy:bsc-testnet
```

#### Deploy to BSC Mainnet

```bash
npm run deploy:bsc
```

#### Deploy to Local Network

```bash
# In one terminal, start local node
npm run node

# In another terminal, deploy
npm run deploy:localhost
```

### Verify Contract

After deployment, verify on BSCScan:

```bash
npx hardhat verify --network bscTestnet <CONTRACT_ADDRESS> "<TOKEN_ADDRESS>" "<OWNER_ADDRESS>"
```

Or use npm scripts:
```bash
npm run verify:bsc-testnet <CONTRACT_ADDRESS> "<TOKEN_ADDRESS>" "<OWNER_ADDRESS>"
```

## Usage

### For Users

1. **Approve tokens**: First approve the TokenLock contract to spend your tokens
```javascript
await token.approve(tokenLockAddress, amount);
```

2. **Lock tokens**: Call the lock function with amount and recipient address
```javascript
await tokenLock.lock(amount, recipientAddress);
```

### For Contract Owner

**Release tokens**: Send locked tokens to any address
```javascript
await tokenLock.release(toAddress, amount);
```

## Contract Deployment Flow

1. Deploy the contract with token address and owner address
2. Users approve the contract to spend their tokens
3. Users call `lock()` with the amount and recipient address
4. Contract emits `TokensLocked` event
5. Off-chain bridge service listens for events
6. Owner can call `release()` to send tokens to addresses

## Security Features

- **ReentrancyGuard**: Prevents reentrancy attacks
- **SafeERC20**: Safely handles ERC20 token transfers
- **Ownable**: Access control for privileged functions
- **Input Validation**: Comprehensive validation of all inputs
- **Immutable Token**: Token address cannot be changed after deployment

## Testing

The project includes comprehensive tests covering:
- Contract deployment and initialization
- Token locking functionality
- Owner-controlled token release
- Access control
- Input validation
- Reentrancy protection

## Project Structure

```
eth/
├── contracts/
│   ├── TokenLock.sol       # Main bridge contract
│   └── MockERC20.sol       # Mock token for testing
├── scripts/
│   └── deploy.ts           # Deployment script
├── test/
│   └── TokenLock.test.ts   # Comprehensive tests
├── ignition/
│   └── modules/
│       └── TokenLock.ts    # Hardhat Ignition module
├── hardhat.config.ts       # Hardhat configuration
└── .env.example            # Environment variables template
```

## Networks

### BSC Mainnet
- Chain ID: 56
- RPC: https://bsc-dataseed1.binance.org
- Explorer: https://bscscan.com

### BSC Testnet
- Chain ID: 97
- RPC: https://data-seed-prebsc-1-s1.binance.org:8545
- Explorer: https://testnet.bscscan.com
- Faucet: https://testnet.binance.org/faucet-smart

## Technologies

- **Solidity ^0.8.20**: Smart contract language
- **Hardhat**: Development environment
- **TypeScript**: Type-safe development
- **OpenZeppelin Contracts**: Secure, audited smart contract library
- **Ethers.js v6**: Ethereum library
- **Chai**: Testing framework

## License

ISC
