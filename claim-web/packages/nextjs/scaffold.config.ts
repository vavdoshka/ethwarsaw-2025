import { defineChain } from "viem";
import * as chains from "viem/chains";

export type BaseConfig = {
  targetNetworks: readonly chains.Chain[];
  pollingInterval: number;
  alchemyApiKey: string;
  rpcOverrides?: Record<number, string>;
  walletConnectProjectId: string;
  onlyLocalBurnerWallet: boolean;
};

export type ScaffoldConfig = BaseConfig;

export const DEFAULT_ALCHEMY_API_KEY = "oKxs-03sij-U_N0iOlrSsZFr29-IqbuF";

// Define your custom local network
const DEFAULT_RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ||
  (process.env.NODE_ENV === "production" ? "https://ethwarsaw-2025.onrender.com" : "http://127.0.0.1:8545");

const localhost = defineChain({
  id: 12345,
  name: "Sheetchain Mainnet",
  nativeCurrency: {
    decimals: 18,
    name: "Sheetchain",
    symbol: "SHEET",
  },
  rpcUrls: {
    default: {
      http: [DEFAULT_RPC_URL],
    },
  },
  blockExplorers: {
    default: {
      name: "Local Explorer",
      url: "http://localhost:3000/blockexplorer",
    },
  },
});

const scaffoldConfig = {
  // The networks on which your DApp is live
  targetNetworks: [localhost],
  // The interval at which your front-end polls the RPC servers for new data (it has no effect if you only target the local network (default is 4000))
  pollingInterval: 30000,
  // This is ours Alchemy's default API key.
  // You can get your own at https://dashboard.alchemyapi.io
  // It's recommended to store it in an env variable:
  // .env.local for local testing, and in the Vercel/system env config for live apps.
  alchemyApiKey: process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || DEFAULT_ALCHEMY_API_KEY,
  // If you want to use a different RPC for a specific network, you can add it here.
  // The key is the chain ID, and the value is the HTTP RPC URL
  rpcOverrides: {
    // Use local RPC node for custom localhost network
    [localhost.id]: DEFAULT_RPC_URL,
  },
  // This is ours WalletConnect's default project ID.
  // You can get your own at https://cloud.walletconnect.com
  // It's recommended to store it in an env variable:
  // .env.local for local testing, and in the Vercel/system env config for live apps.
  walletConnectProjectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || "3a8170812b534d0ff9d794f19a901d64",
  onlyLocalBurnerWallet: true,
} as const satisfies ScaffoldConfig;

export default scaffoldConfig;
