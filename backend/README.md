# xStocks Claw Machine Backend

Backend indexer, REST API, WebSocket feed, and optional transaction relay for the
xStocks Claw Machine on Monad.

The service targets the **audited `ClawMachine` contract** (PR #14):

- `pull()` takes **no calldata arguments** and pays `pullPrice` USDC via
  `transferFrom`; `msg.value` must cover `getFee()` (the Pyth Entropy fee).
- Randomness and payouts happen in the Pyth Entropy callback. There is no claim
  step.
- Pyth price feeds are **not** used by the backend. There is no
  `priceUpdateData`, `getPythFee()`, or `getTotalFee()` path.
- Supported networks: Monad mainnet (`143`) and testnet (`10143`).

## Architecture

```
                 ┌──────────────────────────┐
  Monad RPC ───▶ │ indexer (eth_getLogs)    │ ──▶ SQLite
                 │ 100-block pages          │
                 └────────────┬─────────────┘
                              │
                 ┌────────────▼─────────────┐
                 │ Hono REST + WS /events   │ ──▶ web app / clients
                 └────────────▲─────────────┘
                              │
                 ┌────────────┴─────────────┐
                 │ optional /relay          │
                 │ validates, never signs   │
                 └──────────────────────────┘
```

The relay is **off by default** (`RELAY_ENABLED=false`). Players can always
submit a signed `pull()` transaction directly to Monad. When enabled, the relay
only validates and broadcasts a transaction the player already signed. The
backend never stores private keys and never pays gas.

## Features

- **Event indexer**: `PullRequested`, `PullResolved`, and `PullRefunded`, stored
  in SQLite with a resumable block checkpoint.
- **Machine status** (`GET /machine`): live reads of `canPull`, `pullPrice`,
  `inventoryValueUsd6`, `reservedValueUsd6`, `getFee`, `totalPulls`, `paused`.
- **Pull history**: recent pulls, pull by id, pulls and stats by player.
- **Leaderboard**: ranked by actual `valueUsd6` paid out.
- **Real-time feed** (`WS /events`): pushes indexed `PullRequested`,
  `PullResolved`, and `PullRefunded` events for reveal animations.
- **Optional relay** (`POST /relay`): validates chain, recipient, selector,
  gas limit, and `msg.value >= getFee()`.

## Requirements

- Node.js 20+
- npm (the repo uses `package-lock.json`)
- SQLite via `better-sqlite3` (installed automatically)

## Installation

```bash
cd backend
npm install
```

## Configuration

Copy the template and fill in the deployed contract details:

```bash
cp .env.example .env
```

| Variable | Default | Purpose |
|---|---|---|
| `NETWORK` | `mainnet` | `mainnet` (143) or `testnet` (10143) |
| `PORT` | `3000` | HTTP/WebSocket port |
| `RPC_URL` | network default | Monad HTTP RPC |
| `WS_URL` | network default | Monad WebSocket RPC (reserved) |
| `CLAW_MACHINE_ADDRESS` | zero address | Deployed `ClawMachine` address |
| `START_BLOCK` | unset | Block the contract was deployed at |
| `INDEXER_BLOCK_RANGE` | `100` | Blocks per `eth_getLogs` request |
| `INDEXER_POLL_INTERVAL_MS` | `3000` | How often to poll the chain head |
| `RELAY_ENABLED` | `false` | Set `true` to expose `POST /relay` |
| `MAX_GAS_LIMIT` | `500000` | Reject relayed transactions above this gas limit |
| `RATE_LIMIT_WINDOW_MS` | `3000` | Per-address relay rate limit |
| `DATABASE_PATH` | `claw-machine.db` | SQLite file |

Default RPCs:

- Mainnet: `https://rpc.monad.xyz` / `wss://rpc.monad.xyz`
- Testnet: `https://testnet-rpc.monad.xyz` / `wss://testnet-rpc.monad.xyz`

`CLAW_MACHINE_ADDRESS` and `START_BLOCK` come from the deployment output. The
contracts deploy script only writes addresses on `--broadcast`, so use the
address and block from the broadcast run.

If `START_BLOCK` is omitted, the indexer starts at the current chain head and
only indexes new pulls. Set it to backfill history.

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

### Tests and type checks

```bash
npm test
npm run typecheck
```

## API

### `GET /`

Health check. Returns the configured network, chain id, and relay status.

```json
{
  "status": "ok",
  "service": "xStocks Claw Machine Backend",
  "network": "mainnet",
  "chainId": 143,
  "relayEnabled": false
}
```

### `GET /machine`

Live machine state. Values are decimal strings so JavaScript clients do not lose
precision. USD values use 6 decimals; `fee` is in wei (MON).

```json
{
  "network": "mainnet",
  "chainId": 143,
  "canPull": true,
  "pullPrice": "1000000",
  "inventoryValueUsd6": "20000000",
  "reservedValueUsd6": "0",
  "fee": "1480000000000000000",
  "totalPulls": "42",
  "paused": false
}
```

If `CLAW_MACHINE_ADDRESS` is unset or a read fails, the endpoint returns safe
defaults (`canPull: false`, zero values) instead of crashing.

### `GET /pulls?limit=20`

Recently indexed pulls, newest first. `limit` is clamped to 1–100 (default 20).

```json
[
  {
    "id": 7,
    "pullId": "7",
    "player": "0x1234...",
    "sequenceNumber": "18446744073709551615",
    "feePaid": "1480000000000000000",
    "txHash": "0xabc...",
    "blockNumber": "1234567",
    "timestamp": 1760000000,
    "resolved": true,
    "legendary": false,
    "stocks": ["0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0"],
    "amounts": ["2692000000000000000"],
    "valueUsd6": "730000",
    "randomNumber": "0x...",
    "resolvedTxHash": "0xdef...",
    "resolvedBlockNumber": "1234568",
    "resolvedTimestamp": 1760000002,
    "refunded": false
  }
]
```

### `GET /pulls/:id`

One indexed pull by id (ids start at 1). Returns `404` if the id has not been
indexed. Same shape as an entry from `GET /pulls`.

### `GET /players/:address/pulls`

All indexed pulls for a player plus aggregate stats. Refunded pulls are counted
in `totalPulls` and `refundedCount` but excluded from prize counts and value.

```json
{
  "address": "0x1234...",
  "totalPulls": 10,
  "legendaryCount": 1,
  "commonCount": 8,
  "refundedCount": 1,
  "totalValue": "10.73",
  "totalValueUsd6": "10730000",
  "pulls": []
}
```

### `GET /leaderboard?limit=100`

Players ranked by total `valueUsd6` paid out. `limit` is clamped to 1–500.

```json
[
  {
    "player": "0x1234...",
    "totalPulls": 50,
    "legendaryCount": 2,
    "totalValue": "17.3",
    "totalValueUsd6": "17300000"
  }
]
```

### `POST /relay`

Only available when `RELAY_ENABLED=true`; otherwise returns `503`.

**Request:**

```json
{
  "signedTx": "0x02f8..."
}
```

**Success:**

```json
{
  "txHash": "0x123...",
  "status": "success",
  "pullId": "7"
}
```

**Validation rules:**

- Chain id matches `NETWORK` (`143` or `10143`).
- `to` equals `CLAW_MACHINE_ADDRESS`.
- Selector is `pull()` (no calldata arguments).
- Gas limit is at most `MAX_GAS_LIMIT`.
- `msg.value >= getFee()` (read live from the contract).
- One relayed pull per address every `RATE_LIMIT_WINDOW_MS`.
- Duplicate signed transactions are rejected.

The relay never signs, never holds keys, and never pays gas.

### `WS /events`

```javascript
const ws = new WebSocket('ws://localhost:3000/events');
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log(message.type); // PullRequested | PullResolved | PullRefunded
};
```

`PullRequested`:

```json
{
  "type": "PullRequested",
  "pullId": "7",
  "player": "0x1234...",
  "data": {
    "sequenceNumber": "42",
    "feePaid": "1480000000000000000",
    "txHash": "0xabc...",
    "blockNumber": "1234567"
  }
}
```

`PullResolved`:

```json
{
  "type": "PullResolved",
  "pullId": "7",
  "player": "0x1234...",
  "data": {
    "legendary": false,
    "stocks": ["0x8ad3..."],
    "amounts": ["2692000000000000000"],
    "valueUsd6": "730000",
    "randomNumber": "0x...",
    "txHash": "0xdef...",
    "blockNumber": "1234568"
  }
}
```

`PullRefunded`:

```json
{
  "type": "PullRefunded",
  "pullId": "7",
  "player": "0x1234...",
  "data": {
    "amount": "1000000",
    "txHash": "0x...",
    "blockNumber": "1234599"
  }
}
```

## Frontend integration

The frontend should use the same ABI as `src/abi/ClawMachine.ts` and the address
from `.env`. A pull is a single transaction:

1. Read `getFee()` and `pullPrice`.
2. Approve `pullPrice` USDC for the ClawMachine (or use an existing allowance).
3. Send `pull()` with `value = getFee()`. The contract refunds excess MON.

```typescript
import { encodeFunctionData } from 'viem';

const fee = await publicClient.readContract({
  address: clawMachine,
  abi: ClawMachineABI,
  functionName: 'getFee',
});

// USDC.approve(clawMachine, pullPrice) must happen first.
const hash = await walletClient.writeContract({
  address: clawMachine,
  abi: ClawMachineABI,
  functionName: 'pull',
  value: fee,
});
```

Find the pull id in the `PullRequested` log of the receipt, then poll
`getPull(pullId)` until `status == 2` (Resolved) and read `getPullPayout(pullId)`.
The REST API and `/events` feed are convenience layers; the on-chain views are
the source of truth.

### Using the optional relay

If `RELAY_ENABLED=true`, sign the transaction without broadcasting and POST it:

```typescript
const signedTx = await account.signTransaction({
  to: clawMachine,
  value: fee,
  data: encodeFunctionData({ abi: ClawMachineABI, functionName: 'pull' }),
  chainId: 143,
  nonce: await publicClient.getTransactionCount({ address: account.address }),
  gas: 200_000n,
  maxFeePerGas: parseGwei('10'),
  maxPriorityFeePerGas: parseGwei('1'),
});

await fetch('http://localhost:3000/relay', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ signedTx }),
});
```

## Indexer details

Monad's public RPC restricts `eth_getLogs` block ranges, so the indexer never
scans the chain in one request. It pages through `INDEXER_BLOCK_RANGE` blocks at
a time (default 100), polling every `INDEXER_POLL_INTERVAL_MS` milliseconds.

- The last fully processed block is stored in SQLite (`indexer_state`).
- Restarts resume from the checkpoint; replayed ranges are idempotent
  (`INSERT OR IGNORE` plus upserts).
- If `START_BLOCK` is unset and no checkpoint exists, indexing starts at the
  current head.
- `PullRefunded` marks the pull as refunded without counting it as a prize.
- If `PullResolved` is seen without a matching `PullRequested` (for example,
  because `START_BLOCK` starts after the request), a minimal row is created so
  the resolution is still queryable.

If the RPC still rejects a range, lower `INDEXER_BLOCK_RANGE` (for example to
`50`) and restart.

## Monad-specific notes

- Gas is charged on the gas **limit**, not gas used. The relay caps gas with
  `MAX_GAS_LIMIT`; clients should estimate and add a small buffer.
- `eth_getLogs` ranges are limited; see the indexer section above.
- Blocks are fast (~0.4s), so the default 3s poll is responsive enough for
  REST and WebSocket consumers.
- The backend reads state through contract views (`getPull`, `getRecentPulls`,
  `getPullPayout`) rather than log scans wherever possible.

## Project structure

```
backend/
├── src/
│   ├── abi/
│   │   └── ClawMachine.ts        # Audited contract ABI (as const)
│   ├── db/
│   │   └── index.ts              # SQLite schema, migrations, queries
│   ├── routes/
│   │   └── index.ts              # Hono REST routes
│   ├── services/
│   │   ├── contract.ts           # Machine status reads
│   │   ├── indexer.ts            # Paged event indexer
│   │   ├── relay.ts              # Optional transaction validation/relay
│   │   └── websocket.ts          # WebSocket broadcast
│   ├── types/
│   │   └── index.ts              # Shared TypeScript types
│   ├── utils/
│   │   └── rateLimiter.ts        # Relay rate limiting and dedup
│   ├── config.ts                 # Network config and viem client
│   └── index.ts                  # Server entry point
├── .env.example
├── vitest.config.ts
└── package.json
```

## Testing

```bash
npm test
npm run typecheck
```

The relay tests sign transactions with a well-known test key and mock the RPC;
no network connection or real funds are required. They cover chain id, recipient,
selector, gas limit, zero/insufficient value, unreadable `getFee()`, a valid
pull, and the disabled-by-default `/relay` route.

## Deployment

1. Deploy the contracts with the team's Foundry script (`--broadcast`).
2. Copy the deployed `ClawMachine` address and deployment block from the
   broadcast output.
3. Configure `.env`:
   ```env
   NETWORK=mainnet
   CLAW_MACHINE_ADDRESS=0x...
   START_BLOCK=...
   ```
4. Build and run:
   ```bash
   npm run build
   npm start
   ```
5. For a long-running process, use a process manager (for example PM2):
   ```bash
   pm2 start dist/index.js --name xstocks-backend
   ```

## License

MIT
