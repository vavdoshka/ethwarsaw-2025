import {
  createPublicClient,
  createWalletClient,
  custom,
  erc20Abi,
  formatUnits,
  http,
  isAddress,
  parseUnits,
  type EIP1193Provider,
} from 'viem';
import { bsc, bscTestnet } from 'viem/chains';
import {
  BSC_RPC_ENDPOINT,
  BSC_SHEET_BRIDGE_PROGRAM_ID,
  BSC_SHEET_TOKEN_ADDRESS,
  IS_MAINNET,
} from '../config';

const BSC_SHEET_DECIMALS = 18;
const BSC_CHAIN = IS_MAINNET ? bsc : bscTestnet;

const tokenLockAbi = [
  {
    inputs: [
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
      { internalType: 'address', name: 'recipient', type: 'address' },
    ],
    name: 'lock',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

export async function getBscBalance(userAddress: string): Promise<number> {
  const client = createPublicClient({
    chain: BSC_CHAIN,
    transport: http(BSC_RPC_ENDPOINT),
  });

  try {
    const balance = (await client.readContract({
      address: BSC_SHEET_TOKEN_ADDRESS as `0x${string}`,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [userAddress as `0x${string}`],
    })) as bigint;

    return Number(formatUnits(balance, BSC_SHEET_DECIMALS));
  } catch (error) {
    console.error('Failed to fetch BSC SHEET balance:', error);
    return 0;
  }
}

export async function lockBscTokens(
  amount: string | number,
  recipient: string
): Promise<string> {
  const ethereum = (window as typeof window & { ethereum?: EIP1193Provider })
    ?.ethereum;
  if (!ethereum) {
    throw new Error('EVM wallet provider not found');
  }

  const amountString = amount?.toString();
  if (!amountString || Number(amountString) <= 0) {
    throw new Error('Amount must be greater than 0');
  }

  if (!recipient || !isAddress(recipient)) {
    throw new Error('Invalid recipient address');
  }

  const walletClient = createWalletClient({
    chain: BSC_CHAIN,
    transport: custom(ethereum),
  });
  const publicClient = createPublicClient({
    chain: BSC_CHAIN,
    transport: http(BSC_RPC_ENDPOINT),
  });

  const [account] = await walletClient.getAddresses();
  if (!account) {
    throw new Error('No connected EVM wallet');
  }

  const currentChainId = await walletClient.getChainId();
  if (currentChainId !== BSC_CHAIN.id && walletClient.switchChain) {
    await walletClient.switchChain({ id: BSC_CHAIN.id });
  }

  const parsedAmount = parseUnits(amountString, BSC_SHEET_DECIMALS);

  const allowance = await publicClient.readContract({
    address: BSC_SHEET_TOKEN_ADDRESS as `0x${string}`,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [account, BSC_SHEET_BRIDGE_PROGRAM_ID as `0x${string}`],
  });

  if (allowance < parsedAmount) {
    const approveTx = await walletClient.writeContract({
      account,
      address: BSC_SHEET_TOKEN_ADDRESS as `0x${string}`,
      abi: erc20Abi,
      functionName: 'approve',
      args: [BSC_SHEET_BRIDGE_PROGRAM_ID as `0x${string}`, parsedAmount],
    });

    await publicClient.waitForTransactionReceipt({ hash: approveTx });
  }

  const txHash = await walletClient.writeContract({
    account,
    address: BSC_SHEET_BRIDGE_PROGRAM_ID as `0x${string}`,
    abi: tokenLockAbi,
    functionName: 'lock',
    args: [parsedAmount, recipient as `0x${string}`],
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });

  return txHash;
}
