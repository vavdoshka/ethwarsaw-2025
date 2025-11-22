import Database from 'better-sqlite3';
import path from 'path';
import logger from './logger';

const DB_PATH = path.join(__dirname, '../bridge.db');

let db: Database.Database;

export interface BridgeEventRecord {
    id?: number;
    from_chain: string;
    from_address: string;
    from_amount: string;
    to_chain: string;
    to_address: string;
    to_amount: string;
    signature: string;
    status: string;
    created_at?: string;
}

export function setupDatabase(): Database.Database {
    db = new Database(DB_PATH);

    db.exec(`
        CREATE TABLE IF NOT EXISTS bridge_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_chain TEXT NOT NULL,
            from_address TEXT NOT NULL,
            from_amount TEXT NOT NULL,
            to_chain TEXT NOT NULL,
            to_address TEXT NOT NULL,
            to_amount TEXT NOT NULL,
            signature TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(from_chain, from_address, from_amount, to_chain, to_address, to_amount)
        )
    `);

    logger.info(`Database initialized at ${DB_PATH}`);
    return db;
}

export function insertBridgeEvent(record: BridgeEventRecord): boolean {
    if (!db) {
        throw new Error('Database not initialized. Call setupDatabase() first.');
    }

    try {
        const stmt = db.prepare(`
            INSERT OR IGNORE INTO bridge_events
            (from_chain, from_address, from_amount, to_chain, to_address, to_amount, signature, status)
            VALUES (@from_chain, @from_address, @from_amount, @to_chain, @to_address, @to_amount, @signature, @status)
        `);

        const result = stmt.run(record);

        if (result.changes > 0) {
            logger.info(`Bridge event record inserted: ${record.signature}`);
            return true;
        } else {
            logger.debug(`Bridge event record already exists (duplicate ignored): ${record.signature}`);
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
            WHERE status = 'pending'
            ORDER BY created_at ASC
        `);

        return stmt.all() as BridgeEventRecord[];
    } catch (error: any) {
        logger.error(`Failed to get pending bridge events: ${error?.message ?? String(error)}`);
        throw error;
    }
}

export function updateBridgeEventStatus(id: number, status: string): boolean {
    if (!db) {
        throw new Error('Database not initialized. Call setupDatabase() first.');
    }

    try {
        const stmt = db.prepare(`
            UPDATE bridge_events
            SET status = ?
            WHERE id = ?
        `);

        const result = stmt.run(status, id);

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
