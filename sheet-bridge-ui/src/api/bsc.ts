import { createPublicClient, http, formatUnits } from 'viem';
import { bsc } from 'viem/chains';
import { BSC_RPC_ENDPOINT, BSC_SHEET_TOKEN_ADDRESS } from '../config';

const BSC_SHEET_DECIMALS = 18;

const erc20Abi = [
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    type: 'function',
  },
] as const;

export async function getBscBalance(userAddress: string): Promise<number> {
  const client = createPublicClient({
    chain: bsc,
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
