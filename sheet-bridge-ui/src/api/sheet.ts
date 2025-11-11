import { createPublicClient, http, formatEther, parseEther, encodeFunctionData, type WalletClient, defineChain } from 'viem';
import { SHEET_RPC_ENDPOINT } from '../config';
import { sheetChain } from '../App';

// Create a custom chain config for SheetChain (for public client)
const sheetChainForClient = defineChain({
  id: 12345,
  name: 'SheetChain',
  network: 'sheetchain',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: [SHEET_RPC_ENDPOINT],
    },
    public: {
      http: [SHEET_RPC_ENDPOINT],
    },
  },
  blockExplorers: {
    default: {
      name: 'SheetChain Explorer',
      url: '',
    },
  },
});

// Bridge contract address (using a special address for bridge operations)
const BRIDGE_CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000003';

export async function getSheetBalance(userAddress: string): Promise<number> {
  console.log('getSheetBalance: Fetching balance for', userAddress, 'from', SHEET_RPC_ENDPOINT);
  
  const client = createPublicClient({
    chain: sheetChainForClient,
    transport: http(SHEET_RPC_ENDPOINT, {
      retryCount: 3,
      retryDelay: 1000,
      timeout: 10000,
    }),
  });

  try {
    const balance = await client.getBalance({
      address: userAddress as `0x${string}`,
    });

    const balanceInEther = Number(formatEther(balance));
    console.log('getSheetBalance: Balance fetched successfully', balanceInEther, 'SHEET');
    return balanceInEther;
  } catch (error) {
    console.error('Error fetching SheetChain balance:', error);
    console.error('RPC Endpoint:', SHEET_RPC_ENDPOINT);
    console.error('Address:', userAddress);
    return 0;
  }
}

export async function bridgeOut(
  walletClient: WalletClient | undefined,
  fromAddress: string,
  amount: number,
  toAddress: string,
  destChainId: number
): Promise<string> {
  if (!walletClient) {
    throw new Error('Wallet client not available. Please connect your wallet.');
  }

  try {
    // Convert amount to wei (BigInt)
    const amountInWei = parseEther(amount.toString());
    
    // Check if toAddress is a Solana address (base58, 32-44 chars) or Ethereum address (0x...)
    // Validate on client side - both formats are valid strings
    const isSolanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(toAddress);
    const isEthereumAddress = /^0x[a-fA-F0-9]{40}$/.test(toAddress);
    
    if (!isSolanaAddress && !isEthereumAddress) {
      throw new Error(`Invalid address format: ${toAddress}`);
    }
    
    // Encode function data: bridgeOut(string toAddress, uint256 destChainId)
    // Use string type to accept both Ethereum and Solana addresses as-is
    const data = encodeFunctionData({
      abi: [{
        name: 'bridgeOut',
        type: 'function',
        stateMutability: 'payable',
        inputs: [
          { name: 'toAddress', type: 'string' },
          { name: 'destChainId', type: 'uint256' },
        ],
        outputs: [],
      }],
      functionName: 'bridgeOut',
      args: [toAddress, BigInt(destChainId)],
    });
    
    console.log('Sending bridge transaction:', {
      from: fromAddress,
      to: BRIDGE_CONTRACT_ADDRESS,
      value: amountInWei,
      data,
      chainId: sheetChain.id,
    });
    
    // Send transaction using wagmi walletClient
    // Explicitly specify SheetChain to ensure correct chain is used
    const txHash = await walletClient.sendTransaction({
      chain: sheetChain,
      to: BRIDGE_CONTRACT_ADDRESS as `0x${string}`,
      value: amountInWei,
      data: data,
    });
    
    return txHash;
  } catch (error: any) {
    console.error('Error calling bridgeOut:', error);
    // Provide more helpful error messages
    if (error?.message?.includes('circuit breaker') || error?.message?.includes('Execution prevented')) {
      throw new Error('RPC connection issue. Please refresh the page and ensure the RPC node is running on http://localhost:8545');
    }
    throw error;
  }
}
