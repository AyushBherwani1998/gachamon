"use client";

import {
  useMemo,
  type ReactNode,
} from "react";

import {
  LiveFeed,
  OddsPanel,
  QrCard,
  ResultCard,
  ShareButton,
  type FeedItem,
} from "@/components/panels";
import { useNow } from "@/components/panels/use-now";

const EXPLORER = "https://testnet.monadscan.com";
const LIVE_URL = "https://clawmachine.vercel.app";

const ADDRESSES = [
  "0x7a3f9c2e5b1d84a06f3c9e7b2a4d6c8e1f0b3a5c",
  "0x12ab34cd56ef7890a1b2c3d4e5f60718293a4b5c",
  "0x9f8e7d6c5b4a39281706f5e4d3c2b1a098765432",
  "0x3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f",
  "0xdeadbeef00112233445566778899aabbccddeeff",
  "0x55aa66bb77cc88dd99ee00ff11aa22bb33cc44dd",
  "0xabcdef0123456789abcdef0123456789abcdef01",
  "0x11223344556677889900aabbccddeeff00112233",
];

function buildFeed(now: number): FeedItem[] {
  return [
    {
      pullId: "1042",
      player: ADDRESSES[0],
      legendary: true,
      payouts: [{ symbol: "NVDAx", amount: "0.0724", usd: "$10.00" }],
      valueUsd: "$10.00",
      resolvedAt: now - 38,
    },
    {
      pullId: "1041",
      player: ADDRESSES[1],
      legendary: false,
      payouts: [{ symbol: "SPYx", amount: "0.0012", usd: "$0.73" }],
      valueUsd: "$0.73",
      resolvedAt: now - 140,
    },
    {
      pullId: "1040",
      player: ADDRESSES[2],
      legendary: false,
      payouts: [{ symbol: "TSLAx", amount: "0.0017", usd: "$0.73" }],
      valueUsd: "$0.73",
      resolvedAt: now - 260,
    },
    {
      pullId: "1039",
      player: ADDRESSES[3],
      legendary: false,
      payouts: [{ symbol: "NVDAx", amount: "0.0053", usd: "$0.73" }],
      valueUsd: "$0.73",
      resolvedAt: now - 420,
    },
    {
      pullId: "1038",
      player: ADDRESSES[4],
      legendary: false,
      payouts: [{ symbol: "SPYx", amount: "0.0012", usd: "$0.73" }],
      valueUsd: "$0.73",
      resolvedAt: now - 610,
    },
    {
      pullId: "1037",
      player: ADDRESSES[5],
      legendary: true,
      payouts: [{ symbol: "SPYx", amount: "0.0166", usd: "$10.00" }],
      valueUsd: "$10.00",
      resolvedAt: now - 840,
    },
    {
      pullId: "1036",
      player: ADDRESSES[6],
      legendary: false,
      payouts: [{ symbol: "TSLAx", amount: "0.0017", usd: "$0.73" }],
      valueUsd: "$0.73",
      resolvedAt: now - 1_320,
    },
    {
      pullId: "1035",
      player: ADDRESSES[7],
      legendary: false,
      payouts: [{ symbol: "NVDAx", amount: "0.0053", usd: "$0.73" }],
      valueUsd: "$0.73",
      resolvedAt: now - 1_860,
    },
  ];
}

const ODDS_PROPS = {
  legendaryBps: 200,
  commonUsd: "$0.73",
  legendaryUsd: "$10.00",
  pullPriceUsd: "$1.00",
  inventoryUsd: "$1,284.20",
  totalPulls: "1,042",
  prices: [
    { symbol: "TSLAx", usd: "$421.25" },
    { symbol: "NVDAx", usd: "$138.21" },
    { symbol: "SPYx", usd: "$601.32" },
  ],
};

function SectionHeading({
  index,
  title,
  note,
}: {
  index: string;
  title: string;
  note: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-foreground/15 pb-2">
      <h2 className="retro text-[11px] leading-relaxed text-foreground">
        <span className="mr-2 text-amber-300">{index}</span>
        {title}
      </h2>
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        {note}
      </p>
    </div>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="border-4 border-dashed border-foreground/15 p-4 sm:p-5">
      {children}
    </div>
  );
}

