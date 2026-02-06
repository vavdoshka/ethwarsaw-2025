import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { TokenChainSelector } from './TokenChainSelector';
import { useWallet } from '../contexts/walletContext';
import { useWalletClient, useAccount } from 'wagmi';
import type { Token } from '../types/index';
import { CHAINS, BRIDGE_OPERATOR_ADDRESS, IS_MAINNET } from '../config';
import { isValidAmount, isValidAddress } from '../utils/format';
import { ArrowSwapIcon, SpinnerIcon, RefreshIcon } from './ui/icons';
import { getSplTokenBalance, lockSplTokens } from '../api/sol';
import { getSheetBalance, bridgeOut, bridgeTransfer } from '../api/sheet';
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
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Debug bridgeTransfer inputs
  const [debugRecipient, setDebugRecipient] = useState('');
  const [debugAmount, setDebugAmount] = useState('');
  const [debugIsLoading, setDebugIsLoading] = useState(false);

  // Track wallet addresses to detect connection changes
  const fromWallet = getWalletByChain(fromChain.name);
  const toWallet = getWalletByChain(toChain.name);
  const fromWalletAddress = fromWallet?.address;
  const toWalletAddress = toWallet?.address;

  // Treat the connected SheetChain EVM wallet as the potential bridge operator
  const sheetWallet = getWalletByChain('sheet chain');
  const isBridgeOperatorConnected =
    !!sheetWallet &&
    sheetWallet.address.toLowerCase() === BRIDGE_OPERATOR_ADDRESS.toLowerCase();

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

        const toastId = toast.loading('Sending Solana transaction...');
        
        const signature = await lockSplTokens(
          wallet.walletAdapter,
          parseFloat(fromAmount),
          destinationAddress
        );

        console.log('Transaction successful:', signature);
        
        const solanaExplorerUrl = IS_MAINNET 
          ? `https://explorer.solana.com/tx/${signature}`
          : `https://explorer.solana.com/tx/${signature}?cluster=devnet`;

        toast.success(
          () => (
            <div>
              <div className="font-semibold">Solana transaction sent!</div>
              <a
                href={solanaExplorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline text-sm"
              >
                View on Explorer
              </a>
              <div className="text-xs text-gray-400 mt-2">Bridge backend is processing your transfer...</div>
            </div>
          ),
          { id: toastId, duration: 8000 }
        );

        setFromAmount('');
        setToAmount('');
        setDestinationAddress('');
        await fetchFromBalance();
        
        // Refresh destination balance after a delay to allow backend to process
        // The backend needs time to detect the Solana event and update Sheet Chain balance
        setTimeout(async () => {
          await fetchToBalance();
          // Refresh again after a bit more time to ensure balance is updated
          setTimeout(async () => {
            await fetchToBalance();
          }, 3000);
        }, 2000);
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

        // Show initial toast for Sheet transaction
        const sheetTxToastId = toast.loading('Sending Sheet Chain transaction...');

        const txHash = await bridgeOut(
          walletClient,
          connectedWallet.address,
          parseFloat(fromAmount),
          destAddress,
          solanaChainId
        );

        console.log('Bridge transaction successful:', txHash);
        
        toast.success(
          () => (
            <div>
              <div className="font-semibold">Sheet Chain transaction sent!</div>
              <div className="text-sm text-gray-400 mt-1">Tx: {txHash.slice(0, 10)}...{txHash.slice(-8)}</div>
              <div className="text-xs text-gray-500 mt-2">Waiting for Solana transfer...</div>
            </div>
          ),
          { id: sheetTxToastId, duration: 10000 }
        );

        // Show toast for Solana transaction (will be processed by backend)
        toast.loading(
          () => (
            <div>
              <div className="font-semibold">Processing Solana transfer...</div>
              <div className="text-sm text-gray-400 mt-1">The bridge will process your transfer shortly</div>
            </div>
          ),
          { duration: 15000 }
        );

        setFromAmount('');
        setToAmount('');
        setDestinationAddress('');
        await fetchFromBalance();
        await fetchToBalance();
      } else {
        throw new Error(`Bridge from ${fromChain.name} to ${toChain.name} is not yet supported`);
      }
    } catch (error) {
      console.error('Bridge transaction failed:', error);
      const message =
        error instanceof Error ? error.message : 'Unknown error occurred';
      toast.error(`Transaction failed: ${message}`);
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
      let balance = 0;
      if (toChain.name === 'solana') {
        balance = await getSplTokenBalance(toWalletAddress);
      } else if (toChain.name === 'sheet chain') {
        balance = await getSheetBalance(toWalletAddress);
        console.log('fetchToBalance: Sheet Chain balance fetched:', balance, 'SHEET');
      } else if (toChain.name === 'bsc') {
        balance = await getBscBalance(toWalletAddress);
      }
      const formattedBalance = balance.toFixed(2);
      console.log('fetchToBalance: Setting balance to', formattedBalance, toChain.name);
      setToBalance(formattedBalance);
    } catch (error) {
      console.error('Failed to fetch to balance:', error);
      setToBalance('0');
    }
  }, [toChain, toWalletAddress]);

  // Fetch balances only on mount and when wallet addresses change
  // Removed automatic polling to reduce API quota usage
  useEffect(() => {
    fetchFromBalance();
  }, [fromChain, fromWalletAddress, fetchFromBalance]);

  useEffect(() => {
    fetchToBalance();
  }, [toChain, toWalletAddress, fetchToBalance]);

  // Refresh balances manually
  const handleRefreshBalances = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([fetchFromBalance(), fetchToBalance()]);
      toast.success('Balances refreshed');
    } catch (error) {
      console.error('Failed to refresh balances:', error);
      toast.error('Failed to refresh balances');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Auto-populate destination address with connected wallet address
  // This effect runs when wallet address or chain changes, and also checks after a delay
  // to catch wallet connections that happen asynchronously after page load
  useEffect(() => {
    const checkAndPopulate = () => {
      if (toWalletAddress) {
        // Auto-populate if field is empty or contains invalid address
        if (!destinationAddress || !isValidAddress(destinationAddress, toChain.name)) {
          setDestinationAddress(toWalletAddress);
          setDestinationAddressError('');
        }
      }
    };

    // Check immediately when dependencies change
    checkAndPopulate();

    // Also check after a short delay to catch async wallet connections
    // This handles the case where wallet connects after the component mounts
    const timeoutId = setTimeout(checkAndPopulate, 1000);
    
    return () => clearTimeout(timeoutId);
    // Only run when wallet or chain changes, not when destinationAddress changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toWalletAddress, toChain.name]);

  const handleDebugBridgeTransfer = async () => {
    try {
      setDebugIsLoading(true);

      if (!isBridgeOperatorConnected || !sheetWallet?.address) {
        throw new Error('Bridge operator wallet is not connected on SheetChain');
      }

      if (!walletClient) {
        throw new Error('Wallet client not available. Please ensure your wallet is connected.');
      }

      // Ensure wallet is on SheetChain before sending transaction
      if (currentChain?.id !== SHEET_CHAIN_ID) {
        try {
          await switchToSheetChain();
          await new Promise((resolve) => setTimeout(resolve, 1500));
          const updatedChain = await walletClient.getChainId();
          if (updatedChain !== SHEET_CHAIN_ID) {
            throw new Error('Failed to switch to SheetChain. Please try again.');
          }
        } catch (error: any) {
          throw new Error(`Failed to switch to SheetChain: ${error.message}`);
        }
      }

      const amt = parseFloat(debugAmount);
      if (Number.isNaN(amt) || amt <= 0) {
        throw new Error('Amount must be a positive number');
      }

      const toastId = toast.loading('Sending bridgeTransfer transaction...');
      
      const txHash = await bridgeTransfer(walletClient, sheetWallet.address, debugRecipient, amt);

      console.log('Debug bridgeTransfer sent:', txHash);
      
      toast.success(
        () => (
          <div>
            <div className="font-semibold">bridgeTransfer sent!</div>
            <div className="text-sm text-gray-400 mt-1">Tx: {txHash.slice(0, 10)}...{txHash.slice(-8)}</div>
          </div>
        ),
        { id: toastId }
      );
    } catch (error: any) {
      console.error('Debug bridgeTransfer failed:', error);
      toast.error(`bridgeTransfer failed: ${error.message || String(error)}`);
    } finally {
      setDebugIsLoading(false);
    }
  };

  return (
    <>
      <div className="w-full max-w-[480px] mx-auto border-l border-r border-white/[0.15]">
        <h2 className="text-[36px] font-normal text-white mt-16 mb-7 text-center">
          Bridge your Sheet
        </h2>
      </div>
      <div className="w-full border-b border-white/[0.15]"></div>
      {/* Debug panel for calling bridgeTransfer directly against SheetChain RPC.
          Visible only when the bridge operator wallet is connected on SheetChain. */}
      {isBridgeOperatorConnected && (
        <div className="w-full max-w-[480px] mx-auto border-l border-r border-white/[0.15] bg-[#050505]">
          <div className="px-3 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">
                Debug: bridgeTransfer
              </span>
              <span className="text-[10px] uppercase tracking-wide text-white/40">
                Operator only
              </span>
            </div>
            <p className="text-xs text-white/40">
              For local testing only. Uses the connected bridge operator wallet to call{' '}
              <code className="text-[10px]">bridgeTransfer(address,uint256)</code> on
              SheetChain RPC.
            </p>
            <div className="space-y-2">
              <input
                type="text"
                value={debugRecipient}
                onChange={(e) => setDebugRecipient(e.target.value)}
                placeholder="Recipient address on SheetChain (0x...)"
                className="w-full border border-white/[0.08] bg-[#0a0a0a] px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/15"
              />
              <input
                type="text"
                value={debugAmount}
                onChange={(e) => setDebugAmount(e.target.value)}
                placeholder="Amount in SHEET"
                className="w-full border border-white/[0.08] bg-[#0a0a0a] px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/15"
              />
            </div>
            <button
              onClick={handleDebugBridgeTransfer}
              disabled={
                debugIsLoading ||
                !debugRecipient.trim() ||
                !debugAmount.trim()
              }
              className={`w-full py-2.5 px-4 text-xs font-medium transition-all duration-200 ${
                debugIsLoading ||
                !debugRecipient.trim() ||
                !debugAmount.trim()
                  ? 'bg-white/5 text-white/30 cursor-not-allowed'
                  : 'bg-[#2563eb] hover:bg-[#1d4ed8] text-white'
              }`}
            >
              {debugIsLoading ? 'Sending bridgeTransfer…' : 'Call bridgeTransfer (debug)'}
            </button>
          </div>
        </div>
      )}
      <div className="w-full max-w-[480px] mx-auto border-l border-r border-white/[0.15]">
        <div className="bg-[#0f0f0f] px-3 py-3 space-y-2">
          <div className="space-y-4">
            <div className="border border-white/[0.08] bg-[#0a0a0a] px-5 py-5">
              <div className="flex items-center justify-between mb-5 text-sm text-white/60">
                <span className="text-white">You pay</span>
                <div className="flex items-center gap-2">
                  <span>
                    Balance: {fromBalance} {fromToken.symbol}
                  </span>
                  <button
                    onClick={handleRefreshBalances}
                    disabled={isRefreshing}
                    className="p-1 hover:bg-white/5 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Refresh balances"
                  >
                    <RefreshIcon 
                      className={`w-4 h-4 text-white/60 hover:text-white ${isRefreshing ? 'animate-spin' : ''}`} 
                    />
                  </button>
                </div>
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
                <div className="flex items-center gap-2">
                  <span>
                    Balance: {toBalance} {toToken.symbol}
                  </span>
                  <button
                    onClick={handleRefreshBalances}
                    disabled={isRefreshing}
                    className="p-1 hover:bg-white/5 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Refresh balances"
                  >
                    <RefreshIcon 
                      className={`w-4 h-4 text-white/60 hover:text-white ${isRefreshing ? 'animate-spin' : ''}`} 
                    />
                  </button>
                </div>
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
