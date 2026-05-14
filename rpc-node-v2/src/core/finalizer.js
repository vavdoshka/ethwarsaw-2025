class Finalizer {
  constructor(stateStore) {
    this.state = stateStore;
  }

  markPending(txHash) {
    this.state.setSyncStatus(txHash, { status: "pending", syncedAt: null });
  }

  markSynced(txHash, syncedAt = new Date().toISOString()) {
    this.state.setSyncStatus(txHash, { status: "synced", syncedAt });
  }

  getPendingTxHashes() {
    return this.state.getPendingSyncTxHashes();
  }
}

module.exports = {
  Finalizer
};
