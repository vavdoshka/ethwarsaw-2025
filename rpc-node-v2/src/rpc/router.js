function createRpcRouter(methods) {
  async function handleRequest(payload) {
    if (!payload || payload.jsonrpc !== "2.0" || !payload.method) {
      return {
        jsonrpc: "2.0",
        error: { code: -32600, message: "Invalid Request" },
        id: payload ? payload.id : null
      };
    }

    const method = methods[payload.method];
    if (!method) {
      return {
        jsonrpc: "2.0",
        error: { code: -32601, message: `Method ${payload.method} not supported` },
        id: payload.id
      };
    }

    try {
      const result = await method(payload.params || []);
      return { jsonrpc: "2.0", result, id: payload.id };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        error: { code: -32603, message: error.message },
        id: payload.id
      };
    }
  }

  return { handleRequest };
}

module.exports = {
  createRpcRouter
};
