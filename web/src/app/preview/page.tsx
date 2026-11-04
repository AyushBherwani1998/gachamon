"use client";

import Link from "next/link";
import { useState } from "react";

import {
  PixelGachaMachine,
  type GachaPhase,
  type GachaResult,
} from "@/components/gacha";

const PHASES: { id: GachaPhase; label: string; note: string }[] = [
  {
    id: "idle",
    label: "Idle",
    note: "Empty output tray, coin slot waiting. The page's pull button lives outside this component.",
  },
  {
    id: "approving",
    label: "Approving",
    note: "Waiting on the USDC approval in the player's wallet.",
  },
  {
    id: "confirming",
    label: "Confirming",
    note: "The card dispenses out of the chute while the pull transaction confirms.",
  },
  {
    id: "drawing",
    label: "Drawing",
    note: "Card jitters with steps(2), Pyth is drawing with an animated pixel ellipsis.",
  },
  {
    id: "revealed",
    label: "Revealed",
    note: "Tap the card (or press Enter / Space) to tear it. onRevealed fires after the reveal finishes.",
  },
  {
    id: "error",
    label: "Error",
    note: "Failed pull state. The page should offer a retry.",
  },
];

const RESULTS: Record<"common" | "legendary", GachaResult> = {
  common: {
    pullId: "2481",
    legendary: false,
    payouts: [{ symbol: "NVDAx", amount: "0.0036", usd: "0.73" }],
    valueUsd: "0.73",
    explorerUrl: "https://testnet.monadscan.com",
  },
  legendary: {
    pullId: "2482",
    legendary: true,
    payouts: [
      { symbol: "TSLAx", amount: "0.0182", usd: "7.28" },
      { symbol: "SPYx", amount: "0.0051", usd: "2.72" },
    ],
    valueUsd: "10.00",
    explorerUrl: "https://testnet.monadscan.com",
  },
};

const buttonBase =
  "border-2 px-3 py-2 text-left font-mono text-[11px] uppercase tracking-[0.08em] leading-tight";
const buttonOff =
  "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100";
const buttonOn = "border-violet-400 bg-violet-500/20 text-violet-100";

