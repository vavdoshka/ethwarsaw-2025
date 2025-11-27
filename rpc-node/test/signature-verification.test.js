const { ethers } = require('ethers');
const { describe, it, expect } = require('./test-helpers');

/**
 * Test suite for transaction signature verification
 * Tests the ecrecover-based signature verification logic
 */

const CHAIN_ID = 12345;

// Extracted helper so it can also be exported if needed
async function verifyTransactionSignature(rawTx) {
  try {
    const tx = ethers.Transaction.from(rawTx);
    
    // Verify signature components exist
    if (!tx.signature || !tx.signature.r || !tx.signature.s || tx.signature.v === undefined) {
      throw new Error('Transaction missing signature components');
    }
    
    // Reconstruct unsigned transaction
    const unsignedTx = {
      to: tx.to,
      value: tx.value,
      data: tx.data || '0x',
      gasLimit: tx.gasLimit,
      gasPrice: tx.gasPrice || tx.maxFeePerGas || 0n,
      nonce: tx.nonce,
      chainId: tx.chainId
    };
    
    // Create unsigned transaction and get its hash
    const unsignedTxObj = ethers.Transaction.from(unsignedTx);
    const unsignedSerialized = unsignedTxObj.unsignedSerialized;
    const txHash = ethers.keccak256(unsignedSerialized);
    
    // Recover the signer address from the signature using ecrecover
    const recoveredAddress = ethers.recoverAddress(txHash, {
      r: tx.signature.r,
      s: tx.signature.s,
      v: tx.signature.v
    });
    
    // Verify the recovered address matches the transaction's from address
    if (recoveredAddress.toLowerCase() !== tx.from.toLowerCase()) {
      throw new Error('Invalid transaction signature: recovered address does not match sender');
    }
    
    return {
      valid: true,
      from: tx.from,
      recoveredAddress: recoveredAddress
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
  }
}

describe('Transaction Signature Verification', () => {

  it('should verify a valid transaction signature', async () => {
    // Create a wallet and sign a transaction
    const wallet = ethers.Wallet.createRandom();
    // simple deterministic valid address (all zeros)
    const recipient = '0x0000000000000000000000000000000000000001';
    
    const tx = {
      to: recipient,
      value: ethers.parseEther('1.0'),
      gasLimit: 21000,
      gasPrice: ethers.parseUnits('20', 'gwei'),
      nonce: 0,
      chainId: CHAIN_ID
    };
    
    // Sign the transaction
    const signedTx = await wallet.signTransaction(tx);
    
    // Verify the signature
    const result = await verifyTransactionSignature(signedTx);
    
    expect(result.valid).toBe(true);
    expect(result.from.toLowerCase()).toBe(wallet.address.toLowerCase());
    expect(result.recoveredAddress.toLowerCase()).toBe(wallet.address.toLowerCase());
  });

  it('should verify transaction with data field', async () => {
    const wallet = ethers.Wallet.createRandom();
    const recipient = '0x0000000000000000000000000000000000000001';
    
    // Transaction with data (contract call)
    const tx = {
      to: recipient,
      value: ethers.parseEther('0.5'),
      data: '0x1234567890abcdef',
      gasLimit: 100000,
      gasPrice: ethers.parseUnits('20', 'gwei'),
      nonce: 0,
      chainId: CHAIN_ID
    };
    
    const signedTx = await wallet.signTransaction(tx);
    const result = await verifyTransactionSignature(signedTx);
    
    expect(result.valid).toBe(true);
    expect(result.from.toLowerCase()).toBe(wallet.address.toLowerCase());
  });

  it('should verify transaction with zero value', async () => {
    const wallet = ethers.Wallet.createRandom();
    const recipient = '0x0000000000000000000000000000000000000001';
    
    const tx = {
      to: recipient,
      value: 0n,
      gasLimit: 21000,
      gasPrice: ethers.parseUnits('20', 'gwei'),
      nonce: 0,
      chainId: CHAIN_ID
    };
    
    const signedTx = await wallet.signTransaction(tx);
    const result = await verifyTransactionSignature(signedTx);
    
    expect(result.valid).toBe(true);
    expect(result.from.toLowerCase()).toBe(wallet.address.toLowerCase());
  });

  it('should verify transaction with different chain IDs', async () => {
    const wallet = ethers.Wallet.createRandom();
    const recipient = '0x0000000000000000000000000000000000000001';
    
    // Test with different chain ID
    const tx = {
      to: recipient,
      value: ethers.parseEther('1.0'),
      gasLimit: 21000,
      gasPrice: ethers.parseUnits('20', 'gwei'),
      nonce: 0,
      chainId: 1 // Ethereum mainnet
    };
    
    const signedTx = await wallet.signTransaction(tx);
    const result = await verifyTransactionSignature(signedTx);
    
    expect(result.valid).toBe(true);
    expect(result.from.toLowerCase()).toBe(wallet.address.toLowerCase());
  });

  it('should handle contract creation transaction (no to address)', async () => {
    const wallet = ethers.Wallet.createRandom();
    
    // Contract creation transaction (to is null)
    const tx = {
      to: null,
      value: ethers.parseEther('0.1'),
      data: '0x6080604052348015600f57600080fd5b50',
      gasLimit: 1000000,
      gasPrice: ethers.parseUnits('20', 'gwei'),
      nonce: 0,
      chainId: CHAIN_ID
    };
    
    const signedTx = await wallet.signTransaction(tx);
    const result = await verifyTransactionSignature(signedTx);
    
    expect(result.valid).toBe(true);
    expect(result.from.toLowerCase()).toBe(wallet.address.toLowerCase());
  });
});

// Export helper for potential reuse
module.exports = { verifyTransactionSignature };
