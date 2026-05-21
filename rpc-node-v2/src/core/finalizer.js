class Finalizer {
  constructor(stateStore, { onSynced = null } = {}) {
    this.state = stateStore;
    this.onSynced = onSynced;
  }

  markPending(txHash) {
    this.state.setSyncStatus(txHash, { status: "pending", syncedAt: null });
  }

  markSynced(txHash, syncedAt = new Date().toISOString()) {
    this.state.setSyncStatus(txHash, { status: "synced", syncedAt });
    if (this.onSynced) this.onSynced(txHash);
  }

  getPendingTxHashes() {
    return this.state.getPendingSyncTxHashes();
  }
}

module.exports = {
  Finalizer
};
