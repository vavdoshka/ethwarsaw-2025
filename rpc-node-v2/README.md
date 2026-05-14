# SheetChain RPC Node V2

This folder is the design starting point for a cleaner RPC node implementation. The current `rpc-node` remains the behavioral reference, but V2 should be built around explicit execution, state, system contract, and sync boundaries.

## Goals

- Keep RPC request handling separate from business logic.
- Make local state fast and durable enough to avoid Google Sheets throttling.
- Treat Google Sheets as a synced external view, not the execution hot path.
- Support trusted system contracts loaded from local modules.
- Prevent system contracts from bypassing core ledger invariants.
- Leave a migration path toward multiple RPC nodes after the POC.

## Non-Goals

- No user-deployed smart contracts.
- No EVM execution engine.
- No consensus protocol in the POC.
- No direct reliance on Google Sheets for transaction execution.

## Proposed Structure

```text
rpc-node-v2/
  src/
    rpc/
      server.js
      router.js
      methods.js

    core/
      executor.js
      ledger.js
      state-store.js
      journal.js
      policy.js
      finalizer.js
      errors.js

    system-contracts/
      registry.js
      bridge.js
      airdrop.js

    sync/
      google-sheets-sync.js
      serializers.js

    config/
      index.js

    utils/
      addresses.js
      hex.js
      logger.js
```

## Layer Responsibilities

### RPC Layer

The RPC layer should only:

- Parse JSON-RPC requests.
- Validate basic JSON-RPC shape.
- Decode signed transactions where needed.
- Call the core executor or read APIs.
- Format Ethereum-compatible responses.

It should not:

- Move balances.
- Increment nonces.
- Write Google Sheets.
- Contain bridge or airdrop business logic.
- Know system contract internals.

### Core Layer

The core layer is the authority for execution.

- `executor.js` accepts transactions, validates them, routes system contract calls, commits state, and records journal events.
- `ledger.js` is the only module allowed to move funds, mint, burn, or increment nonces.
- `state-store.js` owns in-memory state and local snapshots.
- `journal.js` owns the durable append-only transaction/event log.
- `policy.js` owns authorization and protocol rules, such as bridge operator checks and reserved addresses.
- `finalizer.js` tracks external sync status such as Google Sheets confirmation.

Core invariant:

> Only the core ledger/executor can mutate balances, nonces, transaction history, claims, or bridge records.

### System Contracts

System contracts are trusted native modules exposed through Ethereum-like addresses and ABI selectors. They are not user-deployed contracts.

Each contract module should export metadata and handlers:

```js
module.exports = {
  name: 'Bridge',
  address: '0x0000000000000000000000000000000000000003',
  abi: [
    'function bridgeBalance() view returns (uint256)',
    'function bridgeAccount() view returns (address)',
    'function bridgeTransfer(address recipient, uint256 amount)'
  ],

  calls: {
    'bridgeBalance()': async (ctx) => {
      return ctx.ledger.getBalance(ctx.config.bridgeAccountAddress);
    }
  },

  transactions: {
    'bridgeTransfer(address,uint256)': async (ctx) => {
      ctx.policy.requireSender(ctx.tx.from, ctx.config.bridgeOperatorAddress);

      return ctx.ledger.transfer({
        from: ctx.config.bridgeAccountAddress,
        to: ctx.args.recipient,
        amount: ctx.args.amount,
        reason: 'bridgeTransfer',
        txHash: ctx.tx.hash
      });
    }
  }
};
```

System contracts should receive a restricted context:

```js
{
  tx,
  args,
  selector,
  ledger,
  policy,
  config,
  logger
}
```

They should not receive direct access to raw state maps, journal writers, or Google Sheets clients.

### System Contract Registry

The registry should load local system contract modules at startup and validate:

- Every contract address is a valid Ethereum address.
- No two contracts use the same address.
- No duplicate function selector exists for the same address.
- ABI entries are valid.
- Non-view functions have transaction handlers.
- View/pure functions have call handlers.
- Reserved addresses are explicit and intentional.

RPC routing should be simple:

- `eth_call` to a system contract address goes through `registry.call(...)`.
- Transactions to a system contract address go through `registry.transact(...)`.
- Other transactions go through normal value transfer execution.

## State Model

V2 should make the local journal the canonical execution history for the single-node POC.

State should include:

- Accounts: address, balance, nonce.
- Transactions: hash, from, to, value, nonce, status, block number, gas used.
- Claims.
- Bridge records.
- Sync metadata.

