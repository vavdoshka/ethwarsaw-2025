# Setup Guide for SheetChain RPC Node

## Quick Setup Steps

### 1. ✅ Google Sheet Created
Your Google Sheet URL: https://docs.google.com/spreadsheets/d/1SgFDDfi4GsWQfjaXUPzdJJnRN7t8TjWpHwRXP-9dMfg/edit

**Note:** The app will automatically create the required tabs (Balances, Transactions, Claims) when it starts, so you don't need to create them manually.

### 2. 🔑 Set Up Google Cloud Service Account

You need to create a Google Cloud Service Account to allow the app to access your Google Sheet:

#### Step-by-Step:

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com
   - Sign in with your Google account

2. **Create or Select a Project**
   - Click the project dropdown at the top
   - Click "New Project" or select an existing one
   - Note your project name

3. **Enable Google Sheets API**
   - Go to "APIs & Services" > "Library"
   - Search for "Google Sheets API"
   - Click on it and click "Enable"

4. **Create a Service Account**
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "Service Account"
   - Fill in:
     - Service account name: `sheetchain-rpc-node` (or any name)
     - Service account ID: (auto-generated)
     - Description: "Service account for SheetChain RPC Node"
   - Click "Create and Continue"
   - Skip the optional steps and click "Done"

5. **Create and Download Key**
   - Find your newly created service account in the list
   - Click on it to open details
   - Go to the "Keys" tab
   - Click "Add Key" > "Create new key"
   - Select "JSON" format
   - Click "Create" - this will download a JSON file
   - **Save this file securely** - you'll need it in the next step

6. **Share Your Google Sheet**
   - Open your Google Sheet: https://docs.google.com/spreadsheets/d/1SgFDDfi4GsWQfjaXUPzdJJnRN7t8TjWpHwRXP-9dMfg/edit
   - Click the "Share" button (top right)
   - Copy the email address from the downloaded JSON file (it looks like: `xxx@xxx.iam.gserviceaccount.com`)
   - Paste it in the "Add people and groups" field
   - Give it "Editor" permissions
   - Click "Send" (uncheck "Notify people" if you want)

### 3. ⚙️ Configure Environment Variables

You have two options for authentication:

#### Option A: Using JSON Key File (Recommended)

1. Copy the downloaded JSON key file to your `rpc-node` directory
2. Update your `.env` file:
   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=./path/to/your-service-account-key.json
   ```

#### Option B: Using Inline Credentials

1. Open the downloaded JSON key file
2. Copy the `client_email` value
3. Copy the `private_key` value (keep the entire string including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`)
4. Update your `.env` file:
   ```bash
   GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n"
   ```
   **Important:** Keep the `\n` characters in the private key - they're needed for proper formatting.

### 3.5. 🌉 Configure Bridge Account (Optional but Recommended)

The bridge account is used to receive bridged tokens and can be used to transfer funds to users on destination chains.

1. **Generate or use an existing Ethereum wallet private key**
   - You can generate a new wallet using MetaMask, or use an existing one
   - The private key should start with `0x` and be 66 characters long

2. **Add to your `.env` file:**
   ```bash
   BRIDGE_ACCOUNT_PRIVATE_KEY=0xYourPrivateKeyHere
   ```

3. **Important Security Notes:**
   - Keep this private key secure - it controls the bridge account
   - The bridge account address will be automatically derived from the private key
   - If not configured, the system will use a default bridge account address: `0x0000000000000000000000000000000000000002`
   - Make sure the bridge account has sufficient balance in the Balances sheet

4. **Verify Bridge Account:**
   - When the server starts, you'll see: `🌉 Bridge account configured: 0x...`
   - If not configured, you'll see: `⚠️ Bridge account using default address`

### 4. 🚀 Start the Server

```bash
cd rpc-node
npm install  # If you haven't already
npm start
```

The app will:
- ✅ Connect to your Google Sheet
- ✅ Automatically create the required tabs (Balances, Transactions, Claims, Bridge) if they don't exist
- ✅ Set up the headers for each tab
- ✅ Initialize the bridge account (if configured)
- ✅ Start the RPC server on port 8545

### 5. ✅ Verify It's Working

Once the server starts, you should see:
```
info: Google Sheets client initialized successfully
info: Created sheet: Balances (or "Sheet Balances already exists")
info: Created sheet: Transactions
info: Created sheet: Claims
info: Created sheet: Bridge
info: 🌉 Bridge account configured: 0x... (if configured)
info: SheetChain RPC Node initialized successfully
info: SheetChain RPC Node running on port 8545
```

### 6. 📊 Add Initial Balances (Optional)

You can add some test accounts to your Balances sheet:

| Address | Balance | Nonce |
|---------|---------|-------|
| 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7 | 1000000000000000000000 | 0 |
| 0x5B38Da6a701c568545dCfcB03FcB875f56beddC4 | 500000000000000000000 | 0 |

**Note:** Balances are in wei (1 ETH = 1000000000000000000 wei)

## Troubleshooting

### "Failed to initialize Google Sheets client"
- Check that your `.env` file has the correct `GOOGLE_SHEET_ID`
- Verify your service account credentials are correct
- Make sure you shared the Google Sheet with the service account email

### "Permission denied" or "Access denied"
- Make sure you shared the Google Sheet with the service account email
- The service account needs "Editor" permissions (not just "Viewer")

### "Sheet not found"
- Double-check the `GOOGLE_SHEET_ID` in your `.env` file
- Make sure the Sheet ID is correct (from the URL)

## Next Steps

Once everything is set up:
- Connect MetaMask to `http://localhost:8545` (Chain ID: 12345)
- Start making transactions!
- View all transactions in your Google Sheet's "Transactions" tab
- Use `bridgeOut` RPC method to bridge tokens to other chains

### Using the Bridge Feature

The `bridgeOut` method allows users to bridge tokens:
- **Method**: `bridgeOut`
- **Parameters**: `[fromAddress, amount, toAddress, destChainId]`
- **Example**:
  ```javascript
  {
    "jsonrpc": "2.0",
    "method": "bridgeOut",
    "params": [
      "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
      "1000000000000000000", // 1 ETH in wei
      "0x5B38Da6a701c568545dCfcB03FcB875f56beddC4",
      1 // Ethereum Mainnet chain ID
    ],
    "id": 1
  }
  ```

The bridge account will receive the tokens and can be used to transfer funds to users on the destination chain.

