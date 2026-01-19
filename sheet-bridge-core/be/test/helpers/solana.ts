/**
 * Solana transaction helpers for e2e tests
 */

import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { 
  getAssociatedTokenAddress,
  createTransferInstruction,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
  getAccount
} from '@solana/spl-token';
import { AnchorProvider, Program, BN } from '@coral-xyz/anchor';
import { SOLANA_TOKEN_MINT, LOCK_PROGRAM_ID } from '../../src/config';
import * as path from 'path';
import * as fs from 'fs';

// Import IDL - resolve path relative to backend directory
// From be/test/helpers/ -> ../../../solana/target/idl/lock.json
const idlPath = path.resolve(__dirname, '../../../solana/target/idl/lock.json');

if (!fs.existsSync(idlPath)) {
  throw new Error(
    `IDL file not found at ${idlPath}. ` +
    'Please build the Solana program first: cd sheet-bridge-core/solana && anchor build'
  );
}

const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));

/**
 * Lock tokens on Solana (bridge to Sheet Chain)
 */
export async function lockTokensOnSolana(
  connection: Connection,
  userKeypair: Keypair,
  amount: number, // Amount in human-readable format (e.g., 0.1 SHEET)
  recipientAddress: string // Sheet Chain address (0x...)
): Promise<string> {
  const mint = new PublicKey(SOLANA_TOKEN_MINT);
  const user = userKeypair.publicKey;
  
  // Create wallet compatible with AnchorProvider
  const wallet = {
    publicKey: user,
    signTransaction: async (tx: Transaction) => {
      tx.sign(userKeypair);
      return tx;
    },
    signAllTransactions: async (txs: Transaction[]) => {
      txs.forEach(tx => tx.sign(userKeypair));
      return txs;
    },
  };
  
  const provider = new AnchorProvider(
    connection,
    wallet as any,
    AnchorProvider.defaultOptions()
  );
  
  const program = new Program(idl as any, provider);
  
  const [lockAccountPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('lock'), mint.toBuffer()],
    program.programId
  );
  
  const [vaultAuthorityPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), lockAccountPda.toBuffer()],
    program.programId
  );
  
  // Check if lock account is initialized
  try {
    const lockAccountInfo = await connection.getAccountInfo(lockAccountPda);
    if (!lockAccountInfo) {
      throw new Error(
        `Lock program is not initialized. ` +
        `Lock account ${lockAccountPda.toBase58()} does not exist. ` +
        `Please run the initialization script first: cd sheet-bridge-core/solana && npm run initialize`
      );
    }
    console.log(`   ✅ Lock account exists: ${lockAccountPda.toBase58()}`);
  } catch (error: any) {
    if (error.message?.includes('not initialized')) {
      throw error;
    }
    throw new Error(
      `Failed to check lock account: ${error.message}. ` +
      `Lock account: ${lockAccountPda.toBase58()}`
    );
  }
  
  const userTokenAccount = await getAssociatedTokenAddress(mint, user);
  const vaultTokenAccount = await getAssociatedTokenAddress(
    mint,
    vaultAuthorityPda,
    true
  );
  
  console.log(`   Token account addresses:`, {
    userTokenAccount: userTokenAccount.toBase58(),
    vaultTokenAccount: vaultTokenAccount.toBase58(),
    user: user.toBase58(),
    vaultAuthority: vaultAuthorityPda.toBase58()
  });
  
  // Check user balance and account existence
  // First, try to find the actual token account (might not be ATA)
  let actualUserTokenAccount = userTokenAccount;
  try {
    // Try to get the account directly
    const accountInfo = await getAccount(connection, userTokenAccount);
    const userBalance = Number(accountInfo.amount);
    const lockAmountRaw = amount * Math.pow(10, 9);
    
    console.log(`   User token account balance: ${userBalance} (${userBalance / Math.pow(10, 9)} SHEET)`);
    
    if (userBalance < lockAmountRaw) {
      throw new Error(
        `Insufficient balance. You have ${userBalance / Math.pow(10, 9)} SHEET, ` +
        `but trying to transfer ${amount} SHEET.`
      );
    }
  } catch (error: any) {
    // If ATA doesn't exist, try to find any token account for this user and mint
    if (error.message?.includes('could not find account') || 
        error.message?.includes('InvalidAccountData') || 
        error.message?.includes('TokenAccountNotFoundError')) {
      
      console.log(`   ATA not found, searching for user's token accounts...`);
      try {
        // getTokenAccountsByOwner is a method on Connection, not from @solana/spl-token
        const tokenAccounts = await connection.getTokenAccountsByOwner(user, { mint });
        
        if (tokenAccounts.value.length === 0) {
          throw new Error(
            `No token account found for user ${user.toBase58()} and mint ${mint.toBase58()}. ` +
            `You don't have a SHEET token account yet. ` +
            `Please receive some SHEET tokens first.`
          );
        }
        
        // Use the first token account found
        actualUserTokenAccount = tokenAccounts.value[0].pubkey;
        const accountInfo = await getAccount(connection, actualUserTokenAccount);
        const userBalance = Number(accountInfo.amount);
        const lockAmountRaw = amount * Math.pow(10, 9);
        
        console.log(`   Found token account: ${actualUserTokenAccount.toBase58()}`);
        console.log(`   Balance: ${userBalance} (${userBalance / Math.pow(10, 9)} SHEET)`);
        
        if (userBalance < lockAmountRaw) {
          throw new Error(
            `Insufficient balance. You have ${userBalance / Math.pow(10, 9)} SHEET, ` +
            `but trying to transfer ${amount} SHEET.`
          );
        }
      } catch (searchError: any) {
        throw new Error(
          `Token account not found. ${searchError.message} ` +
          `Expected ATA: ${userTokenAccount.toBase58()}, ` +
          `User: ${user.toBase58()}, Mint: ${mint.toBase58()}`
        );
      }
    } else {
      throw error;
    }
  }
  
  // Use the actual token account (might be different from ATA)
  const finalUserTokenAccount = actualUserTokenAccount;
  
  // Verify the token account details match what the program expects
  try {
    const finalAccountInfo = await getAccount(connection, finalUserTokenAccount, 'confirmed');
    
    // Also get parsed account info to see full state
    const parsedInfo = await connection.getParsedAccountInfo(finalUserTokenAccount, 'confirmed');
    console.log(`   Parsed account info:`, {
      executable: parsedInfo.value?.executable,
      owner: parsedInfo.value?.owner?.toBase58(),
      lamports: parsedInfo.value?.lamports,
      data: parsedInfo.value?.data ? (typeof parsedInfo.value.data === 'string' ? 'parsed' : 'raw') : 'none'
    });
    
    console.log(`   Final token account details:`, {
      address: finalUserTokenAccount.toBase58(),
      mint: finalAccountInfo.mint.toBase58(),
      expectedMint: mint.toBase58(),
      owner: finalAccountInfo.owner.toBase58(),
      expectedOwner: user.toBase58(),
      balance: Number(finalAccountInfo.amount),
      mintMatches: finalAccountInfo.mint.equals(mint),
      ownerMatches: finalAccountInfo.owner.equals(user)
    });
    
    // If we can get the account info, it means it's initialized (getAccount throws if account doesn't exist)
    // So we don't need to check state explicitly
    
    if (!finalAccountInfo.mint.equals(mint)) {
      throw new Error(
        `Token account mint mismatch! ` +
        `Account ${finalUserTokenAccount.toBase58()} has mint ${finalAccountInfo.mint.toBase58()}, ` +
        `but expected ${mint.toBase58()}`
      );
    }
    
    if (!finalAccountInfo.owner.equals(user)) {
      throw new Error(
        `Token account owner mismatch! ` +
        `Account ${finalUserTokenAccount.toBase58()} is owned by ${finalAccountInfo.owner.toBase58()}, ` +
        `but expected ${user.toBase58()}`
      );
    }
    
    if (Number(finalAccountInfo.amount) === 0) {
      throw new Error(
        `Token account has zero balance! ` +
        `Account ${finalUserTokenAccount.toBase58()} has no tokens to transfer.`
      );
    }
  } catch (error: any) {
    throw new Error(
      `Failed to verify token account: ${error.message}. ` +
      `Account: ${finalUserTokenAccount.toBase58()}`
    );
  }
  
  // Check if vault token account exists (it should be created during initialization)
  try {
    const vaultAccountInfo = await getAccount(connection, vaultTokenAccount);
    console.log(`   ✅ Vault token account exists: ${vaultTokenAccount.toBase58()}`);
    console.log(`   Vault balance: ${Number(vaultAccountInfo.amount)} (${Number(vaultAccountInfo.amount) / Math.pow(10, 9)} SHEET)`);
  } catch (error: any) {
    if (error.message?.includes('could not find account') || 
        error.message?.includes('InvalidAccountData') || 
        error.message?.includes('TokenAccountNotFoundError')) {
      throw new Error(
        `Vault token account does not exist at ${vaultTokenAccount.toBase58()}. ` +
        `The lock program must be initialized first. ` +
        `Run the initialization script to create the vault token account.`
      );
    }
    throw error;
  }
  
  const lockAmount = new BN(amount * Math.pow(10, 9));
  
  console.log(`   Preparing lock transaction:`, {
    amount: amount,
    amountRaw: lockAmount.toString(),
    recipient: recipientAddress,
    user: user.toBase58(),
    lockAccount: lockAccountPda.toBase58(),
    vaultAuthority: vaultAuthorityPda.toBase58()
  });
  
  // Note: Solana simulation can fail even when the actual transaction succeeds
  // This is a known quirk with Solana's simulation system, especially with complex programs
  // We'll attempt simulation for debugging, but won't block the actual transaction if it fails
  console.log(`   Simulating transaction (optional - will proceed even if simulation fails)...`);
  try {
    const simulateResult = await program.methods
      .lockTokens(lockAmount, recipientAddress)
      .accounts({
        user,
        lockAccount: lockAccountPda,
        mint,
        userTokenAccount: finalUserTokenAccount,
        vaultTokenAccount,
        vaultAuthority: vaultAuthorityPda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .simulate();
    
    console.log(`   ✅ Simulation successful:`, simulateResult);
  } catch (simError: any) {
    // Simulation failures are common and don't necessarily mean the transaction will fail
    // This is a known issue with Solana's simulation system
    console.log(`   ⚠️  Simulation failed (this is often normal - proceeding with actual transaction)`);
    if (simError.logs && simError.logs.length > 0) {
      console.log(`   Simulation logs (for debugging):`, simError.logs.slice(0, 5)); // Only show first 5 logs
    }
  }
  
  // Use .rpc() like the frontend does - it handles blockhash, confirmation, and event emission properly
  // This is the same approach the frontend uses, which works correctly
  console.log(`   Sending transaction using .rpc() (same as frontend)...`);
  let signature: string;
  try {
    // Use .rpc() which handles everything: blockhash, sending, and confirmation
    // This is what the frontend uses and it works correctly
    signature = await program.methods
      .lockTokens(lockAmount, recipientAddress)
      .accounts({
        user,
        lockAccount: lockAccountPda,
        mint,
        userTokenAccount: finalUserTokenAccount, // Use the actual token account
        vaultTokenAccount,
        vaultAuthority: vaultAuthorityPda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc({
        skipPreflight: true, // Skip simulation to avoid false errors (same as frontend approach)
        commitment: 'confirmed', // Use confirmed commitment
      });
    
    // Verify the transaction actually succeeded
    console.log(`   ✅ Transaction sent, signature: ${signature}`);
    console.log(`   Verifying transaction exists on-chain...`);
    
    // Wait a moment for the transaction to propagate
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Verify the transaction actually exists by trying to fetch it
    let transactionFound = false;
    let retries = 0;
    const maxRetries = 10;
    
    while (!transactionFound && retries < maxRetries) {
      try {
        const tx = await connection.getTransaction(signature, {
          maxSupportedTransactionVersion: 0,
        });
        
        if (tx) {
          transactionFound = true;
          if (tx.meta?.err) {
            throw new Error(`Transaction failed: ${JSON.stringify(tx.meta.err)}`);
          }
          console.log(`   ✅ Transaction found on-chain (slot: ${tx.slot})`);
          break;
        }
      } catch (fetchError: any) {
        // Transaction not found yet, wait and retry
        retries++;
        if (retries < maxRetries) {
          console.log(`   ⏳ Transaction not found yet, retrying... (${retries}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          // Also check signature status as fallback
          const status = await connection.getSignatureStatus(signature, { searchTransactionHistory: true });
          if (status.value?.err) {
            throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
          }
          if (!status.value || (status.value.confirmationStatus !== 'confirmed' && status.value.confirmationStatus !== 'finalized')) {
            throw new Error(
              `Transaction not found on-chain after ${maxRetries} retries. ` +
              `Status: ${status.value?.confirmationStatus || 'unknown'}. ` +
              `The transaction may have expired or failed. ` +
              `Please check manually: https://explorer.solana.com/tx/${signature}?cluster=devnet`
            );
          }
          console.log(`   ✅ Transaction confirmed (via status check, status: ${status.value.confirmationStatus})`);
          transactionFound = true;
        }
      }
    }
    
    if (!transactionFound) {
      throw new Error(
        `Transaction not found on-chain. ` +
        `Signature: ${signature}. ` +
        `Please check the transaction manually: https://explorer.solana.com/tx/${signature}?cluster=devnet`
      );
    }
    
    console.log(`   📝 Backend should detect this transaction via onLogs() and process the bridge transfer`);
    console.log(`   💡 Check backend logs for: "Solana transfer event cached" with signature: ${signature}`);
    console.log(`   🔍 Verify on explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
  } catch (error: any) {
    // Handle timeout errors - transaction might have succeeded but confirmation timed out
    const errorMsg = error?.message || String(error);
    
    if (errorMsg.includes('not confirmed') || 
        errorMsg.includes('TransactionExpiredTimeoutError') ||
        errorMsg.includes('timeout')) {
      console.log(`   ⚠️  Transaction confirmation timed out, checking if it actually succeeded...`);
      
      // Try to extract signature from error if available
      let extractedSignature: string | null = null;
      const signatureMatch = errorMsg.match(/signature[:\s]+([A-Za-z0-9]{64,88})/i) || 
                              errorMsg.match(/([A-Za-z0-9]{64,88})/);
      if (signatureMatch) {
        extractedSignature = signatureMatch[1];
        console.log(`   Found signature in error: ${extractedSignature}`);
      }
      
      // Check recent transactions to see if it went through
      if (!extractedSignature) {
        try {
          console.log(`   Checking recent transactions for user: ${user.toBase58()}`);
          const recentSigs = await connection.getSignaturesForAddress(user, { limit: 5 });
          
          // Look for a recent transaction that might be our lock transaction
          const thirtySecondsAgo = Date.now() - 30000;
          for (const sigInfo of recentSigs) {
            const sigTime = sigInfo.blockTime ? sigInfo.blockTime * 1000 : 0;
            if (sigTime > thirtySecondsAgo && !sigInfo.err) {
              // This might be our transaction - verify it's a lock transaction
              try {
                const tx = await connection.getTransaction(sigInfo.signature, {
                  maxSupportedTransactionVersion: 0,
                });
                
                // Check if this transaction involves our lock account
                if (tx && tx.transaction) {
                  try {
                    const accountKeys = tx.transaction.message.getAccountKeys();
                    const lockAccountFound = accountKeys.staticAccountKeys.some(
                      (key: PublicKey) => key.toBase58() === lockAccountPda.toBase58()
                    );
                    if (lockAccountFound) {
                      extractedSignature = sigInfo.signature;
                      console.log(`   Found matching lock transaction: ${extractedSignature}`);
                      break;
                    }
                  } catch (keyError) {
                    // If we can't parse account keys, skip this transaction
                  }
                }
              } catch (txError) {
                // Continue checking other transactions
              }
            }
          }
        } catch (recentTxError) {
          console.log(`   Could not check recent transactions: ${recentTxError}`);
        }
      }
      
      if (extractedSignature) {
        signature = extractedSignature;
        console.log(`   ✅ Transaction appears to have succeeded! Using signature: ${signature}`);
        console.log(`   📝 Backend should detect this transaction via onLogs() and process the bridge transfer`);
        console.log(`   💡 Check backend logs for: "Solana transfer event cached" with signature: ${signature}`);
      } else {
        // Last resort - check transaction status directly if we have a signature
        if (error.signature) {
          signature = error.signature;
          console.log(`   Using signature from error: ${signature}`);
          try {
            const status = await connection.getSignatureStatus(signature);
            if (status.value && !status.value.err) {
              console.log(`   ✅ Transaction status check: ${status.value.confirmationStatus || 'unknown'}`);
              console.log(`   📝 Backend should detect this transaction via onLogs() and process the bridge transfer`);
            } else {
              throw new Error(`Transaction failed or not found: ${JSON.stringify(status.value?.err)}`);
            }
          } catch (statusError) {
            throw new Error(
              `Transaction confirmation timed out and could not verify status. ` +
              `Signature: ${signature || 'unknown'}. ` +
              `Please check the transaction manually. ` +
              `The backend will detect it once it's confirmed on-chain.`
            );
          }
        } else {
          throw new Error(
            `Transaction confirmation timed out and no signature found. ` +
            `Please check your wallet or Solana explorer for recent transactions. ` +
            `The backend will detect the transaction once it's confirmed on-chain.`
          );
        }
      }
    } else {
      // Other errors - rethrow
      throw error;
    }
  }
  
  return signature;
}

/**
 * Get transaction status
 */
export async function getTransactionStatus(
  connection: Connection,
  signature: string
): Promise<{ confirmed: boolean; error: any }> {
  const status = await connection.getSignatureStatus(signature);
  return {
    confirmed: status.value?.confirmationStatus === 'confirmed' || 
               status.value?.confirmationStatus === 'finalized',
    error: status.value?.err || null,
  };
}
