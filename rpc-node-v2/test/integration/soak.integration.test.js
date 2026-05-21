const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("ethers");
const { createServer } = require("../../src/rpc/server");
const { makeTempDir } = require("../helpers");

test("integration: soak with sheets disabled reports throughput", async () => {
  if (process.env.RUN_SOAK_TEST !== "1") return;
  const durationMs = Number.parseInt(process.env.SOAK_DURATION_MS || "5000", 10);
  const dir = makeTempDir();
  const journalPath = path.join(dir, "journal.jsonl");
  const dbPath = path.join(dir, "state.sqlite3");
  const genesisPath = path.join(dir, "genesis.json");

  const sender = ethers.Wallet.createRandom();
  const recipient = ethers.Wallet.createRandom();
  fs.writeFileSync(genesisPath, JSON.stringify({
    accounts: [{ address: sender.address, balance: String(10_000_000n), nonce: 0 }]
  }));

  const { app } = createServer({
    journalPath,
    genesisPath,
    env: { CHAIN_ID: "12345", PORT: "8545", SQLITE_ENABLED: "1", SQLITE_DB_PATH: dbPath }
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  try {
    const provider = new ethers.JsonRpcProvider(`http://127.0.0.1:${server.address().port}`);
    let nonce = 0;
    let accepted = 0;
    const startedAt = Date.now();
    while (Date.now() - startedAt < durationMs) {
      const signed = await sender.signTransaction({
        to: recipient.address, value: 1n, nonce, gasLimit: 21000, gasPrice: 1n, chainId: 12345
      });
      await provider.send("eth_sendRawTransaction", [signed]);
      nonce += 1;
      accepted += 1;
    }
    const tps = accepted / (durationMs / 1000);
    console.log("[soak] accepted=", accepted, "durationMs=", durationMs, "tps=", tps.toFixed(2));
    assert.ok(accepted > 0);
  } finally {
    await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
});

test("integration: restart during soak recovers sqlite state", async () => {
  if (process.env.RUN_SOAK_TEST !== "1") return;
  const dir = makeTempDir();
  const journalPath = path.join(dir, "journal.jsonl");
  const dbPath = path.join(dir, "state.sqlite3");
  const genesisPath = path.join(dir, "genesis.json");

  const sender = ethers.Wallet.createRandom();
  const recipient = ethers.Wallet.createRandom();
  fs.writeFileSync(genesisPath, JSON.stringify({
    accounts: [{ address: sender.address, balance: String(10_000_000n), nonce: 0 }]
  }));

  const makeServer = () => createServer({
    journalPath,
    genesisPath,
    env: { CHAIN_ID: "12345", PORT: "8545", SQLITE_ENABLED: "1", SQLITE_DB_PATH: dbPath }
  });

  let built = makeServer();
  let server = await new Promise((resolve) => {
    const s = built.app.listen(0, () => resolve(s));
  });

  try {
    let provider = new ethers.JsonRpcProvider(`http://127.0.0.1:${server.address().port}`);
    for (let nonce = 0; nonce < 25; nonce += 1) {
      const signed = await sender.signTransaction({
        to: recipient.address, value: 1n, nonce, gasLimit: 21000, gasPrice: 1n, chainId: 12345
      });
      await provider.send("eth_sendRawTransaction", [signed]);
    }
    await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));

    built = makeServer();
    server = await new Promise((resolve) => {
      const s = built.app.listen(0, () => resolve(s));
    });
    provider = new ethers.JsonRpcProvider(`http://127.0.0.1:${server.address().port}`);
    const nonceHex = await provider.send("eth_getTransactionCount", [sender.address, "latest"]);
    assert.equal(Number.parseInt(nonceHex, 16), 25);
  } finally {
    await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
});
