import 'dotenv/config';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Extract secret key from existing Solana wallet
 * Supports:
 * - Default Solana CLI wallet (~/.config/solana/id.json)
 * - Custom keypair file path
 */
function main() {
    console.log('🔑 Extracting secret key from existing Solana wallet...\n');

    // Try to find the wallet
    const defaultWalletPath = path.join(os.homedir(), '.config', 'solana', 'id.json');
    const customWalletPath = process.argv[2]; // Allow custom path as argument
    
    let walletPath: string;
    let keypairData: number[];

    if (customWalletPath && fs.existsSync(customWalletPath)) {
        walletPath = customWalletPath;
        console.log('📁 Using custom wallet:', walletPath);
    } else if (fs.existsSync(defaultWalletPath)) {
        walletPath = defaultWalletPath;
        console.log('📁 Using default Solana wallet:', walletPath);
    } else {
        console.error('❌ No wallet found!');
        console.error('   Default location:', defaultWalletPath);
        console.error('   Or provide custom path: ts-node scripts/extractKeypair.ts /path/to/keypair.json');
        process.exit(1);
    }

    try {
        const fileContent = fs.readFileSync(walletPath, 'utf-8');
        keypairData = JSON.parse(fileContent);
        
        if (!Array.isArray(keypairData) || keypairData.length < 64) {
            throw new Error('Invalid keypair format');
        }
    } catch (error) {
        console.error('❌ Failed to read wallet file:', error);
        process.exit(1);
    }

    // Create keypair to get public key
    const keypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));
    const secretKey = keypair.secretKey;

    // Format 1: JSON array (for .env file) - only first 64 bytes
    const jsonArray = Array.from(secretKey.slice(0, 64));
    const jsonString = JSON.stringify(jsonArray);

    // Format 2: Base58 encoded (alternative format)
    const base58String = bs58.encode(secretKey);

    console.log('\n✅ Wallet loaded successfully!\n');
    console.log('📋 Public Key (Address):');
    console.log('  ' + keypair.publicKey.toBase58());
    console.log('\n📋 Secret Key Formats:\n');

    console.log('1️⃣  JSON Array (for .env SECRET_KEY):');
    console.log('   SECRET_KEY=' + jsonString);
    console.log('\n2️⃣  Base58 Encoded (alternative):');
    console.log('   SECRET_KEY=' + base58String);
    console.log('\n💡 Copy the SECRET_KEY line above to your .env file');
    console.log('\n⚠️  IMPORTANT: Keep this secret key secure!');
    console.log('   Never commit it to git or share it publicly.');
}

try {
    main();
} catch (e) {
    console.error('Error:', e);
    process.exit(1);
}

