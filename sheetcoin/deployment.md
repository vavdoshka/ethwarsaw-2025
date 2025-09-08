# SheetCoin ERC20 Token Deployment

## Contract Information

**Token Name:** SheetCoin  
**Token Symbol:** SHEET  
**Decimals:** 18  
**Total Supply:** 1,000 SHEET (1,000,000,000,000,000,000,000 wei)

## Arbitrum Sepolia Testnet Deployment

### Contract Details
- **Contract Address:** `0x5e030a6f6218ada6b29eb46b5344386ea9765702`
- **Network:** Arbitrum Sepolia Testnet
- **RPC URL:** `https://sepolia-rollup.arbitrum.io/rpc`
- **Block Explorer:** [Arbiscan Sepolia](https://sepolia.arbiscan.io/address/0x5e030a6f6218ada6b29eb46b5344386ea9765702)

### Deployment Transactions
- **Deployment TX Hash:** `0x0a1089d5b53a275d4be1e7e3ffef71c5152eff711b89efa4b5ddd80e38669135`
- **Activation TX Hash:** `0x8ca7af9a99505e51a0e850dd2dd38b5156d4589b2dc14a422e11f0a1f4a690cd`
- **Initialization TX Hash:** `0x471025d1d579a16b566943a98b2bb07d024721b5836381d4b976eb5efe438560`

### Owner Information
- **Owner Address:** `0xf0074866D3161e7f27f4fD5506C4691536560b1b`
- **Owner Private Key:** `0xa1ca1cb677bdc2e0610216e7ca2d26c0ce678198590426db0913ebc7f216dcfe`

### Contract Features
- ✅ **ERC20 Standard Compliance**
- ✅ **Owner-Only Minting** - Only the contract owner can mint new tokens
- ✅ **Owner Transfer** - Ownership can be transferred to another address
- ✅ **Token Burning** - Tokens can be burned to reduce total supply
- ✅ **Standard ERC20 Functions** - transfer, approve, allowance, etc.

### Test Results
- **Initial Mint:** 1,000 SHEET tokens minted successfully
- **Balance Verification:** Owner balance confirmed as 1,000 SHEET
- **Total Supply:** 1,000 SHEET tokens in circulation
- **Owner Restriction:** Confirmed that only owner can mint tokens

### Gas Costs
- **Deployment:** ~0.000097 ETH (with 20% bump)
- **Initialization:** ~62,634 gas
- **Minting:** ~89,468 gas

### ABI File
The contract ABI is stored in `SheetCoin.json` in the project root directory.

### Usage Examples

#### Initialize Contract (Owner Only)
```bash
cast send --rpc-url 'https://sepolia-rollup.arbitrum.io/rpc' \
  --private-key YOUR_PRIVATE_KEY \
  0x5e030a6f6218ada6b29eb46b5344386ea9765702 \
  "initialize()"
```

#### Mint Tokens (Owner Only)
```bash
cast send --rpc-url 'https://sepolia-rollup.arbitrum.io/rpc' \
  --private-key YOUR_PRIVATE_KEY \
  0x5e030a6f6218ada6b29eb46b5344386ea9765702 \
  "mint(address,uint256)" RECIPIENT_ADDRESS AMOUNT_IN_WEI
```

#### Check Balance
```bash
cast call --rpc-url 'https://sepolia-rollup.arbitrum.io/rpc' \
  0x5e030a6f6218ada6b29eb46b5344386ea9765702 \
  "balanceOf(address)(uint256)" ADDRESS
```

#### Transfer Ownership
```bash
cast send --rpc-url 'https://sepolia-rollup.arbitrum.io/rpc' \
  --private-key YOUR_PRIVATE_KEY \
  0x5e030a6f6218ada6b29eb46b5344386ea9765702 \
  "transferOwnership(address)" NEW_OWNER_ADDRESS
```

### Security Notes
- The contract uses owner-based access control for minting
- Only the current owner can mint new tokens
- Ownership can be transferred to another address
- All standard ERC20 security practices apply

### Contract Source
- **Rust Source:** `src/lib.rs` and `src/erc20.rs`
- **Stylus SDK:** v0.9.0
- **Compilation:** Optimized release build
- **Contract Size:** 13.5 KiB (13,822 bytes)
- **WASM Size:** 49.0 KiB (50,190 bytes)

---
*Deployed on: $(date)*  
*Stylus Contract Cache Recommended: Run `cargo stylus cache bid 5e030a6f6218ada6b29eb46b5344386ea9765702 0`*

