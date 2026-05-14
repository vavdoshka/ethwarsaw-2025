const { ethers } = require("ethers");
const { toHexQuantity } = require("../utils/hex");

function createRpcMethods({ config, state, executor, contracts }) {
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
        hash: parsed.hash
      }).transactionHash;
    },
    async eth_getTransactionByHash(params) {
      const [txHash] = params;
      const tx = state.getTransaction(txHash);
      if (!tx) return null;
      return {
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: toHexQuantity(BigInt(tx.value)),
        nonce: toHexQuantity(tx.nonce),
        blockNumber: toHexQuantity(tx.blockNumber)
      };
    },
    async eth_getTransactionReceipt(params) {
      const [txHash] = params;
      const tx = state.getTransaction(txHash);
      if (!tx) return null;
      return {
        transactionHash: tx.hash,
        blockNumber: toHexQuantity(tx.blockNumber),
        status: tx.status || "0x1",
        from: tx.from,
        to: tx.to,
        gasUsed: toHexQuantity(21000)
      };
    },
    async eth_call(params) {
      const [callTx] = params;
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
