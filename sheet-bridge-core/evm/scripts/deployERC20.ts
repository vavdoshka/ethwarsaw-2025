import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

// ========================================
// TOKEN CONFIGURATION
// ========================================
const TOKEN_CONFIG = {
  name: "Sheet Token",
  symbol: "SHEET",
  decimals: 18,
  initialSupply: "1000000",
  imageUrl: process.env.TOKEN_IMAGE_URL || '',
  initialHolder: process.env.INITIAL_HOLDER,
};
// ========================================

async function main() {
  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying ERC20 token with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // Determine initial token holder
  const initialHolder = TOKEN_CONFIG.initialHolder || deployer.address;

  // Calculate initial supply with decimals
  const initialSupplyWithDecimals = ethers.parseUnits(
    TOKEN_CONFIG.initialSupply,
    TOKEN_CONFIG.decimals
  );

  console.log("\n========================================");
  console.log("Token Configuration");
  console.log("========================================");
  console.log("Name:", TOKEN_CONFIG.name);
  console.log("Symbol:", TOKEN_CONFIG.symbol);
  console.log("Decimals:", TOKEN_CONFIG.decimals);
  console.log("Initial Supply:", TOKEN_CONFIG.initialSupply, "tokens");
  console.log("Initial Supply (with decimals):", initialSupplyWithDecimals.toString(), "smallest units");
  console.log("Initial Holder:", initialHolder);
  if (TOKEN_CONFIG.imageUrl) {
    console.log("Image URL (for BSCScan registration):", TOKEN_CONFIG.imageUrl);
  }
  console.log("========================================\n");

  // Deploy the token contract
  console.log("Deploying ERC20 token...");
  const ERC20Token = await ethers.getContractFactory("ERC20Token");
  const token = await ERC20Token.deploy(
    TOKEN_CONFIG.name,
    TOKEN_CONFIG.symbol,
    TOKEN_CONFIG.decimals,
    initialSupplyWithDecimals
  );

  await token.waitForDeployment();

  const tokenAddress = await token.getAddress();
  console.log("ERC20 token deployed to:", tokenAddress);

  // If initial holder is different from deployer, transfer tokens
  if (initialHolder !== deployer.address) {
    console.log("\nTransferring initial supply to:", initialHolder);
    const transferTx = await token.transfer(initialHolder, initialSupplyWithDecimals);
    await transferTx.wait();
    console.log("Transfer completed!");
  }

  // Verify deployment
  const totalSupply = await token.totalSupply();
  const holderBalance = await token.balanceOf(initialHolder);

  console.log("\n========================================");
  console.log("Deployment Summary");
  console.log("========================================");
  console.log("Token Address:", tokenAddress);
  console.log("Token Name:", await token.name());
  console.log("Token Symbol:", await token.symbol());
  console.log("Decimals:", await token.decimals());
  console.log("Total Supply:", ethers.formatUnits(totalSupply, TOKEN_CONFIG.decimals), "tokens");
  console.log("Initial Holder:", initialHolder);
  console.log("Initial Holder Balance:", ethers.formatUnits(holderBalance, TOKEN_CONFIG.decimals), "tokens");
  console.log("Deployer:", deployer.address);
  console.log("========================================");

  // Save deployment info
  const deploymentInfo = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    tokenAddress: tokenAddress,
    tokenName: TOKEN_CONFIG.name,
    tokenSymbol: TOKEN_CONFIG.symbol,
    decimals: TOKEN_CONFIG.decimals,
    initialSupply: TOKEN_CONFIG.initialSupply,
    initialSupplyWithDecimals: initialSupplyWithDecimals.toString(),
    initialHolder: initialHolder,
    imageUrl: TOKEN_CONFIG.imageUrl,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
  };

  const fs = require("fs");
  const path = require("path");
  const deploymentsDir = path.join(__dirname, "../deployments");

  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir);
  }

  const filename = `erc20-deployment-${Date.now()}.json`;
  fs.writeFileSync(
    path.join(deploymentsDir, filename),
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log(`\nDeployment info saved to: deployments/${filename}`);

  // Verification instructions
  const networkName = (await ethers.provider.getNetwork()).name;
  console.log("\nTo verify the contract on the block explorer, run:");
  console.log(`npx hardhat verify --network ${networkName} ${tokenAddress} "${TOKEN_CONFIG.name}" "${TOKEN_CONFIG.symbol}" ${TOKEN_CONFIG.decimals} "${initialSupplyWithDecimals}"`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
