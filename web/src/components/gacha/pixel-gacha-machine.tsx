"use client";

import { Pixelify_Sans } from "next/font/google";
import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";

import { Confetti } from "./confetti";
import "./gacha.css";
import type { GachaPhase, GachaPayout, GachaResult } from "./types";
import { useReducedMotion } from "./use-reduced-motion";

const pixelFont = Pixelify_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-pixel",
});

const EMBLEMS: Record<string, string> = {
  TSLAx: "/sprites/emblem_tsla.png",
  AAPLx: "/sprites/emblem_aapl.png",
  NVDAx: "/sprites/emblem_nvda.png",
  SPYx: "/sprites/emblem_spy.png",
};

const TEAR_MS = 280;
const ENTER_MS = 200;

const s = {
  amount: "gm-amount",
  cardBackImg: "gm-cardBackImg",
  cardButton: "gm-cardButton",
  cardFace: "gm-cardFace",
  cardMotion: "gm-cardMotion",
  cardSlot: "gm-cardSlot",
  common: "gm-common",
  confetti: "gm-confetti",
  dispense: "gm-dispense",
  dot: "gm-dot",
  dots: "gm-dots",
  emptyCard: "gm-emptyCard",
  emptyCoin: "gm-emptyCoin",
  emptySub: "gm-emptySub",
  emptyTitle: "gm-emptyTitle",
  errorCard: "gm-errorCard",
  errorMark: "gm-errorMark",
  errorText: "gm-errorText",
  explorer: "gm-explorer",
  faceEmblem: "gm-faceEmblem",
  faceWrap: "gm-faceWrap",
  goldFlash: "gm-goldFlash",
  hintKey: "gm-hintKey",
  jitter: "gm-jitter",
  legendary: "gm-legendary",
  live: "gm-live",
  machineArea: "gm-machineArea",
  machineGlow: "gm-machineGlow",
  machineImg: "gm-machineImg",
  payoutList: "gm-payoutList",
  payoutRow: "gm-payoutRow",
  payoutText: "gm-payoutText",
  payoutTop: "gm-payoutTop",
  pullId: "gm-pullId",
  pulse: "gm-pulse",
  rarity: "gm-rarity",
  resultBody: "gm-resultBody",
  resultFoot: "gm-resultFoot",
  resultHead: "gm-resultHead",
  resultPanel: "gm-resultPanel",
  resultWrap: "gm-resultWrap",
  root: "gm-root",
  rowEmblem: "gm-rowEmblem",
  sparkIcon: "gm-sparkIcon",
  srOnly: "gm-srOnly",
  stage: "gm-stage",
  staticGold: "gm-staticGold",
  statusRow: "gm-statusRow",
  statusText: "gm-statusText",
  symbol: "gm-symbol",
  tearBottom: "gm-tearBottom",
  tearHalf: "gm-tearHalf",
  tearHint: "gm-tearHint",
  tearTop: "gm-tearTop",
  tray: "gm-tray",
  trayBay: "gm-trayBay",
  trayInner: "gm-trayInner",
  trayLabel: "gm-trayLabel",
  trayTitle: "gm-trayTitle",
  usd: "gm-usd",
  value: "gm-value",
  valueLabel: "gm-valueLabel",
  valueLine: "gm-valueLine",
  walletDot: "gm-walletDot",
  walletNote: "gm-walletNote",
} as const;


export type PixelGachaMachineProps = {
  phase: GachaPhase;
  result?: GachaResult;
  onRevealed?: () => void;
};

function emblemFor(symbol: string): string {
  return EMBLEMS[symbol] ?? "/sprites/spark.png";
}

function payoutSummary(payouts: GachaPayout[], valueUsd: string): string {
  const list = payouts
    .map((payout) => `${payout.amount} ${payout.symbol}`)
    .join(", ");
  return `You pulled ${list || "nothing"}, about $${valueUsd}`;
}

function announcementFor(
  phase: GachaPhase,
  result: GachaResult | undefined,
  opened: boolean,
): string {
  switch (phase) {
    case "idle":
      return "Gacha machine ready. One USDC per pull.";
    case "approving":
      return "Approve one USDC in your wallet.";
    case "confirming":
      return "Confirming your pull on Monad.";
    case "drawing":
      return "Drawing...";
    case "revealed":
      if (!result) return "Waiting for your card.";
      return opened
        ? payoutSummary(result.payouts, result.valueUsd)
        : "Your card is ready. Tear it open.";
    case "error":
      return "Something went wrong with your pull. Please try again.";
  }
}

