import 'dotenv/config';
import bs58 from 'bs58';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { 
    getOrCreateAssociatedTokenAccount, 
    getMint,
    getAccount,
    getAssociatedTokenAddress,
    createTransferInstruction,
    createAssociatedTokenAccountInstruction
} from '@solana/spl-token';
import { Transaction, sendAndConfirmTransaction } from '@solana/web3.js';

const CONFIG = {
    rpcUrl: process.env.RPC_URL || 'https://api.devnet.solana.com',
    mintAddress: '4opADvbtoEaXryZH5UoEpVXERDJoRMZoXy8yMsogsc2S',
    transferAmount: 1_000_000, // Amount in human-readable units
};

function getKeypairFromEnv(envVar: string, description: string): Keypair {
    const secret = process.env[envVar];
    if (!secret) {
        throw new Error(`Missing ${envVar} in .env (${description})`);
    }
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
    const connection = new Connection(CONFIG.rpcUrl, 'confirmed');
    const mint = new PublicKey(CONFIG.mintAddress);

    console.log('💸 Transferring tokens to authority wallet...\n');

    // Get mint info
    const mintInfo = await getMint(connection, mint);
    console.log('Mint Info:');
    console.log('  Address:', mint.toBase58());
    console.log('  Decimals:', mintInfo.decimals);
    console.log('  Supply:', mintInfo.supply.toString());
    console.log('  Mint Authority:', mintInfo.mintAuthority?.toBase58() || 'None (frozen)');
    console.log('');

    // Try to get source wallet (mint authority) from env
    let sourceWallet: Keypair | null = null;
    const mintAuthorityAddress = mintInfo.mintAuthority?.toBase58();
    
    if (process.env.MINT_AUTHORITY_SECRET_KEY) {
        try {
            sourceWallet = getKeypairFromEnv('MINT_AUTHORITY_SECRET_KEY', 'Mint Authority Wallet');
            console.log('✅ Using MINT_AUTHORITY_SECRET_KEY as source wallet');
            console.log('   Source Address:', sourceWallet.publicKey.toBase58());
            
            if (mintAuthorityAddress && sourceWallet.publicKey.toBase58() !== mintAuthorityAddress) {
                console.log('⚠️  WARNING: MINT_AUTHORITY_SECRET_KEY does not match mint authority!');
                console.log('   Expected:', mintAuthorityAddress);
                console.log('   Got:', sourceWallet.publicKey.toBase58());
            }
        } catch (error) {
            console.log('⚠️  Could not load MINT_AUTHORITY_SECRET_KEY, will check if authority wallet has tokens');
        }
    }

    // Get destination wallet (authority)
    const destinationWallet = getKeypairFromEnv('SECRET_KEY', 'Authority Wallet (Destination)');
    console.log('Destination Address:', destinationWallet.publicKey.toBase58());
    console.log('');

    // Determine source wallet
    if (!sourceWallet) {
        // Check if destination wallet has tokens (maybe it already has some)
        const destTokenAccount = await getAssociatedTokenAddress(mint, destinationWallet.publicKey);
        try {
            const destAccount = await getAccount(connection, destTokenAccount);
            const destBalance = Number(destAccount.amount) / Math.pow(10, mintInfo.decimals);
            console.log(`✅ Destination wallet already has ${destBalance} SHEET tokens!`);
            console.log('   No transfer needed.');
            return;
        } catch (error) {
            // Destination has no tokens, need to transfer
        }

        // If no source wallet specified, we need the mint authority
        if (!mintAuthorityAddress) {
            throw new Error('Mint authority is frozen. Cannot determine source wallet.');
        }

        console.log('❌ No MINT_AUTHORITY_SECRET_KEY found in .env');
        console.log('\n💡 To transfer tokens, you need to:');
        console.log('   1. Add MINT_AUTHORITY_SECRET_KEY to your .env file');
        console.log('   2. The value should be the secret key of:', mintAuthorityAddress);
        console.log('   3. Format: MINT_AUTHORITY_SECRET_KEY=[...] (JSON array) or MINT_AUTHORITY_SECRET_KEY=... (Base58)');
        console.log('\n   OR manually transfer tokens using Solana CLI or a wallet:');
        console.log(`   solana transfer --from <mint-authority-keypair> ${destinationWallet.publicKey.toBase58()} <amount>`);
        throw new Error('MINT_AUTHORITY_SECRET_KEY not found. Cannot proceed with transfer.');
    }

    // Get source token account
    const sourceTokenAccount = await getAssociatedTokenAddress(mint, sourceWallet.publicKey);
    console.log('Source Token Account:', sourceTokenAccount.toBase58());

    // Check source balance
    let sourceAccount;
    try {
        sourceAccount = await getAccount(connection, sourceTokenAccount);
        const sourceBalance = Number(sourceAccount.amount) / Math.pow(10, mintInfo.decimals);
        console.log('Source Balance:', sourceBalance, 'SHEET');
        
        if (sourceBalance < CONFIG.transferAmount) {
            throw new Error(
                `Insufficient balance: ${sourceBalance} < ${CONFIG.transferAmount} SHEET`
            );
        }
    } catch (error: any) {
        if (error.message?.includes('could not find account') || 
            error.message?.includes('TokenAccountNotFound')) {
            throw new Error(
                `Source wallet (${sourceWallet.publicKey.toBase58()}) has no token account. ` +
                `It may not have any SHEET tokens.`
            );
        }
        throw error;
    }

    // Get destination token account
    const destinationTokenAccount = await getAssociatedTokenAddress(mint, destinationWallet.publicKey);
    console.log('Destination Token Account:', destinationTokenAccount.toBase58());
    console.log('');

    // Calculate transfer amount
    const transferAmountRaw = BigInt(CONFIG.transferAmount) * BigInt(10 ** mintInfo.decimals);
    console.log(`Transferring ${CONFIG.transferAmount} SHEET (${transferAmountRaw.toString()} raw units)...`);

    const transaction = new Transaction();

    // Check if destination token account exists, create if not
    try {
        await getAccount(connection, destinationTokenAccount);
        console.log('✅ Destination token account exists');
    } catch (error: any) {
        if (error.message?.includes('could not find account') || 
            error.message?.includes('TokenAccountNotFound')) {
            console.log('📝 Creating destination token account...');
            transaction.add(
                createAssociatedTokenAccountInstruction(
                    sourceWallet.publicKey, // payer
                    destinationTokenAccount, // ata
                    destinationWallet.publicKey, // owner
                    mint // mint
                )
            );
        } else {
            throw error;
        }
    }

    // Add transfer instruction
    transaction.add(
        createTransferInstruction(
            sourceTokenAccount,
            destinationTokenAccount,
            sourceWallet.publicKey,
            transferAmountRaw
        )
    );

    // Send transaction
    const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [sourceWallet],
        { commitment: 'confirmed' }
    );

    console.log('\n✅ Tokens transferred successfully!');
    console.log('Transaction:', signature);

    // Check new balance
    const updatedAccount = await getAccount(connection, destinationTokenAccount);
    const newBalance = Number(updatedAccount.amount) / Math.pow(10, mintInfo.decimals);
    console.log('Destination balance:', newBalance, 'SHEET');
}

main().catch((e) => {
    console.error('Error:', e);
    process.exit(1);
});

