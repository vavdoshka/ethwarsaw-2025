/**
 * Script to help fund test wallets for e2e tests
 * 
 * This script generates test wallet addresses and provides instructions
 * for funding them.
 */

import 'dotenv/config';
import { Keypair } from '@solana/web3.js';
import { Wallet, JsonRpcProvider } from 'ethers';
import { SHEET_RPC_URL } from '../../src/config';

async function main() {
  console.log('\n🔧 Test Wallet Funding Helper\n');
  
  // Generate or load test wallets
  const sheetProvider = new JsonRpcProvider(process.env.SHEET_RPC_URL || SHEET_RPC_URL);
  
  // Sheet Chain wallet
  let sheetWallet: Wallet;
  if (process.env.TEST_SHEET_PRIVATE_KEY) {
    sheetWallet = new Wallet(process.env.TEST_SHEET_PRIVATE_KEY, sheetProvider);
    console.log('📋 Using existing TEST_SHEET_PRIVATE_KEY wallet');
  } else {
    sheetWallet = Wallet.createRandom().connect(sheetProvider);
    console.log('🆕 Generated new Sheet Chain wallet');
  }
  
  // Solana wallet
  let solanaKeypair: Keypair;
  if (process.env.TEST_SOLANA_PRIVATE_KEY) {
    const privateKeyBytes = Buffer.from(process.env.TEST_SOLANA_PRIVATE_KEY, 'base64');
    solanaKeypair = Keypair.fromSecretKey(privateKeyBytes);
    console.log('📋 Using existing TEST_SOLANA_PRIVATE_KEY wallet');
  } else {
    solanaKeypair = Keypair.generate();
    console.log('🆕 Generated new Solana wallet');
  }
  
  console.log('\n📊 Test Wallet Addresses:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`\n📄 Sheet Chain Wallet:`);
  console.log(`   Address: ${sheetWallet.address}`);
  console.log(`   Private Key: ${sheetWallet.privateKey}`);
  
  console.log(`\n🪙 Solana Wallet:`);
  console.log(`   Address: ${solanaKeypair.publicKey.toBase58()}`);
  console.log(`   Private Key (base64): ${Buffer.from(solanaKeypair.secretKey).toString('base64')}`);
  
  console.log('\n💡 To use these wallets in tests, add to your .env file:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`TEST_SHEET_PRIVATE_KEY=${sheetWallet.privateKey}`);
  console.log(`TEST_SOLANA_PRIVATE_KEY=${Buffer.from(solanaKeypair.secretKey).toString('base64')}`);
  
  console.log('\n💰 Funding Instructions:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  console.log('\n1. Sheet Chain Wallet:');
  console.log(`   - Open your Google Sheet (used by RPC node)`);
  console.log(`   - Go to the "Balances" tab`);
  console.log(`   - Add a row with:`);
  console.log(`     Address: ${sheetWallet.address}`);
  console.log(`     Balance: 1000000000000000000000 (1 ETH in wei, or more)`);
  console.log(`     Nonce: 0`);
  console.log(`   - Restart the RPC node to pick up the changes`);
  
  console.log('\n2. Solana Wallet:');
  console.log(`   - Send SHEET SPL tokens to: ${solanaKeypair.publicKey.toBase58()}`);
  console.log(`   - Token Mint: ${process.env.SOLANA_TOKEN_MINT || '4opADvbtoEaXryZH5UoEpVXERDJoRMZoXy8yMsogsc2S'}`);
  console.log(`   - You can use the Solana CLI or a wallet like Phantom`);
  console.log(`   - For devnet, you can use a faucet or transfer from another wallet`);
  
  console.log('\n✅ After funding, run: npm run test:e2e\n');
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
