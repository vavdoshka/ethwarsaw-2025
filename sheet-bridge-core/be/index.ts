import { Connection, PublicKey } from '@solana/web3.js';
import { EventParser, BorshCoder, Idl } from '@coral-xyz/anchor';
import idl from '../target/idl/lock.json';
import logger from './logger';
import 'dotenv/config';
import { JsonRpcProvider, Wallet, isAddress } from 'ethers';

const SOLANA_RPC_URL = 'https://api.devnet.solana.com';
const SHEET_RPC_URL = 'http://127.0.0.1:8545';
const LOCK_PROGRAM_ID = new PublicKey('A71HPBKuZWm5AeEHTant8rdC2nkMDBcaWcfSrqtjU94F');
const TOKENS_LOCKED_EVENT = 'TokensLocked';

async function main() {
    const coder = new BorshCoder(idl as Idl);
    const parser = new EventParser(LOCK_PROGRAM_ID, coder);
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

    const ethProvider = new JsonRpcProvider(SHEET_RPC_URL);
    if (!process.env.SHEET_PRIVATE_KEY) throw new Error('SHEET_PRIVATE_KEY not set');
    const ethWallet = new Wallet(process.env.SHEET_PRIVATE_KEY, ethProvider);

    logger.info('Starting event listener for emitted events...');

    connection.onLogs(
        LOCK_PROGRAM_ID,
        (logs, context) => {
            if (logs.err) return;

            const logMessages = logs.logs.join(' ');
            if (logMessages.includes('Program log: AnchorError')) return;

            for (const evt of parser.parseLogs(logs.logs)) {
                if (evt.name === TOKENS_LOCKED_EVENT) {
                    const { sender, amount, recipient } = evt.data as {
                        sender: PublicKey;
                        amount: any;
                        recipient: string;
                    };
                    const amountStr =
                        typeof amount === 'bigint'
                            ? amount.toString()
                            : amount?.toString?.() ?? String(amount);
                    logger.info(
                        `transfer event cached, user: ${sender.toString()}, amount: ${amountStr}, recipient: ${recipient}`
                    );

                    sendSheetTransfer(ethWallet, recipient, amount);
                }
            }
        },
        'confirmed'
    );

    logger.info('Event listener is running. Press Ctrl+C to stop.');

    process.on('SIGINT', () => {
        logger.info('\nStopping event listener...');
        process.exit(0);
    });
}

async function sendSheetTransfer(ethWallet: Wallet, recipient: string, amount: any) {
    if (!isAddress(recipient)) {
        logger.error(`Invalid Sheet address from event, skipping: ${recipient}`);
        return;
    }
    const valueWei = typeof amount === 'bigint' ? amount : BigInt(amount.toString());
    try {
        const tx = await ethWallet.sendTransaction({ to: recipient, value: valueWei });
        logger.info(
            `Sheet transfer submitted: ${tx.hash} -> ${recipient} (${valueWei.toString()} wei)`
        );
        const receipt = await tx.wait();
        logger.info(`Sheet transfer confirmed in block ${receipt.blockNumber}`);
    } catch (err: any) {
        logger.error(`Sheet transfer failed: ${err?.message ?? String(err)}`);
    }
}

main().catch(console.error);
