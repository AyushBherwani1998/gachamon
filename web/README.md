# Claw Machine — web app

The player-facing app for the Monad xStocks claw machine. Pay 1 USDC, pull a
card, and receive real tokenized stocks (xStocks) straight to your wallet.
Prices come from **Chainlink Data Feeds on Monad** (on-chain push feeds, no API
key); randomness comes from **Pyth Entropy**. The payout is delivered inside the
entropy callback, so there is no claim step.

The machine launches with **TSLAx, NVDAx and SPYx**; QQQx and SPCXx (SpaceX) can
be added later. The token list is never hardcoded: it is read from the contract
(`getSupportedTokens()` + `tokenInfo(token)`), and symbols come from the token
contracts. Any token added with `addToken` appears after a refresh.

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
cp .env.example .env.local   # fill in the machine address
bun run dev                  # http://localhost:3000
```

Other commands:

```bash
bun run typecheck
bun run lint
bun run build
```

There is no price API key: Chainlink prices are read on-chain by the contract.

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

`NEXT_PUBLIC_*` values are inlined at build time. Restart the dev server (or
rebuild) after changing them.

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
| Prices | Chainlink Data Feeds | Chainlink Data Feeds |
| Randomness | Pyth Entropy V2 | Pyth Entropy V2 |

The app opens on `NEXT_PUBLIC_DEFAULT_NETWORK` (mainnet by default). If the
connected wallet is on a different chain, a banner offers a one-click network
switch. On testnet the wallet panel shows **Get test USDC** (calls
`MockUSDC.faucet()` and mints 100 USDC) and a link to the Monad MON faucet.

## Contract interface

`src/abi/clawMachine.ts` is the typed ABI (`src/abi/ClawMachine.json` is
generated from it) and targets the Chainlink version of the contract on
`fix/claw-pyth-entropy`:

- `pull(bytes32 userRandomNumber)` payable — no price update data
- `getFee()` / `getEntropyFee()` — the Entropy fee; the whole `msg.value`
- `getTokenPrice(address token)` — live Chainlink price per whole token, 6 decimals
- `tokenInfo(address token)` — `(address priceFeed, uint8 decimals, bool supported)`
- `canPull()` / `getInventoryValue()` — live on-chain prices
- `getSupportedTokens()`, `getOwedBalance(player)`, `withdrawOwed()`
- `getPullPriceSnapshot(pullId, token)` — the price snapshot used for a pull
- `callbackGasLimit()` / `setCallbackGasLimit(uint32)`
- `_entropyCallback(...)` — the IEntropyConsumer entry point; the web never calls it

`getPythFee`, `getTotalFee`, the `bytes[] priceUpdateData` argument and `IPyth`
are gone. `maxPriceAge` defaults to 3900 s for Chainlink feeds.

The fixed contract also has an owner-only `refundStuckPull` for pulls whose
callback never lands. There is no player-facing refund action: if a callback
does not arrive, the pull stays pending on-chain and the owner can refund it.

## How a pull works

1. `usePull()` reads `pullPrice` and the wallet's USDC allowance. If the
   allowance is short it approves the exact `pullPrice`.
2. It reads `getFee()` immediately before sending, then simulates
   `pull(random32)` (`random32` from `crypto.getRandomValues`) and sends it with
   `value = getFee()`.
3. `pullId` and the Entropy `sequenceNumber` are decoded from the
   `PullRequested` log in the receipt. The UI shows the drawing state.
4. It polls `PullResolved` for that indexed `pullId` with `getLogs` from the
   receipt block forward, in chunks of at most **100 blocks**, every 1.5 s for
   up to 120 s. No `eth_getLogs` range above 100 blocks is ever requested.
5. The result card shows `stocks` / `amounts` (18-decimal formatting). The USD
   value comes from `getPullPriceSnapshot(pullId, token)`, with
   `getTokenPrice(token)` as a fallback.

Reverts are mapped to player-friendly copy: insufficient inventory, insufficient
fee, stale Chainlink price, paused machine, user rejection, and low USDC
allowance.

Availability is `canPull()` + `paused()`. Because the Chainlink contract reads
live on-chain prices, the old Pyth stale-price caveat no longer applies.
Inventory USD comes from `getInventoryValue()`; per-stock prices come from
`getTokenPrice()`.

## Server route for the live feed

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
- **Prices/inventory** use `getTokenPrice()` and `getInventoryValue()`.
- **Claimable balance** uses `getOwedBalance(player)` and `withdrawOwed()`.
- Footer copy: “Prices: Chainlink. Randomness: Pyth Entropy.”

## Mock mode

```bash
cd web
NEXT_PUBLIC_DEMO_MODE=mock bun run dev
```

No wallet, RPC or contract is needed. Pulls resolve after a 1.5 s draw with the
same 2% legendary odds as the contract, the wallet panel shows simulated
balances, and the feed updates in memory. The mock shows TSLAx, NVDAx and SPYx
to match the launch list. This is the fastest way to work on UI and to demo
offline.

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
  `NEXT_PUBLIC_CLAW_MACHINE_MAINNET` and `NEXT_PUBLIC_SITE_URL`.
- Add the Vercel domain as a Privy allowed origin.

No Pyth price API key is needed for the deployment.

## Troubleshooting

- **“Machine not deployed”** — set the ClawMachine (and testnet USDC) env vars
  for the selected network and restart/rebuild. The app shows an explicit
  not-deployed notice with the required env names; it never reads a zero
  address.
- **“Not enough USDC”** — on testnet use **Get test USDC**; on mainnet top up
  USDC in the connected wallet.
- **“Machine refilling”** — `canPull()` is false: inventory does not cover the
  legendary reserve, a Chainlink feed is stale, or the machine is paused.
- **“Stale price” on a pull** — Chainlink has not updated within `maxPriceAge`
  (3900 s by default). Try again once the feed updates.
- **Wrong network banner** — click the switch button; the app reads state from
  the selected deployment chain even while the wallet is elsewhere.
- **Pull stuck in “Drawing”** — Entropy callbacks usually land in a few
  seconds. The hook polls for 120 s and then points at the explorer.
- **Live feed empty** — the feed only scans ~1,500 blocks (~10 minutes on
  Monad). An empty feed shortly after deployment is expected.
