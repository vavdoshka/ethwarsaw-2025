const path = require("node:path");
const { loadConfig } = require("./config");
const { StateStore } = require("./core/state-store");
const { Ledger } = require("./core/ledger");
const { Policy } = require("./core/policy");
const { Journal } = require("./core/journal");
const { Finalizer } = require("./core/finalizer");
const { resolveGenesisPath, loadGenesisFile, applyGenesisToState } = require("./core/genesis");
const { Executor } = require("./core/executor");
const { GoogleSheetsSyncWorker } = require("./sync/google-sheets-sync");
const { ExportCheckpoint } = require("./sync/export-checkpoint");
const { createRpcMethods } = require("./rpc/methods");
const { createRpcRouter } = require("./rpc/router");
const { SystemContractRegistry } = require("./system-contracts/registry");
const bridgeContract = require("./system-contracts/bridge");
const airdropContract = require("./system-contracts/airdrop");

function createApp({ env = process.env, journalPath = null, genesisPath = null, syncClient = null, exportCheckpointPath = null } = {}) {
  const config = loadConfig(env);
  const state = new StateStore();
  const resolvedGenesisPath = resolveGenesisPath(config, genesisPath);
  const genesis = loadGenesisFile(resolvedGenesisPath);
  applyGenesisToState(state, genesis);
  const ledger = new Ledger(state);
  const policy = new Policy({
    bridgeOperatorAddress: config.bridgeOperatorAddress
  });
  const resolvedJournalPath = journalPath || path.join(process.cwd(), "rpc-node-v2-data", "journal.jsonl");
  const journal = new Journal(resolvedJournalPath);
  const finalizer = new Finalizer(state);
  const executor = new Executor({ stateStore: state, ledger, policy, journal, finalizer });
  executor.recoverFromJournal();
  const checkpointPath = exportCheckpointPath || path.join(path.dirname(resolvedJournalPath), "export-checkpoint.json");
  const checkpoint = syncClient ? new ExportCheckpoint(checkpointPath) : null;
  const syncWorker = syncClient ? new GoogleSheetsSyncWorker({ finalizer, state, syncClient, checkpoint }) : null;

  const contracts = new SystemContractRegistry({
    contracts: [bridgeContract, airdropContract]
  });
  const methods = createRpcMethods({ config, state, executor, contracts });
  const router = createRpcRouter(methods);

  return {
    config,
    state,
    ledger,
    policy,
    journal,
    finalizer,
    checkpoint,
    syncWorker,
    executor,
    contracts,
    methods,
    router
  };
}

module.exports = {
  createApp
};
