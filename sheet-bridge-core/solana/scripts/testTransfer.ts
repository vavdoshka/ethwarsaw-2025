import 'dotenv/config';
import bs58 from 'bs58';
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { 
    getAssociatedTokenAddress, 
    createTransferInstruction, 
    getAccount,
    getOrCreateAssociatedTokenAccount,
    getMint
} from '@solana/spl-token';

const CONFIG = {
    rpcUrl: process.env.RPC_URL || 'https://api.devnet.solana.com',
    mintAddress: '4opADvbtoEaXryZH5UoEpVXERDJoRMZoXy8yMsogsc2S',
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
    // Get recipient and amount from command line args
    const recipient = process.argv[2];
    const amountWei = process.argv[3] || '1000000000000000'; // Default: 0.001 tokens in wei (18 decimals)
    
    if (!recipient) {
        console.error('Usage: ts-node scripts/testTransfer.ts <recipient-address> [amount-in-wei]');
        console.error('Example: ts-node scripts/testTransfer.ts 34TFHAUVVtW3UtcsuU5wrb3zABGqDeGX4FudGj5m25yA 980000000000000');
        process.exit(1);
    }

    const authority = getKeypairFromEnv();
    const connection = new Connection(CONFIG.rpcUrl, 'confirmed');
    const mint = new PublicKey(CONFIG.mintAddress);
    const recipientPubkey = new PublicKey(recipient);

    console.log('🧪 Testing Solana Transfer...\n');
    console.log('Authority Address:', authority.publicKey.toBase58());
    console.log('Recipient Address:', recipient);
    console.log('Mint Address:', mint.toBase58());
    console.log('Amount (wei):', amountWei);
    console.log('');

    // Get mint info
    const mintInfo = await getMint(connection, mint);
    const decimals = mintInfo.decimals;
    console.log(`Mint decimals: ${decimals}`);

    // Convert amount from wei (18 decimals) to Solana token units
    const amountWeiBigInt = BigInt(amountWei);
    const amountSolana = amountWeiBigInt / BigInt(10 ** (18 - decimals));
    
    if (amountSolana === 0n) {
        throw new Error(`Amount too small after conversion: ${amountWeiBigInt} wei = ${amountSolana} tokens`);
    }
    
    console.log(`Converted amount: ${amountWeiBigInt} wei -> ${amountSolana} tokens (${decimals} decimals)`);
    console.log('');

    // Get authority token account
    const authorityTokenAccount = await getAssociatedTokenAddress(
        mint,
        authority.publicKey
    );
    console.log(`Authority Token Account: ${authorityTokenAccount.toBase58()}`);

    // Check authority balance
    try {
        const authorityAccount = await getAccount(connection, authorityTokenAccount);
        const balance = Number(authorityAccount.amount) / Math.pow(10, decimals);
        console.log(`✅ Authority balance: ${balance} SHEET (${authorityAccount.amount.toString()} raw)`);
        
        if (authorityAccount.amount < amountSolana) {
            throw new Error(
                `Insufficient balance: ${authorityAccount.amount.toString()} < ${amountSolana.toString()}`
            );
        }
    } catch (error: any) {
        if (error.message?.includes('could not find account')) {
            throw new Error(`Authority token account does not exist: ${authorityTokenAccount.toBase58()}`);
        }
        throw error;
    }

    // Ensure recipient token account exists
    console.log('Ensuring recipient token account exists...');
    let recipientTokenAccount: PublicKey;
    try {
        const recipientTokenAccountInfo = await getOrCreateAssociatedTokenAccount(
            connection,
            authority,        // payer
            mint,             // mint
            recipientPubkey   // owner
        );
        recipientTokenAccount = recipientTokenAccountInfo.address;
        console.log(`✅ Recipient token account: ${recipientTokenAccount.toBase58()}`);
    } catch (error: any) {
        const errorMsg = error.message || String(error);
        console.error(`❌ Failed to get or create recipient token account: ${errorMsg}`);
        
        if (errorMsg.includes('not allowed') || errorMsg.includes('Invalid')) {
            throw new Error(
                `Invalid recipient address: ${recipient}. ` +
                `The address must be a valid Solana wallet address.`
            );
        }
        throw error;
    }

    // Check SOL balance
    const solBalance = await connection.getBalance(authority.publicKey);
    const solBalanceFormatted = solBalance / 1e9;
    console.log(`Authority SOL balance: ${solBalanceFormatted} SOL`);
    
    if (solBalance < 5000) {
        throw new Error(`Insufficient SOL for transaction fees. Need at least 0.000005 SOL.`);
    }
    console.log('');

    // Create transaction
    const transaction = new Transaction();
    transaction.feePayer = authority.publicKey;

    // Add transfer instruction
    transaction.add(
        createTransferInstruction(
            authorityTokenAccount,
            recipientTokenAccount,
            authority.publicKey,
            amountSolana
        )
    );

    // Simulate transaction
    console.log('Simulating transaction...');
    const { blockhash: simBlockhash } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = simBlockhash;
    
    try {
        const simulation = await connection.simulateTransaction(transaction);
        if (simulation.value.err) {
            console.error('❌ Simulation failed:', JSON.stringify(simulation.value.err, null, 2));
            if (simulation.value.logs) {
                console.error('Simulation logs:', simulation.value.logs);
            }
            throw new Error(`Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`);
        }
        console.log('✅ Simulation successful');
        if (simulation.value.unitsConsumed) {
            console.log(`   Compute units: ${simulation.value.unitsConsumed}`);
        }
    } catch (simError: any) {
        console.error('❌ Simulation error:', simError?.message || String(simError));
        throw simError;
    }

    // Get fresh blockhash for actual transaction
    console.log('\nSending transaction...');
    const { blockhash: sendBlockhash } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = sendBlockhash;

    // Send and confirm
    const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [authority],
        { 
            commitment: 'confirmed',
            skipPreflight: false
        }
    );

    console.log('\n✅ Transfer successful!');
    console.log(`Transaction signature: ${signature}`);
    console.log(`View on Solana Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

    // Check final balances
    console.log('\n📊 Final balances:');
    const finalAuthorityAccount = await getAccount(connection, authorityTokenAccount);
    const finalRecipientAccount = await getAccount(connection, recipientTokenAccount);
    
    console.log(`Authority: ${Number(finalAuthorityAccount.amount) / Math.pow(10, decimals)} SHEET`);
    console.log(`Recipient: ${Number(finalRecipientAccount.amount) / Math.pow(10, decimals)} SHEET`);
}

main().catch((e) => {
    console.error('\n❌ Error:', e);
    process.exit(1);
});

