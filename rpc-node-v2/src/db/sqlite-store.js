const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const Database = require("better-sqlite3");

class SqliteStore {
  constructor(dbPath, { blockTxsPerBlock = 1 } = {}) {
    this.dbPath = path.resolve(dbPath);
    this.blockTxsPerBlock = Math.max(1, Number.parseInt(String(blockTxsPerBlock), 10) || 1);
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    this.db = new Database(this.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this._migrate();
    this._prepare();
  }

  _migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        address TEXT PRIMARY KEY,
        balance TEXT NOT NULL,
        nonce INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS blocks (
        block_number INTEGER PRIMARY KEY,
        block_hash TEXT NOT NULL UNIQUE,
        parent_hash TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS transactions (
        tx_hash TEXT PRIMARY KEY,
        block_number INTEGER NOT NULL,
        tx_index INTEGER NOT NULL,
        from_address TEXT NOT NULL,
        to_address TEXT NOT NULL,
        value TEXT NOT NULL,
        nonce INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (block_number) REFERENCES blocks(block_number),
        UNIQUE(block_number, tx_index)
      );
      CREATE TABLE IF NOT EXISTS receipts (
        tx_hash TEXT PRIMARY KEY,
        block_number INTEGER NOT NULL,
        tx_index INTEGER NOT NULL,
        status TEXT NOT NULL,
        gas_used TEXT NOT NULL,
        FOREIGN KEY (tx_hash) REFERENCES transactions(tx_hash)
      );
      CREATE TABLE IF NOT EXISTS sync_jobs (
        tx_hash TEXT PRIMARY KEY,
        block_number INTEGER NOT NULL,
        status TEXT NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        next_retry_at TEXT,
        export_batch_id TEXT,
        synced_at TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS journal_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tx_hash TEXT,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS system_contract_state (
        contract_address TEXT NOT NULL,
        state_key TEXT NOT NULL,
        state_value TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (contract_address, state_key)
      );
      CREATE TABLE IF NOT EXISTS sync_checkpoints (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_synced_block INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
    `);
    const columns = this.db.prepare("PRAGMA table_info(sync_jobs)").all();
    if (!columns.find((column) => column.name === "export_batch_id")) {
      this.db.exec("ALTER TABLE sync_jobs ADD COLUMN export_batch_id TEXT");
    }
    const checkpointColumns = this.db.prepare("PRAGMA table_info(sync_checkpoints)").all();
    if (!checkpointColumns.find((column) => column.name === "last_exported_block")) {
      this.db.exec("ALTER TABLE sync_checkpoints ADD COLUMN last_exported_block INTEGER NOT NULL DEFAULT 0");
    }
    this.db.exec(`
      INSERT OR IGNORE INTO sync_checkpoints (id, last_synced_block, updated_at)
      VALUES (1, 0, datetime('now'));
      UPDATE sync_checkpoints
      SET last_exported_block = COALESCE(last_exported_block, 0)
      WHERE id = 1;
    `);
  }

  _prepare() {
    this.getAccountStmt = this.db.prepare("SELECT address, balance, nonce FROM accounts WHERE address = ?");
    this.upsertAccountStmt = this.db.prepare(`
      INSERT INTO accounts (address, balance, nonce)
      VALUES (@address, @balance, @nonce)
      ON CONFLICT(address) DO UPDATE SET balance = excluded.balance, nonce = excluded.nonce
    `);
    this.hasTxStmt = this.db.prepare("SELECT 1 FROM transactions WHERE tx_hash = ?");
    this.latestBlockStmt = this.db.prepare("SELECT COALESCE(MAX(block_number), 0) AS block_number FROM blocks");
    this.latestBlockRowStmt = this.db.prepare("SELECT block_number, block_hash, parent_hash FROM blocks ORDER BY block_number DESC LIMIT 1");
    this.blockByNumberStmt = this.db.prepare("SELECT block_number, block_hash, parent_hash, created_at FROM blocks WHERE block_number = ?");
    this.blockTxCountStmt = this.db.prepare("SELECT COUNT(1) AS tx_count FROM transactions WHERE block_number = ?");
    this.insertBlockStmt = this.db.prepare(`
      INSERT OR IGNORE INTO blocks (block_number, block_hash, parent_hash, created_at)
      VALUES (@block_number, @block_hash, @parent_hash, @created_at)
    `);
    this.updateBlockHashStmt = this.db.prepare("UPDATE blocks SET block_hash = @block_hash WHERE block_number = @block_number");
    this.insertTxStmt = this.db.prepare(`
      INSERT INTO transactions (
        tx_hash, block_number, tx_index, from_address, to_address, value, nonce, status, created_at
      ) VALUES (
        @tx_hash, @block_number, @tx_index, @from_address, @to_address, @value, @nonce, @status, @created_at
      )
    `);
    this.insertReceiptStmt = this.db.prepare(`
      INSERT INTO receipts (tx_hash, block_number, tx_index, status, gas_used)
      VALUES (@tx_hash, @block_number, @tx_index, @status, @gas_used)
    `);
    this.upsertSyncJobStmt = this.db.prepare(`
      INSERT INTO sync_jobs (tx_hash, block_number, status, updated_at)
      VALUES (@tx_hash, @block_number, 'pending', @updated_at)
      ON CONFLICT(tx_hash) DO UPDATE SET status = 'pending', updated_at = excluded.updated_at
    `);
    this.markSyncedStmt = this.db.prepare(`
      UPDATE sync_jobs
      SET status = 'synced', synced_at = @synced_at, export_batch_id = @export_batch_id, updated_at = @updated_at
      WHERE tx_hash = @tx_hash
    `);
    this.advanceCheckpointStmt = this.db.prepare(`
      UPDATE sync_checkpoints
      SET last_synced_block = @last_synced_block, updated_at = @updated_at
      WHERE id = 1 AND last_synced_block < @last_synced_block
    `);
    this.loadAccountsStmt = this.db.prepare("SELECT address, balance, nonce FROM accounts");
    this.loadTxStmt = this.db.prepare("SELECT tx_hash, from_address, to_address, value, nonce, block_number, tx_index, status, created_at FROM transactions ORDER BY block_number, tx_index");
    this.loadTxHashesByBlockStmt = this.db.prepare("SELECT tx_hash FROM transactions WHERE block_number = ? ORDER BY tx_index ASC");
    this.loadTxsByBlockStmt = this.db.prepare(`
      SELECT tx_hash, tx_index, from_address, to_address, value, nonce, status
      FROM transactions
      WHERE block_number = ?
      ORDER BY tx_index ASC
    `);
    this.loadPendingSyncStmt = this.db.prepare("SELECT tx_hash FROM sync_jobs WHERE status != 'synced'");
    this.claimableJobsStmt = this.db.prepare(`
      SELECT tx_hash, block_number, retry_count
      FROM sync_jobs
      WHERE (status = 'pending' OR status = 'failed')
        AND (next_retry_at IS NULL OR next_retry_at <= @now)
      ORDER BY block_number ASC, tx_hash ASC
      LIMIT @limit
    `);
    this.markInFlightStmt = this.db.prepare(`
      UPDATE sync_jobs
      SET status = 'in_flight', updated_at = @updated_at
      WHERE tx_hash = @tx_hash
    `);
    this.markFailedStmt = this.db.prepare(`
      UPDATE sync_jobs
      SET
        status = @status,
        retry_count = @retry_count,
        last_error = @last_error,
        next_retry_at = @next_retry_at,
        updated_at = @updated_at
      WHERE tx_hash = @tx_hash
    `);
    this.getTxByHashesStmt = this.db.prepare(`
      SELECT tx_hash, from_address, to_address, value, nonce, block_number, status
      FROM transactions
      WHERE tx_hash IN (SELECT value FROM json_each(@hashes_json))
      ORDER BY block_number ASC, tx_index ASC
    `);
    this.statusCountsStmt = this.db.prepare(`
      SELECT
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_jobs,
        SUM(CASE WHEN status = 'in_flight' THEN 1 ELSE 0 END) AS in_flight_jobs,
        SUM(CASE WHEN status = 'dead_letter' THEN 1 ELSE 0 END) AS dead_letter_jobs
      FROM sync_jobs
    `);
    this.latestTxCountStmt = this.db.prepare("SELECT COUNT(1) AS tx_count FROM transactions");
    this.latestBlockCheckpointStmt = this.db.prepare("SELECT last_synced_block FROM sync_checkpoints WHERE id = 1");
    this.latestExportCheckpointStmt = this.db.prepare("SELECT last_exported_block FROM sync_checkpoints WHERE id = 1");
    this.advanceExportCheckpointStmt = this.db.prepare(`
      UPDATE sync_checkpoints
      SET last_exported_block = @last_exported_block, updated_at = @updated_at
      WHERE id = 1 AND last_exported_block < @last_exported_block
    `);
  }

  hasTransaction(txHash) {
    return Boolean(this.hasTxStmt.get(txHash.toLowerCase()));
  }

  loadStateInto(state, finalizer) {
    for (const account of this.loadAccountsStmt.all()) {
      state.setAccount(account.address, { balance: BigInt(account.balance), nonce: account.nonce });
    }
    for (const row of this.loadTxStmt.all()) {
      state.setTransaction(row.tx_hash, {
        hash: row.tx_hash,
        from: row.from_address,
        to: row.to_address,
        value: row.value,
        nonce: row.nonce,
        blockNumber: row.block_number,
        txIndex: row.tx_index,
        acceptedAt: row.created_at,
        status: row.status
      });
      finalizer.markSynced(row.tx_hash);
    }
    for (const pending of this.loadPendingSyncStmt.all()) {
      state.setSyncStatus(pending.tx_hash, { status: "pending", syncedAt: null });
    }
    const block = this.latestBlockStmt.get();
    state.setLatestBlockNumber(block.block_number || 0);
  }

  applyGenesis(genesis) {
    if (!genesis || !Array.isArray(genesis.accounts)) return;
    const hasAnyAccounts = this.db.prepare("SELECT COUNT(1) AS c FROM accounts").get().c > 0;
    if (hasAnyAccounts) return;
    const tx = this.db.transaction(() => {
      for (const account of genesis.accounts) {
        this.upsertAccountStmt.run({
          address: String(account.address).toLowerCase(),
          balance: String(account.balance || "0"),
          nonce: Number.parseInt(String(account.nonce || 0), 10)
        });
      }
    });
    tx();
  }

  persistAcceptedTx(record) {
    const run = this.db.transaction((payload) => {
      const allocation = this._allocateBlockPosition(payload.timestamp);
      this.upsertAccountStmt.run(payload.fromAccount);
      this.upsertAccountStmt.run(payload.toAccount);
      this.insertBlockStmt.run({
        block_number: allocation.blockNumber,
        block_hash: allocation.blockHash,
        parent_hash: allocation.parentHash,
        created_at: payload.timestamp
      });
      this.insertTxStmt.run({
        tx_hash: payload.txHash,
        block_number: allocation.blockNumber,
        tx_index: allocation.txIndex,
        from_address: payload.tx.from,
        to_address: payload.tx.to,
        value: payload.tx.value,
        nonce: payload.tx.nonce,
        status: "0x1",
        created_at: payload.timestamp
      });
      this.insertReceiptStmt.run({
        tx_hash: payload.txHash,
        block_number: allocation.blockNumber,
        tx_index: allocation.txIndex,
        status: "0x1",
        gas_used: "21000"
      });
      this.upsertSyncJobStmt.run({
        tx_hash: payload.txHash,
        block_number: allocation.blockNumber,
        updated_at: payload.timestamp
      });
      const txHashes = this.loadTxHashesByBlockStmt.all(allocation.blockNumber).map((row) => row.tx_hash.toLowerCase());
      allocation.blockHash = this._computeBlockHash(allocation.parentHash, txHashes);
      this.updateBlockHashStmt.run({
        block_number: allocation.blockNumber,
        block_hash: allocation.blockHash
      });
      return allocation;
    });
    return run(record);
  }

  _allocateBlockPosition(timestamp) {
    const latest = this.latestBlockRowStmt.get();
    const latestBlockNumber = latest?.block_number || 0;
    if (latestBlockNumber === 0) {
      return {
        blockNumber: 1,
        txIndex: 0,
        blockHash: this._computeBlockHash(null, []),
        parentHash: null
      };
    }

    const countInLatest = this.blockTxCountStmt.get(latestBlockNumber)?.tx_count || 0;
    if (countInLatest < this.blockTxsPerBlock) {
      return {
        blockNumber: latestBlockNumber,
        txIndex: countInLatest,
        blockHash: latest.block_hash,
        parentHash: latest.parent_hash
      };
    }

    const nextBlock = latestBlockNumber + 1;
    return {
      blockNumber: nextBlock,
      txIndex: 0,
      blockHash: this._computeBlockHash(latest.block_hash, []),
      parentHash: latest.block_hash
    };
  }

  _computeBlockHash(parentHash, txHashes) {
    const body = `${parentHash || "0x0"}|${(txHashes || []).join(",")}`;
    return `0x${crypto.createHash("sha256").update(body).digest("hex")}`;
  }

  markTxSynced(txHash, blockNumber, exportBatchId = null) {
    const ts = new Date().toISOString();
    const tx = this.db.transaction(() => {
      this.markSyncedStmt.run({
        tx_hash: txHash.toLowerCase(),
        synced_at: ts,
        export_batch_id: exportBatchId,
        updated_at: ts
      });
      if (blockNumber !== undefined && blockNumber !== null) {
        this.advanceCheckpointStmt.run({ last_synced_block: blockNumber, updated_at: ts });
        this.advanceExportCheckpointStmt.run({ last_exported_block: blockNumber, updated_at: ts });
      }
    });
    tx();
  }

  claimPendingSyncJobs(limit = 500) {
    const nowIso = new Date().toISOString();
    const tx = this.db.transaction(() => {
      const rows = this.claimableJobsStmt.all({ now: nowIso, limit });
      for (const row of rows) {
        this.markInFlightStmt.run({ tx_hash: row.tx_hash, updated_at: nowIso });
      }
      return rows.map((row) => ({
        txHash: row.tx_hash,
        blockNumber: row.block_number,
        retryCount: row.retry_count
      }));
    });
    return tx();
  }

  markSyncJobsFailed(txHashes, errorMessage, { maxRetries = 5, retryDelayMs = 2000 } = {}) {
    if (!Array.isArray(txHashes) || txHashes.length === 0) return;
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const tx = this.db.transaction(() => {
      for (const txHash of txHashes) {
        const row = this.db.prepare("SELECT retry_count FROM sync_jobs WHERE tx_hash = ?").get(txHash.toLowerCase());
        if (!row) continue;
        const retryCount = Number(row.retry_count || 0) + 1;
        const dead = retryCount >= maxRetries;
        const nextRetryAt = dead ? null : new Date(now + retryDelayMs * retryCount).toISOString();
        this.markFailedStmt.run({
          tx_hash: txHash.toLowerCase(),
          status: dead ? "dead_letter" : "failed",
          retry_count: retryCount,
          last_error: String(errorMessage || "unknown error"),
          next_retry_at: nextRetryAt,
          updated_at: nowIso
        });
      }
    });
    tx();
  }

  getTransactionsByHashes(txHashes) {
    if (!Array.isArray(txHashes) || txHashes.length === 0) return [];
    const hashesJson = JSON.stringify(txHashes.map((hash) => String(hash).toLowerCase()));
    return this.getTxByHashesStmt.all({ hashes_json: hashesJson }).map((row) => ({
      hash: row.tx_hash,
      from: row.from_address,
      to: row.to_address,
      value: row.value,
      nonce: row.nonce,
      blockNumber: row.block_number,
      status: row.status
    }));
  }

  getAllTransactions() {
    return this.loadTxStmt.all().map((row) => ({
      hash: row.tx_hash,
      from: row.from_address,
      to: row.to_address,
      value: row.value,
      nonce: row.nonce,
      blockNumber: row.block_number,
      status: row.status
    }));
  }

  getStatus() {
    const counts = this.statusCountsStmt.get() || {};
    const txCount = this.latestTxCountStmt.get()?.tx_count || 0;
    const latestBlock = this.latestBlockStmt.get()?.block_number || 0;
    const syncedBlock = this.latestBlockCheckpointStmt.get()?.last_synced_block || 0;
    const exportedBlock = this.latestExportCheckpointStmt.get()?.last_exported_block || 0;
    return {
      acceptedTxCount: txCount,
      latestBlockNumber: latestBlock,
      pendingSyncJobs: counts.pending_jobs || 0,
      inFlightSyncJobs: counts.in_flight_jobs || 0,
      deadLetterJobs: counts.dead_letter_jobs || 0,
      lastSyncedBlock: syncedBlock,
      lastExportedBlock: exportedBlock,
      syncLagBlocks: Math.max(0, latestBlock - syncedBlock)
    };
  }

  getBlockByNumber(blockNumber, { includeTransactions = false } = {}) {
    const normalized = Number.parseInt(String(blockNumber), 10);
    if (!Number.isInteger(normalized) || normalized <= 0) return null;
    const block = this.blockByNumberStmt.get(normalized);
    if (!block) return null;
    const txRows = this.loadTxsByBlockStmt.all(normalized);
    return {
      number: block.block_number,
      hash: block.block_hash,
      parentHash: block.parent_hash || "0x0000000000000000000000000000000000000000000000000000000000000000",
      timestamp: block.created_at,
      transactions: includeTransactions
        ? txRows.map((row) => ({
          hash: row.tx_hash,
          from: row.from_address,
          to: row.to_address,
          value: row.value,
          nonce: row.nonce,
          txIndex: row.tx_index,
          status: row.status
        }))
        : txRows.map((row) => row.tx_hash)
    };
  }
}

module.exports = {
  SqliteStore
};
