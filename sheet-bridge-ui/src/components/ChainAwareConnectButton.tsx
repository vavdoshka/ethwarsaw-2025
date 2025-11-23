import React, { useEffect } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { WalletButton } from './WalletButton';
import { WalletDisconnect } from './WalletDisconnect';
import { useDisconnect, useSwitchChain, useAccount } from 'wagmi';
import { useWallet } from '../contexts/walletContext';
import { mainnet, sepolia, bsc, bscTestnet } from 'wagmi/chains';
import { IS_MAINNET } from '../config';

export const ChainAwareConnectButton: React.FC = () => {
  const { chain } = useWallet();
  const { disconnect: disconnectEvm } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { isConnected: evmConnected, chain: currentEvmChain } = useAccount();

  // Auto-switch EVM network when chain changes
  useEffect(() => {
    if (!evmConnected || !switchChain || chain.name === 'solana') return;

    const sheetChainConfig = IS_MAINNET ? mainnet : sepolia;
    const bscChainConfig = IS_MAINNET ? bsc : bscTestnet;

    let targetChainId: number;
    if (chain.name === 'bsc') {
      targetChainId = bscChainConfig.id;
    } else if (chain.name === 'sheet chain') {
      targetChainId = sheetChainConfig.id;
    } else {
      // Default to sheet chain for unknown chains
      targetChainId = sheetChainConfig.id;
    }

    if (currentEvmChain?.id !== targetChainId) {
      switchChain({ chainId: targetChainId });
    }
  }, [chain, evmConnected, currentEvmChain, switchChain]);

  const handleEvmDisconnect = () => {
    disconnectEvm();
  };

  // Determine which chain to connect to based on selected chain
  const getTargetChainId = () => {
    const sheetChainConfig = IS_MAINNET ? mainnet : sepolia;
    const bscChainConfig = IS_MAINNET ? bsc : bscTestnet;

    if (chain.name === 'bsc') {
      return bscChainConfig.id;
    } else {
      return sheetChainConfig.id;
    }
  };

  const handleConnect = (openConnectModal: () => void) => {
    // Set the target chain before opening the modal
    const targetChainId = getTargetChainId();

    // If we can switch chain, do it before connecting
    if (switchChain) {
      try {
        switchChain({ chainId: targetChainId });
      } catch (error) {
        console.log(
          'Chain switch not available yet, will switch after connect'
        );
      }
    }

    openConnectModal();
  };

  return (
    <ConnectButton.Custom>
      {({ account, chain, openConnectModal, mounted }) => {
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
            {connected ? (
              <WalletDisconnect
                address={account.displayName}
                onDisconnect={handleEvmDisconnect}
              />
            ) : (
              <WalletButton
                onClick={() => handleConnect(openConnectModal)}
                connected={false}
                address={undefined}
              />
            )}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
};
