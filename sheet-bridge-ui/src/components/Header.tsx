import React, { useEffect } from 'react';
import { useWallet } from '../contexts/walletContext';
import { useWallet as useSolanaWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { WalletButton } from './WalletButton';
import { useSwitchChain, useAccount } from 'wagmi';
import { bsc, bscTestnet } from 'wagmi/chains';
import { IS_MAINNET } from '../config';

const SHEET_CHAIN_ID = 12345;

export const Header: React.FC = () => {
  const { chain } = useWallet();
  const { publicKey, connected: solanaConnected } = useSolanaWallet();
  const { setVisible: setSolanaModalVisible } = useWalletModal();
  const { switchChain } = useSwitchChain();
  const { isConnected: evmConnected, chain: currentEvmChain } = useAccount();

  // Auto-switch EVM network when chain changes
  useEffect(() => {
    if (!evmConnected || !switchChain || chain.name === 'solana') return;

    const bscChainConfig = IS_MAINNET ? bsc : bscTestnet;

    const targetChainId =
      chain.name === 'bsc' ? bscChainConfig.id : SHEET_CHAIN_ID;

    if (currentEvmChain?.id !== targetChainId) {
      switchChain({ chainId: targetChainId });
    }
  }, [chain, evmConnected, currentEvmChain, switchChain]);

  // Format Solana address like RainbowKit does (show first 4 and last 4 characters)
  const formatSolanaAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const handleSolanaClick = () => {
    setSolanaModalVisible(true);
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
            <WalletButton
              onClick={handleSolanaClick}
              connected={solanaConnected}
              address={
                publicKey
                  ? formatSolanaAddress(publicKey.toBase58())
                  : undefined
              }
            />
          ) : (
            <ConnectButton.Custom>
              {({
                account,
                chain,
                openAccountModal,
                openConnectModal,
                mounted,
              }) => {
                const ready = mounted;
                const connected = ready && account && chain;

                return (
                  <div
                    className="flex items-stretch h-full"
                    {...(!ready && {
                      'aria-hidden': true,
                      style: {
                        opacity: 0,
                        pointerEvents: 'none',
                        userSelect: 'none',
                      },
                    })}
                  >
                    <WalletButton
                      onClick={connected ? openAccountModal : openConnectModal}
                      connected={!!connected}
                      address={account?.displayName}
                    />
                  </div>
                );
              }}
            </ConnectButton.Custom>
          )}
        </div>
      </div>
    </header>
  );
};
