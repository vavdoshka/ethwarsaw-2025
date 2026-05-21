# SheetChain RPC Node V2 Implementation Plan

Build V2 in small milestones. Each milestone should land with tests before moving to the next one.

## 1. Project Skeleton

Deliverables:

- Create `package.json` and basic Node.js test runner setup.
- Add `src/config`, `src/utils`, `src/core`, `src/rpc`, `src/system-contracts`, and `src/sync` folders.
- Add shared logger, address, and hex utilities.
- Add a minimal health endpoint or startup smoke path.

Tests:

- Config loads defaults without environment variables.
- Config rejects invalid chain id values.
- Address utility normalizes valid addresses.
- Address utility rejects invalid addresses.
- Hex utility encodes bigint values as Ethereum hex quantities.

## 2. In-Memory State Store

Deliverables:

- Implement account, transaction, claim, bridge, and sync metadata storage.
- Keep state mutations internal to the store API.
- Support snapshot export/import for later persistence.

Tests:

- Empty state returns zero balance and zero nonce.
- Setting an account can be read back normalized by lowercase address.
- Snapshot export/import preserves balances, nonces, transactions, and sync metadata.
- Store rejects invalid addresses.
- Store does not expose mutable internal maps directly.

## 3. Core Ledger

Deliverables:

- Implement `ledger.transfer`, `ledger.mint`, `ledger.burn`, and read helpers.
- Enforce no overdrafts, no negative balances, and normalized addresses.
- Keep nonce changes explicit and centralized.

Tests:

- Transfer debits sender and credits receiver.
- Transfer rejects insufficient balance.
- Transfer rejects zero or negative amount.
- Mint credits recipient without touching another account.
- Burn rejects insufficient balance.
- Failed ledger operations leave state unchanged.

## 4. Policy Layer

Deliverables:

- Implement sender authorization helpers.
- Add reserved/system address checks.
- Add bridge operator policy.
- Add nonce validation policy.

Tests:

- `requireSender` accepts matching sender.
- `requireSender` rejects non-matching sender.
- Bridge operator policy accepts configured operator.
- Bridge operator policy rejects unauthorized sender.
- Nonce policy accepts exact next nonce.
- Nonce policy rejects stale and future nonces.

## 5. Local Journal

Deliverables:

- Implement append-only local journal.
- Write JSONL events to disk.
- Support replay from disk.
- Add idempotency checks by tx hash.

Tests:

- Appending an event writes one JSONL record.
- Replaying journal returns events in original order.
- Corrupt journal line fails startup with a clear error.
- Duplicate tx hash is detected.
- Journal fsync/write failure prevents tx acceptance.

## 6. Core Executor

Deliverables:

- Implement normal value transaction execution.
- Validate sender, nonce, balance, and duplicate hash.
- Assign block numbers.
- Write journal event before reporting accepted transaction.
- Apply effects to in-memory state.

Tests:

- Valid value transaction is accepted and included.
- Accepted transaction increments sender nonce.
- Accepted transaction writes journal before success.
- Insufficient balance rejects without journal write.
- Invalid nonce rejects without journal write.
- Duplicate tx hash rejects or returns existing result consistently.
- Block numbers increase monotonically.

## 7. Restart Recovery

Deliverables:

- Add startup recovery from snapshot plus journal replay.
- Rebuild balances, nonces, transactions, and sync metadata.
- Detect pending Google Sheets sync events.

Tests:

- Restart after accepted tx restores balance changes.
- Restart after multiple txs restores block number.
- Unsynced events remain pending after replay.
- Synced events remain marked as synced after replay.
- Replay is deterministic for the same journal.

## 8. System Contract Registry

Deliverables:

- Load trusted local system contract modules.
- Parse ABI with `ethers.Interface`.
- Build address + selector routing tables.
- Validate address and selector collisions at startup.
- Route `eth_call` and transactions separately.

Tests:

- Registry loads a valid contract.
- Duplicate contract address fails startup.
- Duplicate selector for the same address fails startup.
- Invalid ABI fails startup.
- Missing call handler for view function fails startup.
- Missing transaction handler for non-view function fails startup.
- Unknown contract call returns empty result or configured not-found behavior.

## 9. Bridge System Contract

Deliverables:

