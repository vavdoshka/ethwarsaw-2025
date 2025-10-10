import React, { useState } from 'react';
import { useWallet } from '../contexts/walletContext';
import { WalletModal } from './WalletModal';
import { WalletPopup } from './WalletPopup';
import { Button } from './ui/Button';

export const Header: React.FC = () => {
  const { connectedWallets, disconnectWallet, fromChain, toChain } =
    useWallet();
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [showWalletPopup, setShowWalletPopup] = useState(false);

  const walletsConnected =
    connectedWallets.has(fromChain.name) && connectedWallets.has(toChain.name);
  const allWallets = Array.from(connectedWallets.values());

  const handleDisconnect = (chain: string) => {
    disconnectWallet(chain);
    if (connectedWallets.size <= 1) {
      setShowWalletPopup(false);
    }
  };

  return (
    <>
      <header className="w-full px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <img src="/sheet.svg" alt="Sheet Bridge" className="w-10 h-10" />
            <h1 className="text-xl font-bold text-gray-900">Sheet Bridge</h1>
          </div>

          <div className="relative">
            <div
              onMouseEnter={() => setShowWalletPopup(true)}
              onMouseLeave={() => setShowWalletPopup(false)}
            >
              {walletsConnected ? (
                <Button className="transform hover:scale-105">Connected</Button>
              ) : (
                <Button
                  onClick={() => setIsWalletModalOpen(true)}
                  className="transform hover:scale-105"
                >
                  Connect wallet
                </Button>
              )}
              {showWalletPopup && (
                <WalletPopup
                  wallets={allWallets}
                  onDisconnect={handleDisconnect}
                />
              )}
            </div>
          </div>
        </div>
      </header>

      <WalletModal
        isOpen={isWalletModalOpen}
        onClose={() => setIsWalletModalOpen(false)}
      />
    </>
  );
};
