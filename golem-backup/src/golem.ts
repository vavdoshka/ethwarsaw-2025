import {
  createClient,
  Annotation,
  Tagged,
  type GolemBaseClient,
  type GolemBaseCreate,
} from "golem-base-sdk";

export interface GolemConfig {
  chainId: number;
  privateKeyHex: string;
  rpcUrl: string;
  wsUrl: string;
}

export async function connectGolem(
  config: GolemConfig
): Promise<GolemBaseClient> {
  const hex = config.privateKeyHex.startsWith("0x")
    ? config.privateKeyHex.slice(2)
    : config.privateKeyHex;
  const privBytes = new Uint8Array(
    hex.match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) || []
  );
  return createClient(
    config.chainId,
    new Tagged("privatekey", privBytes),
    config.rpcUrl,
    config.wsUrl
  );
}

export async function storeSnapshot(
  client: GolemBaseClient,
  opts: {
    sheetName: string;
    header: string[];
    rows: string[][];
    batchId: string;
    btl?: number;
  }
): Promise<string> {
  const payload = new TextEncoder().encode(
    JSON.stringify({
      sheet: opts.sheetName,
      header: opts.header,
      rows: opts.rows,
      createdAt: Date.now(),
    })
  );

  const entity: GolemBaseCreate = {
    data: payload,
    btl: opts.btl ?? 300,
    stringAnnotations: [
      new Annotation("type", "sheet-backup"),
      new Annotation("sheet", opts.sheetName),
      new Annotation("batchId", opts.batchId),
    ],
    numericAnnotations: [],
  };

  const [receipt] = await client.createEntities([entity]);
  return receipt.entityKey;
}