export default function PreviewPage() {
  const [phase, setPhase] = useState<GachaPhase>("idle");
  const [resultKey, setResultKey] = useState<"common" | "legendary">("common");
  const [run, setRun] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [revealCount, setRevealCount] = useState(0);

  const result = phase === "revealed" ? RESULTS[resultKey] : undefined;
  const activeNote =
    PHASES.find((entry) => entry.id === phase)?.note ?? PHASES[0].note;

  const choosePhase = (next: GachaPhase) => {
    setPhase(next);
    setRun((value) => value + 1);
    setRevealCount(0);
  };

  const chooseResult = (next: "common" | "legendary") => {
    setResultKey(next);
    setPhase("revealed");
    setRun((value) => value + 1);
    setRevealCount(0);
  };

  const replay = () => {
    setRun((value) => value + 1);
    setRevealCount(0);
  };

  return (
    <main className="min-h-screen bg-[#08070d] px-4 py-6 text-zinc-100 sm:px-6 lg:py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-zinc-800 pb-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-violet-400">
              UI Preview · not linked from the app
            </p>
            <h1 className="mt-1 font-mono text-2xl font-bold uppercase tracking-tight text-zinc-50 sm:text-3xl">
              Pixel Gacha Machine
            </h1>
            <p className="mt-1 max-w-xl font-mono text-xs leading-relaxed text-zinc-400">
              Every gacha phase, common and legendary reveals, and the reduced
              motion fallback. Step through the states to review the machine.
            </p>
          </div>
          <Link
            className="border-2 border-zinc-700 px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-zinc-300 hover:border-violet-400 hover:text-violet-200"
            href="/"
          >
            ← Back to app
          </Link>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,480px)_minmax(0,1fr)] lg:items-start">
          <div
            className="flex min-w-0 flex-col gap-3"
            data-reduced-motion={reducedMotion ? "true" : undefined}
          >
            <div className="mx-auto w-full min-w-0 max-w-[480px]">
              <PixelGachaMachine
                key={`${phase}-${resultKey}-${run}-${reducedMotion ? "rm" : "full"}`}
                phase={phase}
                result={result}
                onRevealed={() => setRevealCount((value) => value + 1)}
              />
            </div>
            <p className="text-center font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">
              {reducedMotion
                ? "Reduced motion · data attribute on wrapper"
                : "Full motion · tap the card when revealed"}
            </p>
          </div>

          <div className="flex flex-col gap-5">
            <section className="border-2 border-zinc-800 bg-zinc-950/60 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-violet-300">
                  Phase
                </h2>
                <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                  {phase}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {PHASES.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={`${buttonBase} ${
                      phase === entry.id ? buttonOn : buttonOff
                    }`}
                    aria-pressed={phase === entry.id}
                    onClick={() => choosePhase(entry.id)}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
              <p className="mt-3 font-mono text-[11px] leading-relaxed text-zinc-400">
                {activeNote}
              </p>
            </section>

            <section className="border-2 border-zinc-800 bg-zinc-950/60 p-4">
              <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-violet-300">
                Result
              </h2>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  className={`${buttonBase} ${
                    phase === "revealed" && resultKey === "common"
                      ? buttonOn
                      : buttonOff
                  }`}
                  aria-pressed={phase === "revealed" && resultKey === "common"}
                  onClick={() => chooseResult("common")}
                >
                  Common · one payout
                  <span className="mt-1 block font-mono text-[9px] normal-case tracking-normal text-zinc-400">
                    NVDAx 0.0036 · $0.73
                  </span>
                </button>
                <button
                  type="button"
                  className={`${buttonBase} ${
                    phase === "revealed" && resultKey === "legendary"
                      ? buttonOn
                      : buttonOff
                  }`}
                  aria-pressed={
                    phase === "revealed" && resultKey === "legendary"
                  }
                  onClick={() => chooseResult("legendary")}
                >
                  Legendary · two payouts
                  <span className="mt-1 block font-mono text-[9px] normal-case tracking-normal text-zinc-400">
                    TSLAx + SPYx · $10.00
                  </span>
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={`${buttonBase} ${buttonOff}`}
                  onClick={replay}
                >
                  Replay reveal
                </button>
                <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                  onRevealed fired {revealCount}×
                </span>
              </div>
            </section>

            <section className="border-2 border-zinc-800 bg-zinc-950/60 p-4">
              <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-violet-300">
                Motion
              </h2>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-violet-500"
                  checked={reducedMotion}
                  onChange={(event) => {
                    setReducedMotion(event.target.checked);
                    setRun((value) => value + 1);
                    setRevealCount(0);
                  }}
                />
                <span className="font-mono text-[11px] leading-relaxed text-zinc-300">
                  Reduced motion
                  <span className="mt-1 block text-[10px] normal-case tracking-normal text-zinc-400">
                    Adds data-reduced-motion=&quot;true&quot; to the wrapper and
                    remounts the machine. The OS pref is also honoured.
                  </span>
                </span>
              </label>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-zinc-800 pt-3 font-mono text-[9px] uppercase tracking-wider text-zinc-400">
                <span>common 98% · $0.73</span>
                <span>legendary 2% · $10.00</span>
                <span>1 USDC / pull</span>
              </div>
            </section>

            <section className="border-2 border-dashed border-zinc-800 p-4">
              <h2 className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-400">
                Review checklist
              </h2>
              <ul className="space-y-1.5 font-mono text-[10px] leading-relaxed text-zinc-400">
                <li>· Card dispenses on confirming, then jitters on drawing.</li>
                <li>· Reveal is a button: Tab, Enter and Space all tear.</li>
                <li>· Focus ring is visible on the card and explorer link.</li>
                <li>· Live region announces Drawing and the payout.</li>
                <li>· Legendary: one flash + 40 confetti, reduced: static gold.</li>
                <li>· 360 px wide: machine, tray and result stay in frame.</li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
