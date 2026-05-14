class InMemorySheetsClient {
  constructor() {
    this.transactions = new Map();
  }

  async hasTransaction(txHash) {
    return this.transactions.has(String(txHash).toLowerCase());
  }

  async writeTransaction(tx) {
    const key = String(tx.hash).toLowerCase();
    this.transactions.set(key, { ...tx });
    return { updated: true };
  }

  getTransactionsCount() {
    return this.transactions.size;
  }
}

module.exports = {
  InMemorySheetsClient
};
