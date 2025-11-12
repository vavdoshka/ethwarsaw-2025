import { Wallet, isAddress } from 'ethers';
import logger from '../logger';

export async function sendSheetTransfer(ethWallet: Wallet, recipient: string, amount: any) {
    if (!isAddress(recipient)) {
        logger.error(`Invalid Sheet address from event, skipping: ${recipient}`);
        return;
    }
    const valueWei = typeof amount === 'bigint' ? amount : BigInt(amount.toString());
    try {
        const tx = await ethWallet.sendTransaction({ to: recipient, value: valueWei });
        logger.info(
            `Sheet transfer submitted: ${tx.hash} -> ${recipient} (${valueWei.toString()} wei)`
        );
        const receipt = await tx.wait();
        logger.info(`Sheet transfer confirmed in block ${receipt.blockNumber}`);
    } catch (err: any) {
        logger.error(`Sheet transfer failed: ${err?.message ?? String(err)}`);
    }
}

