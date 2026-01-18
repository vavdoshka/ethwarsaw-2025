import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Wallet } from 'ethers';

// Solana network configuration - can be overridden via environment variables
const SOLANA_NETWORK = process.env.SOLANA_NETWORK || 'devnet'; // 'devnet' or 'mainnet-beta'
const SOLANA_RPC_URL_ENV = process.env.SOLANA_RPC_URL;

// Default RPC URLs
const DEVNET_RPC = 'https://api.devnet.solana.com';
const MAINNET_RPC = 'https://api.mainnet-beta.solana.com';

// Use custom RPC URL if provided, otherwise use network-based default
export const SOLANA_RPC_URL = SOLANA_RPC_URL_ENV || (SOLANA_NETWORK === 'mainnet-beta' ? MAINNET_RPC : DEVNET_RPC);

// Sheet Chain RPC URL - can be overridden via environment variable
// Default to localhost for local development, or use remote URL for production
export const SHEET_RPC_URL = process.env.SHEET_RPC_URL || 'http://localhost:8545';

// Program ID - can be overridden via environment variable
// Devnet: 46BKi3nxgwFpc8EXE2Yem3syK5yqQRvJLasWzvsTEEgx
// Mainnet: (not deployed yet - will need to be set when deployed)
const SOLANA_PROGRAM_ID = process.env.SOLANA_PROGRAM_ID || '46BKi3nxgwFpc8EXE2Yem3syK5yqQRvJLasWzvsTEEgx';
export const LOCK_PROGRAM_ID = new PublicKey(SOLANA_PROGRAM_ID);

export const TOKENS_LOCKED_EVENT = 'TokensLocked';

// Token Mint Address - can be overridden via environment variable
// Devnet: 4opADvbtoEaXryZH5UoEpVXERDJoRMZoXy8yMsogsc2S
// Note: DEPLOYMENT.md mentions CpsKSnkJXrgxUXjJjqLR9tn3QM9RrVASHjA8LW97XHo3 - verify which is correct
const SOLANA_TOKEN_MINT_ADDRESS = process.env.SOLANA_TOKEN_MINT || '4opADvbtoEaXryZH5UoEpVXERDJoRMZoXy8yMsogsc2S';
export const SOLANA_TOKEN_MINT = new PublicKey(SOLANA_TOKEN_MINT_ADDRESS);

export const BSC_WSS_URL = 'wss://bsc-testnet-rpc.publicnode.com';
export const BSC_HTTP_URL = 'https://data-seed-prebsc-1-s1.binance.org:8545';
export const BSC_TOKEN_LOCK_ADDRESS = '0xfD5A4Cee5d5C5b7b5E3B18b8401879361F58113b';

// Bridge Contract Address on Sheet Chain
export const BRIDGE_CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000003';

// Bridge Operator Address - must match the wallet address used for Sheet Chain transfers
// This is the address that is authorized to call bridgeTransfer on the bridge contract
// Can be overridden via environment variable
// Default updated to match the wallet address that has balance
export const BRIDGE_OPERATOR_ADDRESS = process.env.BRIDGE_OPERATOR_ADDRESS || '0x337d7730a281efE851dbEDf5F4eD0D2610E59639';

export interface TransferContext {
    sheetWallet: Wallet;
    bscWallet: Wallet;
    bscTokenLockAddress: string;
    solanaConnection?: Connection;
    solanaAuthority?: Keypair;
    solanaTokenMint?: PublicKey;
}
