const TelegramBot = require('node-telegram-bot-api');

class TelegramService {
  constructor() {
    this.bot = null;
    this.chatId = null;
    this.isEnabled = false;
  }

  /**
   * Initialize Telegram bot
   */
  initialize(botToken, chatId) {
    if (!botToken || !chatId) {
      console.log('📱 Telegram notifications disabled (no bot token or chat ID configured)');
      this.isEnabled = false;
      return;
    }

    try {
      this.bot = new TelegramBot(botToken, { polling: false });
      this.chatId = chatId;
      this.isEnabled = true;
      console.log('✅ Telegram bot initialized successfully');
    } catch (error) {
      console.error(`❌ Failed to initialize Telegram bot: ${error.message}`);
      this.isEnabled = false;
    }
  }

  /**
   * Send a message to Telegram
   */
  async sendMessage(text, parseMode = 'HTML') {
    if (!this.isEnabled || !this.bot || !this.chatId) {
      return;
    }

    try {
      await this.bot.sendMessage(this.chatId, text, { parse_mode: parseMode });
    } catch (error) {
      console.error(`Failed to send Telegram message: ${error.message}`);
      // Don't throw - we don't want Telegram failures to crash the RPC node
    }
  }

  /**
   * Format amount for display
   */
  formatAmount(amount, decimals = 18) {
    try {
      const amountBigInt = BigInt(amount);
      const divisor = BigInt(10 ** decimals);
      const whole = amountBigInt / divisor;
      const fractional = amountBigInt % divisor;
      const fractionalStr = fractional.toString().padStart(decimals, '0');
      const trimmed = fractionalStr.replace(/0+$/, '');
      return trimmed ? `${whole}.${trimmed}` : whole.toString();
    } catch {
      return amount.toString();
    }
  }

  /**
   * Format address for display (shorten)
   */
  formatAddress(address, length = 8) {
    if (!address) return 'N/A';
    const addr = address.toString();
    if (addr.length <= length * 2) return addr;
    return `${addr.slice(0, length)}...${addr.slice(-length)}`;
  }

  /**
   * Notify about bridge transfer operation
   */
  async notifyBridgeTransfer(from, to, amount, txHash, direction = 'out') {
    const amountFormatted = this.formatAmount(amount, 18);
    const directionEmoji = direction === 'out' ? '📤' : '📥';
    const directionText = direction === 'out' ? 'Bridge Out' : 'Bridge Transfer';
    
    const message = `
🌉 <b>${directionText} Operation</b>

${directionEmoji} <b>From:</b> <code>${this.formatAddress(from)}</code>
📥 <b>To:</b> <code>${this.formatAddress(to)}</code>
💰 <b>Amount:</b> ${amountFormatted} SHEET

🔗 <b>Tx:</b> <code>${this.formatAddress(txHash, 16)}</code>

Status: ✅ Processed
    `.trim();

    await this.sendMessage(message);
  }

  /**
   * Notify about claim operation
   */
  async notifyClaim(address, txHash, amount) {
    const amountFormatted = this.formatAmount(amount, 18);
    
    const message = `
🎁 <b>New Airdrop Claim</b>

👤 <b>Address:</b> <code>${this.formatAddress(address)}</code>
💰 <b>Amount:</b> ${amountFormatted} SHEET

🔗 <b>Tx:</b> <code>${this.formatAddress(txHash, 16)}</code>

Status: ✅ Claimed
    `.trim();

    await this.sendMessage(message);
  }

  /**
   * Notify about transaction operation
   */
  async notifyTransaction(from, to, amount, txHash, type = 'transfer') {
    const amountFormatted = this.formatAmount(amount, 18);
    const typeEmoji = type === 'transfer' ? '💸' : '📝';
    
    const message = `
${typeEmoji} <b>Transaction Processed</b>

📤 <b>From:</b> <code>${this.formatAddress(from)}</code>
📥 <b>To:</b> <code>${this.formatAddress(to)}</code>
💰 <b>Amount:</b> ${amountFormatted} SHEET

🔗 <b>Tx:</b> <code>${this.formatAddress(txHash, 16)}</code>

Status: ✅ Confirmed
    `.trim();

    await this.sendMessage(message);
  }

