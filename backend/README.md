# xStocks Claw Machine Backend

Backend relay and indexer service for the xStocks Claw Machine on Monad mainnet (chain 143).

## Architecture: Option A Relay

The frontend builds and signs the complete `pull()` transaction (player pays gas + fees in MON), then POSTs the raw signed transaction hex to the backend. The backend validates and broadcasts it to the Monad network.

This approach:
- ✅ Player controls their own transaction signing
- ✅ No private keys stored on backend
- ✅ Backend only validates and relays
- ✅ Backend never pays gas

## Features

- **Transaction Relay** (`POST /relay`): Validates and broadcasts signed pull transactions
- **Machine Status** (`GET /machine`): Live reads from the ClawMachine contract
- **Price Updates** (`GET /price-update`): Fetches Pyth price update data for xStocks
- **Event Indexer**: Watches and indexes all ClawMachine events
- **Pull History** (`GET /pulls/:id`, `GET /players/:address/pulls`)
- **Leaderboard** (`GET /leaderboard`)
- **Real-time Events** (`WebSocket /events`): Pushes PullResolved events for reveal animations

## Requirements

- Node.js 20+
- TypeScript
- SQLite (via better-sqlite3)

## Installation

```bash
npm install
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Required environment variables:

```env
PORT=3000
RPC_URL=https://rpc.monad.xyz
WS_URL=wss://rpc.monad.xyz
CLAW_MACHINE_ADDRESS=0x... # Set after contract deployment
```

## Running

### Development
```bash
npm run dev
```

### Production
```bash
npm run build
npm start
```

### Testing
```bash
npm test          # Run tests once
npm run test:watch # Watch mode
npm run typecheck  # Type checking only
```

## API Endpoints

### POST /relay

Validate and broadcast a signed pull transaction.

**Request:**
```json
{
  "signedTx": "0x02f8..."
}
```

**Response (Success):**
```json
{
  "txHash": "0x123...",
  "status": "success",
  "pullId": "0x1"
}
```

**Response (Error):**
```json
{
  "txHash": "0x123...",
  "status": "reverted",
  "error": "Rate limited: please wait 2s"
}
```

**Validation Rules:**
- ✅ Chain ID must be 143 (Monad)
- ✅ Recipient must be ClawMachine contract address
- ✅ Function selector must match `pull(bytes32)`
- ✅ Gas limit must be ≤ 500,000
- ✅ Value must be non-zero (to cover Pyth fees)
- ✅ Rate limit: 1 pull per address every 3 seconds
- ✅ Duplicate transaction detection

### GET /machine

Get current machine status.

**Response:**
```json
{
  "canPull": true,
  "pullPrice": "1000000",
  "inventoryValue": "20000000",
  "pendingReservations": "10000000",
  "entropyFee": "10000000000000000"
}
```

### GET /price-update

Fetch Pyth price update data.

**Query Parameters:**
- `symbols` (optional): Comma-separated list of symbols (default: `TSLAx,NVDAx,AAPLx,SPYx`)

**Example:**
```
GET /price-update?symbols=TSLAx,NVDAx
```

**Response:**
```json
{
  "priceUpdateData": ["0x504e41550100000003b801000000030d01..."],
  "fee": "0.0002"
}
```

### GET /pulls/:id

Get pull details by pullId.

**Response:**
```json
{
  "id": 1,
  "pullId": "1",
  "player": "0x123...",
  "sequenceNumber": "42",
  "txHash": "0xabc...",
  "blockNumber": "1000",
  "timestamp": 1699000000,
  "resolved": true,
  "legendary": false,
  "stocks": ["0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0"],
  "amounts": ["730000"]
}
```

### GET /players/:address/pulls

Get all pulls for a player address.

**Response:**
```json
{
  "address": "0x123...",
  "totalPulls": 10,
  "legendaryCount": 0,
  "commonCount": 10,
  "totalValue": "7.3",
  "pulls": [...]
}
```

### GET /leaderboard

Get top players by total value won.

**Query Parameters:**
- `limit` (optional): Number of entries (default: 100)

**Response:**
```json
[
  {
    "player": "0x123...",
    "totalPulls": 50,
    "legendaryCount": 1,
    "totalValue": "17.3"
  }
]
```

### WebSocket /events

Real-time event stream for pull updates.

**Connection:**
```javascript
const ws = new WebSocket('ws://localhost:3000/events');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data.type); // 'PullRequested' or 'PullResolved'
};
```

**Event Types:**

**PullRequested:**
```json
{
  "type": "PullRequested",
  "pullId": "1",
  "player": "0x123...",
  "data": {
    "sequenceNumber": "42",
    "txHash": "0xabc..."
  }
}
```

**PullResolved:**
```json
{
  "type": "PullResolved",
  "pullId": "1",
  "player": "0x123...",
  "data": {
    "legendary": false,
    "stocks": ["0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0"],
    "amounts": ["730000"],
    "txHash": "0xdef..."
  }
}
```

## Frontend Integration

### Signing Transactions (Without Broadcasting)

The frontend must sign transactions without broadcasting them to the network. Here's how:

#### Using Viem with Local/Embedded Account

```typescript
import { createWalletClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monad } from './config'; // Chain definition from backend/src/config.ts

