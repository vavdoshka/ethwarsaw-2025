class GoogleSheetsSyncWorker {
  constructor({ finalizer, state, syncClient, checkpoint = null, retryBaseMs = 200 }) {
    this.finalizer = finalizer;
    this.state = state;
    this.syncClient = syncClient;
    this.checkpoint = checkpoint;
    this.retryBaseMs = retryBaseMs;
  }

  async flushOnce() {
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
    }
    return { flushed };
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
