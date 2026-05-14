const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("ethers");
const { normalizeAddress } = require("../utils/addresses");

class SystemContractRegistry {
  constructor({ contracts = [] } = {}) {
    this.contractsByAddress = new Map();
    this.callHandlers = new Map();
    this.txHandlers = new Map();
    contracts.forEach((contractModule) => this.register(contractModule));
  }

  static loadFromDirectory(directoryPath) {
    const entries = fs.readdirSync(directoryPath).filter((entry) => entry.endsWith(".js") && entry !== "registry.js");
    const contracts = entries.map((entry) => {
      const absolute = path.join(directoryPath, entry);
      return require(absolute);
    });
    return new SystemContractRegistry({ contracts });
  }

  register(contractModule) {
    if (!contractModule || !contractModule.address || !Array.isArray(contractModule.abi)) {
      throw new Error("Invalid system contract module");
    }
    const address = normalizeAddress(contractModule.address);
    if (this.contractsByAddress.has(address)) {
      throw new Error(`Duplicate system contract address: ${address}`);
    }

    const iface = new ethers.Interface(contractModule.abi);
    this.contractsByAddress.set(address, { ...contractModule, address, iface });

    for (const fragment of iface.fragments.filter((fragment) => fragment.type === "function")) {
      const signature = fragment.format("sighash");
      const selector = iface.getFunction(signature).selector.toLowerCase();
      const key = `${address}:${selector}`;
      const isView = fragment.stateMutability === "view" || fragment.stateMutability === "pure";

      if (this.callHandlers.has(key) || this.txHandlers.has(key)) {
        throw new Error(`Duplicate selector for ${address}: ${selector}`);
      }

      if (isView) {
        const callHandler = contractModule.calls && contractModule.calls[signature];
        if (!callHandler) {
          throw new Error(`Missing call handler for ${signature} at ${address}`);
        }
        this.callHandlers.set(key, { handler: callHandler, signature, iface });
      } else {
        const txHandler = contractModule.transactions && contractModule.transactions[signature];
        if (!txHandler) {
          throw new Error(`Missing transaction handler for ${signature} at ${address}`);
        }
        this.txHandlers.set(key, { handler: txHandler, signature, iface });
      }
    }
  }

  hasAddress(address) {
    return this.contractsByAddress.has(normalizeAddress(address));
  }

  async call({ to, data, context }) {
    const address = normalizeAddress(to);
    const selector = String(data || "0x").slice(0, 10).toLowerCase();
    const key = `${address}:${selector}`;
    const entry = this.callHandlers.get(key);
    if (!entry) return "0x";

    const args = entry.iface.decodeFunctionData(entry.signature, data);
    return entry.handler({ ...context, selector, args });
  }

  async transact({ tx, context }) {
    const address = normalizeAddress(tx.to);
    const selector = String(tx.data || "0x").slice(0, 10).toLowerCase();
    const key = `${address}:${selector}`;
    const entry = this.txHandlers.get(key);
    if (!entry) return null;

    const args = entry.iface.decodeFunctionData(entry.signature, tx.data);
    return entry.handler({ ...context, tx, selector, args });
  }
}

module.exports = {
  SystemContractRegistry
};
