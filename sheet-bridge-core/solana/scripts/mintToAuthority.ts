import 'dotenv/config';
import bs58 from 'bs58';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { 
    getOrCreateAssociatedTokenAccount, 
    mintTo, 
    getMint,
    getAccount
} from '@solana/spl-token';

const CONFIG = {
    rpcUrl: process.env.RPC_URL || 'https://api.devnet.solana.com',
    mintAddress: 'Qp8iRNXcL8bjsARWeUwpyQF8ztPLwo1gd8PM3xjrfZz',
    mintAmount: 1_000_000, // Amount in human-readable units (will be converted based on decimals)
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

    console.log('🪙 Minting tokens to authority wallet...\n');
    console.log('Authority Address:', authority.publicKey.toBase58());
    console.log('Mint Address:', mint.toBase58());
    console.log('');

    // Get mint info
    let mintInfo;
    try {
        mintInfo = await getMint(connection, mint);
        console.log('Mint Info:');
        console.log('  Decimals:', mintInfo.decimals);
        console.log('  Supply:', mintInfo.supply.toString());
        console.log('  Mint Authority:', mintInfo.mintAuthority?.toBase58() || 'None (frozen)');
        console.log('');

        // Check if authority has minting authority
        if (!mintInfo.mintAuthority) {
            throw new Error('Mint authority is frozen. Cannot mint more tokens.');
        }

        if (mintInfo.mintAuthority.toBase58() !== authority.publicKey.toBase58()) {
            console.log('⚠️  WARNING: Authority wallet is NOT the mint authority!');
            console.log('   Mint Authority:', mintInfo.mintAuthority.toBase58());
            console.log('   Your Authority:', authority.publicKey.toBase58());
            console.log('   You may not be able to mint tokens.');
            console.log('');
        }
    } catch (error: any) {
        if (error.message?.includes('could not find account')) {
            throw new Error(`Mint ${mint.toBase58()} does not exist. Please deploy the token first.`);
        }
        throw error;
    }

    // Get or create authority token account
    console.log('Getting or creating authority token account...');
    const authorityTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        authority,
        mint,
        authority.publicKey
    );

    console.log('Authority Token Account:', authorityTokenAccount.address.toBase58());
    console.log('');

    // Check current balance
    try {
        const currentAccount = await getAccount(connection, authorityTokenAccount.address);
        const currentBalance = Number(currentAccount.amount) / Math.pow(10, mintInfo.decimals);
        console.log('Current balance:', currentBalance, 'SHEET');
    } catch (error) {
        console.log('Token account is new (no balance yet)');
    }

    // Calculate mint amount
    const mintAmountRaw = BigInt(CONFIG.mintAmount) * BigInt(10 ** mintInfo.decimals);
    console.log(`Minting ${CONFIG.mintAmount} SHEET (${mintAmountRaw.toString()} raw units)...`);

    try {
        // Mint tokens to authority
        const signature = await mintTo(
            connection,
            authority,
            mint,
            authorityTokenAccount.address,
            authority, // mint authority
            mintAmountRaw
        );

        console.log('\n✅ Tokens minted successfully!');
        console.log('Transaction:', signature);

        // Check new balance
        const updatedAccount = await getAccount(connection, authorityTokenAccount.address);
        const newBalance = Number(updatedAccount.amount) / Math.pow(10, mintInfo.decimals);
        console.log('New balance:', newBalance, 'SHEET');
    } catch (error: any) {
        if (error.message?.includes('invalid account data')) {
            throw new Error(
                'Failed to mint: Authority wallet is not the mint authority. ' +
                `Mint authority is: ${mintInfo.mintAuthority?.toBase58()}`
            );
        }
        throw error;
    }
}

main().catch((e) => {
    console.error('Error:', e);
    process.exit(1);
});

