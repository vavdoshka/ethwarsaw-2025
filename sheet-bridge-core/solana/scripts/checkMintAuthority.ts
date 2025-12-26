import 'dotenv/config';
import { Connection, PublicKey } from '@solana/web3.js';
import { getMint } from '@solana/spl-token';

const CONFIG = {
    rpcUrl: process.env.RPC_URL || 'https://api.devnet.solana.com',
    mintAddress: 'Qp8iRNXcL8bjsARWeUwpyQF8ztPLwo1gd8PM3xjrfZz',
};

async function main() {
    const connection = new Connection(CONFIG.rpcUrl, 'confirmed');
    const mint = new PublicKey(CONFIG.mintAddress);

    console.log('🔍 Checking mint authority...\n');
    console.log('Mint Address:', mint.toBase58());
    console.log('');

    try {
        const mintInfo = await getMint(connection, mint);
        
        console.log('Mint Info:');
        console.log('  Decimals:', mintInfo.decimals);
        console.log('  Supply:', mintInfo.supply.toString());
        console.log('  Mint Authority:', mintInfo.mintAuthority?.toBase58() || '❌ None (frozen)');
        console.log('');

        if (mintInfo.mintAuthority) {
            console.log('✅ Mint Authority Address:');
            console.log('   ' + mintInfo.mintAuthority.toBase58());
            console.log('');
            console.log('💡 This is the wallet that can mint new tokens.');
            console.log('   To mint tokens, you need the SECRET_KEY for this wallet.');
            console.log('');
            console.log('📝 To use this wallet as mint authority:');
            console.log('   1. Get the secret key for:', mintInfo.mintAuthority.toBase58());
            console.log('   2. Add to .env: MINT_AUTHORITY_SECRET_KEY=[...]');
            console.log('   3. Run: yarn transfer-to-authority');
        } else {
            console.log('⚠️  WARNING: Mint authority is frozen!');
            console.log('   No new tokens can be minted.');
            console.log('   You can only transfer existing tokens.');
        }
    } catch (error: any) {
        if (error.message?.includes('could not find account')) {
            console.error(`❌ Mint ${mint.toBase58()} does not exist on ${CONFIG.rpcUrl}`);
        } else {
            console.error('Error:', error);
        }
        process.exit(1);
    }
}

main().catch((e) => {
    console.error('Error:', e);
    process.exit(1);
});

