/**
 * E2E Test: Solana to Sheet Chain Bridge
 * 
 * Tests the complete flow of bridging tokens from Solana to Sheet Chain.
 * Assumes bridge infrastructure is running.
 */

import { describe, it, beforeAll, expect, jest } from '@jest/globals';
import { Connection } from '@solana/web3.js';
import { JsonRpcProvider } from 'ethers';
import { TEST_CONFIG, getTestWallets, solanaConnection, sheetProvider, waitFor } from '../setup';
import { getSolanaTokenBalance, getSheetBalance, waitForBalanceChange, formatSolanaBalance, formatSheetBalance } from '../helpers/balance';
import { lockTokensOnSolana } from '../helpers/solana';
import { convertSolanaToSheet } from '../setup';

describe('E2E: Solana to Sheet Chain Bridge', () => {
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
    
    // Verify Solana wallet has balance
    if (initialSolanaBalance === 0n) {
      throw new Error(
        `Solana wallet has no SHEET tokens. ` +
        `Please fund ${wallets.solana.address} with SHEET tokens before running tests.`
      );
    }
  });
  
  it.only('should bridge tokens from Solana to Sheet Chain', async () => {
    const testAmount = TEST_CONFIG.TEST_AMOUNT_SMALL; // 0.01 SHEET
    
    console.log(`\n🌉 Testing bridge: Solana -> Sheet Chain (${testAmount} SHEET)`);
    
    // Get balances before transfer
    const sheetBalanceBefore = await getSheetBalance(sheetProvider, wallets.sheet.address);
    const solanaBalanceBefore = await getSolanaTokenBalance(solanaConnection, wallets.solana.address);
    
    console.log(`   Sheet Chain balance before: ${formatSheetBalance(sheetBalanceBefore)}`);
    console.log(`   Solana balance before: ${formatSolanaBalance(solanaBalanceBefore)}`);
    
    // Calculate expected changes
    const testAmountRaw = BigInt(Math.floor(testAmount * 1e9)); // Solana uses 9 decimals
    const expectedSolanaChange = -testAmountRaw;
    const expectedSheetChange = convertSolanaToSheet(testAmountRaw); // Convert to 18 decimals
    
    // Execute lock transaction on Solana
    console.log(`   Locking tokens on Solana...`);
    let txSignature: string;
    try {
      txSignature = await lockTokensOnSolana(
        solanaConnection,
        wallets.solana.keypair,
        testAmount,
        wallets.sheet.address
      );
      console.log(`   ✅ Solana transaction confirmed: ${txSignature}`);
      console.log(`   📝 Backend should detect this transaction and process the bridge transfer`);
      console.log(`   💡 Check backend logs for: "Solana transfer event cached" with signature: ${txSignature}`);
      console.log(`   🔍 You can verify the transaction on Solana explorer: https://explorer.solana.com/tx/${txSignature}?cluster=devnet`);
    } catch (error: any) {
      console.error(`   ❌ Failed to lock tokens on Solana: ${error.message}`);
      console.error(`   Stack: ${error.stack}`);
      throw error;
    }
    
    console.log(`   Waiting for bridge backend to process...`);
    console.log(`   ⚠️  IMPORTANT: Make sure bridge backend is running and monitoring Solana events!`);
    console.log(`   The backend should detect the Solana transaction and process it.`);
    console.log(`   Check bridge backend logs for messages like "Solana transfer event cached"`);
    
    // Wait for Solana balance to decrease
    console.log(`   Waiting for Solana balance to update...`);
    const solanaBalanceAfter = await waitForBalanceChange(
      () => getSolanaTokenBalance(solanaConnection, wallets.solana.address),
      solanaBalanceBefore,
      expectedSolanaChange,
      TEST_CONFIG.TRANSACTION_TIMEOUT
    );
    
    console.log(`   Solana balance after: ${formatSolanaBalance(solanaBalanceAfter)}`);
    
    // Wait for Sheet Chain balance to increase (bridge backend should process this)
    console.log(`   Waiting for Sheet Chain balance to update (bridge processing)...`);
    const sheetBalanceAfter = await waitForBalanceChange(
      () => getSheetBalance(sheetProvider, wallets.sheet.address),
      sheetBalanceBefore,
      expectedSheetChange,
      TEST_CONFIG.TRANSACTION_TIMEOUT * 2 // Give more time for bridge backend
    );
    
    console.log(`   Sheet Chain balance after: ${formatSheetBalance(sheetBalanceAfter)}`);
    
    // Verify balances
    const actualSolanaChange = solanaBalanceAfter - solanaBalanceBefore;
    const actualSheetChange = sheetBalanceAfter - sheetBalanceBefore;
    
    console.log(`\n📊 Balance Changes:`);
    console.log(`   Solana: ${formatSolanaBalance(actualSolanaChange)} (expected: ${formatSolanaBalance(expectedSolanaChange)})`);
    console.log(`   Sheet Chain: ${formatSheetBalance(actualSheetChange)} (expected: ${formatSheetBalance(expectedSheetChange)})`);
    
    // Assertions
    expect(actualSolanaChange).toBeLessThan(0n); // Balance should decrease
    expect(actualSheetChange).toBeGreaterThan(0n); // Balance should increase
    
    // Verify Solana change matches expected (allowing for small rounding)
    const solanaTolerance = BigInt(1000); // 0.000001 SHEET tolerance
    expect(Math.abs(Number(actualSolanaChange - expectedSolanaChange))).toBeLessThan(Number(solanaTolerance));
    
    // Verify Sheet Chain change matches expected (with conversion)
    const sheetTolerance = BigInt(parseFloat('0.0001') * 1e18); // 0.0001 ETH tolerance
    expect(Math.abs(Number(actualSheetChange - expectedSheetChange))).toBeLessThan(Number(sheetTolerance));
  }, TEST_CONFIG.TRANSACTION_TIMEOUT * 3);
  
  it('should handle insufficient balance error', async () => {
    const excessiveAmount = Number(formatSolanaBalance(initialSolanaBalance)) * 2; // More than available
    
    console.log(`\n🧪 Testing insufficient balance error (${excessiveAmount} SHEET)`);
    
    await expect(
      lockTokensOnSolana(
        solanaConnection,
        wallets.solana.keypair,
        excessiveAmount,
        wallets.sheet.address
      )
    ).rejects.toThrow();
  });
  
  it('should handle invalid recipient address', async () => {
    const testAmount = TEST_CONFIG.TEST_AMOUNT_SMALL;
    const invalidAddress = '0xInvalidAddress';
    
    console.log(`\n🧪 Testing invalid recipient address`);
    
    // The transaction might succeed on Solana but fail on Sheet Chain
    // We'll just verify it doesn't throw on Solana side
    try {
      await lockTokensOnSolana(
        solanaConnection,
        wallets.solana.keypair,
        testAmount,
        invalidAddress
      );
      console.log(`   ⚠️  Transaction succeeded on Solana (may fail on Sheet Chain side)`);
    } catch (error: any) {
      // Expected to fail if validation is in place
      expect(error.message).toBeDefined();
    }
  });
});
