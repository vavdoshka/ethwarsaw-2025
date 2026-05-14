const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function makeTempDir(prefix = "rpc-node-v2-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makeJournalPath() {
  const dir = makeTempDir();
  return path.join(dir, "journal.jsonl");
}

module.exports = {
  makeTempDir,
  makeJournalPath
};
