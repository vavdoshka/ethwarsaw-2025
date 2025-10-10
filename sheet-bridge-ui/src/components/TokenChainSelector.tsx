import React, { useState, useRef, useEffect } from 'react';
import type { Chain, Token } from '../types/index';
import { CHAINS } from '../config';
import { useClickOutside } from '../hooks/useClickOutside';
import {
  ChevronDownIcon,
  CloseIcon,
  CheckCircleIcon,
  ArrowRightIcon,
} from './ui/icons';

interface TokenChainSelectorProps {
  selectedToken: Token;
  selectedChain: Chain;
  onTokenSelect: (token: Token) => void;
  onChainSelect: (chain: Chain) => void;
  label: string;
}

export const TokenChainSelector: React.FC<TokenChainSelectorProps> = ({
  selectedToken,
  selectedChain,
  onTokenSelect,
  onChainSelect,
  label,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [tempSelectedChain, setTempSelectedChain] =
    useState<Chain>(selectedChain);
  const modalRef = useRef<HTMLDivElement>(null);

  useClickOutside(modalRef, () => setIsOpen(false), isOpen);

  useEffect(() => {
    setTempSelectedChain(selectedChain);
  }, [selectedChain]);

  const availableTokens = tempSelectedChain.tokens;

  const handleChainSelect = (chain: Chain) => {
    setTempSelectedChain(chain);
  };

  const handleTokenSelect = (token: Token) => {
    onTokenSelect(token);
    onChainSelect(tempSelectedChain);
    setIsOpen(false);
  };

  return (
    <>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          {label}
        </label>

        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center space-x-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          <img
            src={selectedToken.icon}
            alt={selectedToken.symbol}
            className="w-6 h-6"
          />
          <span className="font-medium">{selectedToken.symbol}</span>
          <ChevronDownIcon
            className={`w-4 h-4 transition-transform ${isOpen ? 'transform rotate-180' : ''}`}
          />
        </button>
      </div>

      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div
            ref={modalRef}
            className="bg-white rounded-xl shadow-2xl max-w-4xl w-full mx-4 max-h-[80vh] overflow-hidden"
          >
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                Select Token and Chain
              </h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-500 hover:text-gray-700 transition-colors"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="flex">
              <div className="w-1/2 border-r border-gray-200">
                <div className="h-96 overflow-y-auto">
                  <div className="grid grid-cols-2 gap-2 p-4">
                    {CHAINS.map((chain) => (
                      <button
                        key={chain.id}
                        onClick={() => handleChainSelect(chain)}
                        className={`flex items-center space-x-3 px-4 py-3 rounded-lg border-2 transition-all ${
                          tempSelectedChain.id === chain.id
                            ? 'border-purple-500 bg-purple-50'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <img
                          src={chain.icon}
                          alt={chain.name}
                          className="w-8 h-8"
                        />
                        <span className="font-medium">{chain.name}</span>
                        {tempSelectedChain.id === chain.id && (
                          <CheckCircleIcon className="w-5 h-5 text-purple-500 ml-auto" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="w-1/2">
                <div className="h-96 overflow-y-auto">
                  <div className="p-4 space-y-2">
                    {availableTokens.map((token) => (
                      <button
                        key={token.symbol}
                        onClick={() => handleTokenSelect(token)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 rounded-lg transition-colors"
                      >
                        <div className="flex items-center space-x-3">
                          <img
                            src={token.icon}
                            alt={token.symbol}
                            className="w-10 h-10"
                          />
                          <div className="text-left">
                            <div className="font-medium">{token.symbol}</div>
                            <div className="text-sm text-gray-500">
                              {token.name}
                            </div>
                          </div>
                        </div>
                        <ArrowRightIcon className="w-5 h-5 text-gray-400" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
