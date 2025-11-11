import { SHEET_RPC_ENDPOINT } from '../config';

const SHEET_CHAIN_ID = 12345;

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
    };
  }
}

export async function addSheetChainToMetaMask(): Promise<void> {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('MetaMask is not installed. Please install MetaMask to continue.');
  }

  try {
    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: `0x${SHEET_CHAIN_ID.toString(16)}`, // 12345 in hex = 0x3039
          chainName: 'SheetChain',
          nativeCurrency: {
            name: 'SHEET',
            symbol: 'SHEET',
            decimals: 18,
          },
          rpcUrls: [SHEET_RPC_ENDPOINT],
          blockExplorerUrls: [],
        },
      ],
    });
  } catch (error: any) {
    if (error.code === 4902) {
      // Network already exists, that's fine
      console.log('SheetChain network already exists in MetaMask');
    } else if (error.code === 4001) {
      // User rejected the request
      throw new Error('User rejected adding SheetChain network');
    } else {
      throw new Error(`Failed to add SheetChain network: ${error.message}`);
    }
  }
}

export async function switchToSheetChain(): Promise<void> {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('MetaMask is not installed. Please install MetaMask to continue.');
  }

  try {
    // First try to switch
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: `0x${SHEET_CHAIN_ID.toString(16)}` }],
    });
  } catch (error: any) {
    if (error.code === 4902) {
      // Chain not added, add it first
      await addSheetChainToMetaMask();
      // Then try to switch again
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${SHEET_CHAIN_ID.toString(16)}` }],
      });
    } else if (error.code === 4001) {
      throw new Error('User rejected switching to SheetChain network');
    } else {
      throw new Error(`Failed to switch to SheetChain: ${error.message}`);
    }
  }
}

