import 'dotenv/config';
import bs58 from 'bs58';
import {
    Connection,
    Keypair,
    PublicKey,
    Transaction,
    sendAndConfirmTransaction,
} from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, getMint } from '@solana/spl-token';
import {
    PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID,
    createCreateMetadataAccountV3Instruction,
} from '@metaplex-foundation/mpl-token-metadata';

// =============================
// Config
// =============================
const MINT_AMOUNT_UNITS = 100_000_000n;

const CONFIG = {
    rpcUrl: process.env.RPC_URL || 'https://api.devnet.solana.com',
    decimals: 9,
    metadata: {
        name: 'Sheet',
        symbol: 'SHEET',
        uri: '',
        sellerFeeBasisPoints: 0,
        creators: null,
        collection: null,
        uses: null,
    },
};

function getPayerFromEnv(): Keypair {
    const secret = process.env.SECRET_KEY;
    if (!secret) throw new Error('Missing SECRET_KEY in .env');
    // Accept either JSON array or bs58 string
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

async function createMetadata(connection: Connection, payer: Keypair, mint: PublicKey) {
    const metadataPDAAndBump = PublicKey.findProgramAddressSync(
        [Buffer.from('metadata'), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
        TOKEN_METADATA_PROGRAM_ID
    );
    const metadataPDA = metadataPDAAndBump[0];

    const transaction = new Transaction();
    const createMetadataAccountInstruction = createCreateMetadataAccountV3Instruction(
        {
            metadata: metadataPDA,
            mint,
            mintAuthority: payer.publicKey,
            payer: payer.publicKey,
            updateAuthority: payer.publicKey,
        },
        {
            createMetadataAccountArgsV3: {
                collectionDetails: null,
                data: CONFIG.metadata,
                isMutable: true,
            },
        }
    );
    transaction.add(createMetadataAccountInstruction);

    await sendAndConfirmTransaction(connection, transaction, [payer]);
}

async function main() {
    const payer = getPayerFromEnv();
    const connection = new Connection(CONFIG.rpcUrl, 'confirmed');

    const mint = await createMint(connection, payer, payer.publicKey, null, CONFIG.decimals);
    await createMetadata(connection, payer, mint);

    const ata = await getOrCreateAssociatedTokenAccount(connection, payer, mint, payer.publicKey);

    const amountRaw = MINT_AMOUNT_UNITS * 10n ** BigInt(CONFIG.decimals);
    const sig = await mintTo(connection, payer, mint, ata.address, payer, amountRaw);

    const mintInfo = await getMint(connection, mint);
    console.log('Token deployed');
    console.log('Mint:', mint.toBase58());
    console.log('Metadata Program:', TOKEN_METADATA_PROGRAM_ID.toBase58());
    console.log('ATA:', ata.address.toBase58());
    console.log('Mint tx:', sig);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
