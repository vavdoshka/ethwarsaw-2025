const fs = require("node:fs");
const path = require("node:path");
const { google } = require("googleapis");

class GoogleSheetsSyncClient {
  constructor({
    spreadsheetId,
    credentialFilePath,
    sheetName,
    blindAppend = false,
    resetOnStart = false
  }) {
    if (!spreadsheetId) throw new Error("spreadsheetId is required");
    if (!credentialFilePath) throw new Error("credentialFilePath is required");
    if (!sheetName) throw new Error("sheetName is required");

    this.spreadsheetId = spreadsheetId;
    this.credentialFilePath = credentialFilePath;
    this.sheetName = sheetName;
    this.txSheetName = `${sheetName}_tx`;
    this.stateSheetName = `${sheetName}_state`;
    this.genesisSheetName = `${sheetName}_genesis`;
    this.claimsSheetName = `${sheetName}_claims`;
    this.bridgeSheetName = `${sheetName}_bridge`;
    this.blindAppend = blindAppend;
    this.resetOnStart = resetOnStart;
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
    let resetInfo = null;
    if (this.resetOnStart) {
      resetInfo = await this.resetSpreadsheetTabs();
    }
    await this.ensureSheet();
    await this.ensureViewSheets();
    return {
      spreadsheetId: this.spreadsheetId,
      resetApplied: this.resetOnStart,
      resetInfo,
      managedSheets: this.getManagedSheetNames()
    };
  }

  async resetSpreadsheetTabs() {
    const spreadsheet = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId
    });
    const sheets = spreadsheet.data.sheets || [];
    if (sheets.length === 0) {
      return { existingSheets: 0, deletedSheets: 0, renamedTo: null };
    }

    const keepSheet = sheets[0];
    const keepSheetId = keepSheet.properties.sheetId;
    const requests = [];

    for (let i = 1; i < sheets.length; i += 1) {
      requests.push({ deleteSheet: { sheetId: sheets[i].properties.sheetId } });
    }
    requests.push({
      updateSheetProperties: {
        properties: { sheetId: keepSheetId, title: this.txSheetName },
        fields: "title"
      }
    });
    requests.push({
      updateCells: {
        range: { sheetId: keepSheetId },
        fields: "userEnteredValue"
      }
    });

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      resource: { requests }
    });
    return {
      existingSheets: sheets.length,
      deletedSheets: Math.max(0, sheets.length - 1),
      renamedTo: this.txSheetName
    };
  }

  getManagedSheetNames() {
    return {
      tx: this.txSheetName,
      genesis: this.genesisSheetName,
      state: this.stateSheetName,
      claims: this.claimsSheetName,
      bridge: this.bridgeSheetName
    };
  }

  async ensureSheet() {
    const spreadsheet = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId
    });
    const titles = (spreadsheet.data.sheets || []).map((sheet) => sheet.properties.title);
    if (!titles.includes(this.txSheetName)) {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        resource: {
          requests: [
            { addSheet: { properties: { title: this.txSheetName } } }
          ]
        }
      });
    }
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${this.txSheetName}!A1:I1`,
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
          "Status",
          "ExportBatchId"
        ]]
      }
    });
  }

  async ensureViewSheets() {
    const spreadsheet = await this.sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
    const titles = new Set((spreadsheet.data.sheets || []).map((sheet) => sheet.properties.title));
    const missing = [
      this.stateSheetName,
      this.genesisSheetName,
      this.claimsSheetName,
      this.bridgeSheetName
    ].filter((name) => !titles.has(name));
    if (missing.length > 0) {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        resource: { requests: missing.map((title) => ({ addSheet: { properties: { title } } })) }
      });
    }
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${this.stateSheetName}!A1:C1`,
      valueInputOption: "RAW",
      resource: { values: [["Address", "Balance", "Nonce"]] }
    });
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${this.genesisSheetName}!A1:C1`,
      valueInputOption: "RAW",
      resource: { values: [["Address", "Balance", "Nonce"]] }
    });
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${this.claimsSheetName}!A1:B1`,
      valueInputOption: "RAW",
      resource: { values: [["ClaimId", "Payload"]] }
    });
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${this.bridgeSheetName}!A1:B1`,
      valueInputOption: "RAW",
      resource: { values: [["Index", "Payload"]] }
    });
  }

  async hasTransaction(txHash) {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${this.txSheetName}!B:B`
    });
    const hashes = (response.data.values || []).map((row) => String(row[0] || "").toLowerCase());
    return hashes.includes(String(txHash).toLowerCase());
  }

  async hasTransactions(txHashes) {
    const normalizedSet = new Set(txHashes.map((hash) => String(hash).toLowerCase()));
    if (normalizedSet.size === 0) return new Set();
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${this.txSheetName}!B:B`
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
      tx.status || "0x1",
      tx.exportBatchId || ""
    ]);
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${this.txSheetName}!A:I`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      resource: { values: rows }
    });
  }

  async writeGenesis(rows) {
    const values = [["Address", "Balance", "Nonce"], ...rows.map((row) => [row.address, String(row.balance), String(row.nonce)])];
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${this.genesisSheetName}!A1:C${values.length}`,
      valueInputOption: "RAW",
      resource: { values }
    });
  }

  async writeBalances(rows) {
    const values = [["Address", "Balance", "Nonce"], ...rows.map((row) => [row.address, String(row.balance), String(row.nonce)])];
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${this.stateSheetName}!A1:C${values.length}`,
      valueInputOption: "RAW",
      resource: { values }
    });
  }

  async writeClaims(rows) {
    const values = [["ClaimId", "Payload"], ...rows.map((row) => [row.claimId, JSON.stringify(row)])];
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${this.claimsSheetName}!A1:B${values.length}`,
      valueInputOption: "RAW",
      resource: { values }
    });
  }

  async writeBridgeRecords(rows) {
    const values = [["Index", "Payload"], ...rows.map((row) => [String(row.index), JSON.stringify(row)])];
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${this.bridgeSheetName}!A1:B${values.length}`,
      valueInputOption: "RAW",
      resource: { values }
    });
  }
}

module.exports = {
  GoogleSheetsSyncClient
};