  /**
   * Notify about error
   */
  async notifyError(title, error, context = {}) {
    let message = `
🚨 <b>RPC Node Error: ${title}</b>

❌ <b>Error:</b> <code>${error.substring(0, 300)}</code>
    `;

    if (Object.keys(context).length > 0) {
      message += '\n\n<b>Context:</b>\n';
      for (const [key, value] of Object.entries(context)) {
        const valueStr = value ? value.toString().substring(0, 100) : 'N/A';
        message += `• <b>${key}:</b> <code>${valueStr}</code>\n`;
      }
    }

    await this.sendMessage(message.trim());
  }

  /**
   * Notify about RPC method error
   */
  async notifyRPCMethodError(method, error, params = {}) {
    let message = `
❌ <b>RPC Method Error</b>

🔧 <b>Method:</b> <code>${method}</code>
❌ <b>Error:</b> <code>${error.substring(0, 200)}</code>
    `;

    if (Object.keys(params).length > 0) {
      message += '\n\n<b>Parameters:</b>\n';
      for (const [key, value] of Object.entries(params)) {
        const valueStr = value ? value.toString().substring(0, 80) : 'N/A';
        message += `• <b>${key}:</b> <code>${valueStr}</code>\n`;
      }
    }

    await this.sendMessage(message.trim());
  }

  /**
   * Notify about Google Sheets error
   */
  async notifySheetsError(operation, error) {
    const message = `
📊 <b>Google Sheets Error</b>

🔧 <b>Operation:</b> ${operation}
❌ <b>Error:</b> <code>${error.substring(0, 200)}</code>

⚠️ RPC operations may be affected
    `.trim();

    await this.sendMessage(message);
  }

  /**
   * Notify about signature verification failure
   */
  async notifySignatureError(txHash, reason) {
    const message = `
🔐 <b>Signature Verification Failed</b>

🔗 <b>Tx:</b> <code>${this.formatAddress(txHash, 16)}</code>
❌ <b>Reason:</b> <code>${reason.substring(0, 200)}</code>

⚠️ Transaction rejected
    `.trim();

    await this.sendMessage(message);
  }

  /**
   * Notify about unauthorized operation
   */
  async notifyUnauthorized(operation, address) {
    const message = `
🚫 <b>Unauthorized Operation</b>

🔧 <b>Operation:</b> ${operation}
👤 <b>Address:</b> <code>${this.formatAddress(address)}</code>

⚠️ Operation rejected
    `.trim();

    await this.sendMessage(message);
  }

  /**
   * Notify about insufficient balance
   */
  async notifyInsufficientBalance(address, required, available) {
    const requiredFormatted = this.formatAmount(required, 18);
    const availableFormatted = this.formatAmount(available, 18);
    
    const message = `
💰 <b>Insufficient Balance</b>

👤 <b>Address:</b> <code>${this.formatAddress(address)}</code>
❌ <b>Required:</b> ${requiredFormatted} SHEET
💵 <b>Available:</b> ${availableFormatted} SHEET

⚠️ Transaction rejected
    `.trim();

    await this.sendMessage(message);
  }

  /**
   * Notify about service status
   */
  async notifyServiceStatus(status, message = '') {
    const statusEmoji = status === 'started' ? '✅' : status === 'stopped' ? '⏸️' : '❌';
    
    let msg = `
${statusEmoji} <b>RPC Node Status: ${status.toUpperCase()}</b>
    `;

    if (message) {
      msg += `\n\n${message}`;
    }

    await this.sendMessage(msg.trim());
  }

  /**
   * Check if Telegram is enabled
   */
  isTelegramEnabled() {
    return this.isEnabled;
  }
}

// Singleton instance
const telegramService = new TelegramService();

module.exports = telegramService;