function statusFor(phase: GachaPhase, result: GachaResult | undefined, opened: boolean) {
  switch (phase) {
    case "idle":
      return "Ready · 1 USDC per pull";
    case "approving":
      return "Approve 1 USDC in your wallet";
    case "confirming":
      return "Confirming on Monad...";
    case "drawing":
      return "Pyth is drawing";
    case "revealed":
      if (!result) return "Waiting for your card";
      return opened ? "In your wallet" : "One tap to tear it open";
    case "error":
      return "Pull failed · try again";
  }
}

export function PixelGachaMachine({
  phase,
  result,
  onRevealed,
}: PixelGachaMachineProps): JSX.Element {
  const reducedMotion = useReducedMotion();
  const [openedKey, setOpenedKey] = useState<string | null>(null);
  const [tearingKey, setTearingKey] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  const revealedRef = useRef(onRevealed);

  // The key changes whenever the parent moves to a different pull or phase, so
  // face-down / tearing state resets without an effect.
  const sessionKey = `${phase}:${result?.pullId ?? ""}`;
  const opened = openedKey === sessionKey;
  const tearing = tearingKey === sessionKey;

  useEffect(() => {
    revealedRef.current = onRevealed;
  }, [onRevealed]);

  // Cancel callbacks belonging to a previous session or an unmounted machine.
  useEffect(() => {
    return () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current = [];
    };
  }, [sessionKey]);

  const canTear = phase === "revealed" && Boolean(result) && !opened;
  const isDrawing = phase === "drawing";
  const showResult = phase === "revealed" && opened && Boolean(result);
  const showCard =
    phase === "confirming" || phase === "drawing" || canTear;

  const handleTear = () => {
    if (!canTear || tearing || !result) return;

    if (reducedMotion) {
      setOpenedKey(sessionKey);
      const timer = window.setTimeout(() => {
        revealedRef.current?.();
      }, 0);
      timers.current.push(timer);
      return;
    }

    setTearingKey(sessionKey);
    const revealTimer = window.setTimeout(
      () => setOpenedKey(sessionKey),
      TEAR_MS,
    );
    const notifyTimer = window.setTimeout(
      () => revealedRef.current?.(),
      TEAR_MS + ENTER_MS,
    );
    timers.current.push(revealTimer, notifyTimer);
  };

  const liveMessage = announcementFor(phase, result, opened);
  const status = statusFor(phase, result, opened);
  const primaryPayout = result?.payouts[0];
  const faceSrc = result?.legendary
    ? "/sprites/card_legendary.png"
    : "/sprites/card_common.png";

  let bayLabel = "BAY 01";
  if (phase === "approving") bayLabel = "APPROVE";
  if (phase === "confirming") bayLabel = "DISPENSING";
  if (phase === "drawing") bayLabel = "DRAWING";
  if (phase === "error") bayLabel = "FAULT";
  if (phase === "revealed" && result && opened) bayLabel = `PULL #${result.pullId}`;

  let emptyTitle = "1 USDC";
  let emptySub = "PER PULL";
  if (phase === "approving") {
    emptyTitle = "APPROVE";
    emptySub = "IN YOUR WALLET";
  }
  if (phase === "revealed" && !result) {
    emptyTitle = "WAIT";
    emptySub = "FOR THE DRAW";
  }

  return (
    <section
      className={`${pixelFont.variable} ${pixelFont.className} ${s.root}`}
      data-phase={phase}
      data-reduced-motion={reducedMotion ? "true" : undefined}
      aria-label="Claw machine card gacha"
    >
      <div className={s.stage}>
        <div className={s.machineArea}>
          <div className={s.machineGlow} aria-hidden="true" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={s.machineImg}
            src="/sprites/machine.png"
            alt="Pixel-art claw machine with a glass dome full of stock cards"
            width={64}
            height={80}
            draggable={false}
          />
        </div>

        <div className={s.tray}>
          <div className={s.trayLabel}>
            <span className={s.trayTitle}>OUTPUT TRAY</span>
            <span className={s.trayBay}>{bayLabel}</span>
          </div>

          <div className={s.trayInner}>
            {showCard && (
              <div className={s.cardSlot} data-tearing={tearing ? "true" : undefined}>
                <div
                  className={`${s.cardMotion} ${
                    phase === "confirming" && !reducedMotion ? s.dispense : ""
                  } ${isDrawing && !reducedMotion ? s.jitter : ""} ${
                    isDrawing && reducedMotion ? s.pulse : ""
                  }`}
                >
                  {canTear ? (
                    <button
                      type="button"
                      className={s.cardButton}
                      onClick={handleTear}
                      disabled={tearing}
                      aria-label="Tear open your card"
                    >
                      {tearing ? (
                        <>
                          <span
                            className={`${s.tearHalf} ${s.tearTop}`}
                            aria-hidden="true"
                          />
                          <span
                            className={`${s.tearHalf} ${s.tearBottom}`}
                            aria-hidden="true"
                          />
                        </>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          className={s.cardBackImg}
                          src="/sprites/card_back.png"
                          alt=""
                          width={24}
                          height={32}
                          draggable={false}
                        />
                      )}
                    </button>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className={s.cardBackImg}
                      src="/sprites/card_back.png"
                      alt=""
                      width={24}
                      height={32}
                      draggable={false}
                    />
                  )}
                </div>
                <span className={s.tearHint} aria-hidden="true">
                  {canTear ? (
                    <>
                      <span className={s.hintKey}>↵</span> TAP TO TEAR
                    </>
                  ) : (
                    "PLEASE WAIT"
                  )}
                </span>
              </div>
            )}

            {!showCard && phase !== "error" && phase !== "revealed" && (
              <div className={s.emptyCard}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className={s.emptyCoin}
                  src="/sprites/coin.png"
                  alt=""
                  width={8}
                  height={8}
                  draggable={false}
                />
                <span className={s.emptyTitle}>{emptyTitle}</span>
                <span className={s.emptySub}>{emptySub}</span>
              </div>
            )}

            {phase === "revealed" && !showResult && !showCard && (
              <div className={s.emptyCard}>
                <span className={s.emptyTitle}>{emptyTitle}</span>
                <span className={s.emptySub}>{emptySub}</span>
              </div>
            )}

            {phase === "error" && (
              <div className={s.errorCard} role="img" aria-label="Pull failed">
                <span className={s.errorMark}>!</span>
                <span className={s.errorText}>NO PULL</span>
              </div>
            )}

            {showResult && result && (
              <div className={s.resultWrap}>
                <div
                  className={`${s.resultPanel} ${
                    result.legendary ? s.legendary : s.common
                  } ${result.legendary && reducedMotion ? s.staticGold : ""}`}
                  data-rarity={result.legendary ? "legendary" : "common"}
                >
                  <div className={s.resultHead}>
                    <span className={s.rarity}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        className={s.sparkIcon}
                        src="/sprites/spark.png"
                        alt=""
                        width={4}
                        height={4}
                        draggable={false}
                      />
                      {result.legendary ? "LEGENDARY" : "COMMON"}
                    </span>
                    <span className={s.pullId}>PULL #{result.pullId}</span>
                  </div>

                  <div className={s.resultBody}>
                    <div className={s.faceWrap}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        className={s.cardFace}
                        src={faceSrc}
                        alt=""
                        width={24}
                        height={32}
                        draggable={false}
                      />
                      {primaryPayout && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          className={s.faceEmblem}
                          src={emblemFor(primaryPayout.symbol)}
                          alt=""
                          width={16}
                          height={16}
                          draggable={false}
                        />
                      )}
                    </div>

                    <div className={s.payoutList}>
                      {result.payouts.map((payout, index) => (
                        <div
                          className={s.payoutRow}
                          key={`${payout.symbol}-${index}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            className={s.rowEmblem}
                            src={emblemFor(payout.symbol)}
                            alt=""
                            width={16}
                            height={16}
                            draggable={false}
                          />
                          <div className={s.payoutText}>
                            <div className={s.payoutTop}>
                              <span className={s.symbol}>{payout.symbol}</span>
                              <span className={s.usd}>${payout.usd}</span>
                            </div>
                            <span className={s.amount}>{payout.amount}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className={s.valueLine}>
                    <span className={s.valueLabel}>TOTAL VALUE</span>
                    <span className={s.value}>${result.valueUsd}</span>
                  </div>

                  <div className={s.resultFoot}>
                    <span className={s.walletNote}>
                      <span className={s.walletDot} aria-hidden="true" />
                      IN YOUR WALLET
                    </span>
                    {result.explorerUrl && (
                      <a
                        className={s.explorer}
                        href={result.explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        VIEW TX <span aria-hidden="true">↗</span>
                        <span className={s.srOnly}> (opens in a new tab)</span>
                      </a>
                    )}
                  </div>
                </div>

                {result.legendary && !reducedMotion && (
                  <>
                    <div className={s.goldFlash} aria-hidden="true" />
                    <Confetti />
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={s.statusRow} aria-hidden="true">
        <span className={s.statusText}>
          {status}
          {isDrawing && (
            <span className={s.dots}>
              <span className={s.dot} />
              <span className={s.dot} />
              <span className={s.dot} />
            </span>
          )}
        </span>
      </div>

      <p className={s.live} aria-live="polite" aria-atomic="true">
        {liveMessage}
      </p>
    </section>
  );
}
