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

  // Validate and normalize RPC endpoint
  if (!SHEET_RPC_ENDPOINT || !SHEET_RPC_ENDPOINT.startsWith('http')) {
    throw new Error(`Invalid RPC endpoint: ${SHEET_RPC_ENDPOINT}`);
  }

  // Normalize RPC URL - remove trailing slash if present
  const normalizedRpcUrl = SHEET_RPC_ENDPOINT.replace(/\/$/, '');

  // Format chainId as hex string (12345 = 0x3039)
  const chainIdHex = `0x${SHEET_CHAIN_ID.toString(16)}`;

  // Prepare network parameters according to EIP-3085
  // MetaMask requires: chainId, chainName, nativeCurrency, rpcUrls
  // All fields must be valid and properly formatted
  const chainParams = {
    chainId: chainIdHex,
    chainName: 'SheetChain',
    nativeCurrency: {
      name: 'SHEET',
      symbol: 'SHEET',
      decimals: 18,
    },
    rpcUrls: [normalizedRpcUrl],
  };

  // Only add blockExplorerUrls if we have a valid URL
  // MetaMask may reject empty arrays, so we omit the field entirely

  try {
    console.log('Adding SheetChain to MetaMask with params:', JSON.stringify(chainParams, null, 2));
    console.log('Chain ID (decimal):', SHEET_CHAIN_ID, 'Chain ID (hex):', chainIdHex);
    console.log('RPC URL (normalized):', normalizedRpcUrl);
    
    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [chainParams],
    });
    console.log('SheetChain network added to MetaMask with RPC URL:', SHEET_RPC_ENDPOINT);
  } catch (error: any) {
    console.error('Error adding network to MetaMask:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    console.error('Error data:', error.data);
    
    if (error.code === 4902) {
      // Network already exists - MetaMask doesn't allow updating existing networks
      // User needs to manually remove and re-add, or we can try to update it
      console.warn('SheetChain network already exists in MetaMask. If you need to update the RPC URL, please remove it from MetaMask settings and re-add it.');
      throw new Error(
        `SheetChain network already exists in MetaMask with a different RPC URL.\n\n` +
        `To update it:\n` +
        `1. Go to MetaMask Settings > Networks\n` +
        `2. Find SheetChain (Chain ID: 12345) and remove it\n` +
        `3. Then try adding it again, or use the "Add Network" button\n\n` +
        `New RPC URL: ${SHEET_RPC_ENDPOINT}`
      );
    } else if (error.code === 4001) {
      // User rejected the request
      throw new Error('User rejected adding SheetChain network');
    } else {
      // Provide more detailed error information
      const errorDetails = error.message || error.toString();
      const suggestion = errorDetails.includes('parameter') || errorDetails.includes('invalid')
        ? '\n\nPlease ensure:\n- RPC URL is accessible\n- All required fields are present\n- Chain ID format is correct (0x3039 for 12345)'
        : '';
      throw new Error(`Failed to add SheetChain network: ${errorDetails}${suggestion}`);
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

