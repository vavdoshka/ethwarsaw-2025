const NodeCache = require('node-cache');
const {ethers} = require('ethers');
const axios = require('axios');

class SheetOperations {
    constructor(sheetsClient) {
        this.client = sheetsClient;
        this.cache = new NodeCache({
            stdTTL: parseInt(process.env.CACHE_TTL || '60'),
            checkperiod: 120
        });
        this.cacheEnabled = process.env.ENABLE_CACHE === 'true';
        
        // Initialize bridge account from private key
        this.bridgeAccount = null;
        this.bridgeAccountAddress = null;
        this.initBridgeAccount();
    }
    
    initBridgeAccount() {
        const bridgePrivateKey = process.env.BRIDGE_ACCOUNT_PRIVATE_KEY;
        if (bridgePrivateKey) {
            try {
                this.bridgeAccount = new ethers.Wallet(bridgePrivateKey);
                this.bridgeAccountAddress = this.bridgeAccount.address.toLowerCase();
                console.log(`Bridge account initialized: ${this.bridgeAccountAddress}`);
            } catch (error) {
                console.error('Failed to initialize bridge account:', error.message);
            }
        } else {
            // Fallback to default bridge account if not configured
            this.bridgeAccountAddress = '0x0000000000000000000000000000000000000002';
            console.warn('BRIDGE_ACCOUNT_PRIVATE_KEY not configured, using default bridge account');
        }
    }
    
    getBridgeAccountAddress() {
        return this.bridgeAccountAddress;
    }
    
    getBridgeAccount() {
        return this.bridgeAccount;
    }

    async getBalance(address) {
        address = address.toLowerCase();
        // const cacheKey = `balance_${address}`;

        // if (this.cacheEnabled) {
        //   const cached = this.cache.get(cacheKey);
        //   if (cached !== undefined) return cached;
        // }

        // return 5000000000000000000;

        const rows = await this.client.readRange('Balances!A:C');
        const addressRow = rows.find(row => row[0] && row[0].toLowerCase() === address);
        const balance = addressRow && addressRow[1] ? BigInt(addressRow[1]) : BigInt(0);


        // if (this.cacheEnabled) {
        //   this.cache.set(cacheKey, balance);
        // }

        return balance;
    }

    async getNonce(address) {
        address = address.toLowerCase();

        const rows = await this.client.readRange('Balances!A:C');
        const addressRow = rows.find(row => row[0] && row[0].toLowerCase() === address);
        return addressRow && addressRow[2] ? parseInt(addressRow[2]) : 0;
    }

    async updateBalance(address, newBalance, newNonce) {
        address = address.toLowerCase();

        const rows = await this.client.readRange('Balances!A:C');
        let rowIndex = rows.findIndex(row => row[0] && row[0].toLowerCase() === address);

        if (rowIndex === -1) {
            await this.client.appendRow('Balances', [address, newBalance.toString(), newNonce.toString()]);
        } else {
            await this.client.updateRange(
                `Balances!A${rowIndex + 1}:C${rowIndex + 1}`,
                [[address, newBalance.toString(), newNonce.toString()]]
            );
        }

        if (this.cacheEnabled) {
            this.cache.del(`balance_${address}`);
            this.cache.del(`nonce_${address}`);
        }
    }

