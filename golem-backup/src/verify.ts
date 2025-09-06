import dotenv from "dotenv";
dotenv.config();

import { connectGolem } from "./golem";

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: bun run src/verify.ts <entityKey|batchId>");
    process.exit(1);
  }

  const chainId = Number(process.env.CHAIN_ID || 60138453033);
  const rpcUrl =
    process.env.RPC_URL || "https://ethwarsaw.holesky.golemdb.io/rpc";
  const wsUrl =
    process.env.WS_URL || "wss://ethwarsaw.holesky.golemdb.io/rpc/ws";
  const privateKey = process.env.PRIVATE_KEY || "";
  if (!privateKey) {
    throw new Error("PRIVATE_KEY is required");
  }

  const client = await connectGolem({
    chainId,
    privateKeyHex: privateKey,
    rpcUrl,
    wsUrl,
  });

  if (arg.startsWith("0x")) {
    const entityKey = arg;
    const meta = await client.getEntityMetaData(entityKey);
    const storage = await client.getStorageValue(entityKey);
    const text = new TextDecoder().decode(storage);
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {}

    console.log("Meta:", meta);
    if (parsed) {
      console.log("Snapshot:", {
        sheet: parsed.sheet,
        headerLength: parsed.header?.length,
        rowsCount: parsed.rows?.length,
        createdAt: parsed.createdAt
          ? new Date(parsed.createdAt).toISOString()
          : undefined,
      });
    } else {
      console.log("Raw data:", text);
    }
  } else {
    const batchId = arg;
    const results = await client.queryEntities(
      `batchId = "${batchId}" && type = "sheet-backup"`
    );
    console.log(`Found ${results.length} entities for batchId ${batchId}`);
    for (const entity of results) {
      const text = new TextDecoder().decode(entity.storageValue);
      let parsed: any = null;
      try {
        parsed = JSON.parse(text);
      } catch {}
      console.log({
        entityKey: entity.entityKey,
        sheet: parsed?.sheet,
        headerLength: parsed?.header?.length,
        rowsCount: parsed?.rows?.length,
        createdAt: parsed?.createdAt
          ? new Date(parsed.createdAt).toISOString()
          : undefined,
      });
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
