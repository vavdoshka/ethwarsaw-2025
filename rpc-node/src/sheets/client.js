const { google } = require('googleapis');
const winston = require('winston');

class GoogleSheetsClient {
  constructor() {
    this.sheets = null;
    this.auth = null;
    this.spreadsheetId = process.env.GOOGLE_SHEET_ID;
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.simple(),
      transports: [new winston.transports.Console()]
    });
  }

  async initialize() {
    try {
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        this.auth = new google.auth.GoogleAuth({
          keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
          scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
      } else {
        this.auth = new google.auth.GoogleAuth({
          credentials: {
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
          },
          scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
      }

      this.sheets = google.sheets({ version: 'v4', auth: this.auth });
      this.logger.info('Google Sheets client initialized successfully');
      
      await this.ensureSheetStructure();
    } catch (error) {
      this.logger.error('Failed to initialize Google Sheets client:', error);
      
      // Notify Telegram about Sheets initialization error
      const telegramService = require('../telegram');
      if (telegramService.isTelegramEnabled()) {
        telegramService.notifySheetsError('Initialization', error.message).catch(() => {});
      }
      throw error;
    }
  }

  async ensureSheetStructure() {
    try {
      const spreadsheet = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId
      });

      const sheetTitles = spreadsheet.data.sheets.map(sheet => sheet.properties.title);
      
      if (!sheetTitles.includes('Balances')) {
        await this.createSheet('Balances', ['Address', 'Balance', 'Nonce']);
      }
      
      if (!sheetTitles.includes('Transactions')) {
        await this.createSheet('Transactions', ['Timestamp', 'TxHash', 'From', 'To', 'Value', 'Nonce', 'Status', 'BlockNumber', 'GasUsed']);
      }
      
      if (!sheetTitles.includes('Claims')) {
        await this.createSheet('Claims', ['ClaimId', 'Address', 'Amount', 'Timestamp', 'Status', 'TransactionHash', 'BlockNumber']);
      }
      
      if (!sheetTitles.includes('Bridge')) {
        await this.createSheet('Bridge', ['Timestamp', 'TxHash', 'From', 'Amount', 'ToAddress', 'DestChainId', 'Status', 'BlockNumber']);
      }
    } catch (error) {
      this.logger.error('Failed to ensure sheet structure:', error);
      throw error;
    }
  }

  async createSheet(title, headers) {
    try {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        resource: {
          requests: [{
            addSheet: {
              properties: { title }
            }
          }]
        }
      });

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${title}!A1:${String.fromCharCode(64 + headers.length)}1`,
        valueInputOption: 'RAW',
        resource: {
          values: [headers]
        }
      });

      this.logger.info(`Created sheet: ${title}`);
    } catch (error) {
      if (error.message && error.message.includes('already exists')) {
        this.logger.info(`Sheet ${title} already exists`);
      } else {
        throw error;
      }
    }
  }

  async readRange(range) {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range
      });
      return response.data.values || [];
    } catch (error) {
      this.logger.error(`Failed to read range ${range}:`, error);
      
      // Notify Telegram about Sheets read error (only for critical operations)
      const telegramService = require('../telegram');
      if (telegramService.isTelegramEnabled() && !error.message.includes('quota')) {
        telegramService.notifySheetsError(`Read ${range}`, error.message).catch(() => {});
      }
      throw error;
    }
  }

  async updateRange(range, values) {
    try {
      const response = await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range,
        valueInputOption: 'RAW',
        resource: { values }
      });
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to update range ${range}:`, error);
      throw error;
    }
  }

  async appendRow(sheetName, values) {
    try {
      // Get current row count to know which row we're adding
      const currentRows = await this.readRange(`${sheetName}!A:A`);
      const newRowNumber = currentRows.length + 1;
      
      console.log(`📝 Appending row to ${sheetName} sheet (will be row ${newRowNumber}):`, {
        sheetName: sheetName,
        rowNumber: newRowNumber,
        values: values,
        timestamp: new Date().toISOString()
      });
      
      const response = await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A:A`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: { values: [values] }
      });
      
      // Get updated row count to confirm
      const updatedRows = await this.readRange(`${sheetName}!A:A`);
      const actualRowNumber = updatedRows.length;
      
      console.log(`✅ Successfully appended row to ${sheetName} sheet (row ${actualRowNumber}):`, {
        sheetName: sheetName,
        rowNumber: actualRowNumber,
        values: values,
        timestamp: new Date().toISOString()
      });
      
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to append row to ${sheetName}:`, error);
      throw error;
    }
  }

  async batchUpdate(requests) {
    try {
      const response = await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        resource: { requests }
      });
      return response.data;
    } catch (error) {
      this.logger.error('Failed to perform batch update:', error);
      throw error;
    }
  }
}

module.exports = GoogleSheetsClient;