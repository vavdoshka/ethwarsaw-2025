const { ethers } = require('ethers');
const { describe, it, expect } = require('./test-helpers');
const {
  setTestEnvironment,
  BRIDGE_CONTRACT_ADDRESS,
  BRIDGE_OPERATOR_ADDRESS,
  handleBridgeTransferTransaction
} = require('../src/server');

describe('BridgeTransfer sender protection', () => {
  const recipient = '0x0000000000000000000000000000000000000001';
  const amount = ethers.parseEther('1.0');

  const iface = new ethers.Interface([
    'function bridgeTransfer(address recipient, uint256 amount)'
  ]);

  it('allows bridgeTransfer when called by bridge operator', async () => {
    const calls = [];

    const fakeSheetOps = {
      getBridgeAccountAddress() {
        return BRIDGE_CONTRACT_ADDRESS;
      },
      async bridgeTransfer(rec, amt) {
        calls.push({ recipient: rec, amount: amt.toString() });
        return {
          transactionHash: '0x' + '3'.padStart(64, '0')
        };
      }
    };

    // Ensure test environment uses our fake sheet ops and preserves operator address
    setTestEnvironment({
      sheetOps: fakeSheetOps
    });

    const data = iface.encodeFunctionData('bridgeTransfer', [recipient, amount]);

    const tx = {
      from: BRIDGE_OPERATOR_ADDRESS,
      to: BRIDGE_CONTRACT_ADDRESS,
      data
    };

    const result = await handleBridgeTransferTransaction(tx);

    expect(result.transactionHash.startsWith('0x')).toBe(true);
    expect(calls.length).toBe(1);
    expect(calls[0].recipient.toLowerCase()).toBe(recipient.toLowerCase());
    expect(calls[0].amount).toBe(amount.toString());
  });

  it('rejects bridgeTransfer when called by non-operator', async () => {
    const fakeSheetOps = {
      getBridgeAccountAddress() {
        return BRIDGE_CONTRACT_ADDRESS;
      },
      async bridgeTransfer() {
        throw new Error('bridgeTransfer should not be called for unauthorized sender');
      }
    };

    setTestEnvironment({
      sheetOps: fakeSheetOps
    });

    const data = iface.encodeFunctionData('bridgeTransfer', [recipient, amount]);

    const tx = {
      from: '0x0000000000000000000000000000000000000004',
      to: BRIDGE_CONTRACT_ADDRESS,
      data
    };

    let threw = false;
    try {
      await handleBridgeTransferTransaction(tx);
    } catch (error) {
      threw = true;
      expect(error.message).toContain('Unauthorized bridgeTransfer caller');
    }

    expect(threw).toBe(true);
  });
});

