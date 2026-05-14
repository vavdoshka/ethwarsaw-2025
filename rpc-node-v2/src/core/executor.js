const { ethers } = require("ethers");
const { normalizeAddress } = require("../utils/addresses");
const { ValidationError } = require("./errors");

class Executor {
  constructor({ stateStore, ledger, policy, journal, finalizer }) {
    this.state = stateStore;
    this.ledger = ledger;
    this.policy = policy;
    this.journal = journal;
    this.finalizer = finalizer;
  }

  executeValueTx(tx) {
    const from = normalizeAddress(tx.from);
    const to = normalizeAddress(tx.to);
    const value = BigInt(tx.value || 0);
    if (value <= 0n) {
      throw new ValidationError("Transaction value must be positive");
    }

    const nonce = this._normalizeNonce(tx.nonce);
    const actualNonce = this.ledger.getNonce(from);
    this.policy.requireExpectedNonce(actualNonce, nonce);

    const txHash = (tx.hash || this._generateTxHash({ from, to, value, nonce })).toLowerCase();
    if (this.journal.hasTxHash(txHash) || this.state.hasTransaction(txHash)) {
      throw new ValidationError(`Duplicate tx hash: ${txHash}`);
    }

    const snapshotBefore = this.state.exportSnapshot();
    const blockNumber = this.state.nextBlockNumber();

    try {
      this.ledger.transfer({ from, to, amount: value });
      this.ledger.setNonce(from, nonce + 1);

      const event = {
        type: "tx.accepted",
        txHash,
        timestamp: new Date().toISOString(),
        blockNumber,
        tx: {
          from,
          to,
          value: value.toString(),
          nonce
        },
        effects: [
          { type: "transfer", from, to, amount: value.toString() },
          { type: "nonceIncrement", address: from, nonce: nonce + 1 }
        ],
        sync: { googleSheets: { status: "pending", syncedAt: null } }
      };

      this.journal.append(event);
      this.state.setTransaction(txHash, {
        hash: txHash,
        from,
        to,
        value: value.toString(),
        nonce,
        blockNumber,
        status: "0x1"
      });
      this.finalizer.markPending(txHash);

      return {
        transactionHash: txHash,
        blockNumber
      };
    } catch (error) {
      this.state.importSnapshot(snapshotBefore);
      throw error;
    }
  }

  async executeSystemTx(tx, executeHandler) {
    const from = normalizeAddress(tx.from);
    const nonce = this._normalizeNonce(tx.nonce);
    const actualNonce = this.ledger.getNonce(from);
    this.policy.requireExpectedNonce(actualNonce, nonce);

    const txHash = (tx.hash || this._generateTxHash({ from, to: tx.to, value: 0n, nonce })).toLowerCase();
    if (this.journal.hasTxHash(txHash) || this.state.hasTransaction(txHash)) {
      throw new ValidationError(`Duplicate tx hash: ${txHash}`);
    }

    const snapshotBefore = this.state.exportSnapshot();
    const blockNumber = this.state.nextBlockNumber();
    try {
      const contractResult = await executeHandler();
      this.ledger.setNonce(from, nonce + 1);

      const event = {
        type: "tx.accepted",
        txHash,
        timestamp: new Date().toISOString(),
        blockNumber,
        tx: {
          from,
          to: normalizeAddress(tx.to),
          value: "0",
          nonce,
          data: tx.data || "0x"
        },
        effects: [{ type: "systemContractCall", to: tx.to, nonce: nonce + 1 }],
        sync: { googleSheets: { status: "pending", syncedAt: null } }
      };

      this.journal.append(event);
      this.state.setTransaction(txHash, {
        hash: txHash,
        from,
        to: normalizeAddress(tx.to),
        value: "0",
        nonce,
        blockNumber,
        status: "0x1"
      });
      this.finalizer.markPending(txHash);
      return { transactionHash: txHash, blockNumber, contractResult };
    } catch (error) {
      this.state.importSnapshot(snapshotBefore);
      throw error;
    }
  }

  recoverFromJournal() {
    this.journal.replay((event) => {
      if (event.type !== "tx.accepted") return;
      const txHash = event.txHash.toLowerCase();
      if (this.state.hasTransaction(txHash)) return;

      const from = event.tx.from;
      const to = event.tx.to;
      const value = BigInt(event.tx.value);
      const nonce = Number.parseInt(String(event.tx.nonce), 10);

      this.ledger.transfer({ from, to, amount: value });
      this.ledger.setNonce(from, nonce + 1);
      this.state.setTransaction(txHash, {
        hash: txHash,
        from,
        to,
        value: value.toString(),
        nonce,
        blockNumber: event.blockNumber,
        status: "0x1"
      });
      this.state.setLatestBlockNumber(Math.max(this.state.latestBlockNumber, event.blockNumber));
      if (event.sync && event.sync.googleSheets && event.sync.googleSheets.status === "synced") {
        this.finalizer.markSynced(txHash, event.sync.googleSheets.syncedAt || new Date().toISOString());
      } else {
        this.finalizer.markPending(txHash);
      }
    });
  }

  _normalizeNonce(value) {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      if (value.startsWith("0x")) return Number.parseInt(value.slice(2), 16);
      return Number.parseInt(value, 10);
    }
    throw new ValidationError(`Invalid nonce: ${value}`);
  }

  _generateTxHash({ from, to, value, nonce }) {
    return ethers.keccak256(
      ethers.toUtf8Bytes(
        JSON.stringify({
          from,
          to,
          value: value.toString(),
          nonce,
          timestamp: Date.now()
        })
      )
    );
  }
}

module.exports = {
  Executor
};
