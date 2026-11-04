"use client";

import { Pixelify_Sans } from "next/font/google";
import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";

import "./gacha.css";
import { emblemFor, PackTear } from "./pack-tear";
import type { GachaPhase, GachaResult } from "./types";
import { useReducedMotion } from "./use-reduced-motion";

const pixelFont = Pixelify_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-pixel",
});

/** Time to watch the pack land in the tray before it fills the screen. */
const DROP_MS = 900;
const DROP_LEGENDARY_MS = 1200;
const DROP_REDUCED_MS = 400;

export type PixelGachaMachineProps = {
  phase: GachaPhase;
  result?: GachaResult;
  onRevealed?: () => void;
};

function announcementFor(
  phase: GachaPhase,
  result: GachaResult | undefined,
  continued: boolean,
): string {
  switch (phase) {
    case "idle":
      return "Gachamon machine ready. One USDC per pack.";
    case "approving":
      return "Approve one USDC in your wallet.";
    case "confirming":
      return "Confirm your pull on Monad.";
    case "drawing":
      return "The machine is drawing your pack.";
    case "revealed":
      if (!result) return "Waiting for your pack.";
      if (continued) return "Your stock is in your wallet.";
      return `A ${result.legendary ? "Legendary" : "Rare"} pack dropped.`;
    case "error":
      return "Something went wrong with your pull. Please try again.";
  }
}

function statusFor(
  phase: GachaPhase,
  result: GachaResult | undefined,
  continued: boolean,
): string {
  switch (phase) {
    case "idle":
      return "Which pack will you get?";
    case "approving":
      return "Approve 1 USDC in your wallet";
    case "confirming":
      return "Confirm your pull";
    case "drawing":
      return "Pyth is drawing";
    case "revealed":
      if (!result) return "Waiting for your pack";
      if (continued) return "In your wallet";
      return result.legendary ? "LEGENDARY PACK!" : "Rare pack dropped";
    case "error":
      return "Pull failed. Try again";
  }
}

export function PixelGachaMachine({
  phase,
  result,
  onRevealed,
}: PixelGachaMachineProps): JSX.Element {
  const reducedMotion = useReducedMotion();
  const [overlayKey, setOverlayKey] = useState<string | null>(null);
  const [continuedKey, setContinuedKey] = useState<string | null>(null);
  const trayPackRef = useRef<HTMLButtonElement>(null);

  // The key changes with each pull, so per-pull state resets without an effect.
  const sessionKey = `${phase}:${result?.pullId ?? ""}`;
  const hasPack = phase === "revealed" && Boolean(result);
  const continued = continuedKey === sessionKey;
  const overlayOpen = hasPack && overlayKey === sessionKey;
  const legendary = Boolean(result?.legendary);

  useEffect(() => {
    if (!hasPack) return;
    const delay = reducedMotion
      ? DROP_REDUCED_MS
      : legendary
        ? DROP_LEGENDARY_MS
        : DROP_MS;
    const timer = window.setTimeout(() => setOverlayKey(sessionKey), delay);
    return () => window.clearTimeout(timer);
  }, [hasPack, legendary, reducedMotion, sessionKey]);

  const handleDismiss = () => {
    setOverlayKey(null);
    requestAnimationFrame(() => trayPackRef.current?.focus());
  };

  const handleContinue = () => {
    setOverlayKey(null);
    setContinuedKey(sessionKey);
    onRevealed?.();
  };

  const status = statusFor(phase, result, continued);
  const primary = result?.payouts[0];
  const packSrc = legendary ? "/sprites/pack_legendary.png" : "/sprites/pack_rare.png";
  const cardSrc = legendary ? "/sprites/card_legendary.png" : "/sprites/card_rare.png";
  const isDrawing = phase === "drawing";
  const isWorking = phase === "confirming" || isDrawing;

  return (
    <section
      className={`${pixelFont.variable} ${pixelFont.className} gm-vars gm-root`}
      data-phase={phase}
      aria-label="Gachamon pack machine"
    >
      <div className={`gm-machine ${isDrawing ? "gm-shake" : ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="gm-sprite gm-fill"
          src="/sprites/machine.png"
          alt="Pixel-art Gachamon machine displaying a Rare pack and a Legendary pack"
          draggable={false}
        />
      </div>

      <div className="gm-tray" data-tier={hasPack ? (legendary ? "legendary" : "rare") : undefined}>
        {hasPack && result && !continued ? (
          <div className="gm-trayDrop" key={result.pullId}>
            {legendary && !reducedMotion ? (
              <span className="gm-dropFlash" aria-hidden="true" />
            ) : null}
            <button
              ref={trayPackRef}
              type="button"
              className="gm-trayPack"
              onClick={() => setOverlayKey(sessionKey)}
              aria-label={`Open your ${legendary ? "Legendary" : "Rare"} pack`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="gm-sprite gm-fill" src={packSrc} alt="" draggable={false} />
            </button>
          </div>
        ) : null}

        {hasPack && result && continued ? (
          <div className="gm-trayResult">
            <span className="gm-trayCard" aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="gm-sprite gm-fill" src={cardSrc} alt="" draggable={false} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="gm-sprite gm-cardEmblem"
                src={primary ? emblemFor(primary.symbol) : "/sprites/coin.png"}
                alt=""
                draggable={false}
              />
            </span>
            <span className="gm-trayValue">
              <strong>{primary?.symbol ?? "No payout"}</strong>
              {primary ? `$${result.valueUsd}` : null}
            </span>
          </div>
        ) : null}

        {!hasPack ? (
          <div className="gm-trayEmpty" data-phase={phase}>
            {phase === "error" ? (
              <span className="gm-trayMark">!</span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className={`gm-sprite gm-trayCoin ${isWorking ? "gm-coinSpin" : ""}`}
                src="/sprites/coin.png"
                alt=""
                draggable={false}
              />
            )}
            <span>{phase === "error" ? "NO PACK" : "1 USDC / PACK"}</span>
          </div>
        ) : null}
      </div>

      <div className="gm-statusRow" aria-hidden="true">
        <span className="gm-statusText" data-tier={hasPack && !continued && legendary ? "legendary" : undefined}>
          {status}
          {isDrawing ? (
            <span className="gm-dots">
              <i />
              <i />
              <i />
            </span>
          ) : null}
        </span>
      </div>

      <p className="gm-live" aria-live="polite" aria-atomic="true">
        {announcementFor(phase, result, continued)}
      </p>

      {overlayOpen && result ? (
        <PackTear
          key={sessionKey}
          result={result}
          reducedMotion={reducedMotion}
          fontClassName={`${pixelFont.variable} ${pixelFont.className}`}
          onDismiss={handleDismiss}
          onContinue={handleContinue}
        />
      ) : null}
    </section>
  );
}
