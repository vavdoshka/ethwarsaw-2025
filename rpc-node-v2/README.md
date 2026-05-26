# rpc-node-v2

Minimal Ethereum-like RPC node for SheetChain with:
- local durable state in SQLite
- optional Google Sheets export
- MetaMask-compatible JSON-RPC surface for basic transfers

## Requirements

- Node.js `22.x`
- npm
- (optional) Google service account JSON for Sheets sync

## Install

From `rpc-node-v2`:

```bash
npm install
```

## Run (local only, no Sheets)

```bash
SQLITE_ENABLED=1 \
SQLITE_DB_PATH=./rpc-node-v2-data/state.sqlite3 \
CHAIN_ID=123456 \
PORT=8545 \
GENESIS_FILE_PATH=./genesis.json \
SYNC_INTERVAL_MS=5000 \
node src/rpc/server.js
```

Health check:

```bash
curl -s http://127.0.0.1:8545/health
```

## Run with Google Sheets sync

```bash
GOOGLE_SHEET_ID='YOUR_SPREADSHEET_ID' \
GOOGLE_APPLICATION_CREDENTIALS='./cred/your-service-account.json' \
GOOGLE_SHEET_NAME='sheet-dev' \
SQLITE_ENABLED=1 \
SQLITE_DB_PATH=./rpc-node-v2-data/state.sqlite3 \
CHAIN_ID=123456 \
PORT=8545 \
GENESIS_FILE_PATH=./genesis.json \
SYNC_INTERVAL_MS=5000 \
node src/rpc/server.js
```

Where `GOOGLE_SHEET_ID` is the ID from:
`https://docs.google.com/spreadsheets/d/<THIS_PART>/edit`

Share the spreadsheet with the service account email from your JSON credentials.

## Reset sheet tabs on startup

If you want a clean sheet layout on startup:

```bash
GOOGLE_SHEET_RESET=1
```

With reset enabled, node recreates managed tabs and then backfills from local DB.
Managed tabs:
- `<GOOGLE_SHEET_NAME>_tx`
- `<GOOGLE_SHEET_NAME>_genesis`
- `<GOOGLE_SHEET_NAME>_state`
- `<GOOGLE_SHEET_NAME>_claims`
- `<GOOGLE_SHEET_NAME>_bridge`

After first run, unset `GOOGLE_SHEET_RESET` to avoid clearing tabs on every restart.

## Fully fresh start (DB + Sheet)

Stop node, then:

```bash
rm -f ./rpc-node-v2-data/state.sqlite3 ./rpc-node-v2-data/state.sqlite3-shm ./rpc-node-v2-data/state.sqlite3-wal
```

Start node with `GOOGLE_SHEET_RESET=1`.

## MetaMask setup

Add custom network:
- RPC URL: `http://127.0.0.1:8545`
- Chain ID: `123456` (or your `CHAIN_ID`)
- Currency symbol: `SHEET` (optional)

Import an account present in `genesis.json` to see funded balance immediately.

## Useful logs

At startup:
- `startup.genesis`
- `startup.sqlite`
- `startup.sheets.init.start`
- `startup.sheets.init.done`
- `startup.sheets.backfill`

During runtime:
- `rpc.call`
- `sync.interval.tick`

## Scripts

```bash
npm test
npm run test:integration:soak
npm run test:integration:live-sheets
npm run test:integration:live-sheets-sweep
npm run test:integration:live-sheets-soak
```

## Notes

- Source of truth: **SQLite DB**
- Sheets are an async external view/export
- Credentials are ignored by git via:
  - root `.gitignore`: `rpc-node-v2/cred/`
  - local `.gitignore`: `cred/`
