import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  // Get configuration from environment variables
  const tokenAddress = process.env.TOKEN_ADDRESS;
  const ownerAddress = process.env.OWNER_ADDRESS;

  if (!tokenAddress) {
    throw new Error("TOKEN_ADDRESS environment variable is required");
  }

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // Use deployer as owner if not specified
  const finalOwnerAddress = ownerAddress || deployer.address;

  console.log("\nDeployment parameters:");
  console.log("- Token Address:", tokenAddress);
  console.log("- Owner Address:", finalOwnerAddress);

  // Deploy TokenLock contract
  console.log("\nDeploying TokenLock contract...");
  const TokenLock = await ethers.getContractFactory("TokenLock");
  const tokenLock = await TokenLock.deploy(tokenAddress, finalOwnerAddress);

  await tokenLock.waitForDeployment();

  const contractAddress = await tokenLock.getAddress();
  console.log("TokenLock deployed to:", contractAddress);

  // Display deployment summary
  console.log("\n========================================");
  console.log("Deployment Summary");
  console.log("========================================");
  console.log("TokenLock Contract:", contractAddress);
  console.log("Bridge Token:", tokenAddress);
  console.log("Owner:", finalOwnerAddress);
  console.log("========================================");

  // Save deployment info to a file
  const deploymentInfo = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    tokenLock: contractAddress,
    bridgeToken: tokenAddress,
    owner: finalOwnerAddress,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
  };

  const fs = require("fs");
  const path = require("path");
  const deploymentsDir = path.join(__dirname, "../deployments");

  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir);
  }

  const filename = `deployment-${Date.now()}.json`;
  fs.writeFileSync(
    path.join(deploymentsDir, filename),
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log(`\nDeployment info saved to: deployments/${filename}`);

  // Verification instructions
  console.log("\nTo verify the contract on BSCScan, run:");
  console.log(`npx hardhat verify --network ${deploymentInfo.network} ${contractAddress} "${tokenAddress}" "${finalOwnerAddress}"`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
