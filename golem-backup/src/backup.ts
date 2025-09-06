import dotenv from "dotenv";
dotenv.config();

import { randomUUID } from "crypto";
import { GoogleSheetsClient } from "./sheets";
import { connectGolem, storeSnapshot } from "./golem";

async function main() {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID || "";
  const sheetName = process.env.SHEET_NAME || "Balances"; // legacy single-sheet option
  const sheetsListEnv = process.env.SHEETS; // comma-separated list
  const sheetsToBackup = (
    sheetsListEnv
      ? sheetsListEnv.split(",")
      : ["Balances", "Transactions", "Claims"]
  ) // default
    .map((s) => s.trim())
    .filter(Boolean);
  const batchSize = parseInt(process.env.BATCH_SIZE || "500", 10);

  if (!spreadsheetId) throw new Error("GOOGLE_SHEET_ID is required");

  const sheets = new GoogleSheetsClient({ spreadsheetId });
  await sheets.initialize({
    spreadsheetId,
    credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey: process.env.GOOGLE_PRIVATE_KEY,
  });

  const chainId = Number(process.env.CHAIN_ID || 60138453033);
  const rpcUrl =
    process.env.RPC_URL || "https://ethwarsaw.holesky.golemdb.io/rpc";
  const wsUrl =
    process.env.WS_URL || "wss://ethwarsaw.holesky.golemdb.io/rpc/ws";
  const privateKey = process.env.PRIVATE_KEY || "";
  if (!privateKey) throw new Error("PRIVATE_KEY is required");

  const client = await connectGolem({
    chainId,
    privateKeyHex: privateKey,
    rpcUrl,
    wsUrl,
  });

  const owner = await client.getOwnerAddress();
  console.log(`Connected to Golem as ${owner}`);

  const runBatchId = randomUUID();
  const allEntityKeys: { [sheet: string]: string[] } = {};

  for (const currentSheet of sheetsToBackup) {
    console.log(`Reading sheet: ${currentSheet}`);
    const full = await sheets.readRange(`${currentSheet}!A:Z`);
    if (full.length === 0) {
      console.log(`No data found in sheet: ${currentSheet}`);
      continue;
    }

    const header = full[0];
    const rows = full.slice(1);

    const chunks: string[][][] = [];
    for (let i = 0; i < rows.length; i += batchSize) {
      chunks.push(rows.slice(i, i + batchSize));
    }

    const entityKeys: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const ek = await storeSnapshot(client, {
        sheetName: currentSheet,
        header,
        rows: chunks[i],
        batchId: runBatchId,
        btl: 600,
      });
      entityKeys.push(ek);
      console.log(
        `Stored ${currentSheet} batch ${i + 1}/${chunks.length}: ${ek}`
      );
    }

    allEntityKeys[currentSheet] = entityKeys;
  }

  console.log("Backup complete. Batch ID:", runBatchId);
  console.log("Summary: ");
  for (const [sheet, keys] of Object.entries(allEntityKeys)) {
    console.log(`  ${sheet}: ${keys.length} entities`);
  }
  console.log("Entity keys:", allEntityKeys);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
