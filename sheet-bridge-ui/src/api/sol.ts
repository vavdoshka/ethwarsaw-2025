import { Connection, PublicKey } from '@solana/web3.js';
import { 
  getAssociatedTokenAddress, 
  TOKEN_PROGRAM_ID,
  getAccount
} from '@solana/spl-token';
import { AnchorProvider, Program, BN } from '@coral-xyz/anchor';
import { SOL_RPC_ENDPOINT, SOL_SHEET_MINT_ADDRESS } from '../config';
import idl from './idl/lock.json';

export async function getSplTokenBalance(userAddress: string): Promise<number> {
  const connection = new Connection(SOL_RPC_ENDPOINT);
  const publicKey = new PublicKey(userAddress);
  const mintAddress = new PublicKey(SOL_SHEET_MINT_ADDRESS);

  const tokenAccounts = await connection.getTokenAccountsByOwner(publicKey, {
    mint: mintAddress,
  });

  if (tokenAccounts.value.length === 0) {
    return 0;
  }

  const accountInfo = await connection.getTokenAccountBalance(
    tokenAccounts.value[0].pubkey
  );

  return (
    Number(accountInfo.value.amount) / Math.pow(10, accountInfo.value.decimals)
  );
}

export async function lockSplTokens(
  walletAdapter: any,
  amount: number,
  recipient: string
): Promise<string> {
  if (!walletAdapter) {
    throw new Error('Wallet not connected');
  }

  if (!recipient || recipient.trim() === '') {
    throw new Error('Recipient address is required');
  }

  const connection = new Connection(SOL_RPC_ENDPOINT, 'confirmed');

  // Create a wallet compatible with AnchorProvider
  const wallet = {
    publicKey: walletAdapter.publicKey,
    signTransaction: walletAdapter.signTransaction.bind(walletAdapter),
    signAllTransactions: walletAdapter.signAllTransactions.bind(walletAdapter),
  };

  const provider = new AnchorProvider(
    connection,
    wallet as any,
    AnchorProvider.defaultOptions()
  );

  const program = new Program(idl as any, provider);
  const mint = new PublicKey(SOL_SHEET_MINT_ADDRESS);
  const user = wallet.publicKey;

  const [lockAccountPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('lock'), mint.toBuffer()],
    program.programId
  );

  const [vaultAuthorityPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), lockAccountPda.toBuffer()],
    program.programId
  );

  // Get user's token account address
  const userTokenAccount = await getAssociatedTokenAddress(mint, user);

  // Check if user's token account exists and has balance
  let userBalance: number;
  try {
    const accountInfo = await getAccount(connection, userTokenAccount);
    userBalance = Number(accountInfo.amount);
    const lockAmountRaw = amount * Math.pow(10, 9);
    
    if (userBalance < lockAmountRaw) {
      throw new Error(
        `Insufficient balance. You have ${userBalance / Math.pow(10, 9)} SHEET, ` +
        `but trying to transfer ${amount} SHEET.`
      );
    }
  } catch (error: any) {
    if (error.message?.includes('Insufficient balance')) {
      throw error;
    }
    // Account doesn't exist - user needs to receive tokens first
    if (error.message?.includes('could not find account') || 
        error.message?.includes('InvalidAccountData')) {
      throw new Error(
        `Token account not found. You don't have a SHEET token account yet. ` +
        `Please receive some SHEET tokens first to create the account. ` +
        `Token account address: ${userTokenAccount.toBase58()}`
      );
    }
    throw error;
  }

  const vaultTokenAccount = await getAssociatedTokenAddress(
    mint,
    vaultAuthorityPda,
    true
  );

  const lockAmount = new BN(amount * Math.pow(10, 9));

  let signature: string;
  
  try {
    signature = await program.methods
      .lockTokens(lockAmount, recipient)
      .accounts({
        user,
        lockAccount: lockAccountPda,
        mint,
        userTokenAccount,
        vaultTokenAccount,
        vaultAuthority: vaultAuthorityPda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  } catch (error: any) {
    // Check if error is "already processed" - this might mean transaction succeeded
    const errorMsg = error?.message || String(error);
    if (errorMsg.includes('already been processed') || 
        errorMsg.includes('already processed') ||
        errorMsg.includes('duplicate')) {
      // Try to get the transaction signature from the error or check recent transactions
      console.warn('Transaction may have already been processed:', errorMsg);
      
      // Check if we can extract a signature from the error
      let extractedSignature: string | null = null;
      const signatureMatch = errorMsg.match(/signature[:\s]+([A-Za-z0-9]{64,88})/i);
      if (signatureMatch) {
        extractedSignature = signatureMatch[1];
        console.log('Extracted signature from error:', extractedSignature);
      }
      
      // If we couldn't extract from error, check recent transactions
      if (!extractedSignature) {
        try {
          console.log('Checking recent transactions for user:', user.toBase58());
          const recentSigs = await connection.getSignaturesForAddress(user, {
            limit: 5,
          });
          
          // Look for a recent transaction that might be our lock transaction
          // Check transactions from the last 30 seconds
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
                    // Check static account keys (works for both legacy and versioned transactions)
                    const lockAccountFound = accountKeys.staticAccountKeys.some(
                      (key: PublicKey) => key.toBase58() === lockAccountPda.toBase58()
                    );
                    if (lockAccountFound) {
                      extractedSignature = sigInfo.signature;
                      console.log('Found matching lock transaction:', extractedSignature);
                      break;
                    }
                  } catch (keyError) {
                    // If we can't parse account keys, skip this transaction
                    console.warn('Error parsing account keys:', keyError);
                  }
                }
              } catch (txError) {
                // Continue checking other transactions
                console.warn('Error checking transaction:', sigInfo.signature, txError);
              }
            }
          }
        } catch (recentTxError) {
          console.warn('Error checking recent transactions:', recentTxError);
        }
      }
      
      if (extractedSignature) {
        signature = extractedSignature;
        console.log('Using extracted/verified signature:', signature);
      } else {
        // If we still can't find it, check if tokens were actually locked
        // by checking the user's balance
        try {
          const accountInfo = await getAccount(connection, userTokenAccount);
          const currentBalance = Number(accountInfo.amount);
          
          // If balance decreased, transaction likely succeeded
          if (currentBalance < userBalance) {
            console.log('Balance decreased, transaction likely succeeded');
            // Try to find the signature one more time with a longer time window
            const recentSigs = await connection.getSignaturesForAddress(user, {
              limit: 10,
            });
            const oneMinuteAgo = Date.now() - 60000;
            for (const sigInfo of recentSigs) {
              const sigTime = sigInfo.blockTime ? sigInfo.blockTime * 1000 : 0;
              if (sigTime > oneMinuteAgo && !sigInfo.err) {
                extractedSignature = sigInfo.signature;
                break;
              }
            }
          }
        } catch (balanceError) {
          console.warn('Error checking balance:', balanceError);
        }
        
        if (extractedSignature) {
          signature = extractedSignature;
        } else {
          // Last resort - throw helpful error
          throw new Error(
            `Transaction may have already been processed. ` +
            `Please check your wallet or Solana explorer for recent transactions. ` +
            `If the transaction succeeded, your tokens should be locked. ` +
            `The bridge backend will process the transfer automatically.`
          );
        }
      }
    } else {
      throw error;
    }
  }

  // Verify transaction was successful
  try {
    const txStatus = await connection.getSignatureStatus(signature);
    if (txStatus.value?.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(txStatus.value.err)}`);
    }
    
    if (txStatus.value?.confirmationStatus === 'confirmed' || 
        txStatus.value?.confirmationStatus === 'finalized') {
      console.log('Transaction confirmed:', signature);
      return signature;
    }
    
    // Wait for confirmation if not yet confirmed
    await connection.confirmTransaction(signature, 'confirmed');
    return signature;
  } catch (confirmError: any) {
    // If confirmation fails but transaction exists, it might still be processing
    const confirmErrorMsg = confirmError?.message || String(confirmError);
    if (confirmErrorMsg.includes('not found') || 
        confirmErrorMsg.includes('Transaction not found')) {
      // Transaction might still be processing, return signature anyway
      console.warn('Transaction confirmation pending, but signature obtained:', signature);
      return signature;
    }
    throw confirmError;
  }
}
