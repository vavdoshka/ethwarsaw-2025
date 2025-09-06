import { google } from "googleapis";

export interface SheetsClientConfig {
  spreadsheetId: string;
  credentialsPath?: string;
  serviceAccountEmail?: string;
  privateKey?: string;
}

export class GoogleSheetsClient {
  private sheets: any;
  private spreadsheetId: string;

  constructor(config: SheetsClientConfig) {
    this.spreadsheetId = config.spreadsheetId;
  }

  async initialize(config: SheetsClientConfig) {
    let auth;
    if (config.credentialsPath) {
      auth = new google.auth.GoogleAuth({
        keyFile: config.credentialsPath,
        scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
      });
    } else {
      auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: config.serviceAccountEmail,
          private_key: (config.privateKey || "").replace(/\\n/g, "\n"),
        },
        scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
      });
    }

    this.sheets = google.sheets({ version: "v4", auth });
  }

  async readRange(range: string): Promise<string[][]> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range,
    });
    return response.data.values || [];
  }
}
