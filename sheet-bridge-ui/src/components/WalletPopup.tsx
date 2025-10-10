import React from 'react';
import { formatAddress } from '../utils/format';
import { WALLETS } from '../config';
import { Button } from './ui/Button';

interface ConnectedWallet {
  address: string;
  type: string;
  chain: string;
}

interface WalletPopupProps {
  wallets: ConnectedWallet[];
  onDisconnect: (chain: string) => void;
}

export const WalletPopup: React.FC<WalletPopupProps> = ({
  wallets,
  onDisconnect,
}) => {
  return (
    <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 p-4 z-50">
      <div className="flex flex-col space-y-3">
        {wallets.map((wallet) => {
          const walletInfo = WALLETS.find((w) => w.type === wallet.type);

          return (
            <div key={wallet.chain} className="flex flex-col space-y-2">
              <div className="flex items-center space-x-3">
                {walletInfo && (
                  <img
                    src={walletInfo.icon}
                    alt={walletInfo.name}
                    className="w-10 h-10 rounded-lg"
                  />
                )}
                <div className="flex-1">
                  <div className="text-sm font-semibold text-gray-900 capitalize">
                    {wallet.chain}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatAddress(wallet.address)}
                  </div>
                </div>
              </div>

              <Button
                variant="danger"
                size="sm"
                onClick={() => onDisconnect(wallet.chain)}
                className="w-full"
              >
                Disconnect
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
