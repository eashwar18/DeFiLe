import { config as dotenvConfig } from "dotenv";
import "@nomicfoundation/hardhat-toolbox";

dotenvConfig();

/** @type import('hardhat/config').HardhatUserConfig */
export default {
  solidity: "0.8.20",
  networks: {
    zkSyncSepolia: {
      type: "http",
      url: process.env.ZKSYNC_SEPOLIA_RPC_URL || "https://sepolia.era.zksync.dev",
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : []
    },
    sepolia: {
      type: "http",
      url: process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org",
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : []
    },
    localhost: {
      type: "edr-simulated",
      url: "http://127.0.0.1:8545"
    }
  },
  paths: {
    tests: "./test"
  }
};