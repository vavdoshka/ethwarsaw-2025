/**
 * E2E Test Setup
 * 
 * This file sets up the test environment for end-to-end bridge tests.
 * Assumes the bridge infrastructure is already running.
 */

import 'dotenv/config';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Wallet, JsonRpcProvider, HDNodeWallet } from 'ethers';
import { SOLANA_RPC_URL, SHEET_RPC_URL, SOLANA_TOKEN_MINT, LOCK_PROGRAM_ID, BRIDGE_CONTRACT_ADDRESS } from '../src/config';

// Test configuration
export const TEST_CONFIG = {
  // RPC endpoints (should match running infrastructure)
  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL || SOLANA_RPC_URL,
  SHEET_RPC_URL: process.env.SHEET_RPC_URL || SHEET_RPC_URL,
  
  // Test timeouts
  TRANSACTION_TIMEOUT: 60000, // 60 seconds
  BALANCE_CHECK_INTERVAL: 2000, // 2 seconds
  MAX_BALANCE_WAIT: 30000, // 30 seconds
  
  // Test amounts (in human-readable format)
  TEST_AMOUNT_SMALL: 0.01, // 0.01 SHEET
  TEST_AMOUNT_MEDIUM: 0.1, // 0.1 SHEET
  TEST_AMOUNT_LARGE: 1.0, // 1.0 SHEET
};

// Initialize connections
export const solanaConnection = new Connection(TEST_CONFIG.SOLANA_RPC_URL, 'confirmed');
export const sheetProvider = new JsonRpcProvider(TEST_CONFIG.SHEET_RPC_URL);

// Test wallets (will be generated or loaded from env)
export interface TestWallets {
  solana: {
    keypair: Keypair;
    address: string;
  };
  sheet: {
    wallet: Wallet | HDNodeWallet;
    address: string;
  };
}

/**
 * Generate or load test wallets
 * 
 * For consistent testing, it's recommended to:
 * 1. Set TEST_SHEET_PRIVATE_KEY to a funded wallet address
 * 2. Set TEST_SOLANA_PRIVATE_KEY to a funded Solana keypair (base64 encoded)
 * 
 * If not set, random wallets will be generated (you'll need to fund them manually)
 * Run `npm run test:fund-wallets` to generate wallet addresses and get funding instructions
 */
export function getTestWallets(): TestWallets {
  // Solana wallet - use env var or generate
  let solanaKeypair: Keypair;
  if (process.env.TEST_SOLANA_PRIVATE_KEY) {
    // Load from environment variable (base64 encoded private key)
    const privateKeyBytes = Buffer.from(process.env.TEST_SOLANA_PRIVATE_KEY, 'base64');
    solanaKeypair = Keypair.fromSecretKey(privateKeyBytes);
    console.log(`✅ Using Solana wallet from TEST_SOLANA_PRIVATE_KEY: ${solanaKeypair.publicKey.toBase58()}`);
  } else {
    // Generate a new keypair for each test run
    solanaKeypair = Keypair.generate();
    console.warn(`⚠️  Using randomly generated Solana wallet: ${solanaKeypair.publicKey.toBase58()}`);
    console.warn(`   Set TEST_SOLANA_PRIVATE_KEY to use a funded wallet.`);
    console.warn(`   Run 'npm run test:fund-wallets' for wallet generation and funding instructions.`);
  }
  
  // Sheet Chain wallet - use env var or generate
  let sheetWallet: Wallet | HDNodeWallet;
  if (process.env.TEST_SHEET_PRIVATE_KEY) {
    sheetWallet = new Wallet(process.env.TEST_SHEET_PRIVATE_KEY, sheetProvider);
    console.log(`✅ Using Sheet Chain wallet from TEST_SHEET_PRIVATE_KEY: ${sheetWallet.address}`);
  } else {
    // Generate a new wallet (will need to be funded manually)
    sheetWallet = Wallet.createRandom().connect(sheetProvider);
    console.warn(`⚠️  Using randomly generated Sheet Chain wallet: ${sheetWallet.address}`);
    console.warn(`   Set TEST_SHEET_PRIVATE_KEY to use a funded wallet.`);
    console.warn(`   Run 'npm run test:fund-wallets' for wallet generation and funding instructions.`);
  }
  
  return {
    solana: {
      keypair: solanaKeypair,
      address: solanaKeypair.publicKey.toBase58(),
    },
    sheet: {
      wallet: sheetWallet,
      address: sheetWallet.address,
    },
  };
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => Promise<boolean>,
  timeout: number = TEST_CONFIG.MAX_BALANCE_WAIT,
  interval: number = TEST_CONFIG.BALANCE_CHECK_INTERVAL
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Convert Solana amount (9 decimals) to Sheet Chain amount (18 decimals)
 */
export function convertSolanaToSheet(amount: bigint): bigint {
  return amount * BigInt(10 ** 9);
}

/**
 * Convert Sheet Chain amount (18 decimals) to Solana amount (9 decimals)
 */
export function convertSheetToSolana(amount: bigint): bigint {
  return amount / BigInt(10 ** 9);
}
