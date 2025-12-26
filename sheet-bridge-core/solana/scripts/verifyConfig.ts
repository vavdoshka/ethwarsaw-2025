import 'dotenv/config';
import bs58 from 'bs58';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getMint, getAssociatedTokenAddress, getAccount } from '@solana/spl-token';

const CONFIG = {
    rpcUrl: process.env.RPC_URL || 'https://api.devnet.solana.com',
    programId: '46BKi3nxgwFpc8EXE2Yem3syK5yqQRvJLasWzvsTEEgx',
    mintAddress: 'Qp8iRNXcL8bjsARWeUwpyQF8ztPLwo1gd8PM3xjrfZz',
    expectedLockPDA: '7nnhVw7XhdWQdrw3qq4ypTjJ8ZuXw7WW15v3duvKGwZN',
    expectedVaultAuthorityPDA: '5DD2pAivrWCGTi4sabkahQe3FrjtKC8T5odN3HrEU8f4',
};

function getKeypairFromEnv(): Keypair {
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
    console.log('🔍 Verifying Solana Configuration...\n');

    const authority = getKeypairFromEnv();
    const connection = new Connection(CONFIG.rpcUrl, 'confirmed');
    const programId = new PublicKey(CONFIG.programId);
    const mint = new PublicKey(CONFIG.mintAddress);

    // 1. Verify Authority Address
    console.log('1️⃣  Authority Address:');
    console.log(`   Expected: 8bjhm2KehhYebDChKyiZKqG79tAaoCpQCwGzsUFYPagK`);
    console.log(`   Actual:   ${authority.publicKey.toBase58()}`);
    const authorityMatch = authority.publicKey.toBase58() === '8bjhm2KehhYebDChKyiZKqG79tAaoCpQCwGzsUFYPagK';
    console.log(`   ${authorityMatch ? '✅' : '❌'} ${authorityMatch ? 'MATCH' : 'MISMATCH'}\n`);

    // 2. Verify Program ID
    console.log('2️⃣  Program ID:');
    console.log(`   Expected: ${CONFIG.programId}`);
    console.log(`   Actual:   ${programId.toBase58()}`);
    const programMatch = programId.toBase58() === CONFIG.programId;
    console.log(`   ${programMatch ? '✅' : '❌'} ${programMatch ? 'MATCH' : 'MISMATCH'}\n`);

    // 3. Verify Token Mint
    console.log('3️⃣  Token Mint:');
    console.log(`   Expected: ${CONFIG.mintAddress}`);
    console.log(`   Actual:   ${mint.toBase58()}`);
    const mintMatch = mint.toBase58() === CONFIG.mintAddress;
    console.log(`   ${mintMatch ? '✅' : '❌'} ${mintMatch ? 'MATCH' : 'MISMATCH'}`);
    
    // Check if mint exists on-chain
    try {
        const mintInfo = await getMint(connection, mint);
        console.log(`   ✅ Mint exists on-chain`);
        console.log(`   Decimals: ${mintInfo.decimals}`);
        console.log(`   Supply: ${mintInfo.supply.toString()}`);
        console.log(`   Mint Authority: ${mintInfo.mintAuthority?.toBase58() || 'None (frozen)'}`);
        
        // Verify mint authority matches
        if (mintInfo.mintAuthority) {
            const mintAuthMatch = mintInfo.mintAuthority.toBase58() === authority.publicKey.toBase58();
            console.log(`   ${mintAuthMatch ? '✅' : '❌'} Mint Authority ${mintAuthMatch ? 'matches' : 'does NOT match'} authority wallet\n`);
        } else {
            console.log(`   ⚠️  Mint authority is frozen\n`);
        }
    } catch (error: any) {
        console.log(`   ❌ Mint does NOT exist on-chain: ${error.message}\n`);
    }

    // 4. Verify Lock Account PDA
    console.log('4️⃣  Lock Account PDA:');
    const [lockAccountPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('lock'), mint.toBuffer()],
        programId
    );
    console.log(`   Expected: ${CONFIG.expectedLockPDA}`);
    console.log(`   Actual:   ${lockAccountPda.toBase58()}`);
    const lockPDAMatch = lockAccountPda.toBase58() === CONFIG.expectedLockPDA;
    console.log(`   ${lockPDAMatch ? '✅' : '❌'} ${lockPDAMatch ? 'MATCH' : 'MISMATCH'}`);
    
    // Check if lock account exists
    try {
        const lockAccountInfo = await connection.getAccountInfo(lockAccountPda);
        if (lockAccountInfo) {
            console.log(`   ✅ Lock account exists on-chain\n`);
        } else {
            console.log(`   ⚠️  Lock account does NOT exist on-chain (needs initialization)\n`);
        }
    } catch (error) {
        console.log(`   ⚠️  Could not check lock account: ${error}\n`);
    }

    // 5. Verify Vault Authority PDA
    console.log('5️⃣  Vault Authority PDA:');
    const [vaultAuthorityPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault'), lockAccountPda.toBuffer()],
        programId
    );
    console.log(`   Expected: ${CONFIG.expectedVaultAuthorityPDA}`);
    console.log(`   Actual:   ${vaultAuthorityPda.toBase58()}`);
    const vaultPDAMatch = vaultAuthorityPda.toBase58() === CONFIG.expectedVaultAuthorityPDA;
    console.log(`   ${vaultPDAMatch ? '✅' : '❌'} ${vaultPDAMatch ? 'MATCH' : 'MISMATCH'}\n`);

    // 6. Verify Authority Token Account
    console.log('6️⃣  Authority Token Account:');
    const authorityTokenAccount = await getAssociatedTokenAddress(mint, authority.publicKey);
    console.log(`   Address: ${authorityTokenAccount.toBase58()}`);
    
    try {
        const account = await getAccount(connection, authorityTokenAccount);
        const balance = Number(account.amount) / Math.pow(10, 9);
        console.log(`   ✅ Token account exists`);
        console.log(`   Balance: ${balance} SHEET`);
        console.log(`   Raw balance: ${account.amount.toString()}\n`);
    } catch (error: any) {
        console.log(`   ❌ Token account does NOT exist: ${error.message}\n`);
    }

    // 7. Verify SOL Balance
    console.log('7️⃣  Authority SOL Balance:');
    try {
        const solBalance = await connection.getBalance(authority.publicKey);
        const solBalanceFormatted = solBalance / 1e9;
        console.log(`   Balance: ${solBalanceFormatted} SOL`);
        if (solBalance < 5000) {
            console.log(`   ⚠️  WARNING: Low SOL balance! Need at least 0.000005 SOL for transactions`);
            console.log(`   💡 Run: solana airdrop 1 ${authority.publicKey.toBase58()}\n`);
        } else {
            console.log(`   ✅ Sufficient SOL for transactions\n`);
        }
    } catch (error: any) {
        console.log(`   ❌ Could not check SOL balance: ${error.message}\n`);
    }

    // Summary
    console.log('📊 Summary:');
    const allMatch = authorityMatch && programMatch && mintMatch && lockPDAMatch && vaultPDAMatch;
    if (allMatch) {
        console.log('✅ All configuration parameters are correct!');
    } else {
        console.log('❌ Some parameters do not match. Please review the output above.');
    }
}

main().catch((e) => {
    console.error('Error:', e);
    process.exit(1);
});

