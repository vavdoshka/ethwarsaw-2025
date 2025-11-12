import { GoogleSheetsClient, BridgeRecord } from './client';
import logger from '../logger';

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
                
                // Find new records by comparing txHashes
                const newRecords = records.filter(record => {
                    if (!record.txHash) return false;
                    if (this.seenTxHashes.has(record.txHash)) return false;
                    this.seenTxHashes.add(record.txHash);
                    return true;
                });
                
                if (newRecords.length > 0) {
                    logger.info(`\n🆕 Detected ${newRecords.length} new record(s) in Bridge tab:`);
                    
                    newRecords.forEach((record, index) => {
                        logger.info(`\n--- New Bridge Record #${index + 1} (Row ${record.rowIndex}) ---`);
                        logger.info(`Timestamp: ${record.timestamp}`);
                        logger.info(`TxHash: ${record.txHash}`);
                        logger.info(`From: ${record.from}`);
                        logger.info(`Amount: ${record.amount}`);
                        logger.info(`To Address: ${record.toAddress}`);
                        logger.info(`Dest Chain ID: ${record.destChainId}`);
                        logger.info(`Status: ${record.status}`);
                        logger.info(`Block Number: ${record.blockNumber}`);
                    });
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

