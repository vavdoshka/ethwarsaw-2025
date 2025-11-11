import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Hardhat Ignition module for deploying TokenLock contract
 *
 * Usage:
 * npx hardhat ignition deploy ignition/modules/TokenLock.ts --network bscTestnet
 *
 * Set environment variables in .env:
 * - TOKEN_ADDRESS: The ERC20 token address to lock
 * - OWNER_ADDRESS: The owner address for the contract (optional, defaults to deployer)
 */
const TokenLockModule = buildModule("TokenLockModule", (m) => {
  // Get parameters with defaults
  const tokenAddress = m.getParameter(
    "tokenAddress",
    process.env.TOKEN_ADDRESS || ""
  );

  const ownerAddress = m.getParameter(
    "ownerAddress",
    process.env.OWNER_ADDRESS || ""
  );

  // Validate token address is provided
  if (!tokenAddress) {
    throw new Error("TOKEN_ADDRESS must be provided in environment variables or as a parameter");
  }

  // Deploy TokenLock contract
  const tokenLock = m.contract("TokenLock", [tokenAddress, ownerAddress]);

  return { tokenLock };
});

export default TokenLockModule;
