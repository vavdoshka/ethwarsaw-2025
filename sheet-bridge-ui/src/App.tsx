import { useMemo } from 'react';
import { WagmiProvider, http } from 'wagmi';
import { mainnet, sepolia, bsc, bscTestnet } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RainbowKitProvider,
  getDefaultConfig,
  darkTheme,
} from '@rainbow-me/rainbowkit';
import {
  ConnectionProvider,
  WalletProvider as SolanaWalletProvider,
} from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  TorusWalletAdapter,
  LedgerWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import { WalletProvider } from './contexts/walletContext';
import { Header } from './components/Header';
import { BridgeForm } from './components/BridgeForm';
import { Footer } from './components/Footer';
import {
  SOL_RPC_ENDPOINT,
  SHEET_RPC_ENDPOINT,
  BSC_RPC_ENDPOINT,
  IS_MAINNET,
} from './config';

// Import RainbowKit and Solana wallet adapter styles
import '@rainbow-me/rainbowkit/styles.css';
import '@solana/wallet-adapter-react-ui/styles.css';

// Configure wagmi with RainbowKit for EVM chains
const sheetChainConfig = IS_MAINNET ? mainnet : sepolia;
const bscChainConfig = IS_MAINNET ? bsc : bscTestnet;

const config = getDefaultConfig({
  appName: 'Sheet Bridge',
  projectId: '479c1dd316d4edfe4a4cce462bf1d26d',
  chains: [sheetChainConfig, bscChainConfig],
  transports: {
    [sheetChainConfig.id]: http(SHEET_RPC_ENDPOINT),
    [bscChainConfig.id]: http(BSC_RPC_ENDPOINT),
  },
});

// Create a query client for wagmi
const queryClient = new QueryClient();

function App() {
  // Configure all available Solana wallets
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new TorusWalletAdapter(),
      new LedgerWalletAdapter(),
    ],
    []
  );

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider modalSize="compact" theme={darkTheme()}>
          <ConnectionProvider endpoint={SOL_RPC_ENDPOINT}>
            <SolanaWalletProvider wallets={wallets} autoConnect>
              <WalletModalProvider>
                <WalletProvider>
                  <div className="app-shell flex min-h-screen flex-col">
                    <Header />

                    <main className="flex flex-col items-center justify-center">
                      <BridgeForm />
                    </main>

                    <Footer />
                  </div>
                </WalletProvider>
              </WalletModalProvider>
            </SolanaWalletProvider>
          </ConnectionProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;
