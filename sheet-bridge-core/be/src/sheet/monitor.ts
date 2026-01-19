import { GoogleSheetsClient, BridgeRecord } from './client';
import logger from '../logger';
import { insertBridgeEvent, BridgeEventStatus } from '../db';

export class BridgeMonitor {
    private sheetsClient: GoogleSheetsClient;
    private seenTxHashes: Set<string> = new Set();
    private pollInterval: number;
    private isRunning: boolean = false;
    private pollTimer?: NodeJS.Timeout;

    constructor(sheetsClient: GoogleSheetsClient, pollIntervalMs: number = 10000) {
        this.sheetsClient = sheetsClient;
        this.pollInterval = pollIntervalMs;
    }

    /**
     * Read all records from the Bridge tab and log count only
     */
    async readAllRecords(): Promise<void> {
        try {
            const records = await this.sheetsClient.readBridgeTab();
            
            logger.info(`📊 Found ${records.length} existing record(s) in Bridge tab`);
            
            // Track all existing records by txHash to detect new ones later
            records.forEach(record => {
                if (record.txHash) {
                    this.seenTxHashes.add(record.txHash);
                }
            });
        } catch (error: any) {
            logger.error('Error reading Bridge records:', error);
            throw error;
        }
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
        const pollIntervalSeconds = this.pollInterval / 1000;
        logger.info(`🔍 Starting Bridge tab monitor (polling every ${pollIntervalSeconds} seconds)`);

        // Set up polling
        this.pollTimer = setInterval(async () => {
            try {
                const records = await this.sheetsClient.readBridgeTab();
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
                            } else {
                                logger.info(`ℹ️  Bridge event already exists (duplicate): ${record.txHash}`);
                            }
                        } catch (error: any) {
                            logger.error(`❌ Failed to insert bridge event: ${error?.message ?? String(error)}`);
                        }
                    }
                }
            } catch (error: any) {
                logger.error('Error during Bridge tab polling:', error);
            }
        }, this.pollInterval);
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
            clearInterval(this.pollTimer);
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

