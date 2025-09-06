
Home
Setup
Connect
Entities
Queries
Events
Batch Operations
BTL & Lifecycle
Troubleshooting
Full Example
TypeScript SDK v0.1.16
Getting Started with Golem DB
Build decentralized applications with TypeScript and Golem DB

Setup & Installation
Prerequisites
What you need before starting (Tested with golem-base-sdk@0.1.16 and Node.js 24.7.0)

Node.js 18+

Latest LTS version recommended

TypeScript 5.0+

For type safety

Ethereum Wallet

With Holesky testnet ETH

Test ETH

From ETHWarsaw faucet

Quick Setup with ETHWarsaw Testnet
Public testnet endpoints - no local setup required!

HTTP RPC

https://ethwarsaw.holesky.golemdb.io/rpc
WebSocket RPC

wss://ethwarsaw.holesky.golemdb.io/rpc/ws
Faucet
Explorer
Dashboard
Installation
Set up a new TypeScript project with Bun and Golem DB SDK


# Create project directory
mkdir golem-sdk-practice
cd golem-sdk-practice

# Initialize project with Bun
bun init -y

# Install dependencies
bun add golem-base-sdk crypto dotenv tslib
bun add -d @types/node @types/bun typescript
Why Bun? Bun runs TypeScript directly without compilation, has built-in package manager, and is significantly faster than Node.js.
tsconfig.json
TypeScript configuration for Bun


{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["@types/bun"]
  },
  "include": ["*.ts"],
  "exclude": ["node_modules"]
}
package.json
Project configuration with Bun scripts


{
  "name": "golem-sdk-practice",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "bun run crud.ts",
    "build": "bun build ./crud.ts --outdir ./dist",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "golem-base-sdk": "^0.1.16",
    "crypto": "^1.0.1",
    "dotenv": "^17.2.1",
    "tslib": "^2.8.1"
  },
  "devDependencies": {
    "@types/bun": "^1.0.0",
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0"
  }
}
Environment Configuration
Create a .env file in your project root with your connection details


PRIVATE_KEY=0x...
CHAIN_ID=60138453033
RPC_URL=https://ethwarsaw.holesky.golemdb.io/rpc
WS_URL=wss://ethwarsaw.holesky.golemdb.io/rpc/ws
Replace 0x... with your actual private key. Never commit your .env file to version control!
Connect to Golem DB
Basic Connection
Connect to Golem DB using your private key



import { 
  createClient, 
  Tagged, 
  Annotation 
} from 'golem-base-sdk'
import type {
  AccountData,
  GolemBaseCreate,
  GolemBaseClient,
  GolemBaseUpdate
} from 'golem-base-sdk'

import dotenv from 'dotenv'
dotenv.config({ path: './.env' })
import { randomUUID } from 'crypto'

// Configure connection from .env
const rawKey = process.env.PRIVATE_KEY ?? '';
const hexKey = rawKey.startsWith('0x') ? rawKey.slice(2) : rawKey;
const key: AccountData = new Tagged(
  "privatekey",
  Buffer.from(hexKey, 'hex')
);
const chainId = Number(process.env.CHAIN_ID)
const rpcUrl = process.env.RPC_URL ?? 'https://ethwarsaw.holesky.golemdb.io/rpc'
const wsUrl = process.env.WS_URL ?? 'wss://ethwarsaw.holesky.golemdb.io/rpc/ws'

// TextEncoder and TextDecoder for data conversion
const encoder = new TextEncoder()
const decoder = new TextDecoder()

// Create a client to interact with the GolemDB API
const client = await createClient(
    chainId,
    key,
    rpcUrl,
    wsUrl,
);

console.log("Connected to Golem DB on ETHWarsaw testnet!");

// Get owner address
const ownerAddress = await client.getOwnerAddress();
console.log(`Connected with address: ${ownerAddress}`);
Security Note: Never hardcode your private key. Use environment variables or secure key management.
Creating Entity
Create Your First Entity
Store data on the blockchain with annotations

Before creating entities: Make sure your account has test ETH. Get some from the ETHWarsaw Faucet