- Move bridge call and transaction behavior into `system-contracts/bridge.js`.
- Support `bridgeBalance()`, `bridgeAccount()`, and `bridgeTransfer(address,uint256)`.
- Enforce bridge operator through `policy`.
- Move funds only through `ledger`.

Tests:

- `bridgeBalance()` returns encoded bridge balance.
- `bridgeAccount()` returns encoded bridge account address.
- Authorized `bridgeTransfer` moves funds from bridge account to recipient.
- Unauthorized `bridgeTransfer` rejects without state mutation.
- `bridgeTransfer` rejects if bridge account has insufficient balance.
- Bridge contract cannot mutate state without ledger methods.

## 10. Airdrop System Contract

Deliverables:

- Move airdrop behavior into `system-contracts/airdrop.js`.
- Support current read calls from the existing frontend.
- Implement claim execution through executor/ledger.
- Track claim status in core state.

Tests:

- Airdrop read methods return ABI-encoded values.
- First claim mints or transfers configured amount.
- Duplicate claim by same address rejects.
- Claim counter increments only for successful claims.
- Failed claim leaves balances and claim state unchanged.

## 11. RPC Server

Deliverables:

- Implement JSON-RPC server with batch support.
- Support current required methods from `rpc-node`.
- Route `eth_call` through system contract registry.
- Route `eth_sendRawTransaction` and `eth_sendTransaction` through executor.
- Keep response formatting MetaMask-compatible.

Tests:

- `eth_chainId` returns configured chain id.
- `net_version` returns configured chain id decimal string.
- `eth_getBalance` reads local state.
- `eth_getTransactionCount` reads local nonce.
- `eth_sendRawTransaction` accepts a valid signed tx.
- `eth_getTransactionByHash` returns accepted tx.
- `eth_getTransactionReceipt` returns receipt for accepted tx.
- Batch requests preserve response ids.
- Unsupported method returns JSON-RPC error.

## 12. Google Sheets Sync

Deliverables:

- Implement async sync worker.
- Batch dirty balances, transactions, claims, and bridge records every 5 seconds.
- Use tx hash as idempotency key for transaction rows.
- Mark events as `sheetSynced` only after confirmed write.
- Retry throttling/quota failures with backoff.

Tests:

- Worker batches multiple accepted txs into one flush cycle.
- Successful flush marks events as `sheetSynced`.
- Failed flush leaves events pending.
- Retry succeeds after transient failure.
- Existing tx hash in Sheets is treated as already synced.
- RPC reads do not call Google Sheets.
- RPC transaction acceptance does not wait for Google Sheets flush.

## 13. Graceful Shutdown

Deliverables:

- Stop accepting new requests during shutdown.
- Finish in-flight executor mutation.
- Attempt final Sheets flush.
- Close journal cleanly.

Tests:

- Shutdown waits for in-flight transaction.
- Shutdown rejects new RPC writes after draining starts.
- Final flush is attempted.
- Failed final flush does not corrupt local journal.

## 14. Compatibility Pass

Deliverables:

- Compare V2 behavior against `rpc-node` for required frontend and bridge flows.
- Document intentional behavior changes.
- Keep old `rpc-node` untouched until V2 is ready.

Tests:

- Existing bridge flow works against V2.
- Existing airdrop flow works against V2.
- Existing MetaMask transfer flow works against V2.
- Existing frontend read calls work against V2.
- README-supported RPC methods have coverage.

## 15. Testnet SQLite Store

Deliverables:

- Add SQLite as the canonical testnet persistence layer.
- Create migrations for `accounts`, `transactions`, `blocks`, `receipts`, `journal_events`, `system_contract_state`, `sync_jobs`, and `sync_checkpoints`.
- Replace in-memory-only canonical state with a SQLite-backed state store.
- Keep in-memory state as an optional read-through cache, not the source of truth.
- Run all account, nonce, transaction, and block mutations inside SQLite transactions.
- Enforce unique constraints for tx hash, block number, and `(block_number, tx_index)`.

Tests:

- Migrations create all required tables and indexes.
- SQLite store loads genesis exactly once.
- Account balances and nonces survive process restart.
- Duplicate tx hash is rejected by a database constraint.
- Failed transaction rolls back all account, tx, block, and sync job writes.
- Multiple sequential transactions produce deterministic persisted state.

