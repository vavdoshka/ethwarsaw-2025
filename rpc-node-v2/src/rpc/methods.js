const { ethers } = require("ethers");
const { toHexQuantity } = require("../utils/hex");

function createRpcMethods({ config, state, executor, contracts, sqliteStore = null }) {
  function resolveBlockTag(blockTag) {
    if (blockTag === "latest" || blockTag === undefined || blockTag === null) return state.latestBlockNumber;
    if (typeof blockTag === "string" && blockTag.startsWith("0x")) return Number.parseInt(blockTag.slice(2), 16);
    return Number.parseInt(String(blockTag), 10);
  }

  function zeroHash() {
    return "0x0000000000000000000000000000000000000000000000000000000000000000";
  }

  function logsBloomZero() {
    return `0x${"0".repeat(512)}`;
  }

  function blockByNumber(blockNumber, includeTransactions = false) {
    if (blockNumber === 0) {
      return {
        number: "0x0",
        hash: zeroHash(),
        parentHash: zeroHash(),
        timestamp: "0x0",
        transactions: []
      };
    }
    if (sqliteStore && typeof sqliteStore.getBlockByNumber === "function") {
      const block = sqliteStore.getBlockByNumber(blockNumber, { includeTransactions });
      if (!block) return null;
      return {
        number: toHexQuantity(block.number),
        hash: block.hash,
        parentHash: block.parentHash,
        timestamp: toHexQuantity(Math.floor(Date.parse(block.timestamp) / 1000)),
        transactions: block.transactions.map((tx) => {
          if (typeof tx === "string") return tx;
          return {
            hash: tx.hash,
            from: tx.from,
            to: tx.to,
            value: toHexQuantity(BigInt(tx.value)),
            nonce: toHexQuantity(tx.nonce),
            gas: toHexQuantity(tx.gas ?? 21000),
            gasPrice: toHexQuantity(BigInt(tx.gasPrice ?? 1)),
            input: tx.input || "0x",
            blockHash: block.hash,
            blockNumber: toHexQuantity(block.number),
            transactionIndex: toHexQuantity(tx.txIndex)
          };
        })
      };
    }

    const txs = Array.from(state.transactions.values())
      .filter((tx) => tx.blockNumber === blockNumber)
      .sort((a, b) => (a.txIndex || 0) - (b.txIndex || 0));
    if (txs.length === 0) return null;
    return {
      number: toHexQuantity(blockNumber),
      hash: null,
      parentHash: null,
      timestamp: null,
      transactions: includeTransactions
        ? txs.map((tx, idx) => ({
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          value: toHexQuantity(BigInt(tx.value)),
          nonce: toHexQuantity(tx.nonce),
          gas: toHexQuantity(tx.gas ?? 21000),
          gasPrice: toHexQuantity(BigInt(tx.gasPrice ?? 1)),
          input: tx.input || "0x",
          blockHash: tx.blockHash || null,
          blockNumber: toHexQuantity(blockNumber),
          transactionIndex: toHexQuantity(tx.txIndex ?? idx)
        }))
        : txs.map((tx) => tx.hash)
    };
  }

  function txWithMeta(tx) {
    if (!tx) return null;
    const block = Number.isInteger(tx.blockNumber) ? blockByNumber(tx.blockNumber, false) : null;
    return {
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      value: toHexQuantity(BigInt(tx.value)),
      nonce: toHexQuantity(tx.nonce),
      gas: toHexQuantity(tx.gas ?? 21000),
      gasPrice: toHexQuantity(BigInt(tx.gasPrice ?? 1)),
      input: tx.input || "0x",
      blockHash: block?.hash || tx.blockHash || null,
      blockNumber: Number.isInteger(tx.blockNumber) ? toHexQuantity(tx.blockNumber) : null,
      transactionIndex: toHexQuantity(tx.txIndex ?? 0),
      type: tx.type || "0x0"
    };
  }

  return {
    async eth_chainId() {
      return toHexQuantity(config.chainId);
    },
    async net_version() {
      return String(config.chainId);
    },
    async eth_getBalance(params) {
      const [address] = params;
      return toHexQuantity(state.getBalance(address));
    },
    async eth_getTransactionCount(params) {
      const [address] = params;
      return toHexQuantity(state.getNonce(address));
    },
    async eth_blockNumber() {
      return toHexQuantity(state.latestBlockNumber);
    },
    async eth_gasPrice() {
      return toHexQuantity(1n);
    },
    async eth_maxPriorityFeePerGas() {
      return toHexQuantity(1n);
    },
    async eth_feeHistory(params) {
      const [blockCountRaw, newestBlock] = params;
      const blockCount = Math.max(1, Number.parseInt(String(blockCountRaw || 1), 10) || 1);
      const newest = newestBlock === "latest"
        ? state.latestBlockNumber
        : (typeof newestBlock === "string" && newestBlock.startsWith("0x")
          ? Number.parseInt(newestBlock.slice(2), 16)
          : Number.parseInt(String(newestBlock || state.latestBlockNumber), 10));
      const baseFeePerGas = Array.from({ length: blockCount + 1 }, () => toHexQuantity(1n));
      const gasUsedRatio = Array.from({ length: blockCount }, () => 0);
      return {
        oldestBlock: toHexQuantity(Math.max(0, newest - blockCount + 1)),
        baseFeePerGas,
        gasUsedRatio,
        reward: []
      };
    },
    async eth_getBlockByNumber(params) {
      const [blockTag, includeTransactions = false] = params;
      const blockNumber = resolveBlockTag(blockTag);
      if (!Number.isInteger(blockNumber) || blockNumber < 0) return null;
      return blockByNumber(blockNumber, Boolean(includeTransactions));
    },
    async eth_getBlockByHash(params) {
      const [blockHash, includeTransactions = false] = params;
      const tx = Array.from(state.transactions.values()).find((item) => item.blockHash === blockHash);
      if (!tx) {
        if (sqliteStore && typeof sqliteStore.getStatus === "function") {
          const latest = sqliteStore.getStatus().latestBlockNumber;
          for (let bn = 1; bn <= latest; bn += 1) {
            const block = blockByNumber(bn, false);
            if (block && block.hash === blockHash) return blockByNumber(bn, Boolean(includeTransactions));
          }
        }
        return null;
      }
      return blockByNumber(tx.blockNumber, Boolean(includeTransactions));
    },
    async eth_sendTransaction(params) {
      const [tx] = params;
      if (contracts.hasAddress(tx.to)) {
        const txHash = tx.hash || ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({ tx, now: Date.now() })));
        const result = await executor.executeSystemTx(
          { ...tx, hash: txHash },
          () => contracts.transact({
            tx: { ...tx, hash: txHash },
            context: { ledger: executor.ledger, policy: executor.policy, state, config }
          })
        );
        return result.transactionHash;
      }
      return executor.executeValueTx(tx).transactionHash;
    },
    async eth_sendRawTransaction(params) {
      const [rawTx] = params;
      const parsed = ethers.Transaction.from(rawTx);
      return executor.executeValueTx({
        from: parsed.from,
        to: parsed.to,
        value: parsed.value,
        nonce: parsed.nonce,
        hash: parsed.hash,
        gas: parsed.gasLimit ? Number(parsed.gasLimit) : 21000,
        gasPrice: parsed.gasPrice ? parsed.gasPrice.toString() : "1",
        input: parsed.data || "0x",
        type: parsed.type != null ? `0x${Number(parsed.type).toString(16)}` : "0x0"
      }).transactionHash;
    },
    async eth_getTransactionByHash(params) {
      const [txHash] = params;
      const tx = state.getTransaction(txHash);
      if (!tx) return null;
      return txWithMeta(tx);
    },
    async eth_getTransactionByBlockNumberAndIndex(params) {
      const [blockTag, txIndexHex] = params;
      const blockNumber = resolveBlockTag(blockTag);
      if (!Number.isInteger(blockNumber) || blockNumber < 0) return null;
      const idx = typeof txIndexHex === "string" && txIndexHex.startsWith("0x")
        ? Number.parseInt(txIndexHex.slice(2), 16)
        : Number.parseInt(String(txIndexHex || 0), 10);
      const tx = Array.from(state.transactions.values())
        .filter((row) => row.blockNumber === blockNumber)
        .sort((a, b) => (a.txIndex || 0) - (b.txIndex || 0))[idx];
      return txWithMeta(tx || null);
    },
    async eth_getTransactionByBlockHashAndIndex(params) {
      const [blockHash, txIndexHex] = params;
      const idx = typeof txIndexHex === "string" && txIndexHex.startsWith("0x")
        ? Number.parseInt(txIndexHex.slice(2), 16)
        : Number.parseInt(String(txIndexHex || 0), 10);
      const tx = Array.from(state.transactions.values())
        .filter((row) => row.blockHash === blockHash)
        .sort((a, b) => (a.txIndex || 0) - (b.txIndex || 0))[idx];
      return txWithMeta(tx || null);
    },
    async eth_getTransactionReceipt(params) {
      const [txHash] = params;
      const tx = state.getTransaction(txHash);
      if (!tx) return null;
      const block = Number.isInteger(tx.blockNumber) ? blockByNumber(tx.blockNumber, false) : null;
      return {
        transactionHash: tx.hash,
        transactionIndex: toHexQuantity(tx.txIndex ?? 0),
        blockHash: block?.hash || tx.blockHash || null,
        blockNumber: toHexQuantity(tx.blockNumber),
        status: tx.status || "0x1",
        from: tx.from,
        to: tx.to,
        cumulativeGasUsed: toHexQuantity(21000),
        gasUsed: toHexQuantity(21000),
        effectiveGasPrice: toHexQuantity(BigInt(tx.gasPrice ?? 1)),
        contractAddress: null,
        logs: [],
        logsBloom: logsBloomZero(),
        type: tx.type || "0x0"
      };
    },
    async eth_estimateGas() {
      return toHexQuantity(21000);
    },
    async eth_getLogs() {
      return [];
    },
    async eth_getCode(params) {
      const [address] = params;
      if (!address) return "0x";
      if (contracts.hasAddress(address)) {
        // Any non-empty bytecode-like marker is enough for wallet contract checks.
        return "0x60006000";
      }
      return "0x";
    },
    async eth_call(params) {
      const [callTx] = params;
      if (!callTx || !callTx.to) return "0x";
      return contracts.call({
        to: callTx.to,
        data: callTx.data,
        context: { ledger: executor.ledger, policy: executor.policy, state, config }
      });
    }
  };
}

module.exports = {
  createRpcMethods
};
