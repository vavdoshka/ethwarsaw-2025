import 'dotenv/config';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Generate a new Solana keypair and output it in multiple formats
 */
function main() {
    console.log('🔑 Generating new Solana keypair...\n');

    // Generate new keypair
    const keypair = Keypair.generate();
    const secretKey = keypair.secretKey;

    // Format 1: JSON array (for .env file)
    const jsonArray = Array.from(secretKey);
    const jsonString = JSON.stringify(jsonArray);

    // Format 2: Base58 encoded (alternative format)
    const base58String = bs58.encode(secretKey);

    // Format 3: Save to file (Solana CLI format)
    const keypairPath = path.join(process.cwd(), 'keypair.json');
    fs.writeFileSync(keypairPath, JSON.stringify(Array.from(secretKey)));

    console.log('✅ Keypair generated successfully!\n');
    console.log('📋 Public Key (Address):');
    console.log('  ' + keypair.publicKey.toBase58());
    console.log('\n📋 Secret Key Formats:\n');

    console.log('1️⃣  JSON Array (for .env SECRET_KEY):');
    console.log('   SECRET_KEY=' + jsonString);
    console.log('\n2️⃣  Base58 Encoded (alternative):');
    console.log('   SECRET_KEY=' + base58String);
    console.log('\n3️⃣  Saved to file:');
    console.log('   ' + keypairPath);
    console.log('\n⚠️  IMPORTANT: Keep this secret key secure!');
    console.log('   Never commit it to git or share it publicly.');
    console.log('\n💡 To use with Solana CLI:');
    console.log('   solana config set --keypair ' + keypairPath);
    console.log('\n💡 To fund this wallet on devnet:');
    console.log('   solana airdrop 2 ' + keypair.publicKey.toBase58());
}

try {
    main();
} catch (e) {
    console.error('Error:', e);
    process.exit(1);
}

