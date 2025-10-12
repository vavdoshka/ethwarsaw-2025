import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import BN from 'bn.js';
import {
    createMint,
    getOrCreateAssociatedTokenAccount,
    getAssociatedTokenAddress,
    mintTo,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { PublicKey, SystemProgram, Keypair } from '@solana/web3.js';
import { Wallet } from 'ethers';
import { expect } from 'chai';
import { sleep, safeGetTokenAmount, captureEventFromTransaction } from './utils';

describe('lock program', () => {
    const provider = anchor.AnchorProvider.local();
    anchor.setProvider(provider);

    const program = anchor.workspace.Lock as unknown as Program;

    let mint: PublicKey;
    let user = provider.wallet.payer as Keypair;
    let userTokenAccount: PublicKey;
    let lockAccountPda: PublicKey;
    let vaultAuthorityPda: PublicKey;
    let vaultTokenAccount: PublicKey;

    before(async () => {
        mint = await createMint(provider.connection, user, user.publicKey, null, 9);

        userTokenAccount = (
            await getOrCreateAssociatedTokenAccount(provider.connection, user, mint, user.publicKey)
        ).address;

        await mintTo(provider.connection, user, mint, userTokenAccount, user, 100_000_000_000);
    });

    it('contract successfully deployed and initialized', async () => {
        // Derive PDAs
        [lockAccountPda] = PublicKey.findProgramAddressSync(
            [Buffer.from('lock'), mint.toBuffer()],
            program.programId
        );
        [vaultAuthorityPda] = PublicKey.findProgramAddressSync(
            [Buffer.from('vault'), lockAccountPda.toBuffer()],
            program.programId
        );

        // Compute vault ATA for PDA owner (allow off curve)
        vaultTokenAccount = await getAssociatedTokenAddress(mint, vaultAuthorityPda, true);

        // Initialize
        await program.methods
            .initialize()
            .accounts({
                payer: user.publicKey,
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

        // Read back on-chain accounts to assert init success
        const lockAccount = await (program.account as any).lockAccount.fetch(lockAccountPda);
        expect(lockAccount.mint.toBase58()).to.equal(mint.toBase58());
    });

    it('user can send valid tokens to this contract; event emitted', async () => {
        const lockAmount = 10_000_000_000;
        const recipient = Wallet.createRandom().address;

        const userPre = (await provider.connection.getTokenAccountBalance(userTokenAccount)).value
            .amount;
        const vaultPre = await safeGetTokenAmount(provider.connection, vaultTokenAccount);

        const sig = await program.methods
            .lockTokens(new BN(lockAmount), recipient)
            .accounts({
                user: user.publicKey,
                lockAccount: lockAccountPda,
                mint,
                userTokenAccount,
                vaultTokenAccount,
                vaultAuthority: vaultAuthorityPda,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([])
            .rpc();

        const receivedEvent = await captureEventFromTransaction(provider.connection, sig);

        const userPost = (await provider.connection.getTokenAccountBalance(userTokenAccount)).value
            .amount;
        const vaultPost = await safeGetTokenAmount(provider.connection, vaultTokenAccount);

        expect(BigInt(userPre) - BigInt(userPost)).to.equal(BigInt(lockAmount));
        expect(BigInt(vaultPost) - BigInt(vaultPre)).to.equal(BigInt(lockAmount));

        expect(receivedEvent).to.not.equal(null);
        expect((receivedEvent as any).sender.toBase58()).to.equal(user.publicKey.toBase58());
        expect(new BN((receivedEvent as any).amount).toNumber()).to.equal(lockAmount);
        expect((receivedEvent as any).recipient).to.equal(recipient);
    });

    it('invalid tokens rejected; no event emitted', async () => {
        // Create a different mint and user ATA for that mint
        const badMint = await createMint(provider.connection, user, user.publicKey, null, 9);
        const badUserToken = (
            await getOrCreateAssociatedTokenAccount(
                provider.connection,
                user,
                badMint,
                user.publicKey
            )
        ).address;
        await mintTo(provider.connection, user, badMint, badUserToken, user, 100);

        let eventCount = 0;
        const listener = await program.addEventListener('TokensLocked', () => {
            eventCount += 1;
        });

        let threw = false;
        try {
            await program.methods
                .lockTokens(new BN(10), '0x1111111111111111111111111111111111111111')
                .accounts({
                    user: user.publicKey,
                    lockAccount: lockAccountPda,
                    mint, // program expects the configured mint
                    userTokenAccount: badUserToken, // wrong mint
                    vaultTokenAccount,
                    vaultAuthority: vaultAuthorityPda,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .signers([])
                .rpc();
        } catch (e) {
            threw = true;
        }

        await sleep(300);
        await program.removeEventListener(listener);

        expect(threw).to.equal(true);
        expect(eventCount).to.equal(0);
    });

    it('invalid recipient format rejected; error thrown', async () => {
        let threw = false;
        try {
            await program.methods
                .lockTokens(new BN(10), 'not-an-address')
                .accounts({
                    user: user.publicKey,
                    lockAccount: lockAccountPda,
                    mint,
                    userTokenAccount,
                    vaultTokenAccount,
                    vaultAuthority: vaultAuthorityPda,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .signers([])
                .rpc();
        } catch (e) {
            threw = true;
        }
        expect(threw).to.equal(true);
    });
});
