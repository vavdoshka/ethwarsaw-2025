# Telegram Bot Setup for Bridge Notifications

This guide explains how to set up Telegram notifications for bridge events and errors.

## Features

The Telegram bot will send notifications for:

- 🔵 **New Solana Bridge Events** - When tokens are locked on Solana
- 🟡 **New BSC Bridge Events** - When tokens are locked on BSC
- 📊 **New SheetChain Bridge Records** - When bridge transactions are detected in Google Sheets
- ⏳ **Transfer Status Updates** - Processing, completed, or failed transfers
- 🚨 **Critical Errors** - RPC connection failures, parsing errors, transfer failures
- ✅ **Service Status** - When services start or stop

## Setup Instructions

### Step 1: Create a Telegram Bot

1. Open Telegram and search for [@BotFather](https://t.me/botfather)
2. Send `/newbot` command
3. Follow the instructions to name your bot
4. BotFather will give you a **bot token** (looks like: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)
5. Save this token - you'll need it for `TELEGRAM_BOT_TOKEN`

### Step 2: Get Your Chat ID

1. Start a conversation with your new bot (search for it by name, e.g., `@sheet_info_bot`)
2. Send any message to your bot (e.g., "Hello")
3. Visit this URL in your browser (replace `YOUR_BOT_TOKEN` with your actual token from BotFather):
   ```
   https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates
   ```
   
   **Important:** Notice the `/bot` prefix before the token!
   
   **Example:** If your token is `7999785843:AAH5M_LB28f7gGis1bFvyU7zkcOy5Ph4_Zk`, the URL would be:
   ```
   https://api.telegram.org/bot7999785843:AAH5M_LB28f7gGis1bFvyU7zkcOy5Ph4_Zk/getUpdates
   ```
4. Look for the `"chat":{"id":` field in the JSON response
5. The number after `"id":` is your **chat ID** (e.g., `123456789`)
6. Save this ID - you'll need it for `TELEGRAM_CHAT_ID`

### Step 3: Configure Environment Variables

Add these to your `.env` file or Docker environment:

```bash
TELEGRAM_BOT_TOKEN=your-bot-token-from-botfather
TELEGRAM_CHAT_ID=your-chat-id-from-getupdates
```

### Step 4: Restart the Bridge Backend

After setting the environment variables, restart the bridge backend service:

```bash
# If running locally
npm run dev

# If running in Docker
docker-compose restart bridge-backend
```

### Step 5: Verify Setup

You should see in the logs:
```
✅ Telegram bot initialized successfully
   Telegram notifications: ✅ Enabled
```

And you should receive a notification:
```
✅ Service Status: Bridge Backend

Status: STARTED

All monitoring services are running:
• Solana event monitor
• BSC event monitor
• Google Sheets monitor
• Transfer worker
```

## Notification Examples

### New Bridge Event
```
🔵 New Solana Bridge Event

📤 From: AShYSTqr...qqHS
📥 To: 0xEeAD692...fa13
💰 Amount: 0.1 SOL → 100000000000000000 SHEET

🔗 Tx: 4etNeQonB6KcUm1z4dxj5mcy8h96E4nqYfpgwFhbCoT4x83hGseiS3ZgJrYSaJEGNBCQzRm4wp2BUW2uidPxCLEA

Status: ⏳ Pending
```

### Transfer Completed
```
📊 Bridge Transfer Update

🔄 Route: SOLANA → SHEET
💰 Amount: 100000000000000000
📥 Recipient: 0xEeAD692...fa13
✅ Status: COMPLETED
🔗 Tx: 0xabc123...
```

### Critical Error
```
🚨 Critical Error: RPC Connection Error

❌ Error: Failed to connect to Sheet Chain RPC: unsupported protocol localhost

Context:
• Chain: sheet
• RPC: http://localhost:8545
```

## Troubleshooting

### Not Receiving Notifications

1. **Check environment variables are set:**
   ```bash
   echo $TELEGRAM_BOT_TOKEN
   echo $TELEGRAM_CHAT_ID
   ```

2. **Check logs for initialization:**
   Look for: `✅ Telegram bot initialized successfully`

3. **Verify bot token is correct:**
   - Token should start with numbers and contain a colon
   - Format: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`

4. **Verify chat ID is correct:**
   - Should be a numeric value
   - Make sure you sent a message to the bot first

5. **Check bot permissions:**
   - Make sure you've started a conversation with the bot
   - The bot should be able to send messages to you

### Bot Token Invalid

If you see errors about invalid bot token:
- Double-check the token from BotFather
- Make sure there are no extra spaces or quotes
- Regenerate the token if needed: `/revoke` then `/newbot` in BotFather

### Chat ID Not Found

If you get "chat not found" errors:
- Make sure you sent at least one message to the bot
- Try the getUpdates URL again to get a fresh chat ID
- Make sure you're using the correct chat ID (personal chat, not group chat)

## Disabling Notifications

To disable Telegram notifications, simply remove or comment out the environment variables:

```bash
# TELEGRAM_BOT_TOKEN=your-bot-token
# TELEGRAM_CHAT_ID=your-chat-id
```

The bridge will continue to work normally, just without Telegram notifications.

## Security Notes

- **Never commit your bot token or chat ID to version control**
- Keep your `.env` file secure and add it to `.gitignore`
- If your bot token is compromised, revoke it immediately with `/revoke` in BotFather
- Consider using environment variable management tools for production deployments