// Create a new entity with annotations
const id = randomUUID()
const creates = [
    {
      data: encoder.encode("Test entity"),
      btl: 300,  // Block-To-Live: ~10 minutes (each block ~2 seconds)
      stringAnnotations: [
        new Annotation("testTextAnnotation", "demo"), 
        new Annotation("id", id)
      ],
      numericAnnotations: [new Annotation("version", 1)]
    } as GolemBaseCreate
]

const createReceipt = await client.createEntities(creates);
console.log('Receipt', createReceipt)

// createEntities takes a list of GolemBaseCreate objects with 4 fields:
// - data: Payload in bytes  
// - btl: Block-To-Live, number of blocks the entity will exist
// - stringAnnotations: Text annotations for querying  
// - numericAnnotations: Numeric annotations for querying
Verify your entity: After creation, check your entity on the Golem DB Block Explorer using the returned entity key
Query Entities
Query Your Data
Search entities using annotations



// Meta data and storage
if (entityKey) {
  const meta = await client.getEntityMetaData(entityKey)
  console.log('Meta data:', meta)

  const data = await client.getStorageValue(entityKey)
  console.log('Storage value:', decoder.decode(data))
}

// 1. Simple equality query
const greetings = await client.queryEntities('type = "greeting"')
console.log(`Found ${greetings.length} greeting entities`)

// 2. Processing query results
for (const entity of greetings) {
    const data = decoder.decode(entity.storageValue)
    console.log(`Entity ${entity.entityKey}: ${data}`)
}

// 3. Numeric comparison operators
await printEntities('High priority', await client.queryEntities('priority > 5'))
await printEntities('Old versions', await client.queryEntities('version < 3'))
await printEntities('In range', await client.queryEntities('score >= 80 && score <= 100'))

// 4. Combining conditions with AND (&&)
await printEntities('Specific', await client.queryEntities('type = "greeting" && version = 1'))

// 5. Using OR (||) for multiple options
await printEntities('Messages', await client.queryEntities('type = "message" || type = "other"'))

// 6. Complex queries with mixed operators
await printEntities('Filtered', await client.queryEntities('(type = "task" && priority > 3) || status = "urgent"'))

// Note: Query string must use double quotes for string values
// Numbers don't need quotes: priority = 5
// Strings need quotes: type = "message"


async function printEntities(label: string, entities: any[]) {
  console.log(`${label} - found ${entities.length} entities:`)
  for (const entity of entities) {
    const data = decoder.decode(entity.storageValue)
    console.log(`${label} EntityKey: ${entity.entityKey}, Data: ${data}`)
  }
}
Real-time Events
Event Monitoring
Listen to real-time blockchain events


async function setupEventMonitoring(client: GolemBaseClient) {
  // Watch for events from the blockchain
  const unwatch = client.watchLogs({
    fromBlock: BigInt(0),
    onCreated: (args) => {
      console.log("Entity created:", args.entityKey);
    },
    onUpdated: (args) => {
      console.log("Entity updated:", args.entityKey);
    },
    onDeleted: (args) => {
      console.log("Entity deleted:", args.entityKey);
    },
    onExtended: (args) => {
      console.log("Entity extended:", args.entityKey);
    },
    onError: (error) => {
      console.error("Watch error:", error);
    }
  });
  
  // Return unwatch function to stop monitoring later
  return unwatch;
}
Batch Operations
Batch Processing
Efficiently create multiple entities at once


async function batchOperations(client: GolemBaseClient) {
  // Create multiple entities at once
  const entities: GolemBaseCreate[] = [];
  const batchId = randomUUID()

  
  for (let i = 0; i < 10; i++) {
    entities.push({
      data: new TextEncoder().encode(`Message ${i}`),
      btl: 100,
      stringAnnotations: [
        new Annotation("type", "batch"),
        new Annotation("batchId", batchId),
        new Annotation("index", i.toString())
      ],
      numericAnnotations: [],
    });
  }
  
  const receipts = await client.createEntities(entities);
  console.log(`Created ${receipts.length} entities in batch`);

  const batchEntityKeys = await client.queryEntities(`batchId = "${batchId}"`);
  console.log(`Queried ${batchEntityKeys.length} entities in batch`);
}
BTL & Data Lifecycle
Managing Data Lifetime
Control when your data expires with Blocks To Live (BTL)


