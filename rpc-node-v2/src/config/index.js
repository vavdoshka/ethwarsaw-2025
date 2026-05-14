function parsePositiveInt(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
  return parsed;
}

function loadConfig(env = process.env) {
  const chainIdRaw = env.CHAIN_ID || "12345";
  const chainId = parsePositiveInt(chainIdRaw, "CHAIN_ID");
  const port = parsePositiveInt(env.PORT || "8545", "PORT");

  return {
    port,
    chainId,
    networkName: env.NETWORK_NAME || "SheetChain",
    bridgeOperatorAddress: (env.BRIDGE_OPERATOR_ADDRESS || "0x337d7730a281efE851dbEDf5F4eD0D2610E59639").toLowerCase(),
    bridgeAccountAddress: (env.BRIDGE_ACCOUNT_ADDRESS || "0x0000000000000000000000000000000000000002").toLowerCase(),
    genesisFilePath: env.GENESIS_FILE_PATH || null,
    syncIntervalMs: parsePositiveInt(env.SYNC_INTERVAL_MS || "5000", "SYNC_INTERVAL_MS")
  };
}

module.exports = {
  loadConfig,
  parsePositiveInt
};
