import 'dotenv/config';
import bs58 from 'bs58';
import * as anchor from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import {
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    getAssociatedTokenAddress,
} from '@solana/spl-token';
import idl from '../target/idl/lock.json';

const CONFIG = {
    rpcUrl: process.env.RPC_URL || 'https://api.devnet.solana.com',
    programId: '46BKi3nxgwFpc8EXE2Yem3syK5yqQRvJLasWzvsTEEgx',
    mintAddress: 'CpsKSnkJXrgxUXjJjqLR9tn3QM9RrVASHjA8LW97XHo3',
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
    const payer = getPayerFromEnv();
    const connection = new Connection(CONFIG.rpcUrl, 'confirmed');

    const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(payer), {});
    anchor.setProvider(provider);

    const programId = new PublicKey(CONFIG.programId);
    const mint = new PublicKey(CONFIG.mintAddress);

    // Derive PDAs
    const [lockAccountPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('lock'), mint.toBuffer()],
        programId
    );
    const [vaultAuthorityPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault'), lockAccountPda.toBuffer()],
        programId
    );

    // Compute vault ATA for PDA owner (allow off curve)
    const vaultTokenAccount = await getAssociatedTokenAddress(mint, vaultAuthorityPda, true);

    // Load program
    const program = new anchor.Program(idl as anchor.Idl, provider);

    console.log('Initializing lock program...');
    console.log('Mint:', mint.toBase58());
    console.log('Lock Account PDA:', lockAccountPda.toBase58());
    console.log('Vault Authority PDA:', vaultAuthorityPda.toBase58());

    try {
        const tx = await program.methods
            .initialize()
            .accounts({
                payer: payer.publicKey,
                lockAccount: lockAccountPda,
                mint,
                vaultAuthority: vaultAuthorityPda,
                vaultTokenAccount,
                systemProgram: SystemProgram.programId,
                tokenProgram: TOKEN_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            })
            .signers([])
            .rpc();

        console.log('✅ Lock program initialized successfully!');
        console.log('Transaction:', tx);
        console.log('Lock Account:', lockAccountPda.toBase58());
    } catch (error) {
        console.error('❌ Failed to initialize:', error);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
