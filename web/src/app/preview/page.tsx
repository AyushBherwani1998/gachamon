"use client";

import Link from "next/link";
import { useState } from "react";

import {
  PixelGachaMachine,
  type GachaPhase,
  type GachaResult,
} from "@/components/gacha";

const PHASES: GachaPhase[] = ["idle", "approving", "confirming", "drawing", "error"];

const RESULTS = {
  rare: {
    pullId: "2481",
    legendary: false,
    payouts: [{ symbol: "TSLAx", amount: "0.0017", usd: "0.73" }],
    valueUsd: "0.73",
  },
  legendary: {
    pullId: "2482",
    legendary: true,
    payouts: [
      { symbol: "TSLAx", amount: "0.0142", usd: "5.98" },
      { symbol: "NVDAx", amount: "0.0291", usd: "4.02" },
    ],
    valueUsd: "10.00",
  },
  "multi-stock": {
    pullId: "2483",
    legendary: true,
    payouts: [
      { symbol: "TSLAx", amount: "0.0182", usd: "7.28" },
      { symbol: "SPYx", amount: "0.0051", usd: "2.72" },
    ],
    valueUsd: "10.00",
  },
  "no-payout": {
    pullId: "2484",
    legendary: false,
    payouts: [],
    valueUsd: "0.73",
  },
} satisfies Record<string, GachaResult>;

type ResultKey = keyof typeof RESULTS;

const button =
  "min-h-11 border-4 border-foreground bg-card px-3 py-2 font-mono text-xs uppercase data-[on=true]:bg-primary data-[on=true]:text-primary-foreground";

export default function PreviewPage() {
  const [phase, setPhase] = useState<GachaPhase>("idle");
  const [resultKey, setResultKey] = useState<ResultKey>("rare");
  const [run, setRun] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [revealCount, setRevealCount] = useState(0);

  const openPack = (next: ResultKey) => {
    setResultKey(next);
    setPhase("revealed");
    setRun((value) => value + 1);
  };

  return (
    <main
      className="min-h-screen px-4 py-6 sm:px-6"
      data-reduced-motion={reducedMotion ? "true" : undefined}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b-4 border-foreground pb-4">
          <div>
            <h1 className="font-mono text-xl font-bold uppercase">Gachamon pack rehearsal</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Every machine state and pack result, with no wallet or 2% odds to wait for.
            </p>
          </div>
          <Link className={button} href="/">
            Back to app
          </Link>
        </header>

        <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <PixelGachaMachine
            key={run}
            phase={phase}
            result={phase === "revealed" ? RESULTS[resultKey] : undefined}
            onRevealed={() => setRevealCount((value) => value + 1)}
          />

          <div className="flex flex-col gap-5">
            <div>
              <h2 className="mb-2 font-mono text-xs font-bold uppercase">Machine state</h2>
              <div className="flex flex-wrap gap-2">
                {PHASES.map((entry) => (
                  <button
                    key={entry}
                    type="button"
                    className={button}
                    data-on={phase === entry}
                    onClick={() => setPhase(entry)}
                  >
                    {entry}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h2 className="mb-2 font-mono text-xs font-bold uppercase">Drop a pack</h2>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(RESULTS) as ResultKey[]).map((entry) => (
                  <button
                    key={entry}
                    type="button"
                    className={button}
                    data-on={phase === "revealed" && resultKey === entry}
                    onClick={() => openPack(entry)}
                  >
                    {entry}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex min-h-11 items-center gap-2 font-mono text-xs uppercase">
              <input
                type="checkbox"
                checked={reducedMotion}
                onChange={(event) => setReducedMotion(event.target.checked)}
              />
              Reduced motion
            </label>

            <p className="font-mono text-xs">onRevealed fired: {revealCount}</p>
          </div>
        </div>
      </div>
    </main>
  );
}
