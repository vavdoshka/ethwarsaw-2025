import 'dotenv/config';
import bs58 from 'bs58';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount, getMint } from '@solana/spl-token';

const CONFIG = {
    rpcUrl: process.env.RPC_URL || 'https://api.devnet.solana.com',
    mintAddress: '4opADvbtoEaXryZH5UoEpVXERDJoRMZoXy8yMsogsc2S',
};

function getPayerFromEnv(): Keypair {
    const secret = process.env.SECRET_KEY;
    if (!secret) throw new Error('Missing SECRET_KEY in .env');
    let kp: Keypair;
    if (secret.trim().startsWith('[')) {
        const arr = JSON.parse(secret) as number[];
        kp = Keypair.fromSecretKey(new Uint8Array(arr));
    } else {
        const bytes = bs58.decode(secret);
        kp = Keypair.fromSecretKey(bytes);
    }
    return kp;
}

async function main() {
    const authority = getPayerFromEnv();
    const connection = new Connection(CONFIG.rpcUrl, 'confirmed');
    const mint = new PublicKey(CONFIG.mintAddress);

    console.log('🔍 Checking authority wallet token balance...\n');
    console.log('Authority Address:', authority.publicKey.toBase58());
    console.log('Mint Address:', mint.toBase58());
    console.log('');

    // Get mint info
    const mintInfo = await getMint(connection, mint);
    console.log('Mint Info:');
    console.log('  Decimals:', mintInfo.decimals);
    console.log('  Supply:', mintInfo.supply.toString());
    console.log('');

    // Get authority token account
    const authorityTokenAccount = await getAssociatedTokenAddress(mint, authority.publicKey);

    console.log('Authority Token Account:', authorityTokenAccount.toBase58());
    console.log('');

    try {
        const account = await getAccount(connection, authorityTokenAccount);
        const balance = Number(account.amount) / Math.pow(10, mintInfo.decimals);
        console.log('✅ Token account exists!');
        console.log('  Raw balance:', account.amount.toString());
        console.log('  Formatted balance:', balance, 'SHEET');
        console.log('  Mint:', account.mint.toBase58());
        console.log('  Owner:', account.owner.toBase58());
        
        if (account.amount === 0n) {
            console.log('\n⚠️  WARNING: Token account exists but has zero balance!');
            console.log('   You need to mint or transfer tokens to this account.');
            console.log('   Run: yarn mint-to-authority');
        }
    } catch (error: any) {
        const errorName = error.constructor?.name || '';
        const errorMsg = error.message || String(error);
        
        if (errorName === 'TokenAccountNotFoundError' || 
            errorMsg.includes('could not find account') ||
            errorMsg.includes('TokenAccountNotFound')) {
            console.log('❌ Token account does NOT exist!');
            console.log('\n💡 Solutions:');
            console.log('   1. Mint tokens to this wallet: yarn mint-to-authority');
            console.log('   2. Transfer tokens from another wallet to:', authority.publicKey.toBase58());
            console.log('   3. The token account will be created automatically when you mint/transfer');
        } else {
            console.error('Error checking account:', error);
        }
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

