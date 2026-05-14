const fs = require("node:fs");
const path = require("node:path");
const { google } = require("googleapis");

class GoogleSheetsSyncClient {
  constructor({
    spreadsheetId,
    credentialFilePath,
    sheetName,
    blindAppend = false
  }) {
    if (!spreadsheetId) throw new Error("spreadsheetId is required");
    if (!credentialFilePath) throw new Error("credentialFilePath is required");
    if (!sheetName) throw new Error("sheetName is required");

    this.spreadsheetId = spreadsheetId;
    this.credentialFilePath = credentialFilePath;
    this.sheetName = sheetName;
    this.blindAppend = blindAppend;
    this.sheets = null;
  }

  async initialize() {
    const resolvedPath = path.resolve(this.credentialFilePath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Credentials file not found: ${resolvedPath}`);
    }

    const auth = new google.auth.GoogleAuth({
      keyFile: resolvedPath,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });
    this.sheets = google.sheets({ version: "v4", auth });
    await this.ensureSheet();
  }

  async ensureSheet() {
    const spreadsheet = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId
    });
    const titles = (spreadsheet.data.sheets || []).map((sheet) => sheet.properties.title);
    if (!titles.includes(this.sheetName)) {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        resource: {
          requests: [
            { addSheet: { properties: { title: this.sheetName } } }
          ]
        }
      });
    }
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${this.sheetName}!A1:H1`,
      valueInputOption: "RAW",
      resource: {
        values: [[
          "Timestamp",
          "TxHash",
          "From",
          "To",
          "Value",
          "Nonce",
          "BlockNumber",
          "Status"
        ]]
      }
    });
  }

  async hasTransaction(txHash) {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${this.sheetName}!B:B`
    });
    const hashes = (response.data.values || []).map((row) => String(row[0] || "").toLowerCase());
    return hashes.includes(String(txHash).toLowerCase());
  }

  async hasTransactions(txHashes) {
    const normalizedSet = new Set(txHashes.map((hash) => String(hash).toLowerCase()));
    if (normalizedSet.size === 0) return new Set();
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${this.sheetName}!B:B`
    });
    const existing = new Set();
    for (const row of response.data.values || []) {
      const value = String(row[0] || "").toLowerCase();
      if (normalizedSet.has(value)) existing.add(value);
    }
    return existing;
  }

  async writeTransaction(tx) {
    await this.writeTransactions([tx]);
  }

  async writeTransactions(transactions) {
    const rows = transactions.map((tx) => [
      new Date().toISOString(),
      tx.hash,
      tx.from,
      tx.to,
      tx.value,
      String(tx.nonce),
      String(tx.blockNumber),
      tx.status || "0x1"
    ]);
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${this.sheetName}!A:H`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      resource: { values: rows }
    });
  }
}

module.exports = {
  GoogleSheetsSyncClient
};
