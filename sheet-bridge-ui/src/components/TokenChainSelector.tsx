import React, { useState, useRef, useEffect } from 'react';
import type { Chain, Token } from '../types/index';
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
  availableChains: Chain[];
  label: string;
}

export const TokenChainSelector: React.FC<TokenChainSelectorProps> = ({
  selectedToken,
  selectedChain,
  onTokenSelect,
  onChainSelect,
  availableChains,
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
      {label && (
        <label className="text-xs uppercase tracking-[0.2em] text-white/40 mb-2 block">
          {label}
        </label>
      )}

      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 border border-white/10 bg-black/30 px-4 py-3 text-left text-white hover:border-white/30 transition-colors flex-shrink-0"
      >
        <img
          src={selectedToken.icon}
          alt={selectedToken.symbol}
          className="w-6 h-6"
        />
        <div className="flex flex-col">
          <span className="text-sm font-semibold">{selectedToken.symbol}</span>
          {/* <span className="text-xs text-white/40 capitalize">
            {selectedChain.name}
          </span> */}
        </div>
        <ChevronDownIcon
          className={`ml-auto w-4 h-4 text-white/60 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
          <div
            ref={modalRef}
            className="max-w-4xl w-full border border-white/10 bg-[#070707] shadow-[0_40px_120px_rgba(0,0,0,0.7)] overflow-hidden"
          >
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="text-xl font-semibold text-white">
                Select Token and Chain
              </h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-white/50 hover:text-white transition-colors"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="flex flex-col md:flex-row">
              <div className="md:w-1/2 border-b md:border-b-0 md:border-r border-white/5">
                <div className="h-96 overflow-y-auto">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
                    {availableChains.map((chain) => (
                      <button
                        key={chain.id}
                        onClick={() => handleChainSelect(chain)}
                        className={`flex items-center gap-3 border px-4 py-3 transition-all ${
                          tempSelectedChain.id === chain.id
                            ? 'border-[#00c853] bg-[#00c853]/10'
                            : 'border-white/10 hover:border-white/30'
                        }`}
                      >
                        <img
                          src={chain.icon}
                          alt={chain.name}
                          className="w-8 h-8"
                        />
                        <span className="font-medium text-white">
                          {chain.name}
                        </span>
                        {tempSelectedChain.id === chain.id && (
                          <CheckCircleIcon className="w-5 h-5 text-[#00c853] ml-auto" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="md:w-1/2">
                <div className="h-96 overflow-y-auto">
                  <div className="p-4 space-y-2">
                    {availableTokens.map((token) => (
                      <button
                        key={token.symbol}
                        onClick={() => handleTokenSelect(token)}
                        className="w-full flex items-center justify-between border border-white/10 px-4 py-3 text-white hover:border-[#00c853] hover:bg-[#00c853]/5 transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <img
                            src={token.icon}
                            alt={token.symbol}
                            className="w-10 h-10"
                          />
                          <div className="text-left">
                            <div className="font-medium">{token.symbol}</div>
                            <div className="text-sm text-white/50">
                              {token.name}
                            </div>
                          </div>
                        </div>
                        <ArrowRightIcon className="w-5 h-5 text-white/40" />
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
