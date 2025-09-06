const { ethers } = require('ethers');

function generateTransactionHash(tx) {
  const data = {
    from: tx.from,
    to: tx.to,
    value: tx.value,
    nonce: tx.nonce,
    timestamp: Date.now(),
    random: Math.random()
  };
  
  return ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(data)));
}

function generateBlockHash(blockNumber) {
  return ethers.keccak256(ethers.toUtf8Bytes(blockNumber.toString()));
}

function calculateGasUsed(tx) {
  const baseGas = 21000;
  
  if (tx.data && tx.data !== '0x') {
    const dataBytes = (tx.data.length - 2) / 2;
    const dataGas = dataBytes * 68;
    return baseGas + dataGas;
  }
  
  return baseGas;
}

function formatAddress(address) {
  if (!address) return null;
  return ethers.getAddress(address).toLowerCase();
}

function parseEther(value) {
  return ethers.parseEther(value.toString());
}

function formatEther(value) {
  return ethers.formatEther(value);
}

module.exports = {
  generateTransactionHash,
  generateBlockHash,
  calculateGasUsed,
  formatAddress,
  parseEther,
  formatEther
};