// Create account from private key (or from mnemonic, etc.)
const account = privateKeyToAccount('0x...');

const walletClient = createWalletClient({
  account,
  chain: monad,
  transport: http('https://rpc.monad.xyz'),
});

// Sign transaction WITHOUT broadcasting
const signedTx = await account.signTransaction({
  to: CLAW_MACHINE_ADDRESS,
  value: parseEther('0.001'), // Pyth fee
  data: encodeFunctionData({
    abi: ClawMachineABI,
    functionName: 'pull',
    args: [userRandomBytes32],
  }),
  chainId: 143,
  nonce: await walletClient.getTransactionCount({ address: account.address }),
  gas: 300000n,
  maxFeePerGas: parseGwei('10'),
  maxPriorityFeePerGas: parseGwei('1'),
});

// Send to backend
const response = await fetch('http://localhost:3000/relay', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ signedTx }),
});

const result = await response.json();
console.log('Pull tx hash:', result.txHash);
console.log('Pull ID:', result.pullId);
```

#### Complete Frontend Flow

```typescript
import { encodeFunctionData, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

async function executePull(userAccount: ReturnType<typeof privateKeyToAccount>) {
  // 1. Get current fees and price update data
  const machineStatus = await fetch('http://localhost:3000/machine').then(r => r.json());
  const priceUpdate = await fetch('http://localhost:3000/price-update').then(r => r.json());
  
  if (!machineStatus.canPull) {
    throw new Error('Machine is currently refilling');
  }
  
  // 2. Generate user randomness
  const userRandom = `0x${crypto.getRandomValues(new Uint8Array(32))
    .reduce((s, b) => s + b.toString(16).padStart(2, '0'), '')}`;
  
  // 3. Build transaction
  const nonce = await walletClient.getTransactionCount({ 
    address: userAccount.address 
  });
  
  const signedTx = await userAccount.signTransaction({
    to: CLAW_MACHINE_ADDRESS,
    value: BigInt(machineStatus.entropyFee),
    data: encodeFunctionData({
      abi: ClawMachineABI,
      functionName: 'pull',
      args: [userRandom],
    }),
    chainId: 143,
    nonce,
    gas: 300000n,
    maxFeePerGas: parseEther('0.00001'),
    maxPriorityFeePerGas: parseEther('0.000001'),
  });
  
  // 4. Submit to backend relay
  const response = await fetch('http://localhost:3000/relay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signedTx }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Transaction failed');
  }
  
  const result = await response.json();
  return result; // { txHash, status, pullId }
}
```

#### MetaMask Limitation

**Important:** MetaMask does NOT support signing transactions without broadcasting via the standard `eth_sendTransaction` RPC method. You have two options:

1. **Use embedded wallets** (viem local accounts, ethers.js Wallet, etc.) for signing
2. **Let MetaMask broadcast directly** and skip the backend relay (not recommended for this architecture)

If using MetaMask, you'll need to implement a different flow where MetaMask broadcasts directly to Monad RPC, and the backend only indexes events (no relay validation).

## Monad-Specific Considerations

### eth_sendRawTransactionSync

Monad supports a synchronous variant of `eth_sendRawTransaction` for faster confirmation. The backend attempts to use it first, then falls back to the standard method:

```typescript
try {
  txHash = await publicClient.request({
    method: 'eth_sendRawTransactionSync',
    params: [signedTx],
  });
} catch {
  txHash = await publicClient.sendRawTransaction({ serializedTransaction: signedTx });
}
```

### Event Indexing Range Limits

Monad has `eth_getLogs` range limits. The indexer automatically chunks requests into 1000-block ranges:

```typescript
const BLOCK_RANGE_LIMIT = 1000;
```

### Gas Costs

- Monad charges by gas **limit**, not usage
- Cold storage access: 10,100 gas (vs 2,100 on Ethereum)
- Set realistic gas limits to avoid overpaying

## Project Structure

```
backend/
├── src/
│   ├── abi/
│   │   └── ClawMachine.ts        # Contract ABI (temporary, to be regenerated)
│   ├── db/
│   │   └── index.ts              # SQLite database operations
│   ├── routes/
│   │   └── index.ts              # API routes
│   ├── services/
│   │   ├── contract.ts           # Contract read operations
│   │   ├── indexer.ts            # Event indexer
│   │   ├── pyth.ts               # Pyth price feed integration
│   │   ├── relay.ts              # Transaction validation & relay
│   │   └── websocket.ts          # WebSocket server
│   ├── types/
│   │   └── index.ts              # TypeScript types
│   ├── utils/
│   │   └── rateLimiter.ts        # Rate limiting & deduplication
│   ├── config.ts                 # Configuration & viem clients
│   └── index.ts                  # Server entry point
├── .env.example                  # Environment variables template
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

