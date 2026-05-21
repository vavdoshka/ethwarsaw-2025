# RPC Node V2 Compatibility Notes

This document tracks compatibility against `../rpc-node` and intentional behavior changes in V2.

## Supported RPC Surface (Current)

- `eth_chainId`
- `net_version`
- `eth_getBalance`
- `eth_getTransactionCount`
- `eth_blockNumber`
- `eth_getBlockByNumber`
- `eth_sendTransaction`
- `eth_sendRawTransaction`
- `eth_getTransactionByHash`
- `eth_getTransactionReceipt`
- `eth_call`

HTTP endpoints:

- `GET /health`
- `GET /status`

## Intentional Behavior Changes

1. Google Sheets is not a source of truth
- V2 executes and persists locally first (SQLite + journal), then exports to Sheets asynchronously.

2. Sync finalization semantics
- Transaction is accepted before Sheets export.
- Sync status is tracked separately and only marked synced after confirmed export.

3. Shutdown behavior
- During drain, write RPC calls are rejected with `-32000` while in-flight writes are allowed to complete.

4. Block model
- Blocks are persisted in SQLite with deterministic block hashes based on parent hash and ordered tx hashes.

5. Outbox/retry model
- Sheets export uses SQLite outbox states: `pending`, `in_flight`, `failed`, `dead_letter`, `synced`.

## Test Coverage Pointers

- Core RPC methods: `test/rpc/methods.test.js`
- Unsupported method behavior: `test/rpc/methods.test.js`
- Shutdown/drain behavior: `test/rpc/shutdown.test.js`
- Status endpoint: `test/rpc/status.test.js`
- Bridge system contract: `test/system-contracts/bridge.test.js`
- Airdrop system contract: `test/system-contracts/airdrop.test.js`
- End-to-end tx + sync path: `test/integration/ethers-sheets.integration.test.js`
