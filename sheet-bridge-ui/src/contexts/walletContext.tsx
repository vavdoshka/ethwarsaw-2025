import React, {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import { useWallet as useSolanaWallet } from '@solana/wallet-adapter-react';
import { useAccount } from 'wagmi';
import type { Chain } from '../types/index';
import { CHAINS } from '../config';

interface ConnectedWallet {
  address: string;
  chain: string;
  walletProvider?: any;
  walletAdapter?: any;
}

interface WalletContextState {
  getWalletByChain: (chainName: string) => ConnectedWallet | undefined;
  isChainConnected: (chainName: string) => boolean;
  chain: Chain;
  setChain: (chain: Chain) => void;
}

const WalletContext = createContext<WalletContextState | undefined>(undefined);

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};

interface WalletProviderProps {
  children: ReactNode;
}

export const WalletProvider: React.FC<WalletProviderProps> = ({ children }) => {
  const {
    publicKey: solanaPublicKey,
    wallet: solanaWallet,
    signTransaction,
    signAllTransactions,
  } = useSolanaWallet();
  const { address: evmAddress, isConnected: evmConnected } = useAccount();
  const [chain, setChain] = useState<Chain>(CHAINS[1]);

  /**
   * Returns the connected wallet for the requested chain.
   * Checks actual wallet connection state from Solana adapter and wagmi.
   *
   * @param chainName - The name of the chain (e.g., 'solana', 'sheet chain')
   * @returns ConnectedWallet object if wallet is connected to that chain, undefined otherwise
   */
  const getWalletByChain = (chainName: string): ConnectedWallet | undefined => {
    const lowerChainName = chainName.toLowerCase();

    if (lowerChainName === 'solana') {
      if (solanaPublicKey) {
        return {
          address: solanaPublicKey.toBase58(),
          chain: 'solana',
          walletProvider: solanaWallet?.adapter,
          walletAdapter: {
            publicKey: solanaPublicKey,
            signTransaction,
            signAllTransactions,
            connected: true,
          },
        };
      }
      return undefined;
    }

    // Check EVM wallet (Sheet Chain, Ethereum, BSC or other EVM chains)
    if (
      lowerChainName === 'sheet chain' ||
      lowerChainName === 'ethereum' ||
      lowerChainName === 'bsc'
    ) {
      if (evmConnected && evmAddress) {
        return {
          address: evmAddress,
          chain: chainName,
          walletProvider: undefined, // wagmi manages the provider internally
          walletAdapter: undefined,
        };
      }
      return undefined;
    }

    return undefined;
  };

  /**
   * Checks if a wallet is connected for the given chain.
   *
   * @param chainName - The name of the chain to check
   * @returns true if a wallet is connected to that chain, false otherwise
   */
  const isChainConnected = (chainName: string): boolean => {
    return getWalletByChain(chainName) !== undefined;
  };

  return (
    <WalletContext.Provider
      value={{
        getWalletByChain,
        isChainConnected,
        chain,
        setChain,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};
