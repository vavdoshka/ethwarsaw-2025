class InMemorySheetsClient {
  constructor() {
    this.transactions = new Map();
    this.genesis = new Map();
    this.balances = new Map();
    this.claims = new Map();
    this.bridgeRecords = [];
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

  getAllTransactions() {
    return Array.from(this.transactions.values());
  }

  async writeGenesis(rows) {
    this.genesis.clear();
    for (const row of rows) this.genesis.set(String(row.address).toLowerCase(), { ...row });
  }

  async writeBalances(rows) {
    for (const row of rows) this.balances.set(String(row.address).toLowerCase(), { ...row });
  }

  async writeClaims(rows) {
    for (const row of rows) this.claims.set(String(row.claimId), { ...row });
  }

  async writeBridgeRecords(rows) {
    this.bridgeRecords = rows.map((row) => ({ ...row }));
  }

  getBalancesCount() {
    return this.balances.size;
  }

  getGenesisCount() {
    return this.genesis.size;
  }

  getClaimsCount() {
    return this.claims.size;
  }

  getBridgeRecordsCount() {
    return this.bridgeRecords.length;
  }
}

module.exports = {
  InMemorySheetsClient
};
