const { ethers } = require('ethers');

async function testRPC() {
  const provider = new ethers.JsonRpcProvider('http://localhost:8545');
  
  console.log('Testing SheetChain RPC Node...\n');
  
  try {
    const chainId = await provider.getNetwork();
    console.log('✅ Chain ID:', chainId.chainId);
    
    const blockNumber = await provider.getBlockNumber();
    console.log('✅ Current Block:', blockNumber);
    
    const testAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7';
    
    const balance = await provider.getBalance(testAddress);
    console.log('✅ Balance for', testAddress, ':', ethers.formatEther(balance), 'ETH');
    
    const nonce = await provider.getTransactionCount(testAddress);
    console.log('✅ Nonce for', testAddress, ':', nonce);
    
    const gasPrice = await provider.getFeeData();
    console.log('✅ Gas Price:', ethers.formatUnits(gasPrice.gasPrice, 'gwei'), 'gwei');
    
    console.log('\n✅ All tests passed! RPC node is working correctly.');
    console.log('\nTo test transactions:');
    console.log('1. Add some initial balance to an address in your Google Sheet (Balances tab)');
    console.log('2. Import the private key to MetaMask');
    console.log('3. Connect MetaMask to http://localhost:8545 with Chain ID 12345');
    console.log('4. Send a transaction!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testRPC();