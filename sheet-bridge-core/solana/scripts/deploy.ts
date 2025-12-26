import 'dotenv/config';
import * as anchor from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { execSync } from 'child_process';
import bs58 from 'bs58';

const CONFIG = {
    cluster: 'devnet',
    rpcUrl: process.env.RPC_URL || 'https://api.devnet.solana.com',
    programId: '46BKi3nxgwFpc8EXE2Yem3syK5yqQRvJLasWzvsTEEgx',
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

async function checkProgramDeployed(connection: Connection, programId: PublicKey): Promise<boolean> {
    try {
        const accountInfo = await connection.getAccountInfo(programId);
        return accountInfo !== null;
    } catch (error) {
        return false;
    }
}

async function main() {
    console.log('🚀 Starting Solana program deployment to devnet...\n');

    const payer = getPayerFromEnv();
    const connection = new Connection(CONFIG.rpcUrl, 'confirmed');
    const programId = new PublicKey(CONFIG.programId);

    console.log('📋 Configuration:');
    console.log('  Cluster:', CONFIG.cluster);
    console.log('  RPC URL:', CONFIG.rpcUrl);
    console.log('  Program ID:', programId.toBase58());
    console.log('  Payer:', payer.publicKey.toBase58());
    console.log('');

    // Check if program is already deployed
    const isDeployed = await checkProgramDeployed(connection, programId);
    if (isDeployed) {
        console.log('✅ Program is already deployed!');
        console.log('  Program ID:', programId.toBase58());
        
        const accountInfo = await connection.getAccountInfo(programId);
        if (accountInfo) {
            console.log('  Program Data Length:', accountInfo.data.length, 'bytes');
            console.log('  Owner:', accountInfo.owner.toBase58());
        }
        return;
    }

    // Check payer balance
    const balance = await connection.getBalance(payer.publicKey);
    const balanceSOL = balance / 1e9;
    console.log('💰 Payer balance:', balanceSOL.toFixed(4), 'SOL');
    
    if (balanceSOL < 2) {
        console.warn('⚠️  Warning: Low balance. You may need at least 2 SOL for deployment.');
        console.log('   Airdrop SOL: solana airdrop 2 ' + payer.publicKey.toBase58());
    }
    console.log('');

    // Build the program
    console.log('🔨 Building program...');
    try {
        execSync('anchor build', { 
            stdio: 'inherit',
            cwd: process.cwd()
        });
        console.log('✅ Build successful!\n');
    } catch (error) {
        console.error('❌ Build failed!');
        process.exit(1);
    }

    // Deploy the program
    console.log('📤 Deploying program to devnet...');
    try {
        execSync(`anchor deploy --provider.cluster ${CONFIG.cluster}`, {
            stdio: 'inherit',
            cwd: process.cwd()
        });
        console.log('\n✅ Deployment successful!');
        console.log('  Program ID:', programId.toBase58());
    } catch (error) {
        console.error('\n❌ Deployment failed!');
        console.error('Make sure:');
        console.error('  1. You have enough SOL in your wallet');
        console.error('  2. The program ID matches in Anchor.toml and lib.rs');
        console.error('  3. The keypair file exists at target/deploy/lock-keypair.json');
        process.exit(1);
    }

    // Verify deployment
    console.log('\n🔍 Verifying deployment...');
    const deployed = await checkProgramDeployed(connection, programId);
    if (deployed) {
        console.log('✅ Program verified on-chain!');
        const accountInfo = await connection.getAccountInfo(programId);
        if (accountInfo) {
            console.log('  Program Data Length:', accountInfo.data.length, 'bytes');
        }
    } else {
        console.warn('⚠️  Warning: Could not verify program on-chain');
    }
}

main().catch((e) => {
    console.error('Fatal error:', e);
    process.exit(1);
});