## 16. Block Production

Deliverables:

- Group accepted transactions into deterministic blocks.
- Assign `block_number`, `tx_index`, `block_hash`, `parent_hash`, and timestamp.
- Store block headers and receipts in SQLite.
- Generate block hash from parent hash and ordered tx hashes.
- Make RPC block and receipt methods read from persisted block data.

Tests:

- First transaction creates or enters the expected first block.
- Block hash is deterministic for the same parent and tx order.
- Receipts reference persisted block number and tx index.
- `eth_blockNumber` reads latest persisted block.
- `eth_getBlockByNumber` returns persisted block data.
- Restart preserves latest block and receipts.

## 17. SQLite Outbox Sync

Deliverables:

- Replace file checkpoint-based Sheets reliability with a SQLite outbox.
- Insert `sync_jobs` in the same SQLite transaction that commits tx/block state.
- Sync worker claims pending jobs in block order.
- Worker marks jobs as `in_flight`, `synced`, `failed`, or `dead_letter`.
- Persist retry count, last error, next retry time, and synced timestamp.
- Keep Google Sheets as an eventually consistent export target, not the canonical source.

Tests:

- Accepted tx creates a pending sync job atomically.
- Failed tx creates no sync job.
- Worker claims jobs without losing them on crash.
- Successful Sheets write marks jobs synced.
- Failed Sheets write increments retry count and preserves pending data.
- Jobs move to dead letter after max retries.
- Restart resumes pending and in-flight jobs.

## 18. Block-Batched Sheets Export

Deliverables:

- Export by block ranges instead of individual tx retries.
- Write rows with `block_number`, `tx_index`, `tx_hash`, `export_batch_id`, `from`, `to`, `value`, `status`, and timestamp.
- Maintain `last_exported_block` in SQLite.
- On recovery, recheck only incomplete block ranges.
- Keep blind append available only for benchmark/test tabs.
- Use batched dedupe for production-like tabs when recovering incomplete exports.

Tests:

- Worker writes all transactions for a block in one batch.
- Rows include block number and tx index.
- `last_exported_block` advances only after Sheets confirms the full block batch.
- Crash before confirmation retries the incomplete block.
- Crash after confirmation and before checkpoint performs bounded dedupe and does not duplicate completed block rows.
- Blind append mode is disabled by default for production-like exports.

## 19. Testnet Status And Metrics

Deliverables:

- Add `/status` endpoint.
- Report latest block, accepted tx count, pending sync jobs, in-flight sync jobs, dead-letter jobs, last synced block, and sync lag.
- Track basic timing metrics for tx execution, SQLite writes, Sheets sync latency, and quota errors.
- Add structured logs for accepted tx, block creation, sync batch start, sync batch success, sync retry, and sync failure.

Tests:

- `/status` returns latest persisted block.
- `/status` reports pending sync jobs before flush.
- `/status` reports last synced block after flush.
- Sync lag increases when jobs are pending and returns to zero after successful export.
- Quota-style errors are logged and represented in sync job state.

## 20. Testnet Load And Soak Tests

Deliverables:

- Add a repeatable load test for signed transactions through HTTP RPC.
- Add a Sheets export benchmark for block batch sizes.
- Add a soak test that runs for a configurable duration and reports accepted tx/sec, exported tx/sec, sync lag, and failures.
- Keep live Sheets tests gated behind explicit environment variables.

Tests:

- Load test accepts a configured number of signed txs without nonce gaps.
- Soak test can run with Sheets disabled and verify SQLite-only throughput.
- Live Sheets soak test reports first quota failure without breaking regular test runs.
- Restart during soak recovers SQLite state and resumes sync jobs.

## Build Order

Recommended order:

1. Project skeleton.
2. State store.
3. Ledger.
4. Policy.
5. Journal.
6. Executor.
7. Recovery.
8. System contract registry.
9. Bridge contract.
10. Airdrop contract.
11. RPC server.
12. Google Sheets sync.
13. Shutdown.
14. Compatibility pass.
15. SQLite store.
16. Block production.
17. SQLite outbox sync.
18. Block-batched Sheets export.
19. Testnet status and metrics.
20. Testnet load and soak tests.
