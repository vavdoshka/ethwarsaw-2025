import 'dotenv/config';
import { Connection, PublicKey } from '@solana/web3.js';
import { getTokenAccountsByOwner } from '@solana/spl-token';

const CONFIG = {
    rpcUrl: process.env.RPC_URL || 'https://api.devnet.solana.com',
    // Both old and new mint addresses
    oldMint: 'Qp8iRNXcL8bjsARWeUwpyQF8ztPLwo1gd8PM3xjrfZz',
    newMint: '4opADvbtoEaXryZH5UoEpVXERDJoRMZoXy8yMsogsc2S',
};

async function main() {
    const userAddress = process.argv[2];
    
    if (!userAddress) {
        console.error('Usage: ts-node scripts/checkUserTokens.ts <user-address>');
        console.error('Example: ts-node scripts/checkUserTokens.ts AShYSTqruNHXbhAfjhiWBVKwNCJRf5z8WpSHdFa9qqHS');
        process.exit(1);
    }

    const connection = new Connection(CONFIG.rpcUrl, 'confirmed');
    const userPubkey = new PublicKey(userAddress);

    console.log('🔍 Checking user token accounts...\n');
    console.log('User Address:', userAddress);
    console.log('');

    // Check for old mint tokens
    console.log('1️⃣  Checking OLD mint:', CONFIG.oldMint);
    try {
        const oldMintPubkey = new PublicKey(CONFIG.oldMint);
        const oldTokenAccounts = await getTokenAccountsByOwner(connection, userPubkey, {
            mint: oldMintPubkey,
        });

        if (oldTokenAccounts.value.length > 0) {
            const account = oldTokenAccounts.value[0];
            const balance = await connection.getTokenAccountBalance(account.pubkey);
            const balanceFormatted = Number(balance.value.amount) / Math.pow(10, balance.value.decimals);
            console.log(`   ✅ Found token account: ${account.pubkey.toBase58()}`);
            console.log(`   Balance: ${balanceFormatted} SHEET (${balance.value.amount} raw)`);
            console.log(`   ⚠️  WARNING: This is the OLD mint address!`);
            console.log(`   The bridge expects the NEW mint: ${CONFIG.newMint}`);
        } else {
            console.log(`   ❌ No token account found for old mint`);
        }
    } catch (error: any) {
        console.log(`   ❌ Error checking old mint: ${error.message}`);
    }

    console.log('');

    // Check for new mint tokens
    console.log('2️⃣  Checking NEW mint:', CONFIG.newMint);
    try {
        const newMintPubkey = new PublicKey(CONFIG.newMint);
        const newTokenAccounts = await getTokenAccountsByOwner(connection, userPubkey, {
            mint: newMintPubkey,
        });

        if (newTokenAccounts.value.length > 0) {
            const account = newTokenAccounts.value[0];
            const balance = await connection.getTokenAccountBalance(account.pubkey);
            const balanceFormatted = Number(balance.value.amount) / Math.pow(10, balance.value.decimals);
            console.log(`   ✅ Found token account: ${account.pubkey.toBase58()}`);
            console.log(`   Balance: ${balanceFormatted} SHEET (${balance.value.amount} raw)`);
            console.log(`   ✅ This matches the bridge configuration!`);
        } else {
            console.log(`   ❌ No token account found for new mint`);
            console.log(`   💡 User needs to receive tokens from the NEW mint address`);
        }
    } catch (error: any) {
        console.log(`   ❌ Error checking new mint: ${error.message}`);
    }

    console.log('');

    // Summary
    console.log('📊 Summary:');
    console.log(`   Bridge expects: ${CONFIG.newMint}`);
    console.log(`   If user has tokens from old mint, they need to receive new tokens`);
    console.log(`   To send new tokens, use: yarn test-transfer ${userAddress} <amount>`);
}

main().catch((e) => {
    console.error('Error:', e);
    process.exit(1);
});
