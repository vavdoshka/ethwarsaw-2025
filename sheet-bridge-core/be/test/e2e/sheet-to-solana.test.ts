/**
 * E2E Test: Sheet Chain to Solana Bridge
 * 
 * Tests the complete flow of bridging tokens from Sheet Chain to Solana.
 * Assumes bridge infrastructure is running.
 */

import { describe, it, beforeAll, expect, jest } from '@jest/globals';
import { Connection } from '@solana/web3.js';
import { JsonRpcProvider } from 'ethers';
import { TEST_CONFIG, getTestWallets, solanaConnection, sheetProvider, waitFor } from '../setup';
import { getSolanaTokenBalance, getSheetBalance, waitForBalanceChange, formatSolanaBalance, formatSheetBalance } from '../helpers/balance';
import { bridgeOutFromSheet } from '../helpers/sheet';
import { convertSheetToSolana } from '../setup';

describe('E2E: Sheet Chain to Solana Bridge', () => {
  let wallets: ReturnType<typeof getTestWallets>;
  let initialSheetBalance: bigint;
  let initialSolanaBalance: bigint;
  
  beforeAll(async () => {
    // Get test wallets
    wallets = getTestWallets();
    
    // Check initial balances
    initialSheetBalance = await getSheetBalance(sheetProvider, wallets.sheet.address);
    initialSolanaBalance = await getSolanaTokenBalance(solanaConnection, wallets.solana.address);
    
    console.log('\n📊 Initial Balances:');
    console.log(`   Sheet Chain: ${formatSheetBalance(initialSheetBalance)}`);
    console.log(`   Solana: ${formatSolanaBalance(initialSolanaBalance)}`);
    
    // Verify Sheet Chain wallet has balance
    if (initialSheetBalance === 0n) {
      throw new Error(
        `Sheet Chain wallet has no balance. ` +
        `Please fund ${wallets.sheet.address} before running tests.`
      );
    }
  });
  
  it('should bridge tokens from Sheet Chain to Solana', async () => {
    const testAmount = TEST_CONFIG.TEST_AMOUNT_SMALL; // 0.01 SHEET
    
    console.log(`\n🌉 Testing bridge: Sheet Chain -> Solana (${testAmount} SHEET)`);
    
    // Get balances before transfer
    const sheetBalanceBefore = await getSheetBalance(sheetProvider, wallets.sheet.address);
    const solanaBalanceBefore = await getSolanaTokenBalance(solanaConnection, wallets.solana.address);
    
    console.log(`   Sheet Chain balance before: ${formatSheetBalance(sheetBalanceBefore)}`);
    console.log(`   Solana balance before: ${formatSolanaBalance(solanaBalanceBefore)}`);
    
    // Calculate expected changes
    const testAmountWei = BigInt(Math.floor(testAmount * 1e18));
    const expectedSheetChange = -testAmountWei;
    const expectedSolanaChange = convertSheetToSolana(testAmountWei);
    
    // Execute bridge transaction
    console.log(`   Sending bridgeOut transaction...`);
    let txHash: string;
    try {
      // Add a timeout wrapper (70 seconds to allow for receipt wait timeout)
      txHash = await Promise.race([
        bridgeOutFromSheet(
          wallets.sheet.wallet,
          testAmount,
          wallets.solana.address,
          1 // Solana chain ID
        ),
        new Promise<string>((_, reject) => 
          setTimeout(() => reject(new Error('Transaction send timeout after 70s')), 70000)
        )
      ]);
    } catch (error: any) {
      console.error(`   ❌ Failed to send transaction: ${error.message}`);
      console.error(`   Stack: ${error.stack}`);
      throw error;
    }
    
    console.log(`   ✅ Transaction sent: ${txHash}`);
    console.log(`   Waiting for bridge processing...`);
    
    // Wait for Sheet Chain balance to decrease
    // Note: This depends on the bridge backend monitoring the Bridge tab in Google Sheets
    // The backend polls every 10 seconds (default), so this may take some time
    console.log(`   Waiting for Sheet Chain balance to update...`);
    console.log(`   Note: Bridge backend must be running and monitoring the Bridge tab`);
    let sheetBalanceAfter: bigint;
    try {
      sheetBalanceAfter = await waitForBalanceChange(
        () => getSheetBalance(sheetProvider, wallets.sheet.address),
        sheetBalanceBefore,
        expectedSheetChange,
        TEST_CONFIG.TRANSACTION_TIMEOUT * 2 // Give more time for bridge backend to process
      );
    } catch (error) {
      const currentBalance = await getSheetBalance(sheetProvider, wallets.sheet.address);
      console.error(`   ❌ Balance update timeout. Current balance: ${formatSheetBalance(currentBalance)}`);
      console.error(`   Make sure:`);
      console.error(`   1. Bridge backend is running and monitoring the Bridge tab`);
      console.error(`   2. The transaction was written to the Bridge tab in Google Sheets`);
      console.error(`   3. The bridge backend has processed the transaction`);
      throw error;
    }
    
    console.log(`   Sheet Chain balance after: ${formatSheetBalance(sheetBalanceAfter)}`);
    
    // Wait for Solana balance to increase
    // This depends on the bridge backend processing the Sheet -> Solana transfer
    console.log(`   Waiting for Solana balance to update...`);
    console.log(`   Note: Bridge backend must process the transfer and send tokens to Solana`);
    console.log(`   Expected change: +${formatSolanaBalance(expectedSolanaChange)}`);
    console.log(`   Expected final balance: ${formatSolanaBalance(solanaBalanceBefore + expectedSolanaChange)}`);
    console.log(`   Transaction hash: ${txHash}`);
    console.log(`   ⚠️  IMPORTANT: Make sure bridge backend is running and monitoring the Bridge tab!`);
    console.log(`   The backend polls every 10 seconds, so it should detect the transaction within 10-20 seconds.`);
    console.log(`   Check bridge backend logs for messages like "🆕 Detected new record" or "✅ Inserted bridge event"`);
    
    // Add a small delay before starting to check, to give the backend time to process
    // The backend polls every 10 seconds, so wait at least that long
    await new Promise(resolve => setTimeout(resolve, 12000));
    
    let solanaBalanceAfter: bigint;
    try {
      solanaBalanceAfter = await waitForBalanceChange(
        () => getSolanaTokenBalance(solanaConnection, wallets.solana.address),
        solanaBalanceBefore,
        expectedSolanaChange,
        TEST_CONFIG.TRANSACTION_TIMEOUT * 2 // Give more time for bridge backend to process
      );
    } catch (error) {
      const currentBalance = await getSolanaTokenBalance(solanaConnection, wallets.solana.address);
      const actualChange = currentBalance - solanaBalanceBefore;
      console.error(`   ❌ Solana balance update timeout.`);
      console.error(`   Current balance: ${formatSolanaBalance(currentBalance)}`);
      console.error(`   Expected balance: ${formatSolanaBalance(solanaBalanceBefore + expectedSolanaChange)}`);
      console.error(`   Actual change: ${formatSolanaBalance(actualChange)} (expected: +${formatSolanaBalance(expectedSolanaChange)})`);
      console.error(`   Make sure:`);
      console.error(`   1. Bridge backend is running and has Solana configured`);
      console.error(`   2. Bridge backend has processed the Sheet -> Solana transfer`);
      console.error(`   3. Solana authority wallet has SHEET tokens to send`);
      console.error(`   4. Check backend logs for any errors during Solana transfer`);
      throw error;
    }
    
    console.log(`   Solana balance after: ${formatSolanaBalance(solanaBalanceAfter)}`);
    
    // Verify balances
    const actualSheetChange = sheetBalanceAfter - sheetBalanceBefore;
    const actualSolanaChange = solanaBalanceAfter - solanaBalanceBefore;
    
    console.log(`\n📊 Balance Changes:`);
    console.log(`   Sheet Chain: ${formatSheetBalance(actualSheetChange)} (expected: ${formatSheetBalance(expectedSheetChange)})`);
    console.log(`   Solana: ${formatSolanaBalance(actualSolanaChange)} (expected: ${formatSolanaBalance(expectedSolanaChange)})`);
    
    // Assertions
    expect(actualSheetChange).toBeLessThan(0n); // Balance should decrease
    expect(actualSolanaChange).toBeGreaterThan(0n); // Balance should increase
    
    // Allow small tolerance for gas fees
    const tolerance = BigInt(parseFloat('0.0001') * 1e18); // 0.0001 ETH tolerance
    expect(Math.abs(Number(actualSheetChange - expectedSheetChange))).toBeLessThan(Number(tolerance));
    
    // Solana amount should match (with conversion)
    expect(actualSolanaChange).toBeGreaterThanOrEqual(expectedSolanaChange * BigInt(99) / BigInt(100)); // Allow 1% tolerance
  }, TEST_CONFIG.TRANSACTION_TIMEOUT * 2);
  
  it('should handle insufficient balance error', async () => {
    // Calculate excessive amount (more than available)
    const currentBalance = Number(formatSheetBalance(initialSheetBalance));
    const excessiveAmount = currentBalance * 2; // More than available
    
    console.log(`\n🧪 Testing insufficient balance error (${excessiveAmount} SHEET)`);
    
    await expect(
      bridgeOutFromSheet(
        wallets.sheet.wallet,
        excessiveAmount,
        wallets.solana.address,
        1
      )
    ).rejects.toThrow();
  });
  
  it('should handle invalid recipient address', async () => {
    const testAmount = TEST_CONFIG.TEST_AMOUNT_SMALL;
    const invalidAddress = 'invalid-address';
    
    console.log(`\n🧪 Testing invalid recipient address`);
    
    await expect(
      bridgeOutFromSheet(
        wallets.sheet.wallet,
        testAmount,
        invalidAddress,
        1
      )
    ).rejects.toThrow();
  });
});
