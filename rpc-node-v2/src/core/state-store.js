const { normalizeAddress } = require("../utils/addresses");

class StateStore {
  constructor(snapshot = null) {
    this.accounts = new Map();
    this.transactions = new Map();
    this.claims = new Map();
    this.bridge = [];
    this.sync = new Map();
    this.latestBlockNumber = 0;

    if (snapshot) this.importSnapshot(snapshot);
  }

  getAccount(address) {
    const normalized = normalizeAddress(address);
    return this.accounts.get(normalized) || { address: normalized, balance: 0n, nonce: 0 };
  }

  setAccount(address, { balance, nonce }) {
    const normalized = normalizeAddress(address);
    this.accounts.set(normalized, {
      address: normalized,
      balance: BigInt(balance),
      nonce: Number.parseInt(String(nonce), 10)
    });
  }

  getBalance(address) {
    return this.getAccount(address).balance;
  }

  getNonce(address) {
    return this.getAccount(address).nonce;
  }

  setBalance(address, balance) {
    const account = this.getAccount(address);
    this.setAccount(address, { balance: BigInt(balance), nonce: account.nonce });
  }

  setNonce(address, nonce) {
    const account = this.getAccount(address);
    this.setAccount(address, { balance: account.balance, nonce });
  }

  setTransaction(txHash, txRecord) {
    this.transactions.set(txHash.toLowerCase(), { ...txRecord });
  }

  getTransaction(txHash) {
    return this.transactions.get(txHash.toLowerCase()) || null;
  }

  hasTransaction(txHash) {
    return this.transactions.has(txHash.toLowerCase());
  }

  setSyncStatus(txHash, syncStatus) {
    this.sync.set(txHash.toLowerCase(), { ...syncStatus });
  }

  getSyncStatus(txHash) {
    return this.sync.get(txHash.toLowerCase()) || { status: "pending", syncedAt: null };
  }

  getPendingSyncTxHashes() {
    const result = [];
    for (const [txHash, status] of this.sync.entries()) {
      if (status.status !== "synced") result.push(txHash);
    }
    return result;
  }

  addClaim(claimId, claim) {
    this.claims.set(claimId, { ...claim });
  }

  getClaim(claimId) {
    return this.claims.get(claimId) || null;
  }

  addBridgeRecord(record) {
    this.bridge.push({ ...record });
  }

  nextBlockNumber() {
    this.latestBlockNumber += 1;
    return this.latestBlockNumber;
  }

  setLatestBlockNumber(value) {
    this.latestBlockNumber = Number.parseInt(String(value), 10);
  }

  exportSnapshot() {
    return {
      latestBlockNumber: this.latestBlockNumber,
      accounts: Array.from(this.accounts.values()).map((account) => ({
        address: account.address,
        balance: account.balance.toString(),
        nonce: account.nonce
      })),
      transactions: Array.from(this.transactions.entries()),
      claims: Array.from(this.claims.entries()),
      bridge: this.bridge.map((record) => ({ ...record })),
      sync: Array.from(this.sync.entries())
    };
  }

  importSnapshot(snapshot) {
    this.accounts.clear();
    this.transactions.clear();
    this.claims.clear();
    this.bridge = [];
    this.sync.clear();
    this.latestBlockNumber = Number.parseInt(String(snapshot.latestBlockNumber || 0), 10);

    for (const account of snapshot.accounts || []) {
      this.setAccount(account.address, {
        balance: BigInt(account.balance),
        nonce: account.nonce
      });
    }
    for (const [txHash, txRecord] of snapshot.transactions || []) {
      this.transactions.set(txHash, txRecord);
    }
    for (const [claimId, claim] of snapshot.claims || []) {
      this.claims.set(claimId, claim);
    }
    for (const record of snapshot.bridge || []) {
      this.bridge.push(record);
    }
    for (const [txHash, syncStatus] of snapshot.sync || []) {
      this.sync.set(txHash, syncStatus);
    }
  }
}

module.exports = {
  StateStore
};