async function manageBTL(client: GolemBaseClient) {
  // Create entity with specific BTL
  const entity: GolemBaseCreate = {
    data: new TextEncoder().encode("Temporary data"),
    btl: 50,  // Expires after 50 blocks (50 blocks * 2 seconds = 100 seconds)
    stringAnnotations: [
      new Annotation("type", "temporary")
    ],
    numericAnnotations: []
  };
  
  const [receipt] = await client.createEntities([entity]);
  console.log(`Entity expires at block: ${receipt.expirationBlock}`);
  
  // Extend entity lifetime
  const extendReceipts = await client.extendEntities([{
    entityKey: receipt.entityKey,
    numberOfBlocks: 150  // Add 150 more blocks
  }]);
  
  console.log(`Extended to block: ${extendReceipts[0].newExpirationBlock}`);
  
  // Check remaining BTL
  const metadata = await client.getEntityMetaData(receipt.entityKey);
  console.log(`Entity expires at block: ${metadata.expiresAtBlock}`);
}
Troubleshooting
Common Issues
Connection Failed
• Check your internet connection
• Verify ETHWarsaw endpoints are correct
• Ensure private key format is valid
Insufficient Funds
• Get test ETH from the faucet
• Check your wallet balance
• Ensure you're on Holesky testnet
TypeScript Errors
• Update to TypeScript 5.0+
• Check tsconfig.json settings
• Reinstall node_modules
Need Help?
Get Test ETH
Join Discord
Get Full Example
Complete Working Example
A full TypeScript application demonstrating all Golem DB features


import { 
  createClient, 
  type GolemBaseClient,
  type GolemBaseCreate,
  type GolemBaseUpdate,
  Annotation,
  Tagged
} from "golem-base-sdk";
import { randomUUID } from "crypto";
import { Logger, ILogObj } from "tslog";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Configure logger
const logLevelMap: Record<string, number> = {
  silly: 0,
  trace: 1,
  debug: 2,
  info: 3,
  warn: 4,
  error: 5,
  fatal: 6
};

const logger = new Logger<ILogObj>({
  name: "GolemDB Example",
  minLevel: logLevelMap[process.env.LOG_LEVEL as keyof typeof logLevelMap] || logLevelMap.info
});