    async processTransaction(tx) {
        const from = tx.from.toLowerCase();
        const to = tx.to ? tx.to.toLowerCase() : null;
        const value = BigInt(tx.value || 0);
        const nonce = await this.getNonce(from);

        const fromBalance = await this.getBalance(from);
        const gasLimit = BigInt(tx.gasLimit || 21000);
        const gasPrice = BigInt(tx.gasPrice || tx.maxFeePerGas || 1000000000);
        const totalCost = value + (gasLimit * gasPrice);

        if (fromBalance < totalCost) {
            throw new Error(`Insufficient balance. Required: ${totalCost}, Available: ${fromBalance}`);
        }

        const txHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({
            from,
            to,
            value: value.toString(),
            nonce,
            timestamp: Date.now()
        })));

        const blockNumber = await this.getLatestBlockNumber() + 1;

        if (to) {
            const toBalance = await this.getBalance(to);
            await this.updateBalance(to, toBalance + value, await this.getNonce(to));
        }

        await this.updateBalance(from, fromBalance - totalCost, nonce + 1);

        // Fetch current crypto prices
        const cryptoPrices = await this.fetchCryptoPrices();

        await this.client.appendRow('Transactions', [
            new Date().toISOString(),
            txHash,
            from,
            to || 'Contract Creation',
            value.toString(),
            nonce.toString(),
            'Success',
            blockNumber.toString(),
            gasLimit.toString(),
            cryptoPrices.btcPrice.toString(),
            cryptoPrices.ethPrice.toString()
        ]);

        return {
            transactionHash: txHash,
            blockNumber,
            from,
            to,
            value: value.toString(),
            nonce,
            gasUsed: gasLimit.toString(),
            status: '0x1',
            btcPrice: cryptoPrices.btcPrice.toString(),
            ethPrice: cryptoPrices.ethPrice.toString()
        };
    }

    async getTransaction(txHash) {
        const rows = await this.client.readRange('Transactions!A:K');
        const txRow = rows.find(row => row[1] === txHash);

        if (!txRow) return null;

        return {
            hash: txRow[1],
            from: txRow[2],
            to: txRow[3] !== 'Contract Creation' ? txRow[3] : null,
            value: '0x' + BigInt(txRow[4]).toString(16),
            nonce: '0x' + parseInt(txRow[5]).toString(16),
            blockNumber: '0x' + parseInt(txRow[7]).toString(16),
            gasUsed: '0x' + BigInt(txRow[8] || 21000).toString(16),
            status: txRow[6] === 'Success' ? '0x1' : '0x0',
            btcPrice: txRow[9] || '0',
            ethPrice: txRow[10] || '0'
        };
    }

    async getTransactionReceipt(txHash) {
        const tx = await this.getTransaction(txHash);
        if (!tx) return null;

        return {
            transactionHash: tx.hash,
            transactionIndex: '0x0',
            blockHash: ethers.keccak256(ethers.toUtf8Bytes(tx.blockNumber)),
            blockNumber: tx.blockNumber,
            from: tx.from,
            to: tx.to,
            gasUsed: tx.gasUsed,
            cumulativeGasUsed: tx.gasUsed,
            contractAddress: tx.to === null ? ethers.getCreateAddress({
                from: tx.from,
                nonce: parseInt(tx.nonce, 16)
            }) : null,
            logs: [],
            logsBloom: '0x' + '0'.repeat(512),
            status: tx.status
        };
    }

    async getLatestBlockNumber() {
        const rows = await this.client.readRange('Transactions!A:C');
        return rows.length;
    }

    async getTransactionsByAddress(address) {
        address = address.toLowerCase();
        const rows = await this.client.readRange('Transactions!A:K');

        return rows
            .filter(row =>
                (row[2] && row[2].toLowerCase() === address) ||
                (row[3] && row[3].toLowerCase() === address)
            )
            .map(row => ({
                timestamp: row[0],
                hash: row[1],
                from: row[2],
                to: row[3],
                value: row[4],
                nonce: row[5],
                status: row[6],
                blockNumber: row[7],
                gasUsed: row[8],
                btcPrice: row[9] || '0',
                ethPrice: row[10] || '0'
            }));
    }

    async fetchCryptoPrices() {
        try {
            const response = await axios.get('https://api.redstone.finance/prices?provider=redstone-primary-prod&symbols=BTC,ETH');
            const data = response.data;

            return {
                btcPrice: data.BTC?.value || 0,
                ethPrice: data.ETH?.value || 0,
                timestamp: data.BTC?.timestamp || Date.now()
            };
        } catch (error) {
            console.error('Error fetching crypto prices:', error.message);
            // Return default values if API call fails
            return {
                btcPrice: 0,
                ethPrice: 0,
                timestamp: Date.now()
            };
        }
    }

    clearCache() {
        if (this.cacheEnabled) {
            this.cache.flushAll();
        }
    }

    async createClaim(address, amount) {
        address = address.toLowerCase();
        const claimId = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({
            address,
            amount: amount.toString(),
            timestamp: Date.now(),
            random: Math.random()
        })));

        const blockNumber = await this.getLatestBlockNumber();

        await this.client.appendRow('Claims', [
            claimId,
            address,
            amount.toString(),
            new Date().toISOString(),
            'pending',
            '',
            blockNumber.toString()
        ]);

        return {
            claimId,
            address,
            amount: amount.toString(),
            status: 'pending',
            blockNumber
        };
    }

    async processClaim(claimId, transactionHash) {
        const rows = await this.client.readRange('Claims!A:G');
        const rowIndex = rows.findIndex(row => row[0] === claimId);

        if (rowIndex === -1) {
            throw new Error(`Claim ${claimId} not found`);
        }

        const claim = rows[rowIndex];
        if (claim[4] !== 'pending') {
            throw new Error(`Claim ${claimId} is not pending`);
        }

        const address = claim[1].toLowerCase();
        const amount = BigInt(claim[2]);

        const currentBalance = await this.getBalance(address);
        await this.updateBalance(address, currentBalance + amount, await this.getNonce(address));

        await this.client.updateRange(
            `Claims!A${rowIndex + 1}:G${rowIndex + 1}`,
            [[
                claim[0],
                claim[1],
                claim[2],
                claim[3],
                'completed',
                transactionHash,
                claim[6]
            ]]
        );

        return {
            claimId,
            address,
            amount: amount.toString(),
            status: 'completed',
            transactionHash
        };
    }

    async getClaim(claimId) {
        const rows = await this.client.readRange('Claims!A:G');
        const claim = rows.find(row => row[0] === claimId);

        if (!claim) return null;

        return {
            claimId: claim[0],
            address: claim[1],
            amount: claim[2],
            timestamp: claim[3],
            status: claim[4],
            transactionHash: claim[5] || null,
            blockNumber: claim[6]
        };
    }

    async getClaimsByAddress(address) {
        address = address.toLowerCase();
        const rows = await this.client.readRange('Claims!A:G');

        return rows
            .filter(row => row[1] && row[1].toLowerCase() === address)
            .map(row => ({
                claimId: row[0],
                address: row[1],
                amount: row[2],
                timestamp: row[3],
                status: row[4],
                transactionHash: row[5] || null,
                blockNumber: row[6]
            }));
    }

    async getAllClaims() {
        const rows = await this.client.readRange('Claims!A:G');

        return rows
            .filter(row => row[0])
            .map(row => ({
                claimId: row[0],
                address: row[1],
                amount: row[2],
                timestamp: row[3],
                status: row[4],
                transactionHash: row[5] || null,
                blockNumber: row[6]
            }));
    }

    async getAllBalances() {
        const rows = await this.client.readRange('Balances!A:C');
        
        return rows
            .filter(row => row[0] && row[0].startsWith('0x')) // Filter out header and empty rows
            .map(row => ({
                address: row[0],
                balance: BigInt(row[1] || 0),
                nonce: parseInt(row[2] || 0)
            }))
            .filter(account => account.balance > 0n) // Only include accounts with balance
            .sort((a, b) => {
                // Sort by balance descending
                if (b.balance > a.balance) return 1;
                if (b.balance < a.balance) return -1;
                return 0;
            });
    }

    async bridgeOut(fromAddress, amount, toAddress, destChainId) {
        fromAddress = fromAddress.toLowerCase();
        const bridgeAccountAddress = this.getBridgeAccountAddress();
        const bridgeAmount = BigInt(amount);
        
        // Get current balances
        const fromBalance = await this.getBalance(fromAddress);
        const bridgeBalance = await this.getBalance(bridgeAccountAddress);
        
        // Validate sufficient balance
        if (fromBalance < bridgeAmount) {
            throw new Error(`Insufficient balance. Required: ${bridgeAmount}, Available: ${fromBalance}`);
        }
        
        // Get nonces
        const fromNonce = await this.getNonce(fromAddress);
        const bridgeNonce = await this.getNonce(bridgeAccountAddress);
        
        // Update balances: deduct from user, add to bridge account
        await this.updateBalance(fromAddress, fromBalance - bridgeAmount, fromNonce + 1);
        await this.updateBalance(bridgeAccountAddress, bridgeBalance + bridgeAmount, bridgeNonce);
        
        // Generate transaction hash
        const txHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({
            from: fromAddress,
            amount: bridgeAmount.toString(),
            toAddress,
            destChainId,
            timestamp: Date.now()
        })));
        
        // Get block number
        const blockNumber = await this.getLatestBlockNumber() + 1;
        
        // Record bridge transaction in Bridge sheet
        await this.client.appendRow('Bridge', [
            new Date().toISOString(),
            txHash,
            fromAddress,
            bridgeAmount.toString(),
            toAddress,
            destChainId.toString(),
            'Success',
            blockNumber.toString()
        ]);
        
        return {
            transactionHash: txHash,
            blockNumber,
            from: fromAddress,
            amount: bridgeAmount.toString(),
            toAddress,
            destChainId: destChainId.toString(),
            bridgeAccount: bridgeAccountAddress,
            bridgeAccountBalance: (bridgeBalance + bridgeAmount).toString(),
            bridgeAccountHasPrivateKey: this.bridgeAccount !== null
        };
    }
}

module.exports = SheetOperations;