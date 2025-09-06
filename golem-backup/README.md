Golem DB Google Sheets Backup

Back up a Google Sheet into Golem DB entities on the ETHWarsaw Holesky testnet.

Setup

1. Create .env with connection details (see below).
2. Install dependencies:

```
bun install
```

.env

```
PRIVATE_KEY=0x...
CHAIN_ID=60138453033
RPC_URL=https://ethwarsaw.holesky.golemdb.io/rpc
WS_URL=wss://ethwarsaw.holesky.golemdb.io/rpc/ws

GOOGLE_SHEET_ID=your_sheet_id
# Either provide a path to a key file:
# GOOGLE_APPLICATION_CREDENTIALS=/abs/path/to/key.json
# Or inline credentials:
# GOOGLE_SERVICE_ACCOUNT_EMAIL=...
# GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

SHEET_NAME=Balances
# Or specify multiple (comma-separated). If omitted, defaults to Balances,Transactions,Claims
# SHEETS=Balances,Transactions,Claims
BATCH_SIZE=500
```

Run backup

```
bun run src/backup.ts
```

This stores rows in chunks as entities annotated with type="sheet-backup", sheet=<name>, and a common batchId.
