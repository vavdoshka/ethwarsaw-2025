const fs = require("node:fs");
const path = require("node:path");

class ExportCheckpoint {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = { batches: [] };
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (fs.existsSync(this.filePath)) {
      const raw = fs.readFileSync(this.filePath, "utf8");
      if (raw.trim()) this.state = JSON.parse(raw);
    } else {
      this._persist();
    }
  }

  beginBatch(txHashes) {
    const batch = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      status: "inFlight",
      txHashes: txHashes.map((hash) => hash.toLowerCase()),
      startedAt: new Date().toISOString(),
      completedAt: null
    };
    this.state.batches.push(batch);
    this._persist();
    return batch;
  }

  completeBatch(batchId) {
    const batch = this.state.batches.find((item) => item.id === batchId);
    if (!batch) throw new Error(`Unknown export batch: ${batchId}`);
    batch.status = "synced";
    batch.completedAt = new Date().toISOString();
    this._persist();
  }

  getInFlightTxHashes() {
    const hashes = [];
    for (const batch of this.state.batches) {
      if (batch.status === "inFlight") hashes.push(...batch.txHashes);
    }
    return Array.from(new Set(hashes));
  }

  _persist() {
    const tmpPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(this.state, null, 2));
    fs.renameSync(tmpPath, this.filePath);
  }
}

module.exports = {
  ExportCheckpoint
};
