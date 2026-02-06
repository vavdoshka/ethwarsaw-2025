import 'dotenv/config';
import bs58 from 'bs58';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, sendAndConfirmTransaction, SystemProgram, Transaction } from '@solana/web3.js';

const CONFIG = {
    rpcUrl: process.env.RPC_URL || 'https://api.devnet.solana.com',
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
    const amountSol = parseFloat(process.argv[3] || '0.1'); // Default: 0.1 SOL
    
    if (!recipient) {
        console.error('Usage: ts-node scripts/sendSol.ts <recipient-address> [amount-in-sol]');
        console.error('Example: ts-node scripts/sendSol.ts AShYSTqruNHXbhAfjhiWBVKwNCJRf5z8WpSHdFa9qqHS 0.1');
        process.exit(1);
    }

    const sender = getKeypairFromEnv();
    const connection = new Connection(CONFIG.rpcUrl, 'confirmed');
    const recipientPubkey = new PublicKey(recipient);

    console.log('💸 Sending SOL...\n');
    console.log('Sender Address:', sender.publicKey.toBase58());
    console.log('Recipient Address:', recipient);
    console.log('Amount:', amountSol, 'SOL');
    console.log('');

    // Check sender balance
    const senderBalance = await connection.getBalance(sender.publicKey);
    const senderBalanceSol = senderBalance / LAMPORTS_PER_SOL;
    console.log(`Sender balance: ${senderBalanceSol} SOL`);

    const amountLamports = amountSol * LAMPORTS_PER_SOL;
    const transactionFee = 5000; // Approximate fee

    if (senderBalance < amountLamports + transactionFee) {
        throw new Error(
            `Insufficient balance. Need ${amountSol + transactionFee / LAMPORTS_PER_SOL} SOL, ` +
            `but only have ${senderBalanceSol} SOL`
        );
    }

    // Check recipient balance
    const recipientBalance = await connection.getBalance(recipientPubkey);
    const recipientBalanceSol = recipientBalance / LAMPORTS_PER_SOL;
    console.log(`Recipient current balance: ${recipientBalanceSol} SOL`);
    console.log('');

    // Create transaction
    const transaction = new Transaction().add(
        SystemProgram.transfer({
            fromPubkey: sender.publicKey,
            toPubkey: recipientPubkey,
            lamports: amountLamports,
        })
    );

    // Send and confirm
    console.log('Sending transaction...');
    const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [sender],
        { commitment: 'confirmed' }
    );

    console.log('\n✅ SOL sent successfully!');
    console.log(`Transaction signature: ${signature}`);
    console.log(`View on Solana Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

    // Check final balances
    console.log('\n📊 Final balances:');
    const finalSenderBalance = await connection.getBalance(sender.publicKey);
    const finalRecipientBalance = await connection.getBalance(recipientPubkey);
    
    console.log(`Sender: ${finalSenderBalance / LAMPORTS_PER_SOL} SOL`);
    console.log(`Recipient: ${finalRecipientBalance / LAMPORTS_PER_SOL} SOL`);
}

main().catch((e) => {
    console.error('\n❌ Error:', e);
    process.exit(1);
});
