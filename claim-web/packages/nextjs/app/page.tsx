"use client";

import { useEffect, useState } from "react";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { parseEther } from "viem";
import AddNetworkButton from "~~/components/AddNetworkButton";

const Home: NextPage = () => {
  const { address: connectedAddress } = useAccount();

  // Generate random claim amount between 0.001 and 0.1 ETH
  const [hasClaimed, setHasClaimed] = useState<boolean>(false);
  const [checkingClaim, setCheckingClaim] = useState<boolean>(false);
  
  // Bridge functionality state
  const [bridgeAmount, setBridgeAmount] = useState<string>("");
  const [isBridging, setIsBridging] = useState<boolean>(false);

  

  // Use smart contract to check if user has already claimed
  const { 
    data: hasClaimedData,
    isLoading: hasClaimedLoading,
    refetch: refetchHasClaimed
  } = useScaffoldReadContract({
    contractName: "EthWarsaw2025Airdrop",
    functionName: "hasClaimed",
    args: [connectedAddress] as const,
  });

  // Update hasClaimed state when contract data changes
  useEffect(() => {
    if (hasClaimedData !== undefined) {
      setHasClaimed(hasClaimedData as boolean);
    }
  }, [hasClaimedData]);

  // Update checking state based on loading
  useEffect(() => {
    setCheckingClaim(hasClaimedLoading);
  }, [hasClaimedLoading]);

  // Read contract data - only totalClaimants
  const {
    data: totalClaimants,
    isLoading: totalClaimantsLoading,
    error: totalClaimantsError,
  } = useScaffoldReadContract({
    contractName: "EthWarsaw2025Airdrop",
    functionName: "totalClaimants",
  });

  // Test read from external contract to verify it's working
  const {
    data: ownerData,
    isLoading: ownerLoading,
    error: ownerError,
  } = useScaffoldReadContract({
    contractName: "EthWarsaw2025Airdrop",
    functionName: "owner",
  });

  // Debug: Log contract responses
  useEffect(() => {
    console.log("📊 DEBUG: Contract call results:");
    console.log("totalClaimants:", {
      data: totalClaimants,
      loading: totalClaimantsLoading,
      error: totalClaimantsError,
    });
    console.log("hasClaimed:", {
      data: hasClaimedData,
      loading: hasClaimedLoading,
      address: connectedAddress,
    });
    console.log("owner (external contract test):", {
      data: ownerData,
      loading: ownerLoading,
      error: ownerError,
    });
  }, [totalClaimants, totalClaimantsLoading, totalClaimantsError, hasClaimedData, hasClaimedLoading, connectedAddress, ownerData, ownerLoading, ownerError]);

  // Write contract function for airdrop
  const { writeContractAsync: writeEthWarsawAirdropAsync } = useScaffoldWriteContract({
    contractName: "EthWarsaw2025Airdrop",
  });

  // Write contract function for bridge (external contract)
  const { writeContractAsync: writeBridgeAsync } = useScaffoldWriteContract({
    contractName: "EthWarsaw2025Airdrop",
  });

  // Bridge function handler
  const handleBridge = async () => {
    if (!bridgeAmount || isNaN(Number(bridgeAmount)) || Number(bridgeAmount) <= 0) {
      alert("Please enter a valid amount");
      return;
    }

    setIsBridging(true);
    console.log("🌉 DEBUG: Attempting to bridge", bridgeAmount, "SHEET");
    console.log("🌉 DEBUG: Using external contract address: 0x0000000000000000000000000000000000000001");
    console.log("🌉 DEBUG: Function: bridge(uint256 value)");
    console.log("🌉 DEBUG: Parsed amount:", parseEther(bridgeAmount).toString());

    try {
      const txResult = await writeBridgeAsync({
        functionName: "bridge",
        args: [parseEther(bridgeAmount)],
      });
      
      console.log("✅ DEBUG: Bridge transaction submitted successfully");
      console.log("Transaction Result:", txResult);
      
      alert("✅ Bridge transaction submitted successfully!");
      setBridgeAmount(""); // Clear the input
      
    } catch (error: any) {
      console.error("❌ DEBUG: Error bridging:", error);
      console.error("Error details:", {
        message: error?.message,
        code: error?.code,
        data: error?.data,
        cause: error?.cause,
      });
      
      if (error?.message?.includes("User rejected")) {
        console.log("User cancelled the transaction");
      } else {
        alert("❌ Error bridging tokens. Please try again.");
        console.error("Unexpected error during bridge:", error);
      }
    } finally {
      setIsBridging(false);
    }
  };

  const handleClaim = async () => {
    console.log("🚀 DEBUG: Attempting to claim airdrop");
    console.log("Function: claimAirdropEthWarsaw2025()");
    console.log("Expected Selector: 0xe21fa87b");
    console.log("Contract: EthWarsaw2025Airdrop");
    console.log("Connected Address:", connectedAddress);

    // First check if user has already claimed (refresh the status)
    await refetchHasClaimed();
    
    // Check the latest hasClaimed status
    if (hasClaimedData === true || hasClaimed === true) {
      alert("❌ You have already claimed your airdrop!");
      return;
    }

    try {
      const txResult = await writeEthWarsawAirdropAsync({
        functionName: "claimAirdropEthWarsaw2025",
      });
      console.log("✅ DEBUG: Claim transaction submitted successfully");
      console.log("Transaction Result:", txResult);
      
      // Mark user as having claimed
      setHasClaimed(true);
      alert("✅ Airdrop claimed successfully!");
      
      // The transaction should now be automatically stored in the spreadsheet by the RPC node
      
    } catch (error: any) {
      console.error("❌ DEBUG: Error claiming airdrop:", error);
      console.error("Error details:", {
        message: error?.message,
        code: error?.code,
        data: error?.data,
        cause: error?.cause,
      });
      
      // Check if the error is because user already claimed
      if (error?.message?.includes("already claimed")) {
        alert("❌ You have already claimed your airdrop!");
        // Refresh the hasClaimed status
        await refetchHasClaimed();
        setHasClaimed(true);
      } else if (error?.message?.includes("Airdrop finished")) {
        alert("❌ Airdrop has finished! All 1000 claims have been used.");
      } else if (error?.message?.includes("User rejected")) {
        console.log("User cancelled the transaction");
      } else {
        alert("❌ Error claiming airdrop. Please try again.");
        console.error("Unexpected error during claim:", error);
      }
    }
  };

  return (
    <>
      <div className="flex items-center flex-col grow pt-10">
        <div className="px-5">
          <h1 className="text-center">
            <span className="block text-2xl mb-2">Welcome to</span>
            <span className="block text-4xl font-bold">ETH Warsaw 2025 SHEET drop</span>
          </h1>
          <div className="flex flex-col items-center mt-4 space-y-2">
            <p className="text-sm text-base-content/70">First time? Add the Sheet Chain network to MetaMask:</p>
            <AddNetworkButton className="btn-primary" />
          </div>
        </div>

        <div className="grow bg-base-300 w-full mt-16 px-8 py-12">
          <div className="flex justify-center items-center gap-8">
            {/* Airdrop Panel */}
            <div className="flex flex-col bg-base-100 px-10 py-10 text-center items-center max-w-md rounded-3xl">
              <h2 className="text-2xl font-bold mb-4">Claim Your Airdrop</h2>

              {connectedAddress ? (
                <div className="space-y-4">
                  <div className="text-lg">
                    <p>Airdrop Amount: 5 SHEET</p>
                    <p>Current Claims: {totalClaimants?.toString() || "Loading..."} / 1000</p>
                    <p>Remaining: {totalClaimants ? `${1000 - Number(totalClaimants)}` : "Loading..."}</p>
                  </div>

                  {checkingClaim ? (
                    <div className="text-info">
                      <p className="text-lg">Checking claim status...</p>
                    </div>
                  ) : totalClaimants && totalClaimants >= 1000 ? (
                    <div className="text-error">
                      <p className="text-xl font-bold">❌ Airdrop Finished</p>
                      <p>All 1000 claims have been used up.</p>
                    </div>
                  ) : (
                    <>
                      {hasClaimed && (
                        <div className="text-warning mb-2">
                          <p className="text-sm">You have already claimed your airdrop</p>
                        </div>
                      )}
                      <button 
                        className={`btn btn-lg ${hasClaimed ? "btn-disabled" : "btn-primary"}`}
                        onClick={handleClaim}
                        disabled={hasClaimed}>
                        CLAIM
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-lg mb-4">Please connect your wallet to claim airdrop</p>
                </div>
              )}
            </div>

            {/* Bridge Panel */}
            <div className="flex flex-col bg-base-100 px-10 py-10 text-center items-center max-w-md rounded-3xl">
              <h2 className="text-2xl font-bold mb-4">Bridge SHEET Tokens</h2>

              {connectedAddress ? (
                <div className="space-y-4 w-full">
                  <div className="text-lg">
                    <p>Bridge your SHEET tokens to another chain</p>
                  </div>

                  <div className="form-control w-full">
                    <label className="label">
                      <span className="label-text">Amount (SHEET)</span>
                    </label>
                    <input
                      type="number"
                      placeholder="Enter amount"
                      className="input input-bordered w-full"
                      value={bridgeAmount}
                      onChange={(e) => setBridgeAmount(e.target.value)}
                      min="0"
                      step="0.000001"
                    />
                  </div>

                  <button 
                    className={`btn btn-lg w-full ${isBridging ? "btn-disabled" : "btn-secondary"}`}
                    onClick={handleBridge}
                    disabled={isBridging || !bridgeAmount || isNaN(Number(bridgeAmount)) || Number(bridgeAmount) <= 0}>
                    {isBridging ? "Bridging..." : "BRIDGE"}
                  </button>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-lg mb-4">Please connect your wallet to bridge tokens</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Home;
