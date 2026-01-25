import TelegramBot from 'node-telegram-bot-api';
import logger from './logger';

export interface TelegramConfig {
    botToken: string;
    chatId: string;
}

class TelegramService {
    private bot: TelegramBot | null = null;
    private chatId: string | null = null;
    private isEnabled: boolean = false;

    /**
     * Initialize Telegram bot
     */
    initialize(config: TelegramConfig | null): void {
        if (!config || !config.botToken || !config.chatId) {
            logger.info('📱 Telegram notifications disabled (no bot token or chat ID configured)');
            this.isEnabled = false;
            return;
        }

        try {
            this.bot = new TelegramBot(config.botToken, { polling: false });
            this.chatId = config.chatId;
            this.isEnabled = true;
            logger.info('✅ Telegram bot initialized successfully');
        } catch (error: any) {
            logger.error(`❌ Failed to initialize Telegram bot: ${error?.message ?? String(error)}`);
            this.isEnabled = false;
        }
    }

    /**
     * Send a message to Telegram
     */
    private async sendMessage(text: string, parseMode: 'HTML' | 'Markdown' = 'HTML'): Promise<void> {
        if (!this.isEnabled || !this.bot || !this.chatId) {
            return;
        }

        try {
            await this.bot.sendMessage(this.chatId, text, { parse_mode: parseMode });
        } catch (error: any) {
            logger.error(`Failed to send Telegram message: ${error?.message ?? String(error)}`);
            // Don't throw - we don't want Telegram failures to crash the bridge
        }
    }

    /**
     * Format amount for display
     */
    private formatAmount(amount: string, decimals: number = 18): string {
        try {
            const amountBigInt = BigInt(amount);
            const divisor = BigInt(10 ** decimals);
            const whole = amountBigInt / divisor;
            const fractional = amountBigInt % divisor;
            const fractionalStr = fractional.toString().padStart(decimals, '0');
            const trimmed = fractionalStr.replace(/0+$/, '');
            return trimmed ? `${whole}.${trimmed}` : whole.toString();
        } catch {
            return amount;
        }
    }

    /**
     * Format address for display (shorten)
     */
    private formatAddress(address: string, length: number = 8): string {
        if (address.length <= length * 2) return address;
        return `${address.slice(0, length)}...${address.slice(-length)}`;
    }

    /**
     * Notify about new Solana bridge event
     */
    async notifySolanaEventDetected(
        signature: string,
        sender: string,
        amount: string,
        recipient: string,
        sheetAmount: string
    ): Promise<void> {
        const solAmount = this.formatAmount(amount, 9);
        const sheetAmountFormatted = this.formatAmount(sheetAmount, 18);
        
        const message = `
🔵 <b>New Solana Bridge Event</b>

📤 <b>From:</b> <code>${this.formatAddress(sender)}</code>
📥 <b>To:</b> <code>${this.formatAddress(recipient)}</code>
💰 <b>Amount:</b> ${solAmount} SOL → ${sheetAmountFormatted} SHEET

🔗 <b>Tx:</b> <code>${signature}</code>

Status: ⏳ Pending
        `.trim();

        await this.sendMessage(message);
    }

    /**
     * Notify about new BSC bridge event
     */
    async notifyBSCEventDetected(
        txHash: string,
        sender: string,
        amount: string,
        recipient: string
    ): Promise<void> {
        const amountFormatted = this.formatAmount(amount, 18);
        
        const message = `
🟡 <b>New BSC Bridge Event</b>

📤 <b>From:</b> <code>${this.formatAddress(sender)}</code>
📥 <b>To:</b> <code>${this.formatAddress(recipient)}</code>
💰 <b>Amount:</b> ${amountFormatted} BNB

🔗 <b>Tx:</b> <code>${txHash}</code>

Status: ⏳ Pending
        `.trim();

        await this.sendMessage(message);
    }

