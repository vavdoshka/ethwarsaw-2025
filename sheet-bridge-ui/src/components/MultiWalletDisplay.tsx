import React, { useState, useRef, useEffect } from 'react';
import { useWallet } from '../contexts/walletContext';
import { useWallet as useSolanaWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useAccount, useDisconnect } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { CHAINS } from '../config';
import { bsc, bscTestnet } from 'wagmi/chains';
import { IS_MAINNET } from '../config';

const SHEET_CHAIN_ID = 12345;

interface WalletInfo {
  chain: typeof CHAINS[0];
  address: string;
  isConnected: boolean;
}

export const MultiWalletDisplay: React.FC = () => {
  const { getWalletByChain, isChainConnected } = useWallet();
  const {
    publicKey: solanaPublicKey,
    connected: solanaConnected,
    disconnect: disconnectSolana,
  } = useSolanaWallet();
  const { setVisible: setSolanaModalVisible } = useWalletModal();
  const { address: evmAddress, isConnected: evmConnected, chain: currentEvmChain } = useAccount();
  const { disconnect: disconnectEvm } = useDisconnect();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Format address to show first 4 and last 4 characters
  const formatAddress = (address: string) => {
    if (!address) return '';
    if (address.length <= 8) return address;
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  // Get wallet info for each chain
  const getWalletInfo = (chain: typeof CHAINS[0]): WalletInfo => {
    const wallet = getWalletByChain(chain.name);
    const isConnected = isChainConnected(chain.name);
    
    let address = '';
    if (chain.name === 'solana' && solanaPublicKey) {
      address = solanaPublicKey.toBase58();
    } else if (evmConnected && evmAddress) {
      address = evmAddress;
    }

    return {
      chain,
      address,
      isConnected,
    };
  };

  const wallets = CHAINS.map(getWalletInfo);

  const handleSolanaConnect = () => {
    setSolanaModalVisible(true);
    setIsOpen(false);
  };

  const handleSolanaDisconnect = async () => {
    if (disconnectSolana) {
      await disconnectSolana();
    }
    setIsOpen(false);
  };

  const handleEvmConnect = (openConnectModal: () => void) => {
    openConnectModal();
    setIsOpen(false);
  };

  const handleEvmDisconnect = () => {
    disconnectEvm();
    setIsOpen(false);
  };

  // Determine which EVM chain is currently connected
  const getCurrentEvmChainName = (): string => {
    if (!evmConnected || !currentEvmChain) return '';
    
    const bscChainConfig = IS_MAINNET ? bsc : bscTestnet;
    if (currentEvmChain.id === bscChainConfig.id) {
      return 'bsc';
    } else if (currentEvmChain.id === SHEET_CHAIN_ID) {
      return 'sheet chain';
    }
    return 'sheet chain'; // default
  };

  // Check if a specific EVM chain is connected
  const isEvmChainConnected = (chainName: string): boolean => {
    if (!evmConnected) return false;
    const currentChain = getCurrentEvmChainName();
    return currentChain === chainName;
  };

  const connectedCount = wallets.filter(w => w.isConnected).length;

  return (
    <div ref={dropdownRef} className="relative h-full">
      <button
        onClick={() => setIsOpen(!isOpen)}
        type="button"
        className="inline-flex items-center justify-center gap-2 h-full px-6 min-w-[150px] text-sm font-medium bg-[#00c853] hover:bg-[#00b64f] text-white transition-colors duration-200 cursor-pointer rounded-none"
      >
        <span>
          {connectedCount > 0 ? `${connectedCount} Connected` : 'Connect Wallets'}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        >
          <polyline points="9 6 6 9 3 6"></polyline>
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-80 bg-[#1a1a1a] border border-white/[0.15] shadow-lg z-50 max-h-[600px] overflow-y-auto">
          <div className="py-2">
            <div className="px-4 py-2 border-b border-white/[0.08]">
              <h3 className="text-sm font-medium text-white">Connected Wallets</h3>
            </div>
            
            {wallets.map((wallet) => {
              const isEvmChain = wallet.chain.name === 'sheet chain' || wallet.chain.name === 'bsc';
              const isThisEvmChainConnected = isEvmChain && isEvmChainConnected(wallet.chain.name);

              return (
                <div
                  key={wallet.chain.id}
                  className="px-4 py-3 border-b border-white/[0.08] last:border-b-0 hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-8 h-8 flex-shrink-0 rounded-full overflow-hidden bg-white/5 border border-white/[0.1]">
                        <img
                          src={wallet.chain.icon}
                          alt={wallet.chain.display_name}
                          className="w-full h-full object-contain p-1"
                          onError={(e) => {
                            // Fallback if image fails to load
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white truncate">
                          {wallet.chain.display_name}
                        </div>
                        {(wallet.isConnected || (isEvmChain && isThisEvmChainConnected)) && wallet.address && (
                          <div className="text-xs text-white/60 truncate">
                            {formatAddress(wallet.address)}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {wallet.chain.name === 'solana' ? (
                        solanaConnected ? (
                          <button
                            onClick={handleSolanaDisconnect}
                            className="px-3 py-1.5 text-xs font-medium text-white/80 hover:text-white bg-white/5 hover:bg-white/10 border border-white/[0.1] rounded transition-colors"
                          >
                            Disconnect
                          </button>
                        ) : (
                          <button
                            onClick={handleSolanaConnect}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-[#00c853] hover:bg-[#00b64f] rounded transition-colors"
                          >
                            Connect
                          </button>
                        )
                      ) : isEvmChain ? (
                        <ConnectButton.Custom>
                          {({ openConnectModal, account }) => {
                            if (isThisEvmChainConnected && account) {
                              return (
                                <button
                                  onClick={handleEvmDisconnect}
                                  className="px-3 py-1.5 text-xs font-medium text-white/80 hover:text-white bg-white/5 hover:bg-white/10 border border-white/[0.1] rounded transition-colors"
                                >
                                  Disconnect
                                </button>
                              );
                            }
                            return (
                              <button
                                onClick={() => handleEvmConnect(openConnectModal)}
                                className="px-3 py-1.5 text-xs font-medium text-white bg-[#00c853] hover:bg-[#00b64f] rounded transition-colors"
                              >
                                Connect
                              </button>
                            );
                          }}
                        </ConnectButton.Custom>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