In-memory state is derived from the local journal and optional compacted snapshots.

## Transaction Lifecycle

Suggested lifecycle:

```text
received -> validated -> accepted -> included -> sheetSynced
```

Definitions:

- `received`: RPC has received the transaction.
- `validated`: signature, nonce, balance, and policy checks passed.
- `accepted`: transaction was committed to the local durable journal.
- `included`: transaction was applied to local state and assigned a block number.
- `sheetSynced`: the transaction and derived state were confirmed in Google Sheets.

Avoid using `finalized` for Google Sheets sync. In a future multi-node version, finality should mean chain or consensus finality, not spreadsheet export completion.

## Local Journal

The journal should be append-only and durable. Every accepted transaction should be written locally before the RPC node returns success.

Example event:

```json
{
  "type": "tx.accepted",
  "txHash": "0x...",
  "blockNumber": 42,
  "timestamp": "2026-05-14T12:00:00.000Z",
  "tx": {
    "from": "0x...",
    "to": "0x...",
    "value": "1000000000000000000",
    "nonce": 1,
    "data": "0x"
  },
  "effects": [
    {
      "type": "transfer",
      "from": "0x...",
      "to": "0x...",
      "amount": "1000000000000000000"
    }
  ],
  "sync": {
    "googleSheets": {
      "status": "pending",
      "syncedAt": null
    }
  }
}
```

On restart:

1. Load the latest snapshot if present.
2. Replay journal events after the snapshot.
3. Rebuild in-memory state.
4. Find unsynced events.
5. Retry Google Sheets sync.

Do not revert accepted local transactions just because Sheets was behind when the process stopped.

## Google Sheets Sync

Google Sheets should be an async external view. It should not be used for hot-path reads or writes.

Recommended behavior:

- Batch sync every 5 seconds by default.
- Flush dirty balances, transactions, claims, and bridge records together.
- Use `txHash` as the idempotency key for transaction rows.
- If a row already exists for a tx hash, treat it as synced.
- Retry quota/throttle failures with exponential backoff.
- Keep serving RPC from local state while Sheets is stale.
- Attempt a final flush during graceful shutdown, but do not depend on it for correctness.

This avoids Google Sheets throttling while preserving the spreadsheet as a public visualization and audit target.

## Core Ledger Rules

The ledger should enforce:

- Address normalization.
- No negative balances.
- No overdrafts.
- Nonce sequencing.
- Duplicate transaction hash handling.
- Reserved/system address rules.
- Atomic mutation per accepted transaction.
- Journal write before RPC success.
- Deterministic effects for replay.

System contracts must express intent through ledger methods such as:

```js
ledger.transfer({ from, to, amount, reason, txHash });
ledger.mint({ to, amount, reason, txHash });
ledger.burn({ from, amount, reason, txHash });
```

They must not update balances or nonces directly.

## Multiple RPC Nodes Later

The single-node POC should be designed so the local journal can later be replaced by a shared ordering layer.

Migration path:

1. Single node with local journal.
2. Multiple RPC nodes submit transactions to one sequencer.
3. Sequencer assigns canonical order and block numbers.
4. Nodes replay the shared ordered log.
5. Google Sheets sync remains an external view.

Possible future shared logs:

- Postgres.
- Redis Streams.
- Kafka.
- NATS JetStream.
- A dedicated sequencer service.

The important design rule is that transaction execution consumes ordered events. If that boundary exists, replacing the local journal later is manageable.

## Initial Test Plan

V2 should start with tests for:

- Value transfer updates balances and nonce.
- Insufficient balance rejects without state mutation.
- Invalid nonce rejects without state mutation.
- Duplicate transaction hash is handled consistently.
- Accepted transactions are written to the journal before success.
- Restart rebuilds state from the journal.
- Unsynced transactions retry Google Sheets sync.
- Google Sheets sync is idempotent by tx hash.
- System contract address collisions fail startup.
- System contract selector collisions fail startup.
- System contracts cannot directly mutate state.
- Bridge operator policy rejects unauthorized bridge transfers.

## Implementation Plan

See [IMPLEMENTATION.md](./IMPLEMENTATION.md) for the milestone-by-milestone build plan and required tests for each task.

## Reference Implementation

Use `../rpc-node` as the behavior reference, especially for:

- Supported JSON-RPC methods.
- Bridge behavior.
- Airdrop behavior.
- Google Sheets schema.
- MetaMask compatibility quirks.

Do not copy the existing coupling between RPC handling, Sheets operations, and business logic.
