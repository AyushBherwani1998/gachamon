# Claw Machine — web app

The player-facing app for the Monad xStocks claw machine. Pay 1 USDC, pull a
card, and receive real tokenized stocks (xStocks) straight to your wallet.
Prices come from Pyth price feeds; randomness comes from Pyth Entropy, and the
payout is delivered inside the entropy callback. There is no claim step.

The launch machine supports **TSLAx only**. The token list is never hardcoded:
it is read from the contract (`getSupportedTokens()` + `tokenInfo(token)`), so
a token added later with `addToken` appears after a refresh.

## Stack

- Next.js 16 (App Router, TypeScript, `src/` directory, Cache Components)
- Tailwind CSS v4 + shadcn/ui + [8bitcn](https://www.8bitcn.com) pixel components
- Privy (`@privy-io/react-auth` + `@privy-io/wagmi`) for sign-in
- wagmi + viem + TanStack Query
- Bun (`bun install`, `bun run build`)

## Run locally

```bash
cd web
bun install
cp .env.example .env.local   # fill in the machine address and PYTH_API_KEY
bun run dev                  # http://localhost:3000
```

Other commands:

```bash
bun run typecheck
bun run lint
bun run build
```

## Environment variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_DEFAULT_NETWORK` | `mainnet` (default, the real demo) or `testnet` |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Privy app id. Blank = injected/MetaMask fallback |
| `NEXT_PUBLIC_SITE_URL` | Public app URL used by the QR card and share link (default `http://localhost:3000`) |
| `NEXT_PUBLIC_CLAW_MACHINE_MAINNET` | ClawMachine address on Monad mainnet (143) |
| `NEXT_PUBLIC_CLAW_MACHINE_TESTNET` | ClawMachine address on Monad testnet (10143) |
| `NEXT_PUBLIC_USDC_TESTNET` | Testnet MockUSDC address (has `faucet()`) |
| `NEXT_PUBLIC_BACKEND_URL` | Optional Ayush backend base URL, no trailing slash |
| `NEXT_PUBLIC_DEMO_MODE` | Set to `mock` to simulate pulls without a chain |
| `PYTH_API_KEY` | **Server-only.** Pyth Hermes API key used by `/api/price-update` |
| `PYTH_HERMES_URL` | Optional Hermes base override (default `https://pyth.dourolabs.app/hermes`) |

`NEXT_PUBLIC_*` values are inlined at build time. Restart the dev server (or
rebuild) after changing them. `PYTH_API_KEY` must never be prefixed with
`NEXT_PUBLIC_`; it is read only inside the server route and never logged.

Mainnet USDC is the canonical constant
`0x754704Bc059F8C67012fEd69BC8A327a5aafb603` (6 decimals), so mainnet only
needs `NEXT_PUBLIC_CLAW_MACHINE_MAINNET`. Testnet needs both the machine and
the MockUSDC address.

After deploying contracts, copy the addresses from
`contracts/deployments/monad-testnet.json` (or `monad-mainnet.json`):

```bash
jq -r '.clawMachine, .usdc' contracts/deployments/monad-testnet.json
```

## Networks

| | Mainnet | Testnet |
| --- | --- | --- |
| chainId | 143 | 10143 |
| RPC | `https://rpc.monad.xyz` | `https://testnet-rpc.monad.xyz` |
| Explorer | https://monadscan.com | https://testnet.monadscan.com |
| USDC | canonical `0x7547…b603` (6 decimals) | MockUSDC, public `faucet()` |
| Stocks | canonical xStocks (18 decimals) | MockStocks (18 decimals) |

The app opens on `NEXT_PUBLIC_DEFAULT_NETWORK` (mainnet by default). If the
connected wallet is on a different chain, a banner offers a one-click network
switch. On testnet the wallet panel shows **Get test USDC** (calls
`MockUSDC.faucet()` and mints 100 USDC) and a link to the Monad MON faucet.

## Contract interface

`src/abi/clawMachine.ts` is the typed ABI (`src/abi/ClawMachine.json` is
generated from it) and targets Ayush's contract from PR #21, including the
pending contracts fix:

- `pull(bytes32 userRandomNumber, bytes[] priceUpdateData)` payable
- `getTotalFee(bytes[] priceUpdateData)` = Pyth update fee + Entropy fee
- `getPullBasicData`, `getPullPriceSnapshot`, `getSupportedTokens`, `tokenInfo`
- `getOwedBalance`, `withdrawOwed`
- `callbackGasLimit()` / `setCallbackGasLimit(uint32)`
- `_entropyCallback(...)` (the IEntropyConsumer entry point; the web never calls it)

The fixed contract also has an owner-only `refundStuckPull` for pulls whose
callback never lands. There is no player-facing refund action: if a callback
does not arrive, the pull stays pending on-chain and the owner can refund it.

The retired interface (`pull()` with no args, `getFee`, `getRecentPulls`,
`getPull`, `getStocks`, `owed`, keeper `setPrices`) is not used anywhere.

`tokenInfo(token)` returns `(pythFeedId, decimals, supported)`. Pyth feed ids
are read through it, which is why the price route works for any token the owner
adds.

## How a pull works

1. `usePull()` calls the server route `GET /api/price-update?chainId=143|10143`.
   The route reads the machine's feed ids and asks Hermes for a signed update
   with the server-only `PYTH_API_KEY`. The browser never sees the key.
2. It reads `pullPrice` and the wallet's USDC allowance. If the allowance is
   short it approves the exact `pullPrice`. A slow approval can outlive the
   signed update, so the update is fetched again after approval.
3. It reads `getTotalFee(updateData)` right before sending, simulates
   `pull(random32, updateData)` (`random32` from `crypto.getRandomValues`) and
   sends it with `value = getTotalFee(...)`.
4. `pullId` and the Entropy `sequenceNumber` are decoded from the
   `PullRequested` log in the receipt. The UI shows the drawing state.
5. It polls `PullResolved` for that indexed `pullId` with `getLogs` from the
   receipt block forward, in chunks of at most **100 blocks**, every 1.5 s for
   up to 120 s. No `eth_getLogs` range above 100 blocks is ever requested.
6. The result card shows `stocks` / `amounts` (18-decimal formatting). The USD
   value is computed from `getPullPriceSnapshot(pullId, token)`.

Reverts are mapped to player-friendly copy: insufficient inventory, insufficient
fee, stale price, paused machine, user rejection, and low USDC allowance.

The button is **not** gated on `canPull()` or `getInventoryValue()`. Those read
stored on-chain prices that may be stale, so they can report false or 0 even
when a pull would succeed. Availability is computed from fresh prices instead:
inventory USD = sum of `balanceOf(machine)` × fresh Pyth price over the
supported tokens; the machine is pullable when that value covers
`pullPrice × legendaryMultiplier + pendingReservations` and it is not paused.

## Server routes

### `GET /api/price-update?chainId=143|10143`

Reads `getSupportedTokens()` + `tokenInfo()` from the machine, then calls:

```text
GET https://pyth.dourolabs.app/hermes/v2/updates/price/latest
    ?ids[]=<feedId>&encoding=hex&parsed=true
Authorization: Bearer $PYTH_API_KEY
```

Response:

```json
{
  "updateData": ["0x..."],
  "prices": [
    {
      "token": "0x...",
      "symbol": "TSLAx",
      "feedId": "0x...",
      "price": "42125000000",
      "expo": -8,
      "priceUsd6": "421250000",
      "publishTime": 1793780300
    }
  ]
}
```

`binary.data` is an array; every element becomes one `bytes` entry of
`priceUpdateData` with a `0x` prefix. Errors are JSON with a useful status:
`500 PRICE_KEY_MISSING`, `401/403 HERMES_NOT_ENTITLED`, `429 HERMES_RATE_LIMITED`,
`502 HERMES_ERROR`, `503 MACHINE_NOT_CONFIGURED / NO_TOKENS`.

The API key is never logged and never returned.

### `GET /api/feed?chainId=143|10143`

Scans back ~1,500 blocks in chunks of at most 100, returns the last 20
`PullResolved` events newest first, and caches the result in memory for 5 s per
chain. Each pull includes the player, rarity, stock addresses/amounts, tx hash,
block number and resolved timestamp.

If `NEXT_PUBLIC_BACKEND_URL` is set, the client also reads the connected
player's history from Ayush's backend (`GET /players/:address/pulls`). That
backend has no global feed route, so on-chain events remain the source for the
global live feed. The user's own pull is inserted immediately, before the next
poll.

## Panels

- **Odds & EV** is computed from contract parameters: common payout =
  `pullPrice × commonPayoutBps / 10000`, legendary payout =
  `pullPrice × legendaryMultiplier`, and the EV weights use
  `legendaryRarityBps`. There is no hardcoded 0.9154 or "$10".
- **Live feed** merges `PullResolved` events with the player's own pull.
- **Claimable balance** uses `getOwedBalance(player)` and `withdrawOwed()`.
- Footer copy: “Prices: Pyth price feeds. Randomness: Pyth Entropy.”

## Mock mode

```bash
cd web
NEXT_PUBLIC_DEMO_MODE=mock bun run dev
```

No wallet, RPC or contract is needed. Pulls resolve after a 1.5 s draw with the
same 2% legendary odds as the contract, the wallet panel shows simulated
balances, and the feed updates in memory. The mock uses TSLAx only to match the
launch machine. This is the fastest way to work on UI and to demo offline.

## Panels preview

`/preview/panels` renders every result/feed/share panel against realistic mock
data, including loading, empty and error states. `/preview` steps the pixel
machine through every phase. Both routes are static and never touch the chain.

Panels live in `src/components/panels` and are presentational: plain props, no
wagmi or RPC calls.

## Wallet sign-in (Privy)

Create an app at [dashboard.privy.io](https://dashboard.privy.io), then set
`NEXT_PUBLIC_PRIVY_APP_ID` (exactly 25 characters). In the Privy dashboard
enable Email, Google, and Wallet login, and add your origins (for example
`http://localhost:3000` and the Vercel production domain). Privy rejects
unknown origins at runtime even when the build succeeds.

If the id is missing or invalid, the app falls back to injected + MetaMask
connectors. Mock mode also uses the fallback, so `NEXT_PUBLIC_DEMO_MODE=mock`
never opens a login modal.

## Deploying to Vercel

- Root directory: `web`
- Framework preset: Next.js
- Package manager: Bun (`bun install`, `bun run build`)
- Add every variable from the table above in Project Settings, including
  `PYTH_API_KEY` (server-only) and `NEXT_PUBLIC_SITE_URL`.
- Add the Vercel domain as a Privy allowed origin.

## Troubleshooting

- **“Price feed offline”** — `/api/price-update` could not read the machine or
  Hermes. Check that the machine address is set, `PYTH_API_KEY` is present in
  the server environment, and the key is entitled to the machine's feeds.
- **`HERMES_NOT_ENTITLED`** — the key is not entitled to one of the feed ids
  returned by `tokenInfo`. The launch key is entitled only to TSLA/USD.
- **“Machine not deployed”** — set the ClawMachine (and testnet USDC) env vars
  for the selected network and restart/rebuild. The app shows an explicit
  not-deployed notice with the required env names; it never reads a zero
  address.
- **“Not enough USDC”** — on testnet use **Get test USDC**; on mainnet top up
  USDC in the connected wallet.
- **Wrong network banner** — click the switch button; the app reads state from
  the selected deployment chain even while the wallet is elsewhere.
- **Pull stuck in “Drawing”** — Entropy callbacks usually land in a few
  seconds. The hook polls for 120 s and then points at the explorer.
- **Live feed empty** — the feed only scans ~1,500 blocks (~10 minutes on
  Monad). An empty feed shortly after deployment is expected.
