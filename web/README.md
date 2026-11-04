# Claw Machine — web app

The player-facing app for the Monad xStocks claw machine. Pay 1 USDC, pull a
card, and receive real tokenized stocks (xStocks) straight to your wallet.
Randomness comes from Pyth Entropy; the payout is delivered in the entropy
callback, so there is no claim step.

## Stack

- Next.js 16 (App Router, TypeScript, `src/` directory)
- Tailwind CSS v4 + shadcn/ui + [8bitcn](https://www.8bitcn.com) pixel components
- wagmi + viem + TanStack Query
- Bun (`bun install`, `bun run build`)

## Run locally

```bash
cd web
bun install
cp .env.example .env.local   # fill in the addresses once contracts are deployed
bun run dev                  # http://localhost:3000
```

Other commands:

```bash
bun run build
bun run lint
bun run typecheck
```

## Environment variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_DEFAULT_NETWORK` | `testnet` (default) or `mainnet` |
| `NEXT_PUBLIC_CLAW_MACHINE_MAINNET` | ClawMachine address on Monad mainnet (143) |
| `NEXT_PUBLIC_CLAW_MACHINE_TESTNET` | ClawMachine address on Monad testnet (10143) |
| `NEXT_PUBLIC_USDC_TESTNET` | Testnet MockUSDC address |
| `NEXT_PUBLIC_DEMO_MODE` | Set to `mock` to simulate pulls without a chain |

`NEXT_PUBLIC_*` values are inlined at build time. Restart the dev server (or
rebuild) after changing them.

Addresses live in `src/config/deployments.ts`. Anything not set via env falls
back to the values in that file (zero placeholders until deployment). The
mainnet USDC and xStock addresses are the canonical Monad mainnet deployments.

When the contracts worker publishes `contracts/abi/ClawMachine.json`, diff it
against `src/abi/clawMachine.ts` and update the subset used by the app:

- `pull`, `getFee`, `canPull`, config getters
- `getStocks`, `getPrices`, `getPull`, `getPullPayout`, `getRecentPulls`
- `PullRequested` / `PullResolved` events

The current ABI was checked against `contracts/abi/ClawMachine.json` at commit
`fd645cb` and matches for every function and event the app reads.

## Mock mode

```bash
cd web
NEXT_PUBLIC_DEMO_MODE=mock bun run dev
```

No wallet, RPC or contract is needed. Pulls resolve after a 1.5 s draw with the
same 2% legendary odds as the contract, the wallet panel shows simulated
balances, and recent pulls update in memory. This is the fastest way to work on
UI and to demo the flow offline.

## Networks

| | Mainnet | Testnet |
| --- | --- | --- |
| chainId | 143 | 10143 |
| RPC | `https://rpc.monad.xyz` | `https://testnet-rpc.monad.xyz` |
| Explorer | https://monadscan.com | https://testnet.monadscan.com |
| USDC | canonical `0x7547…b603` (6 decimals) | MockUSDC, public `faucet()` |
| Stocks | canonical xStocks (18 decimals) | MockStocks (18 decimals) |

The app opens on `NEXT_PUBLIC_DEFAULT_NETWORK`. If the connected wallet is on a
different chain, a banner offers a one-click network switch. On testnet the
wallet panel shows **Get test USDC** (calls `MockUSDC.faucet()` and mints 100
USDC) and a link to the Monad MON faucet.

## How a pull works

1. `useMachine()` reads the machine config and inventory every 3 s through
   contract views (`getRecentPulls` + `getPull` + `getPullPayout` for history —
   never `eth_getLogs`, which public Monad RPCs limit).
2. The primary button reads the wallet's USDC allowance. If it is below one
   pull, `usePull()` first approves five pulls of USDC (`pullPrice * 5`), then
   submits `pull()` with `value: getFee()`.
3. The pull id is decoded from the `PullRequested` log in the receipt. The hook
   polls `getPull(id)` every 500 ms. After 60 s it shows the explorer link and
   keeps polling (up to 5 minutes).
4. On `Resolved`, it loads `getPullPayout(id)` and renders the stock symbols,
   amounts and USD value. Tokens are already in the wallet.

State machine: `idle → approving → confirming → drawing → revealed | error`.
The primary button reflects each phase ("Approve USDC", "Confirm in wallet…",
"Drawing…", "Pull again") and the progress/result is mirrored in an
`aria-live="polite"` region.

## Layout

```
src/
  abi/            ClawMachine + ERC20/MockUSDC ABIs (as const)
  app/            App Router page, layout, providers, global styles
  components/     header, machine placeholder, pull button, result, odds,
                  balances, recent pulls, footer, network banner
  config/         chain definitions, deployments, wagmi config
  hooks/          useMachine, usePull, useBalances, useFaucet
  lib/            formatting, shared types, mock-mode simulator
```

`GachaMachine` in `src/components/gacha/` is a deliberate placeholder with a
stable props contract (`phase`, `legendary`, `label`). The pixel-polish PR
replaces its internals without touching the page wiring.

## Deploying to Vercel

- Root directory: `web`
- Framework preset: Next.js
- Package manager: Bun (`bun install`, `bun run build`)
- Add the environment variables from the table above in Project Settings.

## Troubleshooting

- **"Machine not deployed"** — set the ClawMachine (and testnet USDC) env vars
  for the selected network and restart/rebuild.
- **"Not enough USDC"** — on testnet use **Get test USDC**; on mainnet top up
  USDC in the connected wallet.
- **Wrong network banner** — click the switch button; the app reads state from
  the selected deployment chain even while the wallet is elsewhere.
- **Pull stuck in "Drawing"** — entropy callbacks usually land in a few
  seconds. After 60 s the explorer link appears; the page keeps polling.
