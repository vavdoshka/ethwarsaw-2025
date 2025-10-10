import React from 'react';
import type { WalletType } from '../types/index';
import { useWallet } from '../contexts/walletContext';
import { WALLETS } from '../config';
import { Modal } from './ui/Modal';

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WalletModal: React.FC<WalletModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { connectWallet, isLoading, error } = useWallet();

  const handleWalletClick = async (walletType: WalletType) => {
    await connectWallet(walletType);
    if (!error) {
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Connect Wallet">
      <div className="p-6">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          {WALLETS.map((wallet) => (
            <button
              key={wallet.type}
              onClick={() => handleWalletClick(wallet.type)}
              disabled={isLoading}
              className="flex flex-col items-center justify-center p-6 bg-gray-50 hover:bg-gray-100 rounded-xl transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <img
                src={wallet.icon}
                alt={wallet.name}
                className="w-12 h-12 mb-3"
              />
              <span className="text-sm font-medium text-gray-900">
                {wallet.name}
              </span>
            </button>
          ))}
        </div>

        <p className="mt-6 text-xs text-gray-500 text-center">
          By connecting your wallet you agree with Terms of Service and Privacy
          Policy
        </p>
      </div>
    </Modal>
  );
};
