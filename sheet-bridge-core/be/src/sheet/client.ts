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
            if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
                this.auth = new google.auth.GoogleAuth({
                    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
                    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
                });
            } else if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
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
            logger.error('Failed to read Bridge tab:', error);
            throw error;
        }
    }
}

