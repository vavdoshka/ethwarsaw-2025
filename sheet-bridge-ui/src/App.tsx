import { WalletProvider } from './contexts/walletContext';
import { Header } from './components/Header';
import { BridgeForm } from './components/BridgeForm';
import { Footer } from './components/Footer';

function App() {
  return (
    <WalletProvider>
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50">
        <Header />

        <main className="container mx-auto px-4 py-12">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Bridge Your Sheet
            </h2>
          </div>

          <BridgeForm />
        </main>

        <Footer />
      </div>
    </WalletProvider>
  );
}

export default App;
