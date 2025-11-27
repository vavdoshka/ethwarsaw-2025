const { ethers } = require('ethers');
const { describe, it, expect } = require('./test-helpers');
const { app, setTestEnvironment } = require('../src/server');

const CHAIN_ID = 12345;

// Configure a minimal test environment for the RPC server.
// We stub the RPC handler so we don't touch Google Sheets.
setTestEnvironment({
  rpcHandler: {
    async handleRequest(method, params) {
      if (method === 'eth_sendRawTransaction') {
        // Return a deterministic dummy tx hash so tests can assert on it
        return '0x' + '1'.padStart(64, '0');
      }
      throw new Error(`Unsupported method in test handler: ${method}`);
    }
  }
});

// Grab the actual POST / handler from the Express app so we can invoke it
// directly without opening a real network port (which is restricted).
function getPostRootHandler() {
  const stack = app._router && app._router.stack ? app._router.stack : [];
  for (const layer of stack) {
    if (layer.route && layer.route.path === '/' && layer.route.methods && layer.route.methods.post) {
      // First handler in the route stack is our async RPC handler
      return layer.route.stack[0].handle;
    }
  }
  throw new Error('POST / handler not found on app');
}

const handleRpcRequest = getPostRootHandler();

function createMockReq(body) {
  return {
    body,
    headers: {},
    get(name) {
      const key = String(name || '').toLowerCase();
      return this.headers[key] || '';
    }
  };
}

function createMockRes() {
  return {
    statusCode: 200,
    jsonBody: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.jsonBody = payload;
      return this;
    }
  };
}

describe('RPC Server - eth_sendRawTransaction', () => {
  it('accepts a valid signed transaction and returns a result', async () => {
    const wallet = ethers.Wallet.createRandom();
    const recipient = '0x0000000000000000000000000000000000000001';

    const tx = {
      to: recipient,
      value: ethers.parseEther('0.1'),
      gasLimit: 21000,
      gasPrice: ethers.parseUnits('20', 'gwei'),
      nonce: 0,
      chainId: CHAIN_ID
    };

    const signedTx = await wallet.signTransaction(tx);

    const req = createMockReq({
      jsonrpc: '2.0',
      method: 'eth_sendRawTransaction',
      params: [signedTx],
      id: 1
    });
    const res = createMockRes();

    await handleRpcRequest(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toBeDefined();
    expect(res.jsonBody.error).toBe(undefined);
    expect(typeof res.jsonBody.result).toBe('string');
    expect(res.jsonBody.result.startsWith('0x')).toBe(true);
  });

  it('returns an error for malformed raw transaction data', async () => {
    const req = createMockReq({
      jsonrpc: '2.0',
      method: 'eth_sendRawTransaction',
      params: ['0x1234'],
      id: 2
    });
    const res = createMockRes();

    await handleRpcRequest(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toBeDefined();
    expect(res.jsonBody.error).toBeDefined();
    expect(typeof res.jsonBody.error.message).toBe('string');
  });
});
