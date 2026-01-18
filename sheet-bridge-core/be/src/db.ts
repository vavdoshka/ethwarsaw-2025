import Database from 'better-sqlite3';
import path from 'path';
import logger from './logger';

const DB_PATH = path.join(__dirname, '../bridge.db');

let db: Database.Database;

export enum BridgeEventStatus {
    Pending = 'pending',
    Processing = 'processing',
    Processed = 'processed',
    Failed = 'failed',
}

export interface BridgeEventRecord {
    id?: number;
    from_chain: string;
    from_address: string;
    from_amount: string;
    to_chain: string;
    to_address: string;
    to_amount: string;
    lock_tx_hash: string;
    transfer_tx_hash?: string | null;
    transfer_at?: string | null;
    error?: string | null;
    status: BridgeEventStatus;
    created_at?: string;
}

export function setupDatabase(): Database.Database {
    db = new Database(DB_PATH);

    // Create table with new schema (lock_tx_hash as unique identifier)
    // Changed from UNIQUE constraint on (from_chain, from_address, from_amount, to_chain, to_address, to_amount)
    // to UNIQUE on lock_tx_hash to allow multiple transactions with same amount
    db.exec(`
        CREATE TABLE IF NOT EXISTS bridge_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_chain TEXT NOT NULL,
            from_address TEXT NOT NULL,
            from_amount TEXT NOT NULL,
            to_chain TEXT NOT NULL,
            to_address TEXT NOT NULL,
            to_amount TEXT NOT NULL,
            lock_tx_hash TEXT NOT NULL,
            transfer_tx_hash TEXT,
            error TEXT,
            status TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            transfer_at DATETIME
        )
    `);
    
    // Create unique index on lock_tx_hash - this is the true unique identifier
    // Each Solana transaction has a unique signature, so this allows multiple
    // transactions with the same amount from the same user
    db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_lock_tx_hash ON bridge_events(lock_tx_hash)
    `);

    logger.info(`Database initialized at ${DB_PATH}`);
    logger.info('Using lock_tx_hash as unique identifier (allows multiple transactions with same amount)');
    return db;
}

export function insertBridgeEvent(record: BridgeEventRecord): boolean {
    if (!db) {
        throw new Error('Database not initialized. Call setupDatabase() first.');
    }

    try {
        const stmt = db.prepare(`
            INSERT OR IGNORE INTO bridge_events
            (from_chain, from_address, from_amount, to_chain, to_address, to_amount, lock_tx_hash, transfer_tx_hash, transfer_at, error, status)
            VALUES (@from_chain, @from_address, @from_amount, @to_chain, @to_address, @to_amount, @lock_tx_hash, @transfer_tx_hash, @transfer_at, @error, @status)
        `);

        const result = stmt.run({
            ...record,
            transfer_tx_hash: record.transfer_tx_hash ?? null,
            transfer_at: record.transfer_at ?? null,
            error: record.error ?? null,
        });

        if (result.changes > 0) {
            logger.info(`Bridge event record inserted: ${record.lock_tx_hash}`);
            return true;
        } else {
            logger.debug(`Bridge event record already exists (duplicate ignored): ${record.lock_tx_hash}`);
            return false;
        }
    } catch (error: any) {
        logger.error(`Failed to insert bridge event: ${error?.message ?? String(error)}`);
        throw error;
    }
}

export function getDatabase(): Database.Database {
    if (!db) {
        throw new Error('Database not initialized. Call setupDatabase() first.');
    }
    return db;
}

export function getPendingBridgeEvents(): BridgeEventRecord[] {
    if (!db) {
        throw new Error('Database not initialized. Call setupDatabase() first.');
    }

    try {
        const stmt = db.prepare(`
            SELECT * FROM bridge_events
            WHERE status = @status
            ORDER BY created_at ASC
            LIMIT 10
        `);

        return stmt.all({ status: BridgeEventStatus.Pending }) as BridgeEventRecord[];
    } catch (error: any) {
        logger.error(`Failed to get pending bridge events: ${error?.message ?? String(error)}`);
        throw error;
    }
}

export function markEventAsProcessing(id: number): boolean {
    if (!db) {
        throw new Error('Database not initialized. Call setupDatabase() first.');
    }

    try {
        // Atomically update status to processing only if it's still pending
        const stmt = db.prepare(`
            UPDATE bridge_events
            SET status = @processingStatus
            WHERE id = @id AND status = @pendingStatus
        `);

        const result = stmt.run({ 
            id,
            pendingStatus: BridgeEventStatus.Pending,
            processingStatus: BridgeEventStatus.Processing
        });

        return result.changes > 0;
    } catch (error: any) {
        logger.error(`Failed to mark event as processing: ${error?.message ?? String(error)}`);
        throw error;
    }
}

export function updateBridgeEventStatus(
    id: number,
    status: BridgeEventStatus,
    updates: Partial<Pick<BridgeEventRecord, 'transfer_tx_hash' | 'transfer_at' | 'error'>> = {}
): boolean {
    if (!db) {
        throw new Error('Database not initialized. Call setupDatabase() first.');
    }

    try {
        const setClauses = ['status = @status'];
        const params: Record<string, any> = { status, id };

        if ('transfer_tx_hash' in updates) {
            setClauses.push('transfer_tx_hash = @transfer_tx_hash');
            params.transfer_tx_hash = updates.transfer_tx_hash ?? null;
        }

        if ('transfer_at' in updates) {
            setClauses.push('transfer_at = @transfer_at');
            params.transfer_at = updates.transfer_at ?? null;
        }

        if ('error' in updates) {
            setClauses.push('error = @error');
            params.error = updates.error ?? null;
        }

        const stmt = db.prepare(
            `
            UPDATE bridge_events
            SET ${setClauses.join(', ')}
            WHERE id = @id
        `
        );

        const result = stmt.run(params);

        if (result.changes > 0) {
            logger.info(`Bridge event status updated: id=${id} -> ${status}`);
            return true;
        } else {
            logger.warn(`No bridge event found with id: ${id}`);
            return false;
        }
    } catch (error: any) {
        logger.error(`Failed to update bridge event status: ${error?.message ?? String(error)}`);
        throw error;
    }
}

export function closeDatabase(): void {
    if (db) {
        db.close();
        logger.info('Database connection closed');
    }
}
