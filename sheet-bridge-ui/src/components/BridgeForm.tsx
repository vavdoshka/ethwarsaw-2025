import React, { useState, useEffect, useCallback } from 'react';
import { TokenChainSelector } from './TokenChainSelector';
import { useWallet } from '../contexts/walletContext';
import { useWalletClient, useAccount } from 'wagmi';
import type { Token } from '../types/index';
import { CHAINS } from '../config';
import { isValidAmount, isValidAddress } from '../utils/format';
import { ArrowSwapIcon, SpinnerIcon } from './ui/icons';
import { getSplTokenBalance, lockSplTokens } from '../api/sol';
import { getSheetBalance, bridgeOut } from '../api/sheet';
import { getBscBalance } from '../api/bsc';
import { switchToSheetChain } from '../utils/metamask';

const SHEET_CHAIN_ID = 12345;

export const BridgeForm: React.FC = () => {
  const { isChainConnected, getWalletByChain, setChain } = useWallet();
  const { data: walletClient } = useWalletClient();
  const { chain: currentChain } = useAccount();

  const [fromChain, setFromChain] = useState(CHAINS[1]); // Solana
  const [toChain, setToChain] = useState(CHAINS[0]); // Sheet Chain

  const [fromToken, setFromToken] = useState<Token>(CHAINS[1].tokens[0]);
  const [toToken, setToToken] = useState<Token>(CHAINS[0].tokens[0]);
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [destinationAddressError, setDestinationAddressError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [fromBalance, setFromBalance] = useState('0');
  const [toBalance, setToBalance] = useState('0');

  // Track wallet addresses to detect connection changes
  const fromWallet = getWalletByChain(fromChain.name);
  const toWallet = getWalletByChain(toChain.name);
  const fromWalletAddress = fromWallet?.address;
  const toWalletAddress = toWallet?.address;

  useEffect(() => {
    setChain(fromChain);
  }, [fromChain, setChain]);

  // Allow only non-Sheet -> Sheet or Sheet -> non-Sheet bridge
  useEffect(() => {
    if (fromChain.name !== 'sheet chain' && toChain.name !== 'sheet chain') {
      setToChain(CHAINS[0]);
      setToToken(CHAINS[0].tokens[0]);
    }
  }, [fromChain]);
  useEffect(() => {
    if (fromChain.name !== 'sheet chain' && toChain.name !== 'sheet chain') {
      setFromChain(CHAINS[0]);
      setFromToken(CHAINS[0].tokens[0]);
    }
  }, [toChain]);

  const handleSwap = () => {
    // Swap from and to chains
    const tempChain = fromChain;
    setFromChain(toChain);
    setToChain(tempChain);

    // Swap tokens
    const tempToken = fromToken;
    setFromToken(toToken);
    setToToken(tempToken);

    // Swap amounts
    const tempAmount = fromAmount;
    setFromAmount(toAmount);
    setToAmount(tempAmount);
  };

  const handleFromAmountChange = (value: string) => {
    if (isValidAmount(value)) {
      setFromAmount(value);
      setToAmount(value || '');
    }
  };

  const handleDestinationAddressChange = (value: string) => {
    setDestinationAddress(value);
    if (value.trim() === '') {
      setDestinationAddressError('');
      return;
    }
    
    if (!isValidAddress(value, toChain.name)) {
      setDestinationAddressError(`Invalid ${toChain.name} address`);
    } else {
      setDestinationAddressError('');
    }
  };

  const allowBridge = () => {
    // If destination chain is connected, we can use that wallet's address
    // Otherwise, we need a valid destination address
    const destinationChainConnected = isChainConnected(toChain.name);
    const hasValidDestinationAddress = destinationAddress && isValidAddress(destinationAddress, toChain.name);
    
    return (
      isChainConnected(fromChain.name) &&
      (destinationChainConnected || hasValidDestinationAddress) &&
      fromAmount &&
      parseFloat(fromAmount) > 0 &&
      toAmount &&
      parseFloat(toAmount) > 0
    );
  };

  const handleBridge = async () => {
    if (!allowBridge()) return;

    setIsLoading(true);

    try {
      if (fromChain.name === 'solana') {
        const wallet = getWalletByChain('solana');

        if (!wallet?.walletAdapter) {
          throw new Error('Solana wallet not connected');
        }

        const signature = await lockSplTokens(
          wallet.walletAdapter,
          parseFloat(fromAmount),
          destinationAddress
        );

        console.log('Transaction successful:', signature);
        alert(`Tokens locked successfully! Signature: ${signature}`);

        setFromAmount('');
        setToAmount('');
        setDestinationAddress('');
        await fetchFromBalance();
      } else if (fromChain.name === 'sheet chain' && toChain.name === 'solana') {
        // Sheet Chain to Solana bridge using bridgeOut
        const connectedWallet = getWalletByChain('sheet chain');
        if (!connectedWallet?.address) {
          throw new Error('Sheet Chain wallet not connected');
        }

        if (!walletClient) {
          throw new Error('Wallet client not available. Please ensure your wallet is connected.');
        }

        // Ensure wallet is on SheetChain before sending transaction
        if (currentChain?.id !== SHEET_CHAIN_ID) {
          try {
            // Use MetaMask's native API to add/switch to SheetChain
            await switchToSheetChain();
            // Wait a bit for the chain switch to complete
            await new Promise(resolve => setTimeout(resolve, 1500));
            // Refresh the chain info
            const updatedChain = await walletClient.getChainId();
            if (updatedChain !== SHEET_CHAIN_ID) {
              throw new Error('Failed to switch to SheetChain. Please try again.');
            }
          } catch (error: any) {
            throw new Error(`Failed to switch to SheetChain: ${error.message}`);
          }
        }

        // Get destination address
        let destAddress: string;
        if (destinationAddress) {
          if (!isValidAddress(destinationAddress, toChain.name)) {
            throw new Error(`Invalid ${toChain.name} address`);
          }
          destAddress = destinationAddress.trim();
        } else {
          const solanaWallet = getWalletByChain('solana');
          if (!solanaWallet?.address) {
            throw new Error('Please connect Solana wallet or enter destination address');
          }
          destAddress = solanaWallet.address;
        }

        // Solana chain ID (using 101 for mainnet, but you might want to use a different ID for devnet)
        // For now, using 1 as a placeholder - you can adjust this based on your needs
        const solanaChainId = 1;

        console.log('Calling bridgeOut:', {
          fromAddress: connectedWallet.address,
          amount: parseFloat(fromAmount),
          toAddress: destAddress,
          destChainId: solanaChainId,
        });

        const txHash = await bridgeOut(
          walletClient,
          connectedWallet.address,
          parseFloat(fromAmount),
          destAddress,
          solanaChainId
        );

        console.log('Bridge transaction successful:', txHash);
        alert(`Bridge transaction successful! Transaction Hash: ${txHash}`);

        setFromAmount('');
        setToAmount('');
        setDestinationAddress('');
        await fetchFromBalance();
        await fetchToBalance();
      } else {
        throw new Error(`Bridge from ${fromChain.name} to ${toChain.name} is not yet supported`);
      }
    } catch (error: any) {
      console.error('Bridge transaction failed:', error);
      alert(`Transaction failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchFromBalance = useCallback(async () => {
    if (!fromChain || !fromWalletAddress) {
      console.log('fetchFromBalance: Chain not connected or no wallet address', fromChain?.name);
      setFromBalance('0');
      return;
    }

    console.log('fetchFromBalance: Fetching balance for', fromChain.name, fromWalletAddress);
    try {
      if (fromChain.name === 'solana') {
        const balance = await getSplTokenBalance(fromWalletAddress);
        setFromBalance(balance.toFixed(2));
      } else if (fromChain.name === 'sheet chain') {
        const balance = await getSheetBalance(fromWalletAddress);
        setFromBalance(balance.toFixed(2));
      } else if (fromChain.name === 'bsc') {
        const balance = await getBscBalance(fromWalletAddress);
        setFromBalance(balance.toFixed(2));
      }
    } catch (error) {
      console.error('Failed to fetch from balance:', error);
      setFromBalance('0');
    }
  }, [fromChain, fromWalletAddress]);

  const fetchToBalance = useCallback(async () => {
    if (!toChain || !toWalletAddress) {
      console.log('fetchToBalance: Chain not connected or no wallet address', toChain?.name);
      setToBalance('0');
      return;
    }

    console.log('fetchToBalance: Fetching balance for', toChain.name, toWalletAddress);
    try {
      if (toChain.name === 'solana') {
        const balance = await getSplTokenBalance(toWalletAddress);
        setToBalance(balance.toFixed(2));
      } else if (toChain.name === 'sheet chain') {
        const balance = await getSheetBalance(toWalletAddress);
        setToBalance(balance.toFixed(2));
      } else if (toChain.name === 'bsc') {
        const balance = await getBscBalance(toWalletAddress);
        setToBalance(balance.toFixed(2));
      }
    } catch (error) {
      console.error('Failed to fetch to balance:', error);
      setToBalance('0');
    }
  }, [toChain, toWalletAddress]);

  useEffect(() => {
    fetchFromBalance();
    // Set up periodic refresh every 5 seconds when wallet is connected
    if (fromWalletAddress) {
      const interval = setInterval(() => {
        fetchFromBalance();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [fromChain, fromWalletAddress, fetchFromBalance]);

  useEffect(() => {
    fetchToBalance();
    // Set up periodic refresh every 5 seconds when wallet is connected
    if (toWalletAddress) {
      const interval = setInterval(() => {
        fetchToBalance();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [toChain, toWalletAddress, fetchToBalance]);

  return (
    <>
      <div className="w-full max-w-[480px] mx-auto border-l border-r border-white/[0.15]">
        <h2 className="text-[36px] font-normal text-white mt-16 mb-7 text-center">
          Bridge your Sheet
        </h2>
      </div>
      <div className="w-full border-b border-white/[0.15]"></div>
      <div className="w-full max-w-[480px] mx-auto border-l border-r border-white/[0.15]">
        <div className="bg-[#0f0f0f] px-3 py-3 space-y-2">
          <div className="space-y-4">
            <div className="border border-white/[0.08] bg-[#0a0a0a] px-5 py-5">
              <div className="flex items-center justify-between mb-5 text-sm text-white/60">
                <span className="text-white">You pay</span>
                <span>
                  Balance: {fromBalance} {fromToken.symbol}
                </span>
              </div>

              <div className="flex items-center gap-4 overflow-hidden">
                <TokenChainSelector
                  selectedToken={fromToken}
                  selectedChain={fromChain}
                  onTokenSelect={setFromToken}
                  onChainSelect={setFromChain}
                  availableChains={CHAINS}
                  label=""
                />

                <input
                  type="text"
                  value={fromAmount}
                  onChange={(e) => handleFromAmountChange(e.target.value)}
                  placeholder="0"
                  className="flex-1 bg-transparent text-right text-4xl font-light text-white/60 placeholder-white/60 focus:outline-none min-w-0"
                />
              </div>
            </div>

            <div className="flex justify-center -my-1">
              <button
                onClick={handleSwap}
                className="w-10 h-10 border border-white/[0.08] bg-[#0f0f0f] text-white/40 hover:bg-white/5 transition-colors flex items-center justify-center"
              >
                <ArrowSwapIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="border border-white/[0.08] bg-[#0a0a0a] px-5 py-5">
              <div className="flex items-center justify-between mb-5 text-sm text-white/60">
                <span className="text-white">You pay</span>
                <span>
                  Balance: {toBalance} {toToken.symbol}
                </span>
              </div>

              <div className="flex items-center gap-4 overflow-hidden">
                <TokenChainSelector
                  selectedToken={toToken}
                  selectedChain={toChain}
                  onTokenSelect={setToToken}
                  onChainSelect={setToChain}
                  availableChains={
                    fromChain.name === 'sheet chain' ? CHAINS.slice(1) : CHAINS
                  }
                  label=""
                />

                <input
                  type="text"
                  value={toAmount}
                  readOnly
                  placeholder="0"
                  className="flex-1 bg-transparent text-right text-4xl font-light text-white/60 placeholder-white/60 focus:outline-none min-w-0"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <div>
              <label className="block text-sm text-white/60 mb-2.5">
                Send to address:
              </label>
              <input
                type="text"
                value={destinationAddress}
                onChange={(e) => handleDestinationAddressChange(e.target.value)}
                placeholder={'Enter ' + toChain.display_name + ' adress'}
                className="w-full border border-white/[0.08] bg-[#0a0a0a] px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/10 transition-colors"
              />
              {destinationAddressError && (
                <p className="text-red-500 text-xs mt-1">{destinationAddressError}</p>
              )}
            </div>

            <button
              onClick={handleBridge}
              disabled={isLoading || !allowBridge()}
              className={`w-full py-3.5 px-6 text-base font-medium transition-all duration-200 ${
                isLoading || !allowBridge()
                  ? 'bg-white/5 text-white/30 cursor-not-allowed'
                  : 'bg-[#00d563] hover:bg-[#00c251] text-white'
              }`}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-3">
                  <SpinnerIcon className="animate-spin h-5 w-5 text-white" />
                  Processing...
                </span>
              ) : (
                'Bridge Token'
              )}
            </button>
          </div>
        </div>
      </div>
      <div className="w-full border-b border-white/[0.15]"></div>
    </>
  );
};
