# xStock Price Keeper

Keeps the `ClawMachine` stock prices fresh on Monad so pulls never revert with
stale prices. Every tick it:

1. reads `getStocks()` and the last accepted prices from the contract,
2. fetches USD prices from the xStocks public API (or Pyth Hermes),
3. sanity-checks each price and calls `setPrices(stocks, pricesUsd6)` when a
   price moved at least **0.1%**, or when the last on-chain update is older than
   **5 minutes**,
4. logs one line with the prices, transaction hash and explorer link.

If a fetch or transaction fails, it logs the error and retries on the next tick.
It never crashes the loop.

---

## Live API findings (probed 2026-11-04, ~12:33 IST)

The paths in `plan.md` are partly wrong. These are the real ones, verified with
`curl` against `https://api.xstocks.fi`:

| Endpoint | Status | Notes |
|---|---|---|
| `GET /api/v2/public/assets/{symbol}/price-data` | **200** | Real price endpoint. `{symbol}` is the token symbol (`TSLAx`, `AAPLx`, `NVDAx`, `SPYx`). |
| `GET /api/v2/public/system/status/{symbol}` | **200** | Market/atomic halt status + allowed operations. |
| `GET /api/v2/public/assets/{symbol}/multiplier?network=Monad` | **200** | `network` is **required**; without it the API returns 400. |
| `GET /api/v2/{symbol}/price-data` | 404 | The path written in `plan.md` does not exist. |
| `GET /api/v2/{symbol}/multiplier` | 404 | Same; use `/public/assets/...`. |

Live responses captured during the probe:

```json
GET /api/v2/public/assets/TSLAx/price-data
{"quote":380.9}

GET /api/v2/public/assets/AAPLx/price-data
{"quote":331.23}

GET /api/v2/public/assets/NVDAx/price-data
{"quote":207.405}

GET /api/v2/public/assets/SPYx/price-data
{"quote":752.745}

GET /api/v2/public/system/status/TSLAx
{"symbol":"TSLAx","isMarketTradingHalted":false,"isAtomicTradingHalted":false,
 "allowedOperations":["Issuance","Redemption","Bridge"]}

GET /api/v2/public/assets/TSLAx/multiplier?network=Monad
{"currentMultiplier":1,"newMultiplier":0,"activationDateTime":0,"reason":null}
```

Notes:

- The price is a JSON **number** (`{"quote":207.405}`). The keeper parses the raw
  response text into a decimal string and then into a `bigint` with 6 decimals,
  so no float rounding is involved.
- `{"quote":null}` means the API has no current quote (e.g. market closed). That
  symbol is skipped for the tick; other symbols still update.
- Quotes are 24/5-ish indicative prices from on-chain providers + Nasdaq/Blue
  Ocean. They update outside regular US market hours.
- **Multiplier:** on EVM chains xStocks rebase automatically and `balanceOf()`
  already returns the dividend/split-adjusted amount. The quote is the USD value
  of one token, so the keeper does **not** multiply by `currentMultiplier`. The
  multiplier is only needed for display on Solana/TON, or to know when a split
  activation window is near.
- Symbols are `TSLAx` / `AAPLx` / `NVDAx` / `SPYx`, **not** `TSLA` / `AAPL`.

### Pyth Hermes fallback (optional)

Feed IDs looked up with
`https://hermes.pyth.network/v2/price_feeds?query=TSLA&asset_type=equity`:

| Stock | Pyth feed id |
|---|---|
| TSLA | `16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1` |
| AAPL | `49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688` |
| NVDA | `b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593` |
| SPY | `19e09bb805456ada3979a7d1cbb4b6d63babc3a0f8e8a9509f68afa5c4c11cd5` |

Hermes **now requires an API key on every request** (since the Pyth Core upgrade
on 2026-08-26; unauthenticated requests return `401 unauthorized`). The keeper
supports it via `PYTH_API_KEY`, but the default `PRICE_SOURCE=xstocks` needs no
key at all. `PRICE_SOURCE=auto` uses xStocks first and Pyth only for symbols the
xStocks API failed to return.

---

## Quick start (no key, no contract)

```bash
cd keeper
bun install
bun run dry
```

Example output (prices will differ):

```
[07:08:40] keeper starting: mainnet (chain 143), TSLAx, AAPLx, NVDAx, SPYx | source=xstocks | dry-run
[07:08:40] DRY mainnet  TSLAx $380.325  AAPLx $331.33  NVDAx $207.09  SPYx $752.705  | would update 4/4
```

`bun run dry` is one-shot and exits. It does not need `KEEPER_PRIVATE_KEY` or
`CLAW_MACHINE_ADDRESS`. If a contract address is configured it also shows the
on-chain baseline and whether an update is needed; otherwise it prices the four
built-in symbols.

---

## Setup

```bash
cd keeper
bun install
cp .env.example .env
```

Edit `.env`:

| Variable | Required | Description |
|---|---|---|
| `NETWORK` | yes | `mainnet` or `testnet` (default `mainnet`) |
| `CLAW_MACHINE_ADDRESS` | for writes | Deployed ClawMachine address |
| `KEEPER_PRIVATE_KEY` | for writes | `0x`-prefixed keeper wallet key. Never commit it. |
| `RPC_URL` | no | Overrides the default RPC for the network |
| `INTERVAL_SECONDS` | no | Seconds between ticks, default `60` |
| `PRICE_SOURCE` | no | `xstocks` (default), `pyth`, or `auto` |
| `PYTH_API_KEY` | for Pyth | Hermes API key |
| `MAX_DEVIATION_BPS` | no | Reject moves above this, default `2500` (25%) |

