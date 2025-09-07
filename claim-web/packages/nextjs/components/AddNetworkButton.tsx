"use client";

import { useState } from "react";

interface AddNetworkButtonProps {
  className?: string;
}

const AddNetworkButton = ({ className = "" }: AddNetworkButtonProps) => {
  const [isAdding, setIsAdding] = useState(false);

  const addSheetChainToMetaMask = async () => {
    if (!window.ethereum) {
      alert("MetaMask is not installed. Please install MetaMask to continue.");
      return;
    }

    setIsAdding(true);

    try {
      // Get the RPC URL from environment or use default
      const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 
        (process.env.NODE_ENV === "production" 
          ? "https://ethwarsaw-2025.onrender.com" 
          : "http://127.0.0.1:8545");

      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: "0x3039", // 12345 in hex
            chainName: "Sheetchain Mainnet",
            nativeCurrency: {
              name: "Sheetchain",
              symbol: "SHEET",
              decimals: 18,
            },
            rpcUrls: [rpcUrl],
            blockExplorerUrls: ["http://localhost:3000/blockexplorer"],
          },
        ],
      });

      alert("✅ Sheet Chain network added to MetaMask successfully!");
    } catch (error: any) {
      console.error("Error adding network to MetaMask:", error);
      
      if (error.code === 4902) {
        // Network already exists
        alert("ℹ️ Sheet Chain network is already added to MetaMask.");
      } else if (error.code === 4001) {
        // User rejected the request
        console.log("User rejected adding the network");
      } else {
        alert("❌ Error adding network to MetaMask. Please try again.");
      }
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <button
      className={`btn ${isAdding ? "btn-disabled" : ""} ${className}`}
      onClick={addSheetChainToMetaMask}
      disabled={isAdding}
    >
      {isAdding ? (
        <>
          <span className="loading loading-spinner loading-xs"></span>
          Adding Network...
        </>
      ) : (
        <>
          <svg
            className="w-4 h-4 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6v6m0 0v6m0-6h6m-6 0H6"
            />
          </svg>
          Add Sheet Chain Network
        </>
      )}
    </button>
  );
};

export default AddNetworkButton;