export default function PanelsPreviewPage() {
  const nowMs = useNow();
  const now = Math.floor(nowMs / 1_000);
  const feed = useMemo(() => buildFeed(now), [now]);

  return (
    <div className="min-h-full flex-1 bg-[linear-gradient(to_right,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:32px_32px] [font-family:var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 sm:py-10">
        <header className="border-b-4 border-foreground/20 pb-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="retro text-[9px] leading-relaxed text-amber-300">
                Panel gallery · mock data
              </p>
              <h1 className="retro mt-2 text-lg leading-[1.7] sm:text-2xl">
                Pull. Show. Share.
              </h1>
              <p className="mt-2 max-w-xl text-xs leading-relaxed text-muted-foreground">
                Result card, odds and EV, live feed and QR share. Every state
                rendered with realistic mocks, checked down to 360px.
              </p>
            </div>
            <span className="retro border-2 border-foreground/30 bg-foreground/5 px-2 py-1.5 text-[8px] text-muted-foreground">
              Preview only
            </span>
          </div>
        </header>

        <section aria-labelledby="results-heading" className="space-y-4">
          <div id="results-heading">
            <SectionHeading
              index="01"
              title="Pull results"
              note="common + legendary"
            />
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <ResultCard
              legendary={false}
              payouts={[
                { symbol: "NVDAx", amount: "0.0053", usd: "$0.73" },
              ]}
              valueUsd="$0.73"
              explorerUrl={`${EXPLORER}/tx/0x8f21c0d9a4e7b3f6c5d2a1e0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0`}
              onPullAgain={() => {}}
            />
            <ResultCard
              legendary
              payouts={[
                { symbol: "TSLAx", amount: "0.0142", usd: "$5.98" },
                { symbol: "NVDAx", amount: "0.0291", usd: "$4.02" },
              ]}
              valueUsd="$10.00"
              explorerUrl={`${EXPLORER}/tx/0x1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809`}
              onPullAgain={() => {}}
            />
          </div>
        </section>

        <section aria-labelledby="odds-heading" className="space-y-4">
          <div id="odds-heading">
            <SectionHeading
              index="02"
              title="Odds & expected value"
              note="live + loading"
            />
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <OddsPanel {...ODDS_PROPS} />
            <OddsPanel {...ODDS_PROPS} loading />
          </div>
        </section>

        <section aria-labelledby="feed-heading" className="space-y-4">
          <div id="feed-heading">
            <SectionHeading
              index="03"
              title="Live feed"
              note="8 items + empty / loading / error"
            />
          </div>
          <div className="grid items-start gap-5 md:grid-cols-2">
            <LiveFeed items={feed} explorerBase={EXPLORER} />
            <LiveFeed items={[]} loading explorerBase={EXPLORER} />
            <LiveFeed items={[]} explorerBase={EXPLORER} />
            <LiveFeed
              items={[]}
              explorerBase={EXPLORER}
              error="RPC request timed out. The public endpoint is rate limited."
            />
          </div>
        </section>

        <section aria-labelledby="share-heading" className="space-y-4">
          <div id="share-heading">
            <SectionHeading
              index="04"
              title="Scan & share"
              note="QR + X intent"
            />
          </div>
          <div className="grid items-start gap-5 md:grid-cols-2">
            <QrCard url={LIVE_URL} />
            <Frame>
              <div className="flex h-full flex-col justify-between gap-6">
                <div>
                  <p className="retro text-[10px] leading-relaxed text-amber-300">
                    Share primitive
                  </p>
                  <p className="mt-3 max-w-sm text-xs leading-relaxed text-muted-foreground">
                    Opens an X intent in a new tab. The share text carries the
                    payout, the stack, and the two builder mentions; the live
                    URL is appended automatically when no explicit URL is
                    passed.
                  </p>
                  <ul className="mt-4 space-y-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
                    <li>· @monad_dev @geeky_kartikey</li>
                    <li>· @monad · #MonadBlitz</li>
                    <li>· verifiable randomness by Pyth</li>
                  </ul>
                </div>
                <ShareButton
                  text="Pull a real stock for 1 USDC on @monad. Verifiable randomness by Pyth. #MonadBlitz @monad_dev @geeky_kartikey"
                  url={LIVE_URL}
                  label="Share the machine"
                />
              </div>
            </Frame>
          </div>
        </section>

        <footer className="border-t-4 border-foreground/20 pt-4 font-mono text-[10px] leading-relaxed text-muted-foreground">
          Presentational only. No wagmi or RPC calls live in these components.
        </footer>
      </div>
    </div>
  );
}
