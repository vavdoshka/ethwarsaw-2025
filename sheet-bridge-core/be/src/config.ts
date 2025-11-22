import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Wallet } from 'ethers';

export const SOLANA_RPC_URL = 'https://api.devnet.solana.com';
export const SHEET_RPC_URL = 'https://ethwarsaw-2025.onrender.com';
export const LOCK_PROGRAM_ID = new PublicKey('46BKi3nxgwFpc8EXE2Yem3syK5yqQRvJLasWzvsTEEgx');
export const TOKENS_LOCKED_EVENT = 'TokensLocked';
export const SOLANA_TOKEN_MINT = new PublicKey('TokenMintAddress111111111111111111111111111');

export const BSC_WSS_URL = 'wss://bsc-testnet-rpc.publicnode.com';
export const BSC_HTTP_URL = 'https://data-seed-prebsc-1-s1.binance.org:8545';
export const BSC_TOKEN_LOCK_ADDRESS = '0xfD5A4Cee5d5C5b7b5E3B18b8401879361F58113b';

export interface TransferContext {
    sheetWallet: Wallet;
    bscWallet: Wallet;
    bscTokenLockAddress: string;
    solanaConnection: Connection;
    solanaAuthority: Keypair;
    solanaTokenMint: PublicKey;
}
