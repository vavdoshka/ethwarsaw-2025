import 'dotenv/config';
import { Wallet, JsonRpcProvider, formatEther, Interface } from 'ethers';

/**
 * Script to get the wallet address from SHEET_PRIVATE_KEY and check its balance
 * This address needs to have balance in the Sheet Chain Google Sheets
 * and should match the bridge operator address
 */
async function main() {
    const privateKey = process.env.SHEET_PRIVATE_KEY;
    const rpcUrl = process.env.SHEET_RPC_URL || 'http://localhost:8545';
    const bridgeContractAddress = '0x0000000000000000000000000000000000000003';
    const expectedOperator = process.env.BRIDGE_OPERATOR_ADDRESS || '0x337d7730a281efE851dbEDf5F4eD0D2610E59639';
    
    if (!privateKey) {
        console.error('❌ Error: SHEET_PRIVATE_KEY not found in environment variables');
        console.error('   Please set SHEET_PRIVATE_KEY in your .env file');
        process.exit(1);
    }
    
    try {
        // Create wallet from private key (no provider needed just to get address)
        const wallet = new Wallet(privateKey);
        const address = wallet.address;
        
        console.log('\n✅ Bridge Wallet Address:');
        console.log(`   ${address}`);
        
        // Check if address matches bridge operator
        const isOperator = address.toLowerCase() === expectedOperator.toLowerCase();
        console.log('\n🔐 Bridge Operator Status:');
        console.log(`   Expected operator: ${expectedOperator}`);
        if (isOperator) {
            console.log('   ✅ This address IS the bridge operator - bridge transfers will work');
        } else {
            console.log('   ⚠️  This address is NOT the bridge operator!');
            console.log('   Bridge transfers may fail. To fix:');
            console.log(`   1. Set SHEET_PRIVATE_KEY to match bridge operator private key, or`);
            console.log(`   2. Set BRIDGE_OPERATOR_ADDRESS=${address} in environment`);
        }
        
        // Try to get balance from Sheet Chain
        try {
            const provider = new JsonRpcProvider(rpcUrl);
            const balanceWei = await provider.getBalance(address);
            const balanceEth = formatEther(balanceWei);
            
            console.log('\n💰 Current Balance on Sheet Chain:');
            console.log(`   ${balanceWei.toString()} wei`);
            console.log(`   ${balanceEth} ETH`);
            
            if (balanceWei === 0n) {
                console.log('\n⚠️  WARNING: Balance is 0! The bridge cannot send transfers.');
                console.log('   You need to add balance to this address in the Google Sheets.');
            } else {
                console.log('\n✅ Balance found! The bridge should be able to send transfers.');
            }
            
            // Try to check bridge operator status via contract call
            if (isOperator) {
                try {
                    const bridgeInterface = new Interface([
                        'function isBridgeOperator(address) view returns (bool)'
                    ]);
                    const data = bridgeInterface.encodeFunctionData('isBridgeOperator', [address]);
                    const result = await provider.call({
                        to: bridgeContractAddress,
                        data: data
                    });
                    const isOp = bridgeInterface.decodeFunctionResult('isBridgeOperator', result)[0];
                    console.log(`\n🌉 Bridge Contract Verification:`);
                    console.log(`   isBridgeOperator(${address}): ${isOp ? '✅ true' : '❌ false'}`);
                } catch (callError: any) {
                    console.log(`\n⚠️  Could not verify bridge operator status via contract: ${callError.message}`);
                }
            }
        } catch (balanceError: any) {
            console.log('\n⚠️  Could not fetch balance from Sheet Chain RPC:');
            console.log(`   ${balanceError.message}`);
            console.log(`   RPC URL: ${rpcUrl}`);
            console.log('   Make sure the RPC node is running.');
        }
        
        
        console.log('\n📝 To add/update balance:');
        console.log('   1. Open your Google Sheet (the one used by the RPC node)');
        console.log('   2. Go to the "Balances" tab');
        console.log('   3. Add or update a row with:');
        console.log(`      Address: ${address}`);
        console.log('      Balance: 1000000000000000000000 (1 ETH in wei, or more)');
        console.log('      Nonce: 0');
        console.log('\n   Example row in Balances sheet:');
        console.log(`   ${address} | 1000000000000000000000 | 0`);
        console.log('\n   Note: Balance is in wei (1 ETH = 1000000000000000000 wei)');
        console.log('         The bridge needs enough balance to cover transfers + gas fees');
        console.log('\n💡 After adding balance, restart the RPC node to pick up the changes');
    } catch (error: any) {
        console.error('❌ Error creating wallet:', error.message);
        console.error('   Please check that SHEET_PRIVATE_KEY is a valid private key');
        process.exit(1);
    }
}

main().catch((error) => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
});
