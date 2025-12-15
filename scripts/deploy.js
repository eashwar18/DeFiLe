import hre from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🚀 Deploying DeFiLe contract to", hre.network.name);

  const [deployer] = await hre.ethers.getSigners();
  console.log("📍 Deploying with account:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("💰 Account balance:", hre.ethers.formatEther(balance), "ETH");

  if (balance === 0n) {
    console.error("❌ Error: Insufficient balance. Please fund your account.");
    process.exit(1);
  }

  // Deploy the contract
  console.log("\n⏳ Deploying DeFiLe contract...");
  const DeFiLe = await hre.ethers.getContractFactory("DeFiLe");
  const defile = await DeFiLe.deploy();
  
  await defile.waitForDeployment();
  const contractAddress = await defile.getAddress();
  
  console.log("✅ DeFiLe deployed to:", contractAddress);
  
  // Save deployment info
  const deploymentInfo = {
    network: hre.network.name,
    contractAddress: contractAddress,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    blockNumber: await hre.ethers.provider.getBlockNumber(),
  };

  // Create deployments directory if it doesn't exist
  const deploymentsDir = path.join(process.cwd(), 'deployments');
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir);
  }

  // Save deployment info to file
  const deploymentPath = path.join(deploymentsDir, `${hre.network.name}.json`);
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  
  console.log("\n📋 Deployment Summary:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Network:", hre.network.name);
  console.log("Contract Address:", contractAddress);
  console.log("Deployer:", deployer.address);
  console.log("Block Number:", deploymentInfo.blockNumber);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  
  console.log("\n🔗 View on Explorer:");
  if (hre.network.name === "sepolia") {
    console.log(`https://sepolia.etherscan.io/address/${contractAddress}`);
  } else if (hre.network.name === "zkSyncSepolia") {
    console.log(`https://sepolia.explorer.zksync.io/address/${contractAddress}`);
  }
  
  console.log("\n💾 Deployment info saved to:", deploymentPath);
  
  console.log("\n✨ Next Steps:");
  console.log("1. Wait a few minutes for the contract to be indexed");
  console.log("2. Verify your contract (optional):");
  console.log(`   npx hardhat verify --network ${hre.network.name} ${contractAddress}`);
  console.log("3. Update your frontend with the contract address");
  console.log("4. Test the contract on testnet!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });