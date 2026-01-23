import { google } from 'googleapis';
import logger from '../logger';

export interface BridgeRecord {
    rowIndex: number; // Actual row number in Google Sheet (1-based, including header)
    timestamp: string;
    txHash: string;
    from: string;
    amount: string;
    toAddress: string;
    destChainId: string;
    status: string;
    blockNumber: string;
}

export class GoogleSheetsClient {
    private sheets: any;
    private auth: any;
    private spreadsheetId: string;

    constructor() {
        this.spreadsheetId = process.env.GOOGLE_SHEET_ID || '';
        if (!this.spreadsheetId) {
            throw new Error('GOOGLE_SHEET_ID environment variable is required');
        }
    }

    async initialize(): Promise<void> {
        try {
            logger.info(`Initializing Google Sheets client for spreadsheet: ${this.spreadsheetId}`);
            
            if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
                const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
                logger.info(`Using credentials file: ${credsPath}`);
                
                // Check if credentials file exists (for better error messages)
                try {
                    const fs = require('fs');
                    if (!fs.existsSync(credsPath)) {
                        logger.error(`❌ Credentials file not found at: ${credsPath}`);
                        logger.error(`   Please ensure the file exists and is mounted correctly in the container`);
                        throw new Error(`Credentials file not found: ${credsPath}`);
                    }
                    logger.info(`✅ Credentials file found`);
                    
                    // Try to read and parse the credentials to get the service account email
                    const credsContent = fs.readFileSync(credsPath, 'utf8');
                    const creds = JSON.parse(credsContent);
                    if (creds.client_email) {
                        logger.info(`   Service account: ${creds.client_email}`);
                        logger.info(`   ⚠️  Make sure this service account has access to the spreadsheet!`);
                    }
                } catch (fsError: any) {
                    logger.warn(`Could not verify credentials file: ${fsError.message}`);
                }
                
                this.auth = new google.auth.GoogleAuth({
                    keyFile: credsPath,
                    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
                });
            } else if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
                logger.info(`Using service account email: ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL}`);
                logger.info(`   ⚠️  Make sure this service account has access to the spreadsheet!`);
                this.auth = new google.auth.GoogleAuth({
                    credentials: {
                        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
                        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
                    },
                    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
                });
            } else {
                throw new Error(
                    'Either GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY must be set'
                );
            }

            this.sheets = google.sheets({ version: 'v4', auth: this.auth });
            logger.info('Google Sheets client initialized successfully (read-only)');
            
            // Test access by trying to get spreadsheet metadata
            try {
                const spreadsheet = await this.sheets.spreadsheets.get({
                    spreadsheetId: this.spreadsheetId,
                    fields: 'properties.title,sheets.properties'
                });
                logger.info(`✅ Successfully accessed spreadsheet: "${spreadsheet.data.properties?.title}"`);
                const sheetTitles = spreadsheet.data.sheets?.map((s: any) => s.properties?.title) || [];
                logger.info(`   Available sheets: ${sheetTitles.join(', ')}`);
                if (!sheetTitles.includes('Bridge')) {
                    logger.warn(`   ⚠️  "Bridge" sheet not found. Available sheets: ${sheetTitles.join(', ')}`);
                }
            } catch (testError: any) {
                if (testError.code === 404 || testError.status === 404) {
                    logger.error(`❌ Spreadsheet not found or service account doesn't have access`);
                    logger.error(`   Spreadsheet ID: ${this.spreadsheetId}`);
                    logger.error(`   Please ensure:`);
                    logger.error(`   1. The spreadsheet ID is correct`);
                    logger.error(`   2. The service account has been granted access to the spreadsheet`);
                    logger.error(`   3. The credentials are valid`);
                } else {
                    logger.warn(`Could not verify spreadsheet access: ${testError.message}`);
                }
            }
        } catch (error: any) {
            logger.error('Failed to initialize Google Sheets client:', error);
            throw error;
        }
    }

    async readRange(range: string): Promise<any[][]> {
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range
            });
            return response.data.values || [];
        } catch (error: any) {
            logger.error(`Failed to read range ${range}:`, error);
            throw error;
        }
    }

    async readBridgeTab(): Promise<BridgeRecord[]> {
        try {
            // Read all rows from Bridge tab (skip header row)
            const rows = await this.readRange('Bridge!A:H');
            
            if (rows.length === 0) {
                return [];
            }

            // Skip header row (first row, index 0)
            const dataRows = rows.slice(1);

            return dataRows
                .map((row, arrayIndex) => {
                    // Calculate actual row number in sheet (header is row 1, so data starts at row 2)
                    // arrayIndex 0 = row 2, arrayIndex 1 = row 3, etc.
                    const rowIndex = arrayIndex + 2;
                    
                    // Filter out empty rows but keep track of row index
                    if (!row || row.length === 0 || !row[0]) {
                        return null;
                    }
                    
                    // Map row data to BridgeRecord interface
                    // Expected columns: Timestamp | TxHash | From | Amount | ToAddress | DestChainId | Status | BlockNumber
                    return {
                        rowIndex: rowIndex,
                        timestamp: row[0] || '',
                        txHash: row[1] || '',
                        from: row[2] || '',
                        amount: row[3] || '',
                        toAddress: row[4] || '',
                        destChainId: row[5] || '',
                        status: row[6] || '',
                        blockNumber: row[7] || ''
                    };
                })
                .filter((record): record is BridgeRecord => record !== null);
        } catch (error: any) {
            // Handle 404 error gracefully - Bridge tab doesn't exist
            if (error.code === 404 || error.status === 404 || 
                (error.response?.status === 404) ||
                (error.message && error.message.includes('not found'))) {
                logger.warn('Bridge tab does not exist in Google Sheets. Bridge monitoring will be disabled.');
                logger.warn('To enable bridge monitoring, create a "Bridge" tab with the following columns:');
                logger.warn('  Timestamp | TxHash | From | Amount | ToAddress | DestChainId | Status | BlockNumber');
                return []; // Return empty array instead of throwing
            }
            logger.error('Failed to read Bridge tab:', error);
            throw error;
        }
    }
}

