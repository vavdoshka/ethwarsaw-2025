import { Connection, PublicKey } from '@solana/web3.js';
import { EventParser, BorshCoder, Idl } from '@coral-xyz/anchor';
import idl from '../../solana/target/idl/lock.json';
import logger from './logger';
import 'dotenv/config';
import { JsonRpcProvider, Wallet } from 'ethers';
import { setupDatabase, insertBridgeEvent, closeDatabase } from './db';
import { sendSheetTransfer, GoogleSheetsClient, BridgeMonitor } from './sheet';

const SOLANA_RPC_URL = 'https://api.devnet.solana.com';
const SHEET_RPC_URL = 'https://ethwarsaw-2025.onrender.com';
const LOCK_PROGRAM_ID = new PublicKey('46BKi3nxgwFpc8EXE2Yem3syK5yqQRvJLasWzvsTEEgx');
const TOKENS_LOCKED_EVENT = 'TokensLocked';

async function main() {
    setupDatabase();

    const sheetProvider = new JsonRpcProvider(SHEET_RPC_URL);
    if (!process.env.SHEET_PRIVATE_KEY) throw new Error('SHEET_PRIVATE_KEY not set');
    const sheetWallet = new Wallet(process.env.SHEET_PRIVATE_KEY, sheetProvider);

    logger.info('Starting bridge monitoring services...');

    // Initialize Google Sheets client and Bridge monitor
    let bridgeMonitor: BridgeMonitor | null = null;
    try {
        const sheetsClient = new GoogleSheetsClient();
        await sheetsClient.initialize();
        
        // Create Bridge monitor with 10 second polling interval (default)
        const pollInterval = parseInt(process.env.BRIDGE_POLL_INTERVAL_MS || '10000', 10);
        bridgeMonitor = new BridgeMonitor(sheetsClient, pollInterval);
        
        // Read all existing records first (just to get count and track them)
        await bridgeMonitor.readAllRecords();
        
        // Start monitoring for new records
        await bridgeMonitor.startMonitoring();
        logger.info('✅ Bridge tab monitor started successfully');
    } catch (error: any) {
        logger.error(`Failed to initialize Bridge tab monitor: ${error?.message ?? String(error)}`);
        logger.warn('Continuing without Bridge tab monitoring...');
    }

    const solanaMonitor = runWithAutoRestart('Solana Monitor', monitorSolanaEvents, sheetWallet);
    const evmMonitor = runWithAutoRestart('BSC Monitor', monitorBSCEvents, sheetWallet);

    Promise.all([solanaMonitor, evmMonitor]).catch((error) => {
        logger.error(`Critical error in monitoring services: ${error}`);
    });

    logger.info('Bridge monitoring services are running. Press Ctrl+C to stop.');

    process.on('SIGINT', () => {
        logger.info('\nStopping monitoring services...');
        if (bridgeMonitor) {
            bridgeMonitor.stopMonitoring();
        }
        closeDatabase();
        process.exit(0);
    });
}

async function runWithAutoRestart(
    name: string,
    monitorFn: (sheetWallet: Wallet) => Promise<void>,
    sheetWallet: Wallet
): Promise<void> {
    let retryCount = 0;
    const maxRetryDelay = 60000;
    const baseDelay = 1000;

    while (true) {
        try {
            retryCount = 0;
            await monitorFn(sheetWallet);
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

async function monitorSolanaEvents(sheetWallet: Wallet): Promise<void> {
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

                        // Save information about bridge event into DB
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

                        sendSheetTransfer(sheetWallet, recipient, amount);
                    }
                }
            },
            'confirmed'
        );

        logger.info('Solana event monitor is running');
    });
}

async function monitorBSCEvents(_sheetWallet: Wallet): Promise<void> {
    logger.info('Starting BSC event monitor...');

    // TODO: Implement BSC event monitoring

    return new Promise((_resolve, _reject) => {
        logger.info('BSC event monitor scaffold ready (not yet implemented)');
    });
}

main().catch(console.error);
