const fs = require("node:fs");
const path = require("node:path");
const { normalizeAddress } = require("../utils/addresses");

function resolveGenesisPath(config, explicitGenesisPath = null) {
  if (explicitGenesisPath) return explicitGenesisPath;
  if (config.genesisFilePath) return config.genesisFilePath;
  return path.join(process.cwd(), "rpc-node-v2-data", "genesis.json");
}

function loadGenesisFile(genesisPath) {
  if (!fs.existsSync(genesisPath)) {
    return null;
  }
  const raw = fs.readFileSync(genesisPath, "utf8");
  return JSON.parse(raw);
}

function applyGenesisToState(state, genesis) {
  if (!genesis) return;
  const accounts = Array.isArray(genesis.accounts) ? genesis.accounts : [];
  for (const account of accounts) {
    const address = normalizeAddress(account.address);
    state.setAccount(address, {
      balance: BigInt(account.balance || "0"),
      nonce: Number.parseInt(String(account.nonce || 0), 10)
    });
  }
  if (genesis.latestBlockNumber !== undefined) {
    state.setLatestBlockNumber(genesis.latestBlockNumber);
  }
}

module.exports = {
  resolveGenesisPath,
  loadGenesisFile,
  applyGenesisToState
};
