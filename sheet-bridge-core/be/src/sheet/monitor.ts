import { GoogleSheetsClient, BridgeRecord } from './client';
import logger from '../logger';
import { insertBridgeEvent, BridgeEventStatus } from '../db';
import { telegramService } from '../telegram';

export class BridgeMonitor {
    private sheetsClient: GoogleSheetsClient;
    private seenTxHashes: Set<string> = new Set();
    private pollInterval: number;
    private isRunning: boolean = false;
    private pollTimer?: NodeJS.Timeout;
    private consecutiveErrors: number = 0;
    private maxBackoffInterval: number = 300000; // 5 minutes max backoff
    private basePollInterval: number;

    constructor(sheetsClient: GoogleSheetsClient, pollIntervalMs: number = 30000) {
        this.sheetsClient = sheetsClient;
        this.basePollInterval = pollIntervalMs;
        this.pollInterval = pollIntervalMs;
    }

    /**
     * Read all records from the Bridge tab and log count only
     */
    async readAllRecords(): Promise<void> {
        try {
            const records = await this.sheetsClient.readBridgeTab();
            
            if (records.length === 0) {
                logger.info('📊 Bridge tab is empty or does not exist');
            } else {
                logger.info(`📊 Found ${records.length} existing record(s) in Bridge tab`);
            }
            
            // Track all existing records by txHash to detect new ones later
            records.forEach(record => {
                if (record.txHash) {
                    this.seenTxHashes.add(record.txHash);
                }
            });
        } catch (error: any) {
            // If Bridge tab doesn't exist, log warning but don't throw
            if (error.code === 404 || error.status === 404 || 
                (error.response?.status === 404) ||
                (error.message && error.message.includes('not found'))) {
                logger.warn('Bridge tab not found. Bridge monitoring will be disabled.');
                return;
            }
            logger.error('Error reading Bridge records:', error);
            throw error;
        }
    }

