const { pad32Hex, padAddress32Hex } = require("../utils/hex");

module.exports = {
  name: "Bridge",
  address: "0x0000000000000000000000000000000000000003",
  abi: [
    "function bridgeBalance() view returns (uint256)",
    "function bridgeAccount() view returns (address)",
    "function bridgeTransfer(address recipient, uint256 amount)"
  ],
  calls: {
    "bridgeBalance()": async (ctx) => {
      const balance = ctx.ledger.getBalance(ctx.config.bridgeAccountAddress);
      return pad32Hex(balance);
    },
    "bridgeAccount()": async (ctx) => {
      return padAddress32Hex(ctx.config.bridgeAccountAddress);
    }
  },
  transactions: {
    "bridgeTransfer(address,uint256)": async (ctx) => {
      ctx.policy.requireBridgeOperator(ctx.tx.from);
      const recipient = ctx.args[0];
      const amount = BigInt(ctx.args[1]);
      ctx.ledger.transfer({
        from: ctx.config.bridgeAccountAddress,
        to: recipient,
        amount
      });
      return { ok: true, recipient, amount: amount.toString() };
    }
  }
};
