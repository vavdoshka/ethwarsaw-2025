const fs = require("node:fs");
const path = require("node:path");
const { ConflictError } = require("./errors");

class Journal {
  constructor(filePath) {
    this.filePath = filePath;
    this.txHashSet = new Set();
    this._ensureParentDirectory();
    this.replay((event) => {
      if (event.txHash) this.txHashSet.add(event.txHash.toLowerCase());
    });
  }

  _ensureParentDirectory() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, "");
    }
  }

  hasTxHash(txHash) {
    return this.txHashSet.has(txHash.toLowerCase());
  }

  append(event) {
    const txHash = event.txHash ? event.txHash.toLowerCase() : null;
    if (txHash && this.txHashSet.has(txHash)) {
      throw new ConflictError(`Duplicate tx hash: ${event.txHash}`);
    }
    const line = `${JSON.stringify(event)}\n`;
    const fd = fs.openSync(this.filePath, "a");
    try {
      fs.writeFileSync(fd, line);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    if (txHash) this.txHashSet.add(txHash);
  }

  replay(visitor) {
    const text = fs.existsSync(this.filePath) ? fs.readFileSync(this.filePath, "utf8") : "";
    if (!text.trim()) return;
    const lines = text.split("\n").filter(Boolean);
    for (const [index, line] of lines.entries()) {
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid journal JSON at line ${index + 1}: ${error.message}`);
      }
      visitor(parsed);
    }
  }
}

module.exports = {
  Journal
};
