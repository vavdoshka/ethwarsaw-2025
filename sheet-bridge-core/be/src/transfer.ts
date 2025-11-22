import { Wallet, isAddress, Contract } from 'ethers';
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction } from '@solana/spl-token';
import logger from './logger';
import tokenLockAbi from './tokenLockAbi.json';
import { TransferContext } from './config';

export async function transferTokens(
    fromChain: string,
    toChain: string,
    to_address: string,
    to_amount: string,
    context: TransferContext,
): Promise<string> {
    if (fromChain === 'sheet' && toChain === 'solana') {
        return await sendSolanaTransfer(
            context.solanaConnection,
            context.solanaAuthority,
            context.solanaTokenMint,
            to_address,
            to_amount
        );
    } else if (fromChain === 'sheet' && toChain === 'bsc') {
        return await sendBSCTransfer(
            context.bscWallet,
            context.bscTokenLockAddress,
            to_address,
            to_amount
        );
    } else if (toChain === 'sheet') {
        return await sendSheetTransfer(
            context.sheetWallet,
            to_address,
            to_amount
        );
    } else {
        throw new Error(`Unsupported transfer route: ${fromChain} -> ${toChain}`);
    }
}

export async function sendSheetTransfer(ethWallet: Wallet, recipient: string, amount: any): Promise<string> {
    if (!isAddress(recipient)) {
        logger.error(`Invalid Sheet address from event, skipping: ${recipient}`);
        throw new Error(`Invalid Sheet address: ${recipient}`);
    }
    const valueWei = typeof amount === 'bigint' ? amount : BigInt(amount.toString());

    const tx = await ethWallet.sendTransaction({ to: recipient, value: valueWei });
    logger.info(
        `Sheet transfer submitted: ${tx.hash} -> ${recipient} (${valueWei.toString()} wei)`
    );
    const receipt = await tx.wait();
    logger.info(`Sheet transfer confirmed in block ${receipt?.blockNumber}`);
    return tx.hash;
}

export async function sendSolanaTransfer(
    connection: Connection,
    authorityKeypair: Keypair,
    mintAddress: PublicKey,
    recipient: string,
    amount: string
): Promise<string> {
    try {
        const recipientPubkey = new PublicKey(recipient);

        const authorityTokenAccount = await getAssociatedTokenAddress(
            mintAddress,
            authorityKeypair.publicKey
        );

        const recipientTokenAccount = await getAssociatedTokenAddress(
            mintAddress,
            recipientPubkey
        );

        const transferIx = createTransferInstruction(
            authorityTokenAccount,
            recipientTokenAccount,
            authorityKeypair.publicKey,
            BigInt(amount)
        );

        const transaction = new Transaction().add(transferIx);

        const signature = await sendAndConfirmTransaction(
            connection,
            transaction,
            [authorityKeypair],
            { commitment: 'confirmed' }
        );

        logger.info(
            `Solana transfer confirmed: ${signature} -> ${recipient} (${amount} tokens)`
        );

        return signature;
    } catch (error: any) {
        logger.error(`Solana transfer failed: ${error?.message ?? String(error)}`);
        throw error;
    }
}

export async function sendBSCTransfer(
    wallet: Wallet,
    tokenLockAddress: string,
    recipient: string,
    amount: string
): Promise<string> {
    try {
        if (!isAddress(recipient)) {
            throw new Error(`Invalid BSC address: ${recipient}`);
        }

        const contract = new Contract(tokenLockAddress, tokenLockAbi, wallet);

        const tx = await contract.release(recipient, amount);

        logger.info(
            `BSC transfer submitted: ${tx.hash} -> ${recipient} (${amount} tokens)`
        );

        const receipt = await tx.wait();
        logger.info(`BSC transfer confirmed in block ${receipt?.blockNumber}`);

        return tx.hash;
    } catch (error: any) {
        logger.error(`BSC transfer failed: ${error?.message ?? String(error)}`);
        throw error;
    }
}