Default RPCs:

- mainnet: `https://rpc.monad.xyz`
- testnet: `https://testnet-rpc.monad.xyz`

`bun` loads `.env` automatically when you run from the `keeper/` directory.

---

## Commands

```bash
bun run dry          # one-shot price print (no key, no tx)
bun run dry:watch    # print prices every INTERVAL_SECONDS, no tx
bun run once         # one real setPrices update, then exit
bun run start        # run forever (the production loop)
bun test             # unit tests
bun run typecheck    # tsc --noEmit
```

Flags can also be passed directly:

```bash
bun run src/index.ts --once --dry-run
bun run src/index.ts --help
```

`bun run once` is the recommended command immediately before a demo: it forces
a fresh update and exits non-zero if anything is wrong.

---

## Giving the keeper role

`setPrices` is keeper-only. If the keeper wallet is not the deployer, the owner
must call:

```bash
cast send $CLAW_MACHINE_ADDRESS "setKeeper(address)" $KEEPER_WALLET_ADDRESS \
  --rpc-url https://rpc.monad.xyz \
  --private-key $OWNER_PRIVATE_KEY
```

Or use the explorer: contract → **Write Contract** → `setKeeper`.

Verify:

```bash
cast call $CLAW_MACHINE_ADDRESS "keeper()(address)" --rpc-url https://rpc.monad.xyz
```

The keeper also checks this on the first write attempt and prints a clear error
with the expected `setKeeper(...)` call if the wallet does not match.

---

## How the update logic works

- **Change threshold:** `abs(new - last) * 10000 >= last * 10` → at least 0.1%.
- **Freshness threshold:** `now - updatedAt >= 300` seconds → refresh even when
  prices have not moved. Mainnet `maxPriceAge` is 900 s, so this leaves a
  10-minute buffer if ticks fail.
- **Sanity check:** if a price moved more than `MAX_DEVIATION_BPS` (25% default)
  versus the last accepted on-chain value, that symbol is skipped and logged.
  This protects the machine from a bad API print. The other symbols still update.
- **What is sent:** when any symbol is due, the keeper sends all symbols that
  passed the sanity check in one `setPrices` call. Symbols without a fresh quote
  (or skipped by the sanity check) are omitted; the contract keeps their previous
  values.
- **Gas:** the keeper estimates gas and adds 20% + 5,000. Monad charges the gas
  **limit**, not gas used, so no large fixed limit is used.
- **Receipt:** it waits for a successful receipt before accepting the new prices
  into its in-memory baseline. The next tick re-reads `getPrices()` anyway, so a
  restart is always safe.

### Corporate actions / splits

EVM xStocks rebase automatically, so no multiplier adjustment is applied. A
stock split can still look like a >25% price move. The keeper intentionally
skips it rather than pushing a suspicious price. If the split is confirmed and
you want to accept the new level, raise the guard for one run:

```bash
MAX_DEVIATION_BPS=10000 bun run once
```

then put it back to the default. During that run the keeper accepts the new
price and future ticks use it as the baseline.

---

## Testnet

Testnet has no real USDC/xStocks. The deploy script creates `MockStock` tokens
with the same symbols (`TSLAx`, `AAPLx`, `NVDAx`, `SPYx`), so this keeper works
unchanged against the testnet ClawMachine. Point `CLAW_MACHINE_ADDRESS` at the
testnet deployment and set `NETWORK=testnet`; `xstocks` prices mirror the real
stocks.

Mainnet and testnet explorer links in logs are selected automatically:

- `https://monadscan.com/tx/...`
- `https://testnet.monadscan.com/tx/...`

---

## Log format

```
[07:08:22] testnet  TSLAx $380.325  AAPLx $331.33  NVDAx $207.09  SPYx $752.705  | tx 0x70de...  | https://testnet.monadscan.com/tx/0x70de...
[07:08:23] testnet  TSLAx $380.325  AAPLx $331.33  NVDAx $207.09  SPYx $752.705  | no update needed (fresh, max move 0.00%)
```

Warnings (skipped symbol, failed API call) go to stderr and do not stop the loop.

For a long-running deployment, run `bun run start` under systemd, tmux, pm2,
Railway, or any process manager with restart-on-failure. A minimal systemd unit:

```ini
[Unit]
Description=ClawMachine xStock keeper
After=network-online.target

[Service]
WorkingDirectory=/opt/claw-machine/keeper
ExecStart=/usr/local/bin/bun run start
Restart=always
RestartSec=5
EnvironmentFile=/opt/claw-machine/keeper/.env

[Install]
WantedBy=multi-user.target
```

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `wallet ... is not the keeper` | Owner must call `setKeeper(keeperAddress)`. |
| `no prices available from PRICE_SOURCE=xstocks` | xStocks API down or returning `quote:null` for all symbols. Check with the curl commands above; the loop retries every tick. |
| `PYTH_API_KEY is not set` | Hermes requires a key since 2026-08-26. Use `PRICE_SOURCE=xstocks` or add a key. |
| `stock skipped: ... is 25.xx% from last accepted` | Safety guard. Confirm a split/bad print; see “Corporate actions / splits”. |
| `insufficient funds for gas` | Top up the keeper wallet with MON. |
| Prices never refresh | Check `getPrices()` `updatedAt` with cast; check the keeper wallet is the on-chain `keeper()`; check the tx on the explorer. |
| `getStocks() failed` | Wrong `CLAW_MACHINE_ADDRESS` for the selected `NETWORK`. |

Contract address mismatches are the most common setup error: mainnet and
testnet have completely different deployments.
