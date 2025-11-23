import React from 'react';
import { useWallet } from '../contexts/walletContext';
import { useWallet as useSolanaWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { WalletButton } from './WalletButton';
import { WalletDisconnect } from './WalletDisconnect';
import { ChainAwareConnectButton } from './ChainAwareConnectButton';

export const Header: React.FC = () => {
  const { chain } = useWallet();
  const {
    publicKey,
    connected: solanaConnected,
    disconnect: disconnectSolana,
  } = useSolanaWallet();
  const { setVisible: setSolanaModalVisible } = useWalletModal();

  // Format Solana address like RainbowKit does (show first 4 and last 4 characters)
  const formatSolanaAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const handleSolanaClick = () => {
    setSolanaModalVisible(true);
  };

  const handleSolanaDisconnect = async () => {
    if (disconnectSolana) {
      await disconnectSolana();
    }
  };

  return (
    <header className="w-full bg-[#050505] border-b border-white/[0.15]">
      <div className="flex items-center justify-between h-12">
        <div className="flex items-center">
          <div className="w-12 h-12 flex items-center justify-center p-2 border border-white/[0.15]">
            <img
              src="/logo.png"
              alt="Sheet Bridge"
              className="w-full h-full object-contain"
            />
          </div>
          <div className=" h-6 mx-5"></div>
          <span className="text-[#d8d8d8] text-base font-normal">
            Sheet Bridge
          </span>
        </div>

        <div className="flex items-stretch h-full">
          {chain.name === 'solana' ? (
            solanaConnected && publicKey ? (
              <WalletDisconnect
                address={formatSolanaAddress(publicKey.toBase58())}
                onDisconnect={handleSolanaDisconnect}
              />
            ) : (
              <WalletButton
                onClick={handleSolanaClick}
                connected={false}
                address={undefined}
              />
            )
          ) : (
            <ChainAwareConnectButton />
          )}
        </div>
      </div>
    </header>
  );
};