    /**
     * Notify about new Google Sheets bridge record
     */
    async notifySheetBridgeRecord(
        txHash: string,
        from: string,
        amount: string,
        toAddress: string,
        destChain: string
    ): Promise<void> {
        const amountFormatted = this.formatAmount(amount, 18);
        
        const message = `
📊 <b>New SheetChain Bridge Record</b>

📤 <b>From:</b> <code>${this.formatAddress(from)}</code>
📥 <b>To:</b> <code>${this.formatAddress(toAddress)}</code>
🌐 <b>Destination:</b> ${destChain.toUpperCase()}
💰 <b>Amount:</b> ${amountFormatted} SHEET

🔗 <b>Tx:</b> <code>${txHash}</code>

Status: ⏳ Pending
        `.trim();

        await this.sendMessage(message);
    }

    /**
     * Notify about transfer status update
     */
    async notifyTransferStatus(
        fromChain: string,
        toChain: string,
        amount: string,
        recipient: string,
        status: 'processing' | 'completed' | 'failed',
        txHash?: string,
        error?: string
    ): Promise<void> {
        const amountFormatted = this.formatAmount(amount, 18);
        const chainEmoji = fromChain === 'solana' ? '🔵' : fromChain === 'bsc' ? '🟡' : '📊';
        const statusEmoji = status === 'completed' ? '✅' : status === 'failed' ? '❌' : '⏳';
        
        let message = `
${chainEmoji} <b>Bridge Transfer Update</b>

🔄 <b>Route:</b> ${fromChain.toUpperCase()} → ${toChain.toUpperCase()}
💰 <b>Amount:</b> ${amountFormatted}
📥 <b>Recipient:</b> <code>${this.formatAddress(recipient)}</code>
${statusEmoji} <b>Status:</b> ${status.toUpperCase()}
        `;

        if (txHash) {
            message += `\n🔗 <b>Tx:</b> <code>${txHash}</code>`;
        }

        if (error) {
            message += `\n\n❌ <b>Error:</b> <code>${error.substring(0, 200)}</code>`;
        }

        await this.sendMessage(message.trim());
    }

    /**
     * Notify about critical error
     */
    async notifyError(
        title: string,
        error: string,
        context?: Record<string, string>
    ): Promise<void> {
        let message = `
🚨 <b>Critical Error: ${title}</b>

❌ <b>Error:</b> <code>${error.substring(0, 300)}</code>
        `;

        if (context) {
            message += '\n\n<b>Context:</b>\n';
            for (const [key, value] of Object.entries(context)) {
                message += `• <b>${key}:</b> <code>${value}</code>\n`;
            }
        }

        await this.sendMessage(message.trim());
    }

    /**
     * Notify about RPC connection issues
     */
    async notifyRPCError(
        chain: string,
        rpcUrl: string,
        error: string
    ): Promise<void> {
        const chainEmoji = chain === 'solana' ? '🔵' : chain === 'bsc' ? '🟡' : '📊';
        
        const message = `
${chainEmoji} <b>RPC Connection Error</b>

🌐 <b>Chain:</b> ${chain.toUpperCase()}
🔗 <b>RPC:</b> <code>${rpcUrl}</code>
❌ <b>Error:</b> <code>${error.substring(0, 200)}</code>

⚠️ Bridge monitoring may be affected
        `.trim();

        await this.sendMessage(message);
    }

    /**
     * Notify about service status
     */
    async notifyServiceStatus(
        service: string,
        status: 'started' | 'stopped' | 'error',
        message?: string
    ): Promise<void> {
        const statusEmoji = status === 'started' ? '✅' : status === 'error' ? '❌' : '⏸️';
        
        let msg = `
${statusEmoji} <b>Service Status: ${service}</b>

Status: ${status.toUpperCase()}
        `;

        if (message) {
            msg += `\n\n${message}`;
        }

        await this.sendMessage(msg.trim());
    }

    /**
     * Check if Telegram is enabled
     */
    isTelegramEnabled(): boolean {
        return this.isEnabled;
    }
}

// Singleton instance
export const telegramService = new TelegramService();
