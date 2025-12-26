import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { EventParser, BorshCoder, Idl } from '@coral-xyz/anchor';
import idl from '../../solana/target/idl/lock.json';
import logger from './logger';
import 'dotenv/config';
import { JsonRpcProvider, Wallet, WebSocketProvider, Contract } from 'ethers';
import { setupDatabase, insertBridgeEvent, closeDatabase, BridgeEventStatus, getPendingBridgeEvents, updateBridgeEventStatus, markEventAsProcessing } from './db';
import { GoogleSheetsClient, BridgeMonitor } from './sheet';
import { createWalletFromSecret, runWithAutoRestart } from './utils';
import { BSC_HTTP_URL, BSC_WSS_URL, BSC_TOKEN_LOCK_ADDRESS, SOLANA_TOKEN_MINT, TransferContext, SOLANA_RPC_URL, LOCK_PROGRAM_ID, TOKENS_LOCKED_EVENT, SHEET_RPC_URL } from './config';
import { transferTokens } from './transfer';
import tokenLockAbi from './tokenLockAbi.json';

async function main() {
    setupDatabase();

    const sheetProvider = new JsonRpcProvider(SHEET_RPC_URL);
    if (!process.env.SHEET_PRIVATE_KEY) throw new Error('SHEET_PRIVATE_KEY not set');
    const sheetWallet = createWalletFromSecret(process.env.SHEET_PRIVATE_KEY, sheetProvider);

    const bscProvider = new JsonRpcProvider(BSC_HTTP_URL);
    if (!process.env.BSC_PRIVATE_KEY) throw new Error('BSC_PRIVATE_KEY not set');
    const bscWallet = createWalletFromSecret(process.env.BSC_PRIVATE_KEY, bscProvider);

    // Solana is optional - only initialize if SOLANA_SECRET_KEY or SECRET_KEY is provided
    let solanaConnection: Connection | undefined;
    let solanaAuthority: Keypair | undefined;
    const solanaSecretKey = process.env.SOLANA_SECRET_KEY || process.env.SECRET_KEY;
    const hasSolana = !!solanaSecretKey;
    
    if (hasSolana) {
        try {
            solanaConnection = new Connection(SOLANA_RPC_URL, 'confirmed');
            const secretKeyArray = JSON.parse(solanaSecretKey);
            solanaAuthority = Keypair.fromSecretKey(Uint8Array.from(secretKeyArray));
            
            logger.info('✅ Solana configuration loaded');
            logger.info(`   Solana RPC URL: ${SOLANA_RPC_URL}`);
            logger.info(`   Solana Authority Address: ${solanaAuthority.publicKey.toBase58()}`);
            logger.info(`   Program ID: ${LOCK_PROGRAM_ID.toBase58()}`);
            logger.info(`   Token Mint: ${SOLANA_TOKEN_MINT.toBase58()}`);
            
            // Derive and log PDAs
            const [lockAccountPda] = PublicKey.findProgramAddressSync(
                [Buffer.from('lock'), SOLANA_TOKEN_MINT.toBuffer()],
                LOCK_PROGRAM_ID
            );
            const [vaultAuthorityPda] = PublicKey.findProgramAddressSync(
                [Buffer.from('vault'), lockAccountPda.toBuffer()],
                LOCK_PROGRAM_ID
            );
            logger.info(`   Lock Account PDA: ${lockAccountPda.toBase58()}`);
            logger.info(`   Vault Authority PDA: ${vaultAuthorityPda.toBase58()}`);
            
            // Check connection
            const version = await solanaConnection.getVersion();
            logger.info(`   Solana RPC Version: ${version['solana-core']}`);
            
        } catch (error: any) {
            logger.error(`❌ Failed to initialize Solana: ${error?.message ?? String(error)}`);
            logger.warn('   Continuing without Solana support...');
        }
    } else {
        logger.info('ℹ️  SOLANA_SECRET_KEY/SECRET_KEY not set - Solana features disabled');
    }

    const transferContext: TransferContext = {
        sheetWallet,
        bscWallet,
        bscTokenLockAddress: BSC_TOKEN_LOCK_ADDRESS,
        solanaConnection,
        solanaAuthority,
        solanaTokenMint: hasSolana ? SOLANA_TOKEN_MINT : undefined,
    };

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

    const bscMonitor = runWithAutoRestart('BSC Monitor', monitorBSCEvents);
    const transferWorker = processTransfers(transferContext);
    
    const promises: Promise<void>[] = [bscMonitor, transferWorker];
    
    // Only start Solana monitor if Solana is configured
    if (hasSolana && solanaConnection && solanaAuthority) {
        const solanaMonitor = runWithAutoRestart('Solana Monitor', monitorSolanaEvents);
        promises.push(solanaMonitor);
        logger.info('✅ Solana monitor started');
    } else {
        logger.info('ℹ️  Solana monitor skipped (Solana not configured)');
    }

    Promise.all(promises).catch((error) => {
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
                            lock_tx_hash: logs.signature,
                            status: BridgeEventStatus.Pending,
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
                    lock_tx_hash: transactionHash,
                    status: BridgeEventStatus.Pending,
                });
            } catch (error: any) {
                logger.error(`Error processing BSC TokensLocked event: ${error?.message ?? String(error)}`);
            }
        });

        logger.info('BSC event monitor is running');
    });
}

async function monitorSheetEvents(): Promise<void> {
    logger.info('Starting Sheet event monitor...');

}

async function processTransfers(context: TransferContext): Promise<void> {
    logger.info('Starting transfer worker...');

    return new Promise((_resolve, _reject) => {
        const processInterval = setInterval(async () => {
            try {
                const pendingEvents = getPendingBridgeEvents();

                for (const event of pendingEvents) {
                    if (!event.id) continue;

                    // Atomically mark as processing to prevent concurrent processing
                    if (!markEventAsProcessing(event.id)) {
                        logger.debug(`Event ${event.id} is already being processed, skipping...`);
                        continue;
                    }

                    try {
                        const fromChain = event.from_chain.toLowerCase();
                        const toChain = event.to_chain.toLowerCase();

                        const transferTxHash = await transferTokens(
                            fromChain,
                            toChain,
                            event.to_address,
                            event.to_amount,
                            context
                        );

                        updateBridgeEventStatus(event.id, BridgeEventStatus.Processed, {
                            transfer_tx_hash: transferTxHash,
                            transfer_at: new Date().toISOString(),
                            error: null,
                        });
                    } catch (error: any) {
                        const errorMsg = error?.message ?? String(error);
                        logger.error(
                            `Transfer failed for event id ${event.id}: ${errorMsg}`
                        );
                        
                        // Check if error is "AlreadyProcessed" - this might mean the transaction actually succeeded
                        // In this case, we should check if we can verify the transaction
                        if (errorMsg.includes('AlreadyProcessed')) {
                            logger.warn(
                                `Event ${event.id} got "AlreadyProcessed" error. ` +
                                `This might mean the transaction was already sent. ` +
                                `Marking as failed but transaction may have succeeded.`
                            );
                        }
                        
                        updateBridgeEventStatus(event.id, BridgeEventStatus.Failed, {
                            transfer_at: new Date().toISOString(),
                            error: errorMsg,
                        });
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
