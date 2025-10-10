import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import { PublicKey } from "@solana/web3.js";
import { createHash } from "crypto";

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function safeGetTokenAmount(
  connection: anchor.web3.Connection,
  ata: PublicKey
): Promise<string> {
  try {
    const res = await connection.getTokenAccountBalance(ata);
    return res.value.amount;
  } catch (e) {
    return "0";
  }
}

function parseTokensLockedFromLogs(
  logs: string[]
): { sender: PublicKey; amount: BN } | null {
  const discriminator = Buffer.from(
    createHash("sha256").update("event:TokensLocked").digest().slice(0, 8)
  );
  for (const line of logs) {
    const prefix = "Program data: ";
    const idx = line.indexOf(prefix);
    if (idx === -1) continue;
    const b64 = line.slice(idx + prefix.length).trim();
    let data: Buffer;
    try {
      data = Buffer.from(b64, "base64");
    } catch {
      continue;
    }
    if (data.length < 8) continue;
    if (!data.subarray(0, 8).equals(discriminator)) continue;
    const rest = data.subarray(8);
    if (rest.length < 32 + 8) continue;
    const sender = new PublicKey(rest.subarray(0, 32));
    const amount = new BN(rest.subarray(32, 40), "le");
    return { sender, amount };
  }
  return null;
}

export async function captureEventFromTransaction(
  connection: anchor.web3.Connection,
  signature: string,
  sleepMs: number = 500
) {
  await connection.confirmTransaction(signature, "finalized");
  await sleep(sleepMs);

  const tx = await connection.getTransaction(signature, {
    commitment: "finalized",
    maxSupportedTransactionVersion: 0,
  });
  const logs = tx?.meta?.logMessages ?? [];
  return parseTokensLockedFromLogs(logs);
}

