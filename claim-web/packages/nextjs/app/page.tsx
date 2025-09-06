"use client";

import { useEffect, useState } from "react";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { Address } from "~~/components/scaffold-eth";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";

const Home: NextPage = () => {
  const { address: connectedAddress } = useAccount();

  // Generate random claim amount between 0.001 and 0.1 ETH
  const [claimAmount, setClaimAmount] = useState<string>("0.01");

  useEffect(() => {
    const minAmount = 0.001;
    const maxAmount = 0.1;
    const randomAmount = (Math.random() * (maxAmount - minAmount) + minAmount).toFixed(3);
    setClaimAmount(randomAmount);
  }, []);

  // Read contract data - only totalClaimants
  const {
    data: totalClaimants,
    isLoading: totalClaimantsLoading,
    error: totalClaimantsError,
  } = useScaffoldReadContract({
    contractName: "EthWarsaw2025Airdrop",
    functionName: "totalClaimants",
  });

  // Debug: Log contract responses
  useEffect(() => {
    console.log("📊 DEBUG: Contract call results:");
    console.log("totalClaimants:", {
      data: totalClaimants,
      loading: totalClaimantsLoading,
      error: totalClaimantsError,
    });
  }, [totalClaimants, totalClaimantsLoading, totalClaimantsError]);

  // Write contract function
  const { writeContractAsync: writeEthWarsawAirdropAsync } = useScaffoldWriteContract({
    contractName: "EthWarsaw2025Airdrop",
  });

  const handleClaim = async () => {
    console.log("🚀 DEBUG: Attempting to claim airdrop");
    console.log("Function: claimAirdropEthWarsaw2025()");
    console.log("Expected Selector: 0xe21fa87b");
    console.log("Contract: EthWarsaw2025Airdrop");

    try {
      await writeEthWarsawAirdropAsync({
        functionName: "claimAirdropEthWarsaw2025",
      });
      console.log("✅ DEBUG: Claim transaction submitted successfully");
    } catch (error: any) {
      console.error("❌ DEBUG: Error claiming airdrop:", error);
      console.error("Error details:", {
        message: error?.message,
        code: error?.code,
        data: error?.data,
        cause: error?.cause,
      });
      // The error message will be displayed by the wallet/UI
      if (error?.message?.includes("Airdrop finished")) {
        // This will be handled by the UI state check
      }
    }
  };

  return (
    <>
      <div className="flex items-center flex-col grow pt-10">
        <div className="px-5">
          <h1 className="text-center">
            <span className="block text-2xl mb-2">Welcome to</span>
            <span className="block text-4xl font-bold">ETH Warsaw 2025 Airdrop</span>
          </h1>
          <div className="flex justify-center items-center space-x-2 flex-col">
            <p className="my-2 font-medium">Connected Address:</p>
            <Address address={connectedAddress} />
          </div>
        </div>

        <div className="grow bg-base-300 w-full mt-16 px-8 py-12">
          <div className="flex justify-center items-center">
            <div className="flex flex-col bg-base-100 px-10 py-10 text-center items-center max-w-md rounded-3xl">
              <h2 className="text-2xl font-bold mb-4">Claim Your Airdrop</h2>

              {connectedAddress ? (
                <div className="space-y-4">
                  <div className="text-lg">
                    <p>Airdrop Amount: {claimAmount} ETH</p>
                    <p>Current Claims: {totalClaimants?.toString() || "Loading..."} / 1000</p>
                    <p>Remaining: {totalClaimants ? `${1000 - Number(totalClaimants)}` : "Loading..."}</p>
                  </div>

                  {totalClaimants && totalClaimants >= 1000 ? (
                    <div className="text-error">
                      <p className="text-xl font-bold">❌ Airdrop Finished</p>
                      <p>All 1000 claims have been used up.</p>
                    </div>
                  ) : (
                    <button className="btn btn-primary btn-lg" onClick={handleClaim}>
                      CLAIM
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-lg mb-4">Please connect your wallet to claim airdrop</p>
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
