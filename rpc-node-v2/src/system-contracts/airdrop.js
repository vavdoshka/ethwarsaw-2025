const { ethers } = require("ethers");
const { pad32Hex } = require("../utils/hex");

module.exports = {
  name: "Airdrop",
  address: "0x0000000000000000000000000000000000000001",
  abi: [
    "function totalClaimants() view returns (uint256)",
    "function hasClaimed(address user) view returns (bool)",
    "function claimAirdropEthWarsaw2025()"
  ],
  calls: {
    "totalClaimants()": async (ctx) => {
      return pad32Hex(BigInt(ctx.state.claims.size));
    },
    "hasClaimed(address)": async (ctx) => {
      const user = String(ctx.args[0]).toLowerCase();
      const claim = ctx.state.getClaim(`airdrop:${user}`);
      return claim ? pad32Hex(1n) : pad32Hex(0n);
    }
  },
  transactions: {
    "claimAirdropEthWarsaw2025()": async (ctx) => {
      const claimer = ctx.tx.from.toLowerCase();
      const claimId = `airdrop:${claimer}`;
      if (ctx.state.getClaim(claimId)) {
        throw new Error("Airdrop already claimed");
      }
      const amount = BigInt(ctx.config.airdropAmountWei || ethers.parseEther("0.01"));
      ctx.ledger.mint({ to: claimer, amount });
      ctx.state.addClaim(claimId, {
        claimId,
        address: claimer,
        amount: amount.toString(),
        status: "completed"
      });
      return { ok: true, claimId, amount: amount.toString() };
    }
  }
};
