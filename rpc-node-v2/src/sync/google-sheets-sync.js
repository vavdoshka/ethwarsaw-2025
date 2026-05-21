class GoogleSheetsSyncWorker {
  constructor({ finalizer, state, syncClient, checkpoint = null, sqliteStore = null, retryBaseMs = 200, maxRetries = 5, metrics = null, logger = console }) {
    this.finalizer = finalizer;
    this.state = state;
    this.syncClient = syncClient;
    this.checkpoint = checkpoint;
    this.sqliteStore = sqliteStore;
    this.retryBaseMs = retryBaseMs;
    this.maxRetries = maxRetries;
    this.metrics = metrics;
    this.logger = logger;
  }

  async flushOnce() {
    if (this.sqliteStore) {
      return this.flushFromSqliteOutbox();
    }

    await this.recoverInFlight();

    const pending = this.finalizer.getPendingTxHashes();
    if (pending.length === 0) {
      return { flushed: 0 };
    }

    if (this.syncClient && this.syncClient.blindAppend === true) {
      const txs = [];
      for (const txHash of pending) {
        const tx = this.state.getTransaction(txHash);
        if (tx) txs.push(tx);
      }
      if (txs.length > 0) {
        const batch = this.checkpoint ? this.checkpoint.beginBatch(txs.map((tx) => tx.hash)) : null;
        if (typeof this.syncClient.writeTransactions === "function") {
          await this.syncClient.writeTransactions(txs);
        } else {
          for (const tx of txs) await this.syncClient.writeTransaction(tx);
        }
        if (batch) this.checkpoint.completeBatch(batch.id);
      }
      for (const txHash of pending) {
        this.finalizer.markSynced(txHash);
      }
      await this.syncStateViews();
      return { flushed: pending.length };
    }

    if (typeof this.syncClient.hasTransactions === "function") {
      const txs = [];
      const txHashes = [];
      for (const txHash of pending) {
        const tx = this.state.getTransaction(txHash);
        if (!tx) continue;
        txs.push(tx);
        txHashes.push(txHash);
      }
      const existing = await this.syncClient.hasTransactions(txHashes);
      const toWrite = [];
      const writtenHashes = [];
      for (let i = 0; i < txs.length; i += 1) {
        if (existing.has(txHashes[i].toLowerCase())) {
          this.finalizer.markSynced(txHashes[i]);
        } else {
          toWrite.push(txs[i]);
          writtenHashes.push(txHashes[i]);
        }
      }
      if (toWrite.length > 0) {
        const batch = this.checkpoint ? this.checkpoint.beginBatch(writtenHashes) : null;
        if (typeof this.syncClient.writeTransactions === "function") {
          await this.syncClient.writeTransactions(toWrite);
        } else {
          for (const tx of toWrite) await this.syncClient.writeTransaction(tx);
        }
        if (batch) this.checkpoint.completeBatch(batch.id);
        for (const txHash of writtenHashes) this.finalizer.markSynced(txHash);
      }
      if (txs.length > 0) await this.syncStateViews();
      return { flushed: txs.length };
    }

    const transactionsToWrite = [];
    const txHashesToWrite = [];
    let flushed = 0;
    for (const txHash of pending) {
      const tx = this.state.getTransaction(txHash);
      if (!tx) continue;
      const alreadySynced = await this.syncClient.hasTransaction(txHash);
      if (alreadySynced) {
        this.finalizer.markSynced(txHash);
        flushed += 1;
        continue;
      }
      transactionsToWrite.push(tx);
      txHashesToWrite.push(txHash);
    }

    if (transactionsToWrite.length > 0) {
      const batch = this.checkpoint ? this.checkpoint.beginBatch(txHashesToWrite) : null;
      if (typeof this.syncClient.writeTransactions === "function") {
        await this.syncClient.writeTransactions(transactionsToWrite);
      } else {
        for (const tx of transactionsToWrite) {
          await this.syncClient.writeTransaction(tx);
        }
      }
      if (batch) this.checkpoint.completeBatch(batch.id);
      for (const txHash of txHashesToWrite) {
        this.finalizer.markSynced(txHash);
        flushed += 1;
      }
      await this.syncStateViews();
    }
    return { flushed };
  }

  async flushFromSqliteOutbox() {
    const startedAt = Date.now();
    const claimed = this.sqliteStore.claimPendingSyncJobs(1000);
    if (claimed.length === 0) return { flushed: 0 };
    this.logger.info(JSON.stringify({ event: "sync.batch.start", jobs: claimed.length }));

    const grouped = new Map();
    for (const job of claimed) {
      const key = String(job.blockNumber);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(job.txHash);
    }

    let flushed = 0;
    for (const [blockNumber, txHashes] of grouped.entries()) {
      const exportBatchId = `blk-${blockNumber}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      try {
        const txRows = this.sqliteStore.getTransactionsByHashes(txHashes);
        if (txRows.length === 0) continue;
        for (const row of txRows) row.exportBatchId = exportBatchId;
        if (typeof this.syncClient.writeTransactions === "function") {
          await this.syncClient.writeTransactions(txRows);
        } else {
          for (const tx of txRows) await this.syncClient.writeTransaction(tx);
        }
        for (const txHash of txHashes) {
          this.sqliteStore.markTxSynced(txHash, Number.parseInt(blockNumber, 10), exportBatchId);
          this.finalizer.markSynced(txHash);
          const tx = this.state.getTransaction(txHash);
          if (tx && tx.acceptedAt && this.metrics) {
            this.metrics.observeSyncLatency(Math.max(0, Date.now() - Date.parse(tx.acceptedAt)));
          }
          flushed += 1;
        }
      } catch (error) {
        if (this.metrics && /quota|rate|throttl/i.test(String(error.message || ""))) this.metrics.incQuotaErrors();
        this.logger.warn(JSON.stringify({ event: "sync.batch.failed", blockNumber, error: String(error.message || error) }));
        this.sqliteStore.markSyncJobsFailed(txHashes, error.message, {
          maxRetries: this.maxRetries,
          retryDelayMs: this.retryBaseMs
        });
        throw error;
      }
    }
    if (this.metrics) this.metrics.observeSyncFlush(Date.now() - startedAt);
    this.logger.info(JSON.stringify({ event: "sync.batch.success", flushed }));
    if (flushed > 0) await this.syncStateViews();
    return { flushed };
  }

  async syncStateViews() {
    if (!this.syncClient) return;
    const snapshot = this.state.exportSnapshot();
    if (typeof this.syncClient.writeBalances === "function") {
      const rows = (snapshot.accounts || []).map((account) => ({
        address: account.address,
        balance: String(account.balance),
        nonce: Number.parseInt(String(account.nonce), 10)
      }));
      await this.syncClient.writeBalances(rows);
    }
    if (typeof this.syncClient.writeClaims === "function") {
      const rows = (snapshot.claims || []).map(([claimId, claim]) => ({ claimId, ...claim }));
      await this.syncClient.writeClaims(rows);
    }
    if (typeof this.syncClient.writeBridgeRecords === "function") {
      const rows = (snapshot.bridge || []).map((record, index) => ({ index, ...record }));
      await this.syncClient.writeBridgeRecords(rows);
    }
  }

  async recoverInFlight() {
    if (!this.checkpoint || typeof this.syncClient.hasTransactions !== "function") return { recovered: 0 };
    const inFlight = this.checkpoint.getInFlightTxHashes()
      .filter((txHash) => this.state.getSyncStatus(txHash).status !== "synced");
    if (inFlight.length === 0) return { recovered: 0 };

    const existing = await this.syncClient.hasTransactions(inFlight);
    for (const txHash of inFlight) {
      if (existing.has(txHash.toLowerCase())) {
        this.finalizer.markSynced(txHash);
      }
    }
    return { recovered: existing.size };
  }

  async flushWithRetry(maxAttempts = 3) {
    let attempt = 0;
    let lastError = null;
    while (attempt < maxAttempts) {
      try {
        return await this.flushOnce();
      } catch (error) {
        lastError = error;
        attempt += 1;
        this.logger.warn(JSON.stringify({ event: "sync.retry", attempt, maxAttempts, error: String(error.message || error) }));
        if (attempt >= maxAttempts) break;
        const waitMs = this.retryBaseMs * (2 ** (attempt - 1));
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
    throw lastError;
  }
}

module.exports = {
  GoogleSheetsSyncWorker
};