async function main() {
  // 1. INITIALIZE CLIENT
  const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x...";
  const privateKeyHex = PRIVATE_KEY.replace(/^0x/, "");
  const privateKey = new Uint8Array(
    privateKeyHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
  );
  
  const client = await createClient(
    60138453033,
    new Tagged("privatekey", privateKey),
    "https://ethwarsaw.holesky.golemdb.io/rpc",
    "wss://ethwarsaw.holesky.golemdb.io/rpc/ws",
    logger
  );
  
  console.log("Connected to Golem DB!");
  const ownerAddress = await client.getOwnerAddress();
  console.log(`Owner address: ${ownerAddress}`);

  // Get and check client account balance
  const balanceBigint = await client.getRawClient().httpClient.getBalance({ address: ownerAddress });
  const balance = Number(balanceBigint) / 10**18;
  console.log(`Client account balance: ${balance} ETH`);

  if (balance === 0) {
    console.warn("Warning: Account balance is 0 ETH. Please acquire test tokens from the faucet.");
  }

  // Set up real-time event watching
  const unsubscribe = client.watchLogs({
    fromBlock: BigInt(await client.getRawClient().httpClient.getBlockNumber()),
    onCreated: (args) => {
      console.log("WATCH-> Create:", args);
    },
    onUpdated: (args) => {
      console.log("WATCH-> Update:", args);
    },
    onExtended: (args) => {
      console.log("WATCH-> Extend:", args);
    },
    onDeleted: (args) => {
      console.log("WATCH-> Delete:", args);
    },
    onError: (error) => {
      console.error("WATCH-> Error:", error);
    },
    pollingInterval: 1000,
    transport: "websocket",
  });
  
  // 2. CREATE - Single entity with annotations
  const id = randomUUID();
  const entity: GolemBaseCreate = {
    data: new TextEncoder().encode(JSON.stringify({
      message: "Hello from ETHWarsaw 2025!",
      timestamp: Date.now(),
      author: "Developer"
    })),
    btl: 300, // ~10 minutes (300 blocks * 2 seconds = 600 seconds)
    stringAnnotations: [
      new Annotation("type", "message"),
      new Annotation("event", "ethwarsaw"),
      new Annotation("id", id)
    ],
    numericAnnotations: [
      new Annotation("version", 1),
      new Annotation("timestamp", Date.now())
    ]
  };
  
  const createReceipts = await client.createEntities([entity]);
  const entityKey = createReceipts[0].entityKey;
  console.log(`Created entity: ${entityKey}`);
  
  // 3. QUERY - Find entity by annotations
  const queryResults = await client.queryEntities(`id = "${id}" && version = 1`);
  console.log(`Found ${queryResults.length} matching entities`);
  
  for (const result of queryResults) {
    const data = JSON.parse(new TextDecoder().decode(result.storageValue));
    console.log("Query result:", data);
  }
  
  // 4. UPDATE - Modify existing entity
  const updateData: GolemBaseUpdate = {
    entityKey: entityKey,
    data: new TextEncoder().encode(JSON.stringify({
      message: "Updated message from ETHWarsaw!",
      updated: true,
      updateTime: Date.now()
    })),
    btl: 600, // ~20 minutes (600 blocks * 2 seconds = 1200 seconds)
    stringAnnotations: [
      new Annotation("type", "message"),
      new Annotation("id", id),
      new Annotation("status", "updated")
    ],
    numericAnnotations: [
      new Annotation("version", 2)
    ]
  };
  
  const updateReceipts = await client.updateEntities([updateData]);
  console.log(`Updated entity: ${updateReceipts[0].entityKey}`);
  
  // 5. QUERY updated entity
  const updatedResults = await client.queryEntities(`id = "${id}" && version = 2`);
  console.log(`Found ${updatedResults.length} updated entities`);
  
  // 6. BATCH OPERATIONS - Create multiple entities
  const batchEntities: GolemBaseCreate[] = [];
  for (let i = 0; i < 5; i++) {
    batchEntities.push({
      data: new TextEncoder().encode(`Batch message ${i}`),
      btl: 100,
      stringAnnotations: [
        new Annotation("type", "batch"),
        new Annotation("index", i.toString())
      ],
      numericAnnotations: [
        new Annotation("sequence", i + 1)  // Start from 1, not 0 (SDK bug with value 0)
      ]
    });
  }
  
  const batchReceipts = await client.createEntities(batchEntities);
  console.log(`Created ${batchReceipts.length} entities in batch`);
  
  // 7. BTL MANAGEMENT - Extend entity lifetime
  const extendReceipts = await client.extendEntities([{
    entityKey: entityKey,
    numberOfBlocks: 100
  }]);
  console.log(`Extended BTL to block: ${extendReceipts[0].newExpirationBlock}`);
  
  // Check metadata to verify BTL
  const metadata = await client.getEntityMetaData(entityKey);
  console.log(`Entity expires at block: ${metadata.expiresAtBlock}`);
  
  // 8. DELETE - Remove entity
  const deleteReceipts = await client.deleteEntities([entityKey]);
  console.log(`Deleted entity: ${deleteReceipts[0].entityKey}`);
  
  // Clean up batch entities
  for (const receipt of batchReceipts) {
    await client.deleteEntities([receipt.entityKey]);
  }
  
  // Stop watching events
  unsubscribe();
  console.log("Complete!");
  
  // Clean exit
  process.exit(0);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
Running the Example
1. Save the code to src/index.ts
2. Set your private key: export PRIVATE_KEY=0x...
3. Build the project: bun run build
4. Run the example: bun run dev
View SDK on GitHub
View on NPM
Next Steps
Join the Hackathon

Compete for prizes at ETHWarsaw 2025

Connect with Community

Get help and share your projects

View Hackathon Tracks
Full Documentation
Network Info
Network:
Holesky
Chain ID:
60138453033
Testnet:
ETHWarsaw on Holesky
SDK Version
Package:
golem-base-sdk
Version:
0.1.16
License:
MIT
Key Features
On-chain storage
Query with annotations
Real-time events