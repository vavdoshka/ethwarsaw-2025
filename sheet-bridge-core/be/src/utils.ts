import { JsonRpcProvider, Wallet } from 'ethers';
import 'dotenv/config';
import logger from './logger';


export function createWalletFromSecret(secret: string, provider: JsonRpcProvider): Wallet {
    const trimmed = secret.trim();

    const isMnemonic = trimmed.split(/\s+/).length >= 12 && !trimmed.startsWith('0x');
    if (isMnemonic) {
        const hdWallet = Wallet.fromPhrase(trimmed);
        return new Wallet(hdWallet.privateKey, provider);
    }

    return new Wallet(trimmed, provider);
}


export async function runWithAutoRestart(
    name: string,
    monitorFn: () => Promise<void>
): Promise<void> {
    let retryCount = 0;
    const maxRetryDelay = 60000;
    const baseDelay = 1000;

    while (true) {
        try {
            retryCount = 0;
            await monitorFn();
        } catch (error: any) {
            retryCount++;
            const delay = Math.min(baseDelay * Math.pow(2, retryCount - 1), maxRetryDelay);

            logger.error(
                `${name} failed: ${
                    error?.message ?? String(error)
                }. Restarting in ${delay}ms... (attempt ${retryCount})`
            );

            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
}