## Important Notes

### Contract ABI

The `backend/src/abi/ClawMachine.ts` file is **manually defined** based on the contract specification in `plan.md`. It is marked as **TEMPORARY** and must be regenerated from the actual compiled contract ABI once deployed.

**TODO after contract deployment:**
1. Compile `ClawMachine.sol` with Foundry/Hardhat
2. Extract the ABI JSON
3. Replace `backend/src/abi/ClawMachine.ts` with the real ABI
4. Update `CLAW_MACHINE_ADDRESS` in `.env`

### Dependencies on Contract

The following features require the contract to be deployed and address configured:

- ✅ Transaction relay validation (works without contract)
- ❌ `/machine` endpoint (requires contract deployment)
- ✅ `/price-update` endpoint (works independently)
- ❌ Event indexer (requires contract deployment)
- ❌ Pull history endpoints (require indexed events)

The backend is designed to gracefully handle a missing contract:
- `/machine` returns default/zero values with try/catch
- Indexer logs errors but doesn't crash

## Rate Limiting

- **Per-address rate limit:** 1 pull every 3 seconds
- **In-memory deduplication:** Prevents duplicate transaction submissions
- Duplicate entries auto-expire after 5 minutes

## Testing

Tests validate transaction relay logic:

```bash
npm test
```

Test coverage:
- ✅ Wrong chain ID rejection
- ✅ Wrong recipient address rejection
- ✅ Wrong function selector rejection
- ✅ Gas limit validation
- ✅ Zero value rejection
- ✅ Valid transaction acceptance

Tests use mock accounts and do not require a live Monad connection.

## Deployment

1. Set up environment:
   ```bash
   cp .env.example .env
   # Edit .env with production values
   ```

2. Build:
   ```bash
   npm run build
   ```

3. Run:
   ```bash
   npm start
   ```

4. For production, use a process manager like PM2:
   ```bash
   npm install -g pm2
   pm2 start dist/index.js --name xstocks-backend
   ```

## License

MIT
