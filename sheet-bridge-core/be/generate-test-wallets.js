const { Wallet } = require('ethers');
const { Keypair } = require('@solana/web3.js');

console.log('\n🔧 Generating Test Wallets\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Generate Sheet Chain wallet
const sheetWallet = Wallet.createRandom();
console.log('📄 Sheet Chain Wallet:');
console.log(`   Address: ${sheetWallet.address}`);
console.log(`   Private Key: ${sheetWallet.privateKey}`);
console.log('');

// Generate Solana wallet
const solanaKeypair = Keypair.generate();
const solanaPrivateKeyBase64 = Buffer.from(solanaKeypair.secretKey).toString('base64');
console.log('🪙 Solana Wallet:');
console.log(`   Address: ${solanaKeypair.publicKey.toBase58()}`);
console.log(`   Private Key (base64): ${solanaPrivateKeyBase64}`);
console.log('');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log('💡 Add these to your .env file:\n');
console.log(`TEST_SHEET_PRIVATE_KEY=${sheetWallet.privateKey}`);
console.log(`TEST_SOLANA_PRIVATE_KEY=${solanaPrivateKeyBase64}\n`);
