import { createPublicClient, http, formatEther } from 'viem';
import { mainnet } from 'viem/chains';
import { SHEET_RPC_ENDPOINT } from '../config';

export async function getSheetBalance(userAddress: string): Promise<number> {
  const client = createPublicClient({
    chain: mainnet,
    transport: http(SHEET_RPC_ENDPOINT),
  });

  const balance = await client.getBalance({
    address: userAddress as `0x${string}`,
  });

  return Number(formatEther(balance));
}
