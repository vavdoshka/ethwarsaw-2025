import React, { useState, useEffect } from 'react';
import { TokenChainSelector } from './TokenChainSelector';
import { useWallet } from '../contexts/walletContext';
import type { Token } from '../types/index';
import { CHAINS } from '../config';
import { isValidAmount } from '../utils/format';
import { ArrowSwapIcon, SpinnerIcon } from './ui/icons';
import { Button } from './ui/Button';
import { getSplTokenBalance, lockSplTokens } from '../api/sol';
import { getSheetBalance } from '../api/sheet';

export const BridgeForm: React.FC = () => {
  const {
    isChainConnected,
    fromChain,
    toChain,
    setFromChain,
    setToChain,
    getWalletByChain,
  } = useWallet();
  const [fromToken, setFromToken] = useState<Token>(
    CHAINS[fromChain.id].tokens[0]
  );
  const [toToken, setToToken] = useState<Token>(CHAINS[toChain.id].tokens[0]);
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [fromBalance, setFromBalance] = useState('0');
  const [toBalance, setToBalance] = useState('0');

  const handleSwap = () => {
    setFromChain(toChain);
    setToChain(fromChain);
    setFromToken(toToken);
    setToToken(fromToken);
    setFromAmount(toAmount);
    setToAmount(fromAmount);
  };

  const handleFromAmountChange = (value: string) => {
    if (isValidAmount(value)) {
      setFromAmount(value);
      setToAmount(value || '');
    }
  };

  const allowBridge = () => {
    return (
      isChainConnected &&
      isChainConnected(fromChain.name) &&
      (isChainConnected(toChain.name) || destinationAddress) &&
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
        const connectedWallet = getWalletByChain('solana');

        const signature = await lockSplTokens(
          connectedWallet?.walletProvider,
          parseFloat(fromAmount)
        );

        console.log('Transaction successful:', signature);
        alert(`Tokens locked successfully! Signature: ${signature}`);

        setFromAmount('');
        setToAmount('');
        setDestinationAddress('');
        await fetchFromBalance();
      } else {
        throw new Error('Only Solana to Sheet bridge is currently supported');
      }
    } catch (error: any) {
      console.error('Bridge transaction failed:', error);
      alert(`Transaction failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchFromBalance = async () => {
    if (!fromChain || !isChainConnected || !isChainConnected(fromChain.name)) {
      setFromBalance('0');
      return;
    }
    const wallet = getWalletByChain(fromChain.name);
    if (!wallet?.address) {
      setFromBalance('0');
      return;
    }

    try {
      if (fromChain.name === 'solana') {
        const balance = await getSplTokenBalance(wallet.address);
        setFromBalance(parseFloat(balance.toFixed(2)).toString());
      } else if (fromChain.name === 'sheet chain') {
        const balance = await getSheetBalance(wallet.address);
        setFromBalance(parseFloat(balance.toFixed(2)).toString());
      }
    } catch (error) {
      setFromBalance('0');
    }
  };

  const fetchToBalance = async () => {
    if (!toChain || !isChainConnected || !isChainConnected(toChain.name)) {
      setToBalance('0');
      return;
    }
    const wallet = getWalletByChain(toChain.name);
    if (!wallet?.address) {
      setToBalance('0');
      return;
    }

    try {
      if (toChain.name === 'solana') {
        const balance = await getSplTokenBalance(wallet.address);
        setToBalance(parseFloat(balance.toFixed(2)).toString());
      } else if (toChain.name === 'sheet chain') {
        const balance = await getSheetBalance(wallet.address);
        setToBalance(parseFloat(balance.toFixed(2)).toString());
      }
    } catch (error) {
      setToBalance('0');
    }
  };

  useEffect(() => {
    fetchFromBalance();
  }, [fromChain, isChainConnected]);

  useEffect(() => {
    fetchToBalance();
  }, [toChain, isChainConnected]);

  return (
    <div className="w-full max-w-lg mx-auto">
      <div className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-600">You pay</span>
              <span className="text-sm text-gray-500">
                Balance: {fromBalance} {fromToken.symbol}
              </span>
            </div>

            <div className="flex items-center space-x-3">
              <TokenChainSelector
                selectedToken={fromToken}
                selectedChain={fromChain}
                onTokenSelect={setFromToken}
                onChainSelect={setFromChain}
                label=""
              />

              <input
                type="text"
                value={fromAmount}
                onChange={(e) => handleFromAmountChange(e.target.value)}
                placeholder="0"
                className="flex-1 text-2xl font-semibold bg-transparent outline-none text-right"
              />
            </div>
          </div>

          <div className="flex justify-center">
            <button
              onClick={handleSwap}
              className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <ArrowSwapIcon className="w-6 h-6 text-gray-600" />
            </button>
          </div>

          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-600">
                You receive
              </span>
              <span className="text-sm text-gray-500">
                Balance: {toBalance} {toToken.symbol}
              </span>
            </div>

            <div className="flex items-center space-x-3">
              <TokenChainSelector
                selectedToken={toToken}
                selectedChain={toChain}
                onTokenSelect={setToToken}
                onChainSelect={setToChain}
                label=""
              />

              <input
                type="text"
                value={toAmount}
                readOnly
                placeholder="0"
                className="flex-1 text-2xl font-semibold bg-transparent outline-none text-right"
              />
            </div>
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Send to another address
            </label>
            <input
              type="text"
              value={destinationAddress}
              onChange={(e) => setDestinationAddress(e.target.value)}
              placeholder={'Enter ' + toChain.name + ' address'}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          <Button
            onClick={handleBridge}
            disabled={isLoading || !allowBridge()}
            size="lg"
            className="w-full"
          >
            {isLoading ? (
              <span className="flex items-center justify-center">
                <SpinnerIcon className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" />
                Processing...
              </span>
            ) : (
              'Bridge Token'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
