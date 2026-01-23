import {
  createPublicClient,
  http,
  formatEther,
  parseEther,
  encodeFunctionData,
  type WalletClient,
  defineChain,
} from 'viem';
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

/**
 * Test RPC connection by calling a simple RPC method
 */
export async function testRpcConnection(): Promise<boolean> {
  try {
    const client = createPublicClient({
      chain: sheetChainForClient,
      transport: http(SHEET_RPC_ENDPOINT, {
        retryCount: 1,
        retryDelay: 500,
        timeout: 5000,
      }),
    });
    
    const chainId = await client.getChainId();
    console.log('RPC connection test successful. Chain ID:', chainId);
    return chainId === 12345;
  } catch (error) {
    console.error('RPC connection test failed:', error);
    console.error('RPC Endpoint:', SHEET_RPC_ENDPOINT);
    return false;
  }
}

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

  // Test RPC connection before attempting transaction
  console.log('Testing RPC connection before bridgeOut...');
  const rpcConnected = await testRpcConnection();
  if (!rpcConnected) {
    throw new Error(
      `Cannot connect to SheetChain RPC at ${SHEET_RPC_ENDPOINT}.\n\n` +
      `Please check:\n` +
      `1. The RPC server is running and accessible\n` +
      `2. Your network connection\n` +
      `3. If using MetaMask, ensure the SheetChain network is configured with RPC URL: ${SHEET_RPC_ENDPOINT}`
    );
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
    console.error('RPC Endpoint configured:', SHEET_RPC_ENDPOINT);
    
    // Provide more helpful error messages
    const errorMessage = error?.message || error?.toString() || '';
    const errorDetails = error?.details || '';
    
    // Check for RPC connection issues
    if (
      errorMessage.includes('Requested resource not available') ||
      errorMessage.includes('RPC endpoint returned too many errors') ||
      errorMessage.includes('circuit breaker') ||
      errorMessage.includes('Execution prevented') ||
      errorDetails.includes('Requested resource not available')
    ) {
      throw new Error(
        `RPC connection failed. The SheetChain RPC endpoint may not be reachable.\n\n` +
        `Expected endpoint: ${SHEET_RPC_ENDPOINT}\n\n` +
        `If you're using MetaMask, please:\n` +
        `1. Go to MetaMask Settings > Networks\n` +
        `2. Find SheetChain (Chain ID: 12345)\n` +
        `3. Remove it and re-add it with RPC URL: ${SHEET_RPC_ENDPOINT}\n` +
        `4. Or use the "Add Network" button in the app to re-add it automatically.`
      );
    }
    
    throw error;
  }
}

export async function bridgeTransfer(
  walletClient: WalletClient | undefined,
  fromAddress: string,
  recipient: string,
  amount: number
): Promise<string> {
  if (!walletClient) {
    throw new Error('Wallet client not available. Please connect your wallet.');
  }

  const trimmedRecipient = recipient.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmedRecipient)) {
    throw new Error('Invalid recipient address (expected 0x-prefixed address)');
  }

  if (!(amount > 0)) {
    throw new Error('Amount must be greater than zero');
  }

  const amountInWei = parseEther(amount.toString());

  const data = encodeFunctionData({
    abi: [
      {
        name: 'bridgeTransfer',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
          { name: 'recipient', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
        outputs: [],
      },
    ],
    functionName: 'bridgeTransfer',
    args: [trimmedRecipient as `0x${string}`, amountInWei],
  });

  try {
    const txHash = await walletClient.sendTransaction({
      chain: sheetChain,
      account: fromAddress as `0x${string}`,
      to: BRIDGE_CONTRACT_ADDRESS as `0x${string}`,
      data,
      value: 0n,
    });

    return txHash;
  } catch (error: any) {
    console.error('Error calling bridgeTransfer:', error);
    if (error?.message) {
      throw new Error(error.message);
    }
    throw error;
  }
}
