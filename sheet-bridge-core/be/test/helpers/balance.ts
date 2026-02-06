/**
 * Balance checking helpers for e2e tests
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { JsonRpcProvider, formatEther } from 'ethers';
import { SOLANA_TOKEN_MINT } from '../../src/config';
import { waitFor } from '../setup';

/**
 * Get Solana SPL token balance
 * Uses 'confirmed' commitment to get the most recent balance
 */
export async function getSolanaTokenBalance(
  connection: Connection,
  address: string
): Promise<bigint> {
  const publicKey = new PublicKey(address);
  const mintAddress = new PublicKey(SOLANA_TOKEN_MINT);
  
  try {
    const tokenAccounts = await connection.getTokenAccountsByOwner(publicKey, {
      mint: mintAddress,
    }, 'confirmed');
    
    if (tokenAccounts.value.length === 0) {
      return 0n;
    }
    
    // Use 'confirmed' commitment to get the most recent balance
    const accountInfo = await getAccount(connection, tokenAccounts.value[0].pubkey, 'confirmed');
    return BigInt(accountInfo.amount.toString());
  } catch (error) {
    console.error(`Error fetching Solana balance for ${address}:`, error);
    throw error;
  }
}

/**
 * Get Sheet Chain balance
 */
export async function getSheetBalance(
  provider: JsonRpcProvider,
  address: string
): Promise<bigint> {
  const balance = await provider.getBalance(address);
  return balance;
}

/**
 * Wait for balance to change by expected amount
 * Handles both positive (increase) and negative (decrease) changes
 */
export async function waitForBalanceChange(
  getBalance: () => Promise<bigint>,
  initialBalance: bigint,
  expectedChange: bigint,
  timeout: number = 30000
): Promise<bigint> {
  const expectedBalance = initialBalance + expectedChange;
  const startTime = Date.now();
  let lastBalance = initialBalance;
  let checkCount = 0;
  
  await waitFor(async () => {
    checkCount++;
    const currentBalance = await getBalance();
    
    // Log progress every 5 checks (every ~10 seconds with 2s interval)
    if (checkCount % 5 === 0 || currentBalance !== lastBalance) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      if (expectedChange > 0n) {
        console.log(`   [${elapsed}s] Checking balance: ${formatSolanaBalance(currentBalance)} (expected: >= ${formatSolanaBalance(expectedBalance)})`);
      } else if (expectedChange < 0n) {
        console.log(`   [${elapsed}s] Checking balance: ${formatSheetBalance(currentBalance)} (expected: <= ${formatSheetBalance(expectedBalance)})`);
      }
    }
    lastBalance = currentBalance;
    
    // For positive changes (increase), check if balance >= expected
    // For negative changes (decrease), check if balance <= expected
    if (expectedChange > 0n) {
      return currentBalance >= expectedBalance;
    } else if (expectedChange < 0n) {
      return currentBalance <= expectedBalance;
    } else {
      // No change expected, just check if balance is stable
      return currentBalance === expectedBalance;
    }
  }, timeout);
  
  const finalBalance = await getBalance();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`   ✅ Balance updated after ${elapsed}s`);
  return finalBalance;
}

/**
 * Format balance for display
 */
export function formatSolanaBalance(balance: bigint): string {
  return (Number(balance) / 1e9).toFixed(9) + ' SHEET';
}

export function formatSheetBalance(balance: bigint): string {
  return formatEther(balance) + ' ETH';
}
