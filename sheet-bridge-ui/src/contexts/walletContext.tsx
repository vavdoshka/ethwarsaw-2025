import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import type { WalletType, Chain } from '../types/index';
import { CHAINS, WALLETS } from '../config';

const STORAGE_KEYS = {
  phantom: 'phantom_disconnected',
  metamask: 'metamask_disconnected',
} as const;

interface ConnectedWallet {
  address: string;
  type: WalletType;
  chain: string;
  walletProvider: any;
}

interface WalletContextState {
  connectedWallets: Map<string, ConnectedWallet>;
  connectWallet: (type: WalletType) => Promise<void>;
  disconnectWallet: (chain: string) => Promise<void>;
  getWalletByChain: (chain: string) => ConnectedWallet | undefined;
  isChainConnected: (chain: string) => boolean;
  isLoading: boolean;
  error: string | null;
  fromChain: Chain;
  toChain: Chain;
  setFromChain: (chain: Chain) => void;
  setToChain: (chain: Chain) => void;
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
  const [connectedWallets, setConnectedWallets] = useState<
    Map<string, ConnectedWallet>
  >(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromChain, setFromChain] = useState<Chain>(CHAINS[1]);
  const [toChain, setToChain] = useState<Chain>(CHAINS[0]);

  const getWalletProvider = (type: WalletType) => {
    const windowAny = window as any;
    return type === 'phantom' ? windowAny.solana : windowAny.ethereum;
  };

  const getWalletConfigByType = (type: WalletType) => {
    return WALLETS.find((w) => w.type === type);
  };

  const getDisconnectedState = (type: WalletType): boolean => {
    return localStorage.getItem(STORAGE_KEYS[type]) === 'true';
  };

  const setDisconnectedState = (type: WalletType, disconnected: boolean) => {
    if (disconnected) {
      localStorage.setItem(STORAGE_KEYS[type], 'true');
    } else {
      localStorage.removeItem(STORAGE_KEYS[type]);
    }
  };

  const addWalletToState = (
    walletConfig: any,
    address: string,
    type: WalletType
  ) => {
    setConnectedWallets((prev) => {
      const newMap = new Map(prev);
      newMap.set(walletConfig.chain, {
        address,
        type,
        chain: walletConfig.chain,
        walletProvider: getWalletProvider(type),
      });
      return newMap;
    });
  };

  const connectPhantom = async (): Promise<string> => {
    const solana = getWalletProvider('phantom');
    if (!solana?.isPhantom) {
      throw new Error(
        'Phantom wallet not found. Please install it from phantom.app'
      );
    }

    const response = await solana.connect();
    setDisconnectedState('phantom', false);
    return response.publicKey.toString();
  };

  const connectMetamask = async (): Promise<string> => {
    const ethereum = getWalletProvider('metamask');
    if (!ethereum?.isMetaMask) {
      throw new Error(
        'MetaMask wallet not found. Please install it from metamask.io'
      );
    }

    const accounts = await ethereum.request({
      method: 'eth_requestAccounts',
    });

    if (accounts.length === 0) {
      throw new Error('No accounts found in MetaMask');
    }

    setDisconnectedState('metamask', false);
    return accounts[0];
  };

  const connectWallet = async (type: WalletType) => {
    setIsLoading(true);
    setError(null);

    try {
      const walletConfig = getWalletConfigByType(type);
      if (!walletConfig) {
        throw new Error('Unknown wallet type');
      }

      const connectHandlers: Record<WalletType, () => Promise<string>> = {
        phantom: connectPhantom,
        metamask: connectMetamask,
      };

      const address = await connectHandlers[type]();
      addWalletToState(walletConfig, address, type);
      setError(null);
    } catch (err: any) {
      console.error('Error connecting wallet:', err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const disconnectWallet = async (chain: string) => {
    const wallet = connectedWallets.get(chain);
    if (!wallet) return;

    if (wallet.type === 'phantom') {
      const solana = getWalletProvider('phantom');
      if (solana) {
        try {
          await solana.disconnect();
        } catch (err) {
          console.error('Error disconnecting Phantom:', err);
        }
      }
    }

    setDisconnectedState(wallet.type, true);
    setConnectedWallets((prev) => {
      const newMap = new Map(prev);
      newMap.delete(chain);
      return newMap;
    });
    setError(null);
  };

  const getWalletByChain = (chain: string): ConnectedWallet | undefined => {
    return connectedWallets.get(chain);
  };

  const isChainConnected = (chain: string): boolean => {
    return connectedWallets.has(chain);
  };

  useEffect(() => {
    const checkWalletConnection = async () => {
      const phantomWalletConfig = getWalletConfigByType('phantom');
      const metamaskWalletConfig = getWalletConfigByType('metamask');

      const solana = getWalletProvider('phantom');
      if (
        solana?.isPhantom &&
        phantomWalletConfig &&
        !getDisconnectedState('phantom')
      ) {
        try {
          const response = await solana.connect({ onlyIfTrusted: true });
          addWalletToState(
            phantomWalletConfig,
            response.publicKey.toString(),
            'phantom'
          );
        } catch (err) {
          console.log('Phantom not connected');
        }
      }

      const ethereum = getWalletProvider('metamask');
      if (
        ethereum?.isMetaMask &&
        metamaskWalletConfig &&
        !getDisconnectedState('metamask')
      ) {
        try {
          const accounts = await ethereum.request({ method: 'eth_accounts' });
          if (accounts.length > 0) {
            addWalletToState(metamaskWalletConfig, accounts[0], 'metamask');
          }
        } catch (err) {
          console.log('MetaMask not connected');
        }
      }
    };

    checkWalletConnection();
  }, []);

  useEffect(() => {
    const solana = getWalletProvider('phantom');
    const ethereum = getWalletProvider('metamask');

    const handlePhantomDisconnect = () => {
      const phantomWalletConfig = getWalletConfigByType('phantom');
      if (!phantomWalletConfig) return;

      setConnectedWallets((prev) => {
        const newMap = new Map(prev);
        newMap.delete(phantomWalletConfig.chain);
        return newMap;
      });
    };

    const handleAccountsChanged = (accounts: string[]) => {
      const metamaskWalletConfig = getWalletConfigByType('metamask');
      if (!metamaskWalletConfig) return;

      if (accounts.length > 0) {
        setConnectedWallets((prev) => {
          const newMap = new Map(prev);
          const existingWallet = newMap.get(metamaskWalletConfig.chain);
          if (existingWallet?.type === 'metamask') {
            newMap.set(metamaskWalletConfig.chain, {
              ...existingWallet,
              address: accounts[0],
              walletProvider: getWalletProvider('metamask'),
            });
          }
          return newMap;
        });
      } else {
        disconnectWallet(metamaskWalletConfig.chain);
      }
    };

    if (solana?.isPhantom) {
      solana.on('disconnect', handlePhantomDisconnect);
    }

    if (ethereum) {
      ethereum.on('accountsChanged', handleAccountsChanged);
    }

    return () => {
      if (solana?.isPhantom) {
        solana.off('disconnect', handlePhantomDisconnect);
      }
      if (ethereum) {
        ethereum.removeListener('accountsChanged', handleAccountsChanged);
      }
    };
  }, []);

  return (
    <WalletContext.Provider
      value={{
        connectedWallets,
        connectWallet,
        disconnectWallet,
        getWalletByChain,
        isChainConnected,
        isLoading,
        error,
        fromChain,
        toChain,
        setFromChain,
        setToChain,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};
