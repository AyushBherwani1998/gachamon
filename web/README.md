# Claw Machine — web app

Next.js app for the Monad xStocks claw machine. Pay 1 USDC, pull a card, and
receive real tokenized stocks (xStocks) straight to your wallet. Randomness is
provided by Pyth Entropy.

## Stack

- Next.js 16 (App Router, TypeScript)
- Tailwind CSS v4 + shadcn/ui + [8bitcn](https://www.8bitcn.com) pixel components
- wagmi + viem + TanStack Query
- Bun as package manager

## Run locally

```bash
cd web
bun install
cp .env.example .env.local   # fill in addresses once contracts are deployed
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
| `NEXT_PUBLIC_DEMO_MODE` | `mock` simulates pulls without a chain |

Addresses live in `src/config/deployments.ts`. Anything not set via env falls
back to the values in that file (placeholders until deployment).

## Mock mode

Set `NEXT_PUBLIC_DEMO_MODE=mock` and open the app. No wallet or RPC is needed:
pulls resolve after 1.5 s with the same 2% legendary odds as the contract. This
is the fastest way to work on UI and to demo the flow offline.

## Network support

| | Mainnet | Testnet |
| --- | --- | --- |
| chainId | 143 | 10143 |
| RPC | https://rpc.monad.xyz | https://testnet-rpc.monad.xyz |
| Explorer | https://monadscan.com | https://testnet.monadscan.com |
| USDC | canonical USDC | MockUSDC (`faucet()`) |

On testnet the header shows **Get test USDC** (calls the MockUSDC `faucet()`)
and a link to the Monad MON faucet. On the wrong network, a banner offers a
one-click network switch.

## Panels preview

`/preview/panels` renders every result/feed/share panel against realistic mock
data, including the loading, empty and error states. Run `bun run dev` and open
<http://localhost:3000/preview/panels>. The route is a static preview: it never
touches the chain.

The panels live in `src/components/panels` and are presentational. They take
plain props, contain no wagmi or RPC calls, and can be dropped anywhere:

```tsx
import {
  LiveFeed,
  OddsPanel,
  QrCard,
  ResultCard,
  ShareButton,
  type FeedItem,
  type PanelPayout,
} from "@/components/panels";
```

| Component | Use |
| --- | --- |
| `ResultCard` | Resolved pull: rarity badge, per-stock payout rows, total USD, explorer link, pull-again and share-to-X actions. |
| `OddsPanel` | 98/2 odds, computed EV and house edge, inventory and total pulls. Shows a skeleton while `loading`. |
| `LiveFeed` | Newest-first ring-buffer feed (`FeedItem[]`), shortened addresses, relative time, legendary highlight, explorer links. Accepts `loading` and `error`. |
| `ShareButton` | Opens an X intent in a new tab. Pass `text` and `url`; an empty `url` falls back to the current origin after hydration. Optional `label` defaults to "Share my pull". |
| `QrCard` | Large high-contrast QR of the live URL. The QR is generated locally with `qrcode` (no external image service). |

All USD values and token amounts are pre-formatted strings (`PanelPayout.usd`,
`valueUsd`), so the calling hooks decide the precision. `explorerBase` should be
`https://monadscan.com` on mainnet or `https://testnet.monadscan.com` on
testnet.

## Deploying to Vercel

- Root directory: `web`
- Framework preset: Next.js
- Package manager: Bun (`bun install`, `bun run build`)
- Add the environment variables from the table above in Project Settings.

## Contract sync note

`src/abi/clawMachine.ts` is hand-maintained from the canonical interface in the
shared brief. When `contracts/abi/ClawMachine.json` is published, diff it
against this file and update the ABI (and `src/config/deployments.ts`) together.