    /**
     * Perform a single poll of the Bridge tab
     */
    private async performPoll(): Promise<void> {
        try {
            const records = await this.sheetsClient.readBridgeTab();
            
            // Reset error count on successful request
            if (this.consecutiveErrors > 0) {
                logger.info(`✅ Bridge tab polling recovered after ${this.consecutiveErrors} error(s)`);
                this.consecutiveErrors = 0;
                this.pollInterval = this.basePollInterval;
            }
            
            // If Bridge tab doesn't exist, records will be empty array, so just log and continue
            if (records.length === 0 && this.seenTxHashes.size === 0) {
                // First poll with no records - might be empty tab or doesn't exist
                logger.debug('📊 Bridge tab polling: No records found');
                return;
            }
            logger.debug(`📊 Bridge tab polling: Found ${records.length} total records, ${this.seenTxHashes.size} already seen`);
            
            // Find new records by comparing txHashes
            const newRecords = records.filter(record => {
                if (!record.txHash) {
                    logger.debug(`⚠️  Skipping record without txHash at row ${record.rowIndex}`);
                    return false;
                }
                if (this.seenTxHashes.has(record.txHash)) {
                    return false;
                }
                this.seenTxHashes.add(record.txHash);
                return true;
            });
            
            if (newRecords.length > 0) {
                logger.info(`\n🆕 Detected ${newRecords.length} new record(s) in Bridge tab:`);
                
                for (const record of newRecords) {
                    logger.info(`\n--- New Bridge Record (Row ${record.rowIndex}) ---`);
                    logger.info(`Timestamp: ${record.timestamp}`);
                    logger.info(`TxHash: ${record.txHash}`);
                    logger.info(`From: ${record.from}`);
                    logger.info(`Amount: ${record.amount}`);
                    logger.info(`To Address: ${record.toAddress}`);
                    logger.info(`Dest Chain ID: ${record.destChainId}`);
                    logger.info(`Status: ${record.status}`);
                    logger.info(`Block Number: ${record.blockNumber}`);
                    
                    // Only process records with "Success" status
                    if (record.status?.toLowerCase() !== 'success') {
                        logger.info(`⏭️  Skipping record with status: ${record.status}`);
                        continue;
                    }
                    
                    // Map chain IDs: 0=sheet, 1=solana, 2=bsc
                    const destChainId = parseInt(record.destChainId || '0', 10);
                    let toChain: string;
                    if (destChainId === 1) {
                        toChain = 'solana';
                    } else if (destChainId === 2) {
                        toChain = 'bsc';
                    } else {
                        logger.warn(`⚠️  Unknown destination chain ID: ${destChainId}, skipping`);
                        continue;
                    }
                    
                    // Insert into database for processing
                    try {
                        const inserted = insertBridgeEvent({
                            from_chain: 'sheet',
                            from_address: record.from || '',
                            from_amount: record.amount || '0',
                            to_chain: toChain,
                            to_address: record.toAddress || '',
                            to_amount: record.amount || '0',
                            lock_tx_hash: record.txHash || '',
                            status: BridgeEventStatus.Pending,
                        });
                        
                        if (inserted) {
                            logger.info(`✅ Inserted bridge event: sheet -> ${toChain} (${record.amount} to ${record.toAddress})`);
                            
                            // Notify Telegram
                            await telegramService.notifySheetBridgeRecord(
                                record.txHash || '',
                                record.from || '',
                                record.amount || '0',
                                record.toAddress || '',
                                toChain
                            );
                        } else {
                            logger.info(`ℹ️  Bridge event already exists (duplicate): ${record.txHash}`);
                        }
                    } catch (error: any) {
                        logger.error(`❌ Failed to insert bridge event: ${error?.message ?? String(error)}`);
                    }
                }
            }
        } catch (error: any) {
            this.consecutiveErrors++;
            
            // Check if it's a quota error
            const isQuotaError = error?.message?.includes('Quota exceeded') || 
                                error?.message?.includes('quota') ||
                                error?.code === 429 ||
                                (error?.response?.status === 429);
            
            if (isQuotaError) {
                logger.warn(`⚠️  Google Sheets API quota exceeded. Implementing exponential backoff...`);
                logger.warn(`   Consecutive errors: ${this.consecutiveErrors}`);
                
                // Exponential backoff: 30s, 60s, 120s, 240s, 300s (max)
                const backoffMs = Math.min(
                    this.basePollInterval * Math.pow(2, this.consecutiveErrors - 1),
                    this.maxBackoffInterval
                );
                this.pollInterval = backoffMs;
                
                logger.warn(`   Next poll in ${backoffMs / 1000} seconds`);
            } else {
                logger.error('Error during Bridge tab polling:', error);
                // For non-quota errors, use smaller backoff
                this.pollInterval = Math.min(this.basePollInterval * this.consecutiveErrors, 60000); // Max 1 minute
            }
            
            throw error; // Re-throw to be handled by scheduleNextPoll
        }
    }
    
    /**
     * Schedule the next poll
     */
    private scheduleNextPoll(): void {
        if (!this.isRunning) {
            return;
        }
        
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
        }
        
        this.pollTimer = setTimeout(async () => {
            if (this.isRunning) {
                await this.performPoll();
                this.scheduleNextPoll();
            }
        }, this.pollInterval);
    }

    /**
     * Start monitoring the Bridge tab for new records
     */
    async startMonitoring(): Promise<void> {
        if (this.isRunning) {
            logger.warn('Bridge monitor is already running');
            return;
        }

        this.isRunning = true;
        const pollIntervalSeconds = this.basePollInterval / 1000;
        logger.info(`🔍 Starting Bridge tab monitor (polling every ${pollIntervalSeconds} seconds, with exponential backoff on quota errors)`);

        // Start first poll immediately
        await this.performPoll();
        this.scheduleNextPoll();
    }

    /**
     * Stop monitoring the Bridge tab
     */
    stopMonitoring(): void {
        if (!this.isRunning) {
            return;
        }

        this.isRunning = false;
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = undefined;
        }
        logger.info('Bridge monitor stopped');
    }

    /**
     * Check if monitor is currently running
     */
    isActive(): boolean {
        return this.isRunning;
    }
}
