import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { EventParser, BorshCoder, Idl } from '@coral-xyz/anchor';
import idl from '../../solana/target/idl/lock.json';
import logger from './logger';
import 'dotenv/config';
import { JsonRpcProvider, Wallet, WebSocketProvider, Contract } from 'ethers';
import { setupDatabase, insertBridgeEvent, closeDatabase, getPendingBridgeEvents, updateBridgeEventStatus } from './db';
import { transferTokens } from './transfer';
import tokenLockAbi from './tokenLockAbi.json';
import {
    SOLANA_RPC_URL,
    SHEET_RPC_URL,
    LOCK_PROGRAM_ID,
    TOKENS_LOCKED_EVENT,
    BSC_WSS_URL,
    BSC_HTTP_URL,
    BSC_TOKEN_LOCK_ADDRESS,
    SOLANA_TOKEN_MINT,
    TransferContext
} from './config';

async function main() {
    setupDatabase();

    const sheetProvider = new JsonRpcProvider(SHEET_RPC_URL);
    if (!process.env.SHEET_PRIVATE_KEY) throw new Error('SHEET_PRIVATE_KEY not set');
    const sheetWallet = new Wallet(process.env.SHEET_PRIVATE_KEY, sheetProvider);

    const bscProvider = new JsonRpcProvider(BSC_HTTP_URL);
    if (!process.env.BSC_PRIVATE_KEY) throw new Error('BSC_PRIVATE_KEY not set');
    const bscWallet = new Wallet(process.env.BSC_PRIVATE_KEY, bscProvider);

    const solanaConnection = new Connection(SOLANA_RPC_URL, 'confirmed');
    if (!process.env.SECRET_KEY) throw new Error('SECRET_KEY not set');
    const secretKeyArray = JSON.parse(process.env.SECRET_KEY);
    const solanaAuthority = Keypair.fromSecretKey(Uint8Array.from(secretKeyArray));

    const transferContext: TransferContext = {
        sheetWallet,
        bscWallet,
        bscTokenLockAddress: BSC_TOKEN_LOCK_ADDRESS,
        solanaConnection,
        solanaAuthority,
        solanaTokenMint: SOLANA_TOKEN_MINT,
    };

    logger.info('Starting bridge monitoring services...');

    const solanaMonitor = runWithAutoRestart('Solana Monitor', () => monitorSolanaEvents());
    const bscMonitor = runWithAutoRestart('BSC Monitor', () => monitorBSCEvents());
    const transferWorker = runWithAutoRestart('Transfer Worker', () => processTransfers(transferContext));

    Promise.all([solanaMonitor, bscMonitor, transferWorker]).catch((error) => {
        logger.error(`Critical error in monitoring services: ${error}`);
    });

    logger.info('Bridge monitoring services are running. Press Ctrl+C to stop.');

    process.on('SIGINT', () => {
        logger.info('\nStopping monitoring services...');
        closeDatabase();
        process.exit(0);
    });
}

async function runWithAutoRestart(
    name: string,
    monitorFn: () => Promise<void>
): Promise<void> {
    let retryCount = 0;
    const maxRetryDelay = 60000;
    const baseDelay = 1000;

    while (true) {
        try {
            retryCount = 0;
            await monitorFn();
        } catch (error: any) {
            retryCount++;
            const delay = Math.min(baseDelay * Math.pow(2, retryCount - 1), maxRetryDelay);

            logger.error(
                `${name} failed: ${
                    error?.message ?? String(error)
                }. Restarting in ${delay}ms... (attempt ${retryCount})`
            );

            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
}

async function monitorSolanaEvents(): Promise<void> {
    logger.info('Starting Solana event monitor...');

    const coder = new BorshCoder(idl as Idl);
    const parser = new EventParser(LOCK_PROGRAM_ID, coder);
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

    return new Promise((_resolve, _reject) => {
        connection.onLogs(
            LOCK_PROGRAM_ID,
            (logs) => {
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
                            `Solana transfer event cached, user: ${sender.toString()}, amount: ${amountStr}, recipient: ${recipient}`
                        );

                        insertBridgeEvent({
                            from_chain: 'solana',
                            from_address: sender.toString(),
                            from_amount: amountStr,
                            to_chain: 'sheet',
                            to_address: recipient,
                            to_amount: amountStr,
                            signature: logs.signature,
                            status: 'pending',
                        });
                    }
                }
            },
            'confirmed'
        );

        logger.info('Solana event monitor is running');
    });
}

async function monitorBSCEvents(): Promise<void> {
    logger.info('Starting BSC event monitor...');

    const provider = new WebSocketProvider(BSC_WSS_URL);
    await provider.ready;
    logger.info('BSC WebSocket connection established');

    const contract = new Contract(BSC_TOKEN_LOCK_ADDRESS, tokenLockAbi, provider);

    return new Promise((_resolve, _reject) => {
        contract.on('TokensLocked', async (sender, recipient, amount, event) => {
            try {
                const amountStr = amount.toString();
                const blockNumber = event.log.blockNumber;
                const transactionHash = event.log.transactionHash;

                logger.info(
                    `BSC transfer event cached, user: ${sender}, amount: ${amountStr}, recipient: ${recipient}, tx: ${transactionHash}, block: ${blockNumber}`
                );

                insertBridgeEvent({
                    from_chain: 'bsc',
                    from_address: sender,
                    from_amount: amountStr,
                    to_chain: 'sheet',
                    to_address: recipient,
                    to_amount: amountStr,
                    signature: transactionHash,
                    status: 'pending',
                });
            } catch (error: any) {
                logger.error(`Error processing BSC TokensLocked event: ${error?.message ?? String(error)}`);
            }
        });

        logger.info('BSC event monitor is running');
    });
}

async function processTransfers(context: TransferContext): Promise<void> {
    logger.info('Starting transfer worker...');

    return new Promise((_resolve, _reject) => {
        const processInterval = setInterval(async () => {
            try {
                const pendingEvents = getPendingBridgeEvents();

                for (const event of pendingEvents) {
                    if (!event.id) continue;

                    try {
                        const fromChain = event.from_chain.toLowerCase();
                        const toChain = event.to_chain.toLowerCase();

                        await transferTokens(fromChain, toChain, event.to_address, event.to_amount, context);
                        updateBridgeEventStatus(event.id, 'processed');
                    } catch (error: any) {
                        logger.error(
                            `Transfer failed for event id ${event.id}: ${error?.message ?? String(error)}`
                        );
                        updateBridgeEventStatus(event.id, 'failed');
                    }
                }
            } catch (error: any) {
                logger.error(`Error processing transfers: ${error?.message ?? String(error)}`);
            }
        }, 1000);

        process.on('SIGINT', () => {
            clearInterval(processInterval);
        });

        logger.info('Transfer worker is running');
    });
}

main().catch(console.error);
