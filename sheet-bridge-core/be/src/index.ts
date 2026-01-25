import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { EventParser, BorshCoder, Idl } from '@coral-xyz/anchor';
import idl from '../../solana/target/idl/lock.json';
import logger from './logger';
import 'dotenv/config';
import { JsonRpcProvider, Wallet, WebSocketProvider, Contract } from 'ethers';
import { setupDatabase, insertBridgeEvent, closeDatabase, BridgeEventStatus, getPendingBridgeEvents, updateBridgeEventStatus, markEventAsProcessing } from './db';
import { GoogleSheetsClient, BridgeMonitor } from './sheet';
import { createWalletFromSecret, runWithAutoRestart } from './utils';
import { BSC_HTTP_URL, BSC_WSS_URL, BSC_TOKEN_LOCK_ADDRESS, SOLANA_TOKEN_MINT, TransferContext, SOLANA_RPC_URL, LOCK_PROGRAM_ID, TOKENS_LOCKED_EVENT, SHEET_RPC_URL, BRIDGE_OPERATOR_ADDRESS, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } from './config';
import { transferTokens } from './transfer';
import tokenLockAbi from './tokenLockAbi.json';
import { telegramService } from './telegram';

async function main() {
    setupDatabase();

    // Initialize Telegram bot
    telegramService.initialize(
        TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID
            ? { botToken: TELEGRAM_BOT_TOKEN, chatId: TELEGRAM_CHAT_ID }
            : null
    );

    logger.info(`📋 Configuration:`);
    logger.info(`   SHEET_RPC_URL: ${SHEET_RPC_URL}`);
    logger.info(`   GOOGLE_SHEET_ID: ${process.env.GOOGLE_SHEET_ID || 'NOT SET'}`);
    logger.info(`   BRIDGE_OPERATOR_ADDRESS: ${BRIDGE_OPERATOR_ADDRESS}`);
    logger.info(`   Telegram notifications: ${telegramService.isTelegramEnabled() ? '✅ Enabled' : '❌ Disabled'}`);

    const sheetProvider = new JsonRpcProvider(SHEET_RPC_URL);
    
    // Test Sheet Chain RPC connection using eth_chainId (simpler than getBlockNumber)
    // This avoids issues with ethers.js making multiple requests for network detection
    let bridgeConfig: any = null;
    try {
        logger.info(`Testing Sheet Chain RPC connection to ${SHEET_RPC_URL}...`);
        // Use a direct RPC call instead of getBlockNumber() to avoid ethers.js network detection issues
        const chainId = await sheetProvider.send('eth_chainId', []);
        logger.info(`✅ Sheet Chain RPC connected. Chain ID: ${chainId}`);
        
        // Try to fetch bridge configuration from RPC node
        try {
            bridgeConfig = await sheetProvider.send('bridge_getConfig', []);
            logger.info(`✅ Fetched bridge configuration from RPC node:`);
            logger.info(`   Poll Interval: ${bridgeConfig.pollIntervalMs}ms`);
            if (bridgeConfig.bridgeOperatorAddress) {
                logger.info(`   Bridge Operator: ${bridgeConfig.bridgeOperatorAddress}`);
            }
        } catch (configError: any) {
            logger.warn(`⚠️  Could not fetch bridge config from RPC node: ${configError.message}`);
            logger.warn(`   Using environment variable BRIDGE_POLL_INTERVAL_MS instead`);
        }
    } catch (error: any) {
        const errorMsg = error?.message || String(error);
        logger.error(`❌ Failed to connect to Sheet Chain RPC: ${errorMsg}`);
        logger.error(`   RPC URL: ${SHEET_RPC_URL}`);
        logger.error(`   Please ensure the RPC node is running and accessible.`);
        if (SHEET_RPC_URL.includes('localhost') || SHEET_RPC_URL.includes('127.0.0.1')) {
            logger.error(`   For localhost, ensure the RPC node is running on ${SHEET_RPC_URL}`);
        } else {
            logger.error(`   For production, ensure SHEET_RPC_URL is set correctly (e.g., https://rpc-testnet.sheetchain.com)`);
        }
        
        // Notify Telegram about RPC error
        await telegramService.notifyRPCError('sheet', SHEET_RPC_URL, errorMsg);
        
        throw new Error(`Sheet Chain RPC connection failed: ${errorMsg}`);
    }
    
    if (!process.env.SHEET_PRIVATE_KEY) throw new Error('SHEET_PRIVATE_KEY not set');
    const sheetWallet = createWalletFromSecret(process.env.SHEET_PRIVATE_KEY, sheetProvider);
    const walletAddress = sheetWallet.address.toLowerCase();
    const expectedOperator = BRIDGE_OPERATOR_ADDRESS.toLowerCase();
    
    logger.info(`🌉 Bridge wallet address: ${walletAddress}`);
    logger.info(`   Bridge operator address: ${expectedOperator}`);
    
    if (walletAddress === expectedOperator) {
        logger.info(`   ✅ Wallet address matches bridge operator - bridge transfers will work`);
    } else {
        logger.warn(`   ⚠️  Wallet address does NOT match bridge operator address!`);
        logger.warn(`   Bridge transfers may fail. To fix:`);
        logger.warn(`   1. Set SHEET_PRIVATE_KEY to match bridge operator private key, or`);
        logger.warn(`   2. Set BRIDGE_OPERATOR_ADDRESS=${walletAddress} in environment`);
    }
    logger.info(`   Make sure this address has balance in Sheet Chain (Google Sheets Balances tab)`);

    const bscProvider = new JsonRpcProvider(BSC_HTTP_URL);
    if (!process.env.BSC_PRIVATE_KEY) throw new Error('BSC_PRIVATE_KEY not set');
    const bscWallet = createWalletFromSecret(process.env.BSC_PRIVATE_KEY, bscProvider);

    // Solana is optional - only initialize if SOLANA_SECRET_KEY or SECRET_KEY is provided
    let solanaConnection: Connection | undefined;
    let solanaAuthority: Keypair | undefined;
    const solanaSecretKey = process.env.SOLANA_SECRET_KEY || process.env.SECRET_KEY;
    const hasSolana = !!solanaSecretKey;
    
    logger.info(`🔍 Checking Solana configuration...`);
    logger.info(`   SOLANA_SECRET_KEY: ${solanaSecretKey ? 'SET' : 'NOT SET'}`);
    logger.info(`   SOLANA_RPC_URL: ${SOLANA_RPC_URL}`);
    logger.info(`   SOLANA_PROGRAM_ID: ${process.env.SOLANA_PROGRAM_ID || 'NOT SET'}`);
    logger.info(`   SOLANA_TOKEN_MINT: ${process.env.SOLANA_TOKEN_MINT || 'NOT SET'}`);
    
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
            logger.error(`   Error details: ${error.stack || error}`);
            logger.warn('   Continuing without Solana support...');
        }
    } else {
        logger.warn('⚠️  SOLANA_SECRET_KEY/SECRET_KEY not set - Solana features disabled');
        logger.warn('   To enable Solana monitoring, set SOLANA_SECRET_KEY as a JSON array, e.g.:');
        logger.warn('   SOLANA_SECRET_KEY=[136,123,45,...]');
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
        
        // Get polling interval from RPC node config if available, otherwise use environment variable
        // Priority: RPC node config > Environment variable > Default (30s)
        const pollInterval = bridgeConfig?.pollIntervalMs 
            || parseInt(process.env.BRIDGE_POLL_INTERVAL_MS || '30000', 10);
        
        logger.info(`📊 Bridge monitor polling interval: ${pollInterval}ms (${pollInterval / 1000}s)`);
        if (bridgeConfig?.pollIntervalMs) {
            logger.info(`   ⚙️  Configured from RPC node`);
        } else {
            logger.info(`   ⚙️  Configured from environment variable or default`);
        }
        
        bridgeMonitor = new BridgeMonitor(sheetsClient, pollInterval);
        
        // Read all existing records first (just to get count and track them)
        // This will gracefully handle if Bridge tab doesn't exist
        try {
            await bridgeMonitor.readAllRecords();
        } catch (error: any) {
            // If Bridge tab doesn't exist, log warning and continue
            if (error.code === 404 || error.status === 404 || 
                (error.response?.status === 404) ||
                (error.message && error.message.includes('not found'))) {
                logger.warn('⚠️  Bridge tab does not exist in Google Sheets.');
                logger.warn('   Bridge monitoring will be disabled until the Bridge tab is created.');
                logger.warn('   Please create a "Bridge" tab with columns: Timestamp, TxHash, From, Amount, ToAddress, DestChainId, Status, BlockNumber');
            } else {
                throw error; // Re-throw if it's a different error
            }
        }
        
        // Start monitoring for new records (only if Bridge tab exists)
        if (bridgeMonitor) {
            await bridgeMonitor.startMonitoring();
            logger.info('✅ Bridge tab monitor started successfully');
        }
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
        logger.info('   The monitor will listen for TokensLocked events from the Solana program');
        logger.info(`   Program ID: ${LOCK_PROGRAM_ID.toBase58()}`);
    } else {
        logger.warn('⚠️  Solana monitor skipped (Solana not configured)');
        if (!hasSolana) {
            logger.warn('   Missing: SOLANA_SECRET_KEY environment variable');
            logger.warn('   Format: SOLANA_SECRET_KEY=[136,123,45,...] (JSON array of numbers)');
        } else if (!solanaConnection || !solanaAuthority) {
            logger.warn('   Solana connection or authority failed to initialize');
            logger.warn('   Check the error messages above for details');
        }
        logger.warn('   Solana -> SheetChain bridging will not work without this configuration');
    }

    Promise.all(promises).catch((error) => {
        logger.error(`Critical error in monitoring services: ${error}`);
    });

        logger.info('Bridge monitoring services are running. Press Ctrl+C to stop.');
        
        // Notify Telegram that services have started
        if (telegramService.isTelegramEnabled()) {
            await telegramService.notifyServiceStatus(
                'Bridge Backend',
                'started',
                'All monitoring services are running:\n• Solana event monitor\n• BSC event monitor\n• Google Sheets monitor\n• Transfer worker'
            );
        }

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
    logger.info('🚀 Starting Solana event monitor...');
    logger.info(`   Monitoring program: ${LOCK_PROGRAM_ID.toBase58()}`);
    logger.info(`   RPC URL: ${SOLANA_RPC_URL}`);
    logger.info(`   Commitment level: confirmed`);

    // Verify IDL has events defined
    const idlEvents = (idl as Idl).events || [];
    logger.info(`   IDL Events defined: ${idlEvents.length}`);
    if (idlEvents.length === 0) {
        logger.error(`   ❌ CRITICAL: IDL has no events defined!`);
        logger.error(`   This means the IDL file is a placeholder or incorrect.`);
        logger.error(`   Events will NOT be parsed. Please rebuild the Docker image with the real IDL file.`);
        logger.error(`   Expected: TokensLocked event should be in the IDL`);
    } else {
        const eventNames = idlEvents.map((e: any) => e.name || 'unknown').join(', ');
        logger.info(`   Event names: ${eventNames}`);
        if (!eventNames.includes('TokensLocked')) {
            logger.warn(`   ⚠️  WARNING: TokensLocked event not found in IDL!`);
            logger.warn(`   Events defined: ${eventNames}`);
        } else {
            logger.info(`   ✅ TokensLocked event found in IDL`);
        }
    }

    const coder = new BorshCoder(idl as Idl);
    const parser = new EventParser(LOCK_PROGRAM_ID, coder);
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

    // Test connection first
    try {
        const version = await connection.getVersion();
        logger.info(`✅ Connected to Solana RPC: ${version['solana-core']}`);
        
        // Get recent slot to verify connection is working
        const slot = await connection.getSlot('confirmed');
        logger.info(`   Current slot: ${slot}`);
    } catch (error: any) {
        const errorMsg = error?.message ?? String(error);
        logger.error(`❌ Failed to connect to Solana RPC: ${errorMsg}`);
        
        // Notify Telegram about RPC error
        await telegramService.notifyRPCError('solana', SOLANA_RPC_URL, errorMsg);
        
        throw error;
    }

    let eventCount = 0;
    let lastHeartbeat = Date.now();
    const heartbeatInterval = 60000; // Log heartbeat every 60 seconds

    return new Promise((_resolve, _reject) => {
        logger.info(`📡 Setting up onLogs listener for program ${LOCK_PROGRAM_ID.toBase58()}...`);
        
        // Set up periodic heartbeat logging
        const heartbeatTimer = setInterval(() => {
            const now = Date.now();
            const timeSinceLastEvent = now - lastHeartbeat;
            logger.info(`💓 Solana monitor heartbeat - Still listening for events`);
            logger.info(`   Program: ${LOCK_PROGRAM_ID.toBase58()}`);
            logger.info(`   Total events processed: ${eventCount}`);
            logger.info(`   Time since last event: ${Math.floor(timeSinceLastEvent / 1000)}s`);
            
            // Test connection health
            connection.getSlot('confirmed').then(slot => {
                logger.debug(`   Connection healthy - Current slot: ${slot}`);
            }).catch(err => {
                logger.warn(`   ⚠️  Connection health check failed: ${err.message}`);
            });
        }, heartbeatInterval);
        
        connection.onLogs(
            LOCK_PROGRAM_ID,
            async (logs) => {
                lastHeartbeat = Date.now();
                eventCount++;
                
                // Log all events for debugging
                logger.info(`📨 Received logs from program ${LOCK_PROGRAM_ID.toBase58()} (Event #${eventCount}):`, {
                    signature: logs.signature,
                    err: logs.err,
                    logCount: logs.logs.length
                });
                
                if (logs.err) {
                    logger.warn(`⚠️  Transaction had error, skipping: ${JSON.stringify(logs.err)}`);
                    logger.warn(`   Signature: ${logs.signature}`);
                    return;
                }

                const logMessages = logs.logs.join(' ');
                if (logMessages.includes('Program log: AnchorError')) {
                    logger.warn(`⚠️  Transaction had AnchorError, skipping`);
                    logger.warn(`   Signature: ${logs.signature}`);
                    return;
                }

                try {
                    // Log raw logs for debugging
                    logger.info(`📝 Raw logs from transaction ${logs.signature} (${logs.logs.length} log lines):`);
                    logs.logs.forEach((log, index) => {
                        logger.info(`   [${index}] ${log}`);
                    });
                    
                    let parsedEventCount = 0;
                    const parsedEvents = Array.from(parser.parseLogs(logs.logs));
                    logger.info(`🔍 Parsing logs for events... Found ${parsedEvents.length} event(s) in transaction ${logs.signature}`);
                    
                    // If no events found, log more details
                    if (parsedEvents.length === 0) {
                        logger.warn(`⚠️  No events parsed from transaction ${logs.signature}`);
                        logger.warn(`   This might mean:`);
                        logger.warn(`   1. The transaction doesn't emit TokensLocked events`);
                        logger.warn(`   2. The event structure doesn't match the IDL`);
                        logger.warn(`   3. The logs format is different than expected`);
                        logger.warn(`   4. The program ID in logs doesn't match ${LOCK_PROGRAM_ID.toBase58()}`);
                        
                        // Check if logs contain any relevant keywords
                        const allLogs = logs.logs.join(' ');
                        logger.info(`   All logs combined (first 1000 chars): ${allLogs.substring(0, 1000)}`);
                        
                        // Check for program invocation
                        const programInvokePattern = new RegExp(`Program ${LOCK_PROGRAM_ID.toBase58()} invoke`);
                        const programLogPattern = new RegExp(`Program log:`);
                        const programDataPattern = new RegExp(`Program data:`);
                        
                        let hasProgramInvoke = false;
                        let hasProgramLogs = false;
                        let hasProgramData = false;
                        
                        logs.logs.forEach((log, idx) => {
                            if (programInvokePattern.test(log)) {
                                hasProgramInvoke = true;
                                logger.info(`   [${idx}] Program invoke found: ${log}`);
                            }
                            if (programLogPattern.test(log)) {
                                hasProgramLogs = true;
                                logger.info(`   [${idx}] Program log: ${log}`);
                            }
                            if (programDataPattern.test(log)) {
                                hasProgramData = true;
                                logger.info(`   [${idx}] Program data: ${log}`);
                            }
                        });
                        
                        if (!hasProgramInvoke) {
                            logger.warn(`   ⚠️  No program invoke found for ${LOCK_PROGRAM_ID.toBase58()}`);
                            logger.warn(`   This transaction might not be calling the lock program`);
                        }
                        
                        if (allLogs.includes('TokensLocked') || allLogs.includes('tokens_locked') || allLogs.includes('tokenslocked')) {
                            logger.warn(`   ⚠️  Logs contain "TokensLocked" keyword but parser didn't find it`);
                            logger.warn(`   This suggests an IDL mismatch or parsing issue`);
                            logger.warn(`   Expected event name: ${TOKENS_LOCKED_EVENT}`);
                            logger.warn(`   Try checking if the IDL file matches the deployed program`);
                        }
                        
                        // Check if program ID appears in logs
                        if (allLogs.includes(LOCK_PROGRAM_ID.toBase58())) {
                            logger.info(`   ✅ Program ID found in logs`);
                        } else {
                            logger.warn(`   ⚠️  Program ID ${LOCK_PROGRAM_ID.toBase58()} not found in logs`);
                            logger.warn(`   This transaction might be from a different program`);
                        }
                        
                        // Try to manually parse event data if present
                        const dataLogs = logs.logs.filter(log => log.includes('Program data:'));
                        if (dataLogs.length > 0) {
                            logger.info(`   Found ${dataLogs.length} program data log(s):`);
                            dataLogs.forEach((dataLog, idx) => {
                                logger.info(`   [${idx}] ${dataLog}`);
                            });
                        }
                    }
                    
                    for (const evt of parsedEvents) {
                        parsedEventCount++;
                        logger.info(`📋 Event #${parsedEventCount}: ${evt.name}`, {
                            eventData: evt.data,
                            signature: logs.signature
                        });
                        
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
                            
                            // Convert Solana amount (9 decimals) to Sheet Chain amount (18 decimals)
                            // by multiplying by 10^9
                            const solanaAmount = BigInt(amountStr);
                            const sheetAmount = solanaAmount * BigInt(10 ** 9);
                            const sheetAmountStr = sheetAmount.toString();
                            
                            logger.info(`\n🎯 ========== TokensLocked Event Detected ==========`);
                            logger.info(`   Transaction Signature: ${logs.signature}`);
                            logger.info(`   Sender (Solana): ${sender.toString()}`);
                            logger.info(`   Amount (Solana, 9 decimals): ${amountStr}`);
                            logger.info(`   Amount (SheetChain, 18 decimals): ${sheetAmountStr}`);
                            logger.info(`   Recipient (SheetChain): ${recipient}`);
                            logger.info(`   ================================================\n`);

                            const inserted = insertBridgeEvent({
                                from_chain: 'solana',
                                from_address: sender.toString(),
                                from_amount: amountStr,
                                to_chain: 'sheet',
                                to_address: recipient,
                                to_amount: sheetAmountStr, // Use converted amount for Sheet Chain
                                lock_tx_hash: logs.signature,
                                status: BridgeEventStatus.Pending,
                            });
                            
                            if (inserted) {
                                logger.info(`✅ Bridge event inserted into database: solana -> sheet`);
                                logger.info(`   Event will be processed by transfer worker`);
                                
                                // Notify Telegram
                                await telegramService.notifySolanaEventDetected(
                                    logs.signature,
                                    sender.toString(),
                                    amountStr,
                                    recipient,
                                    sheetAmountStr
                                );
                            } else {
                                logger.info(`ℹ️  Bridge event already exists (duplicate): ${logs.signature}`);
                            }
                        } else {
                            logger.debug(`   Event ${evt.name} is not TokensLocked, skipping`);
                        }
                    }
                    if (parsedEventCount === 0) {
                        logger.debug(`   No TokensLocked events found in this transaction`);
                        logger.debug(`   Transaction signature: ${logs.signature}`);
                    }
                } catch (parseError: any) {
                    const errorMsg = parseError?.message ?? String(parseError);
                    logger.error(`❌ Error parsing Solana logs: ${errorMsg}`);
                    logger.error(`   Signature: ${logs.signature}`);
                    logger.error(`   Logs: ${JSON.stringify(logs.logs)}`);
                    logger.error(`   Stack: ${parseError.stack}`);
                    
                    // Notify Telegram about parsing error
                    await telegramService.notifyError(
                        'Solana Event Parsing Error',
                        errorMsg,
                        {
                            signature: logs.signature,
                            logCount: String(logs.logs.length)
                        }
                    );
                }
            },
            'confirmed'
        );

        logger.info('✅ Solana event monitor is running and listening for TokensLocked events');
        logger.info(`   Program ID: ${LOCK_PROGRAM_ID.toBase58()}`);
        logger.info(`   Waiting for transactions...`);
        logger.info(`   Heartbeat logs will appear every ${heartbeatInterval / 1000} seconds`);
        
        // Clean up heartbeat timer on process exit
        process.on('SIGINT', () => {
            clearInterval(heartbeatTimer);
        });
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

                const inserted = insertBridgeEvent({
                    from_chain: 'bsc',
                    from_address: sender,
                    from_amount: amountStr,
                    to_chain: 'sheet',
                    to_address: recipient,
                    to_amount: amountStr,
                    lock_tx_hash: transactionHash,
                    status: BridgeEventStatus.Pending,
                });

                if (inserted) {
                    // Notify Telegram
                    await telegramService.notifyBSCEventDetected(
                        transactionHash,
                        sender,
                        amountStr,
                        recipient
                    );
                }
            } catch (error: any) {
                const errorMsg = error?.message ?? String(error);
                logger.error(`Error processing BSC TokensLocked event: ${errorMsg}`);
                
                // Notify Telegram about BSC event processing error
                await telegramService.notifyError(
                    'BSC Event Processing Error',
                    errorMsg
                );
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

                    // Declare transferAmount outside try block so it's accessible in catch
                    let transferAmount = event.to_amount;
                    
                    try {
                        const fromChain = event.from_chain.toLowerCase();
                        const toChain = event.to_chain.toLowerCase();

                        // Amount conversion is now done when inserting the event into the database
                        // However, we check if conversion is needed for old events that may have been inserted before the fix
                        transferAmount = event.to_amount;
                        
                        if (fromChain === 'solana' && toChain === 'sheet') {
                            // Check if the amount looks like it's in 9 decimals format (unconverted)
                            // If the amount is less than 10^15 (0.001 ETH in 18 decimals), it's likely in 9 decimals format
                            const amountBigInt = BigInt(event.to_amount);
                            const threshold = BigInt(10 ** 15); // 0.001 ETH in 18 decimals
                            
                            if (amountBigInt < threshold) {
                                // This looks like an old event with unconverted amount
                                // Convert from Solana 9 decimals to Sheet Chain 18 decimals
                                const conversionFactor = BigInt(10 ** 9);
                                const sheetAmount = amountBigInt * conversionFactor;
                                transferAmount = sheetAmount.toString();
                                
                                logger.info(
                                    `🔄 Converting old Solana event amount (legacy format):`
                                );
                                logger.info(
                                    `   Original: ${event.to_amount} (9 decimals) = ${(Number(amountBigInt) / 1e9).toFixed(9)} SHEET`
                                );
                                logger.info(
                                    `   Converted: ${transferAmount} (18 decimals) = ${(Number(sheetAmount) / 1e18).toFixed(9)} ETH`
                                );
                            } else {
                                logger.info(
                                    `✅ Amount already in correct format: ${transferAmount} (18 decimals) = ${(Number(amountBigInt) / 1e18).toFixed(9)} ETH`
                                );
                            }
                        }
                        
                        logger.info(
                            `📤 Processing bridge transfer: ${fromChain} -> ${toChain}, amount: ${transferAmount}`
                        );

                        // Notify Telegram that transfer is processing
                        await telegramService.notifyTransferStatus(
                            fromChain,
                            toChain,
                            transferAmount,
                            event.to_address,
                            'processing'
                        );

                        const transferTxHash = await transferTokens(
                            fromChain,
                            toChain,
                            event.to_address,
                            transferAmount,
                            context
                        );

                        updateBridgeEventStatus(event.id, BridgeEventStatus.Processed, {
                            transfer_tx_hash: transferTxHash,
                            transfer_at: new Date().toISOString(),
                            error: null,
                        });

                        // Notify Telegram about successful transfer
                        await telegramService.notifyTransferStatus(
                            event.from_chain,
                            event.to_chain,
                            transferAmount,
                            event.to_address,
                            'completed',
                            transferTxHash
                        );
                    } catch (error: any) {
                        const errorMsg = error?.message ?? String(error);
                        logger.error(
                            `Transfer failed for event id ${event.id}: ${errorMsg}`
                        );
                        
                        // Check if error is "AlreadyProcessed" - this might mean the transaction actually succeeded
                        // In this case, we should verify the transfer by checking the recipient's balance
                        const eventFromChain = event.from_chain.toLowerCase();
                        const eventToChain = event.to_chain.toLowerCase();
                        if (errorMsg.includes('AlreadyProcessed') && eventFromChain === 'sheet' && eventToChain === 'solana') {
                            logger.warn(
                                `Event ${event.id} got "AlreadyProcessed" error. ` +
                                `Verifying if transfer actually succeeded by checking recipient balance...`
                            );
                            
                            try {
                                const { Connection, PublicKey } = await import('@solana/web3.js');
                                const { getAssociatedTokenAddress, getAccount, getMint } = await import('@solana/spl-token');
                                
                                if (!context.solanaConnection || !context.solanaTokenMint) {
                                    throw new Error('Solana not configured');
                                }
                                
                                const recipientPubkey = new PublicKey(event.to_address);
                                const mintAddress = new PublicKey(context.solanaTokenMint);
                                
                                // Get expected amount in Solana token units
                                const mintInfo = await getMint(context.solanaConnection, mintAddress);
                                const decimals = mintInfo.decimals;
                                // Use event.to_amount which is already in the correct format (18 decimals for Sheet Chain)
                                const amountWei = BigInt(event.to_amount);
                                const expectedAmount = amountWei / BigInt(10 ** (18 - decimals));
                                
                                // Check recipient's current balance
                                const recipientTokenAccount = await getAssociatedTokenAddress(
                                    mintAddress,
                                    recipientPubkey
                                );
                                
                                try {
                                    const recipientAccount = await getAccount(context.solanaConnection, recipientTokenAccount);
                                    const currentBalance = BigInt(recipientAccount.amount.toString());
                                    
                                    logger.info(
                                        `Recipient balance check: current=${currentBalance}, expected increase=${expectedAmount}`
                                    );
                                    
                                    // If balance is at least the expected amount, the transfer likely succeeded
                                    // (We can't know the exact previous balance, but if it's >= expected, it's likely good)
                                    if (currentBalance >= expectedAmount) {
                                        logger.info(
                                            `✅ Transfer verification: Recipient has sufficient balance. ` +
                                            `Marking event as processed (transaction likely succeeded despite "AlreadyProcessed" error).`
                                        );
                                        
                                        updateBridgeEventStatus(event.id, BridgeEventStatus.Processed, {
                                            transfer_tx_hash: 'verified-by-balance-check',
                                            transfer_at: new Date().toISOString(),
                                            error: null,
                                        });
                                        continue; // Skip marking as failed
                                    } else {
                                        logger.warn(
                                            `⚠️  Transfer verification: Recipient balance (${currentBalance}) is less than expected (${expectedAmount}). ` +
                                            `Transaction may not have succeeded.`
                                        );
                                    }
                                } catch (balanceError: any) {
                                    // If we can't check balance (account doesn't exist, etc.), assume it failed
                                    logger.warn(
                                        `Could not verify recipient balance: ${balanceError?.message || String(balanceError)}. ` +
                                        `Marking as failed.`
                                    );
                                }
                            } catch (verifyError: any) {
                                logger.warn(
                                    `Failed to verify transfer: ${verifyError?.message || String(verifyError)}. ` +
                                    `Marking as failed.`
                                );
                            }
                        }
                        
                        updateBridgeEventStatus(event.id, BridgeEventStatus.Failed, {
                            transfer_at: new Date().toISOString(),
                            error: errorMsg,
                        });

                        // Notify Telegram about failed transfer
                        // Use transferAmount if available, otherwise fall back to event.to_amount
                        const amountForNotification = transferAmount || event.to_amount;
                        await telegramService.notifyTransferStatus(
                            event.from_chain,
                            event.to_chain,
                            amountForNotification,
                            event.to_address,
                            'failed',
                            undefined,
                            errorMsg
                        );
                    }
                }
            } catch (error: any) {
                const errorMsg = error?.message ?? String(error);
                logger.error(`Error processing transfers: ${errorMsg}`);
                
                // Notify Telegram about transfer worker error
                await telegramService.notifyError(
                    'Transfer Worker Error',
                    errorMsg
                );
            }
        }, 1000);

        process.on('SIGINT', () => {
            clearInterval(processInterval);
        });

        logger.info('Transfer worker is running');
    });
}

main().catch(console.error);
