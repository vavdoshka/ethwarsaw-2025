import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';
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
  wallet: any,
  amount: number
): Promise<string> {
  if (!wallet) {
    throw new Error('Phantom wallet not connected');
  }
  const connection = new Connection(SOL_RPC_ENDPOINT, 'confirmed');
  const provider = new AnchorProvider(
    connection,
    wallet,
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

  const userTokenAccount = await getAssociatedTokenAddress(mint, user);

  const vaultTokenAccount = await getAssociatedTokenAddress(
    mint,
    vaultAuthorityPda,
    true
  );

  const lockAmount = new BN(amount * Math.pow(10, 9));

  const signature = await program.methods
    .lockTokens(lockAmount)
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

  const latestBlockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    'confirmed'
  );

  return signature;
}
