const express = require("express");
const { createApp } = require("../app");

function createServer(options = {}) {
  const appContext = createApp(options);
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      chainId: appContext.config.chainId,
      latestBlockNumber: appContext.state.latestBlockNumber
    });
  });

  app.post("/", async (req, res) => {
    if (Array.isArray(req.body)) {
      const responses = await Promise.all(req.body.map((item) => appContext.router.handleRequest(item)));
      return res.json(responses);
    }
    const response = await appContext.router.handleRequest(req.body);
    return res.json(response);
  });

  return { app, context: appContext };
}

if (require.main === module) {
  const { app, context } = createServer();
  app.listen(context.config.port, () => {
    console.log(`rpc-node-v2 listening on ${context.config.port}`);
  });
}

module.exports = {
  createServer
};
