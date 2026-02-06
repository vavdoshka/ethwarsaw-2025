import { Wallet, isAddress, Contract, Interface, AbiCoder } from 'ethers';
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { 
    getAssociatedTokenAddress, 
    createTransferInstruction, 
    getAccount,
    createAssociatedTokenAccountInstruction,
    getOrCreateAssociatedTokenAccount,
    getMint,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import { SystemProgram } from '@solana/web3.js';
import logger from './logger';
import tokenLockAbi from './tokenLockAbi.json';
import { TransferContext, SHEET_RPC_URL, BRIDGE_CONTRACT_ADDRESS, BRIDGE_OPERATOR_ADDRESS } from './config';

export async function transferTokens(
    fromChain: string,
    toChain: string,
    to_address: string,
    to_amount: string,
    context: TransferContext,
): Promise<string> {
    if (fromChain === 'sheet' && toChain === 'solana') {
        if (!context.solanaConnection || !context.solanaAuthority || !context.solanaTokenMint) {
            throw new Error('Solana is not configured. Cannot process sheet -> solana transfers.');
        }
        return await sendSolanaTransfer(
            context.solanaConnection,
            context.solanaAuthority,
            context.solanaTokenMint,
            to_address,
            to_amount
        );
    } else if (fromChain === 'sheet' && toChain === 'bsc') {
        return await sendBSCTransfer(
            context.bscWallet,
            context.bscTokenLockAddress,
            to_address,
            to_amount
        );
    } else if (['solana', 'bsc'].includes(fromChain) && toChain === 'sheet') {
        return await sendSheetTransfer(
            context.sheetWallet,
            to_address,
            to_amount
        );
    } else {
        throw new Error(`Unsupported transfer route: ${fromChain} -> ${toChain}`);
    }
}

export async function sendSheetTransfer(ethWallet: Wallet, recipient: string, amount: any): Promise<string> {
    if (!isAddress(recipient)) {
        logger.error(`Invalid Sheet address from event, skipping: ${recipient}`);
        throw new Error(`Invalid Sheet address: ${recipient}`);
    }
    const valueWei = typeof amount === 'bigint' ? amount : BigInt(amount.toString());
    
    logger.info(
        `📊 sendSheetTransfer called with amount: ${amount} (raw) -> ${valueWei.toString()} wei (${(Number(valueWei) / 1e18).toFixed(9)} ETH)`
    );

    try {
        // Check provider connection before sending
        const provider = ethWallet.provider;
        if (!provider) {
            throw new Error('Wallet provider not available');
        }

        // Verify that the wallet address matches the bridge operator address
        const walletAddress = ethWallet.address.toLowerCase();
        const expectedOperator = BRIDGE_OPERATOR_ADDRESS.toLowerCase();
        
        if (walletAddress !== expectedOperator) {
            logger.warn(
                `⚠️  Bridge wallet address (${walletAddress}) does not match bridge operator address (${expectedOperator}). ` +
                `The bridge contract may reject the transaction.`
            );
            logger.warn(
                `   To fix this, either:` +
                `\n   1. Set SHEET_PRIVATE_KEY to match the bridge operator private key, or` +
                `\n   2. Set BRIDGE_OPERATOR_ADDRESS environment variable to ${walletAddress}`
            );
        }

        // Test connection with a simple call
        try {
            await provider.getBlockNumber();
        } catch (connectionError: any) {
            const errorMsg = connectionError?.message || String(connectionError);
            if (errorMsg.includes('Invalid JSON-RPC version') || 
                errorMsg.includes('network') ||
                errorMsg.includes('detect network')) {
                throw new Error(
                    `Sheet Chain RPC connection failed: ${errorMsg}. ` +
                    `Please check if the RPC endpoint is running and accessible.`
                );
            }
            throw connectionError;
        }

        // Use bridge contract's bridgeTransfer function instead of direct transfer
        // Function signature: bridgeTransfer(address recipient, uint256 amount)
        const bridgeInterface = new Interface([
            'function bridgeTransfer(address recipient, uint256 amount)'
        ]);
        
        const functionData = bridgeInterface.encodeFunctionData('bridgeTransfer', [
            recipient,
            valueWei
        ]);

        logger.info(
            `🌉 Calling bridgeTransfer on bridge contract: ${BRIDGE_CONTRACT_ADDRESS}`
        );
        logger.info(
            `   Recipient: ${recipient}, Amount: ${valueWei.toString()} wei`
        );

        const tx = await ethWallet.sendTransaction({
            to: BRIDGE_CONTRACT_ADDRESS,
            data: functionData,
            value: 0n, // No value sent, amount is in function parameter
        });
        
        logger.info(
            `Sheet bridge transfer submitted: ${tx.hash} -> ${recipient} (${valueWei.toString()} wei)`
        );
        const receipt = await tx.wait();
        logger.info(`Sheet bridge transfer confirmed in block ${receipt?.blockNumber}`);
        return tx.hash;
    } catch (error: any) {
        const errorMsg = error?.message || String(error);
        logger.error(`Sheet bridge transfer failed: ${errorMsg}`);
        
        // Provide more helpful error messages
        if (errorMsg.includes('Invalid JSON-RPC version')) {
            throw new Error(
                `Sheet Chain RPC returned invalid response. ` +
                `The RPC endpoint may be misconfigured or not responding correctly. ` +
                `RPC URL: ${SHEET_RPC_URL}`
            );
        }
        
        if (errorMsg.includes('Unauthorized') || errorMsg.includes('unauthorized')) {
            throw new Error(
                `Bridge transfer unauthorized. ` +
                `The wallet address (${ethWallet.address.toLowerCase()}) must match the bridge operator address (${BRIDGE_OPERATOR_ADDRESS.toLowerCase()}). ` +
                `Please check your SHEET_PRIVATE_KEY or set BRIDGE_OPERATOR_ADDRESS environment variable.`
            );
        }
        
        throw error;
    }
}

export async function sendSolanaTransfer(
    connection: Connection,
    authorityKeypair: Keypair,
    mintAddress: PublicKey,
    recipient: string,
    amount: string
): Promise<string> {
    try {
        const recipientPubkey = new PublicKey(recipient);

        // Get mint info to determine decimals
        const mintInfo = await getMint(connection, mintAddress);
        const decimals = mintInfo.decimals;
        
        logger.info(`Transferring ${amount} (raw) to ${recipient}`);
        logger.info(`Mint decimals: ${decimals}`);

        // Convert amount from wei (18 decimals) to Solana token units (typically 9 decimals)
        // Sheet chain uses 18 decimals, Solana typically uses 9
        const amountWei = BigInt(amount);
        const amountSolana = amountWei / BigInt(10 ** (18 - decimals));
        
        if (amountSolana === 0n) {
            throw new Error(`Amount too small after conversion: ${amountWei} wei = ${amountSolana} tokens (decimals: ${decimals})`);
        }
        
        logger.info(`Converted amount: ${amountWei} wei -> ${amountSolana} tokens (${decimals} decimals)`);

        const authorityTokenAccount = await getAssociatedTokenAddress(
            mintAddress,
            authorityKeypair.publicKey
        );

        logger.info(`Authority Token Account: ${authorityTokenAccount.toBase58()}`);

        // Check if authority token account exists and has balance
        let authorityAccount;
        try {
            authorityAccount = await getAccount(connection, authorityTokenAccount);
            logger.info(`✅ Authority account exists with balance: ${authorityAccount.amount.toString()}`);
            
            if (authorityAccount.amount < amountSolana) {
                throw new Error(
                    `Insufficient balance: ${authorityAccount.amount.toString()} < ${amountSolana.toString()}`
                );
            }
        } catch (error: any) {
            const errorMsg = error.message || String(error);
            if (errorMsg.includes('could not find account') || errorMsg.includes('InvalidAccountData')) {
                logger.error(`❌ Authority token account does not exist: ${authorityTokenAccount.toBase58()}`);
                logger.error(`   Authority wallet: ${authorityKeypair.publicKey.toBase58()}`);
                logger.error(`   Mint address: ${mintAddress.toBase58()}`);
                throw new Error(
                    `Authority token account does not exist. ` +
                    `The authority wallet (${authorityKeypair.publicKey.toBase58()}) needs to have SHEET tokens. ` +
                    `You may need to mint tokens to this wallet or transfer tokens to it first.`
                );
            }
            throw error;
        }

        // Ensure recipient token account exists (create if needed)
        // This handles the account creation properly and validates the recipient address
        logger.info('Ensuring recipient token account exists...');
        let recipientTokenAccount;
        try {
            const recipientTokenAccountInfo = await getOrCreateAssociatedTokenAccount(
                connection,
                authorityKeypair,        // payer
                mintAddress,             // mint
                recipientPubkey          // owner
            );
            recipientTokenAccount = recipientTokenAccountInfo.address;
            logger.info(`Recipient token account: ${recipientTokenAccount.toBase58()}`);
        } catch (error: any) {
            const errorMsg = error.message || String(error);
            logger.error(`Failed to get or create recipient token account: ${errorMsg}`);
            
            // Check if it's an invalid address error
            if (errorMsg.includes('not allowed') || errorMsg.includes('Invalid')) {
                throw new Error(
                    `Invalid recipient address: ${recipient}. ` +
                    `The address must be a valid Solana wallet address (not a PDA or program address).`
                );
            }
            throw error;
        }

        const transaction = new Transaction();
        
        // Set fee payer (required for simulation and execution)
        transaction.feePayer = authorityKeypair.publicKey;

        // Add transfer instruction
        transaction.add(
            createTransferInstruction(
                authorityTokenAccount,
                recipientTokenAccount,
                authorityKeypair.publicKey,
                amountSolana
            )
        );

        // Check SOL balance for fees
        const solBalance = await connection.getBalance(authorityKeypair.publicKey);
        logger.info(`Authority SOL balance: ${solBalance / 1e9} SOL`);
        
        if (solBalance < 5000) { // Minimum ~0.000005 SOL for transaction
            throw new Error(
                `Insufficient SOL for transaction fees. ` +
                `Authority wallet has ${solBalance / 1e9} SOL, needs at least 0.000005 SOL.`
            );
        }

        // Simulate transaction first to catch errors early
        // Create a copy for simulation with a blockhash
        const simulationTx = new Transaction();
        simulationTx.feePayer = authorityKeypair.publicKey;
        simulationTx.add(
            createTransferInstruction(
                authorityTokenAccount,
                recipientTokenAccount,
                authorityKeypair.publicKey,
                amountSolana
            )
        );
        
        const { blockhash: simBlockhash } = await connection.getLatestBlockhash('confirmed');
        simulationTx.recentBlockhash = simBlockhash;
        
        try {
            const simulation = await connection.simulateTransaction(simulationTx);
            if (simulation.value.err) {
                logger.error('Transaction simulation failed:', JSON.stringify(simulation.value.err, null, 2));
                if (simulation.value.logs) {
                    logger.error('Simulation logs:', simulation.value.logs);
                }
                throw new Error(
                    `Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`
                );
            }
            logger.info(`Transaction simulation successful`);
            if (simulation.value.unitsConsumed) {
                logger.info(`Compute units consumed: ${simulation.value.unitsConsumed}`);
            }
        } catch (simError: any) {
            logger.error('Simulation error:', simError?.message || String(simError));
            throw simError;
        }

        // Get fresh blockhash for actual transaction (blockhashes expire quickly)
        const { blockhash: sendBlockhash } = await connection.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = sendBlockhash;

        const signature = await sendAndConfirmTransaction(
            connection,
            transaction,
            [authorityKeypair],
            { 
                commitment: 'confirmed',
                skipPreflight: false // Don't skip preflight to catch errors early
            }
        );

        logger.info(
            `✅ Solana transfer confirmed: ${signature} -> ${recipient} (${amountSolana.toString()} tokens)`
        );

        return signature;
    } catch (error: any) {
        const errorMessage = error?.message || error?.toString() || String(error);
        logger.error(`❌ Solana transfer failed: ${errorMessage}`);
        
        // Log additional error details
        if (error?.logs) {
            logger.error('Transaction logs:', JSON.stringify(error.logs, null, 2));
        }
        if (error?.err) {
            logger.error('Transaction error:', JSON.stringify(error.err, null, 2));
        }
        if (error?.stack) {
            logger.error('Error stack:', error.stack);
        }
        if (error?.code) {
            logger.error('Error code:', error.code);
        }
        
        // Create a more descriptive error
        const descriptiveError = new Error(
            `Solana transfer failed: ${errorMessage}${error?.logs ? `\nLogs: ${JSON.stringify(error.logs)}` : ''}`
        );
        throw descriptiveError;
    }
}

export async function sendBSCTransfer(
    wallet: Wallet,
    tokenLockAddress: string,
    recipient: string,
    amount: string
): Promise<string> {
    try {
        if (!isAddress(recipient)) {
            throw new Error(`Invalid BSC address: ${recipient}`);
        }

        const contract = new Contract(tokenLockAddress, tokenLockAbi, wallet);

        const tx = await contract.release(recipient, amount);

        logger.info(
            `BSC transfer submitted: ${tx.hash} -> ${recipient} (${amount} tokens)`
        );

        const receipt = await tx.wait();
        logger.info(`BSC transfer confirmed in block ${receipt?.blockNumber}`);

        return tx.hash;
    } catch (error: any) {
        logger.error(`BSC transfer failed: ${error?.message ?? String(error)}`);
        throw error;
    }
}
