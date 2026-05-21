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
    sqliteEnabled: env.SQLITE_ENABLED !== "0",
    sqliteDbPath: env.SQLITE_DB_PATH || null,
    googleSheetId: env.GOOGLE_SHEET_ID || null,
    googleCredentialsPath: env.GOOGLE_APPLICATION_CREDENTIALS || null,
    googleSheetName: env.GOOGLE_SHEET_NAME || null,
    googleBlindAppend: env.GOOGLE_BLIND_APPEND === "1",
    googleSheetReset: env.GOOGLE_SHEET_RESET === "1",
    blockTxsPerBlock: parsePositiveInt(env.BLOCK_TXS_PER_BLOCK || "1", "BLOCK_TXS_PER_BLOCK"),
    syncIntervalMs: parsePositiveInt(env.SYNC_INTERVAL_MS || "5000", "SYNC_INTERVAL_MS")
  };
}

module.exports = {
  loadConfig,
  parsePositiveInt
};
