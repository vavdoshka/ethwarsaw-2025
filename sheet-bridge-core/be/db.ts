import Database from 'better-sqlite3';
import path from 'path';
import logger from './logger';

const DB_PATH = path.join(__dirname, '../data/swaps.db');

let db: Database.Database;

export interface SwapRecord {
    from_chain: string;
    from_address: string;
    from_amount: string;
    to_chain: string;
    to_address: string;
    to_amount: string;
    signature: string;
    status: string;
}

export function setupDatabase(): Database.Database {
    db = new Database(DB_PATH);

    db.exec(`
        CREATE TABLE IF NOT EXISTS swaps (
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

export function insertSwap(swap: SwapRecord): boolean {
    if (!db) {
        throw new Error('Database not initialized. Call setupDatabase() first.');
    }

    try {
        const stmt = db.prepare(`
            INSERT OR IGNORE INTO swaps
            (from_chain, from_address, from_amount, to_chain, to_address, to_amount, signature, status)
            VALUES (@from_chain, @from_address, @from_amount, @to_chain, @to_address, @to_amount, @signature, @status)
        `);

        const result = stmt.run(swap);

        if (result.changes > 0) {
            logger.info(`Swap record inserted: ${swap.signature}`);
            return true;
        } else {
            logger.debug(`Swap record already exists (duplicate ignored): ${swap.signature}`);
            return false;
        }
    } catch (error: any) {
        logger.error(`Failed to insert swap: ${error?.message ?? String(error)}`);
        throw error;
    }
}

export function getDatabase(): Database.Database {
    if (!db) {
        throw new Error('Database not initialized. Call setupDatabase() first.');
    }
    return db;
}

export function closeDatabase(): void {
    if (db) {
        db.close();
        logger.info('Database connection closed');
    }
}
