"use client";

import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import { createPortal } from "react-dom";

import { Confetti } from "./confetti";
import type { GachaResult } from "./types";
import { useTearGesture, type TearDirection } from "./use-tear-gesture";

const PACK_W = 48;
const PACK_H = 64;
/** The foil strip is rows 0-9 of the pack sprite. */
const TEAR_ROW = 10;
const TOOTH = 3;

const EASE_OUT = (t: number) => 1 - Math.pow(1 - t, 3);
const EASE_IN_OUT = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const EMBLEMS: Record<string, string> = {
  TSLAx: "/sprites/emblem_tsla.png",
  AAPLx: "/sprites/emblem_aapl.png",
  NVDAx: "/sprites/emblem_nvda.png",
  SPYx: "/sprites/emblem_spy.png",
};

export function emblemFor(symbol: string): string {
  return EMBLEMS[symbol] ?? "/sprites/spark.png";
}

const pct = (value: number, of: number) => `${(value / of) * 100}%`;
const point = (x: number, y: number) => `${pct(x, PACK_W)} ${pct(y, PACK_H)}`;

/** Square teeth along the tear line, so the rip edge stays on the pixel grid. */
function toothRow(x: number): number {
  return TEAR_ROW + (Math.floor(x / TOOTH) % 2 === 0 ? 1 : -1);
}

function tearLine(from: number, to: number, overlap = 0): string[] {
  const points: string[] = [];
  const step = from < to ? 1 : -1;
  let x = from;
  while (x !== to) {
    const toothStart = step > 0 ? x : x - 1;
    let next = x + step;
    while (
      next !== to &&
      toothRow(step > 0 ? next : next - 1) === toothRow(toothStart)
    ) {
      next += step;
    }
    const row = toothRow(toothStart) + overlap;
    points.push(point(x, row), point(next, row));
    x = next;
  }
  return points;
}

function stripClip(from: number, to: number): string {
  if (from >= to) return "polygon(0 0, 0 0, 0 0)";
  // The strip overlaps the body slightly: both draw the same image, so the
  // overlap is invisible and hides the anti-aliased hairline along the seam.
  return `polygon(${[point(from, 0), point(to, 0), ...tearLine(to, from, 0.4)].join(", ")})`;
}

const BODY_CLIP = `polygon(${[
  ...tearLine(0, PACK_W),
  point(PACK_W, PACK_H),
  point(0, PACK_H),
].join(", ")})`;

function packScale(): number {
  const scale = Math.floor(
    Math.min((window.innerWidth * 0.82) / PACK_W, (window.innerHeight * 0.64) / PACK_H),
  );
  return Math.max(3, scale);
}

export type PackTearProps = {
  result: GachaResult;
  reducedMotion: boolean;
  fontClassName: string;
  /** Closed before tearing: the pack goes back to the tray. */
  onDismiss: () => void;
  /** Finished looking at the revealed card. */
  onContinue: () => void;
};

export function PackTear({
  result,
  reducedMotion,
  fontClassName,
  onDismiss,
  onContinue,
}: PackTearProps): JSX.Element {
  const [scale, setScale] = useState(packScale);
  const [torn, setTorn] = useState(false);
  const [gripped, setGripped] = useState(false);
  const [tearing, setTearing] = useState(false);

  const groupRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const peeledRef = useRef<HTMLImageElement>(null);
  const attachedRef = useRef<HTMLImageElement>(null);
  const hitRef = useRef<HTMLButtonElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const frame = useRef(0);
  const finishing = useRef(false);
  const lastDirection = useRef<TearDirection>(1);

  const packSrc = result.legendary
    ? "/sprites/pack_legendary.png"
    : "/sprites/pack_rare.png";
  const tierName = result.legendary ? "Legendary" : "Rare";

  // Progress goes straight to the DOM: a pointer move never re-renders React.
  const paint = (progress: number, direction: TearDirection) => {
    lastDirection.current = direction;
    const moved = Math.round(progress * PACK_W);
    const rip = direction > 0 ? moved : PACK_W - moved;
    const peeled = peeledRef.current;
    const attached = attachedRef.current;
    const tilt = tiltRef.current;
    if (!peeled || !attached || !tilt) return;

    peeled.style.clipPath =
      direction > 0 ? stripClip(0, rip) : stripClip(rip, PACK_W);
    attached.style.clipPath =
      direction > 0 ? stripClip(rip, PACK_W) : stripClip(0, rip);
    peeled.style.transformOrigin = `${pct(rip, PACK_W)} ${pct(TEAR_ROW, PACK_H)}`;
    const angle = moved === 0 ? 0 : Math.round(3 + progress * 16);
    peeled.style.transform = `rotate(${angle * direction}deg)`;
    tilt.style.transform = `rotate(${(progress * direction * 1.5).toFixed(2)}deg)`;
  };

  const animate = (
    from: number,
    to: number,
    duration: number,
    ease: (t: number) => number,
    direction: TearDirection,
    done?: () => void,
  ) => {
    cancelAnimationFrame(frame.current);
    const startedAt = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - startedAt) / duration);
      paint(from + (to - from) * ease(t), direction);
      if (t < 1) {
        frame.current = requestAnimationFrame(step);
      } else {
        done?.();
      }
    };
    frame.current = requestAnimationFrame(step);
  };

  const completeTear = (direction: TearDirection) => {
    const peeled = peeledRef.current;
    const group = groupRef.current;
    setTorn(true);
    if (!peeled || !group) return;

    // The strip leaves first; the empty pack then falls away from the card.
    peeled.animate(
      [
        { transform: peeled.style.transform, opacity: 1 },
        {
          transform: `translate(${direction * 70}%, -34%) rotate(${direction * 38}deg)`,
          opacity: 0,
        },
      ],
      { duration: 340, easing: "cubic-bezier(0.23, 1, 0.32, 1)", fill: "forwards" },
    );
    group.animate(
      [
        { transform: "translateY(0)", opacity: 1, offset: 0 },
        { transform: "translateY(4%)", opacity: 1, offset: 0.25 },
        { transform: "translateY(96%)", opacity: 0, offset: 1 },
      ],
      { duration: 460, easing: "cubic-bezier(0.32, 0.72, 0, 1)", fill: "forwards" },
    );
  };

  const finish = (from: number, direction: TearDirection, duration: number) => {
    if (finishing.current) return;
    finishing.current = true;
    setTearing(true);
    setGripped(false);

    if (reducedMotion) {
      setTorn(true);
      return;
    }
    animate(from, 1, duration, EASE_OUT, direction, () => completeTear(direction));
  };

  const gesture = useTearGesture({
    enabled: !tearing && !reducedMotion,
    onGrab: () => {
      cancelAnimationFrame(frame.current);
      setGripped(true);
    },
    onProgress: (progress, direction) => paint(progress, direction),
    onFinish: (progress, direction) => finish(progress, direction, 110),
    onRelease: (progress) => {
      setGripped(false);
      if (progress > 0) {
        animate(progress, 0, 200, EASE_OUT, lastDirection.current);
      }
    },
    onAutoTear: () => {
      if (finishing.current) return;
      finishing.current = true;
      setTearing(true);
      animate(0, 1, 460, EASE_IN_OUT, 1, () => completeTear(1));
    },
  });

  const handleReducedOpen = () => {
    if (reducedMotion) finish(1, 1, 0);
  };

  // Set the resting pack state once, so the first frame already has its layers.
  useEffect(() => {
    paint(0, 1);
    hitRef.current?.focus({ preventScroll: true });
    return () => cancelAnimationFrame(frame.current);
  }, []);

  useEffect(() => {
    const onResize = () => setScale(packScale());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    if (torn) continueRef.current?.focus({ preventScroll: true });
  }, [torn]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (torn) onContinue();
      else if (!finishing.current) onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [torn, onContinue, onDismiss]);

  const primary = result.payouts[0];
  const cardSrc = result.legendary
    ? "/sprites/card_legendary.png"
    : "/sprites/card_rare.png";
  const noPayout = result.payouts.length === 0;
  const announcement = torn
    ? noPayout
      ? `${tierName} pack. No stock payout was recorded.`
      : `${tierName} pack. You got ${result.payouts
          .map((payout) => `${payout.amount} ${payout.symbol}`)
          .join(", ")}, about $${result.valueUsd}.`
    : `${tierName} pack. ${
        reducedMotion ? "Press to open it." : "Hold and swipe to tear it open, or press Enter."
      }`;

  return createPortal(
    <div
      className={`${fontClassName} gm-vars gm-overlay`}
      data-tier={result.legendary ? "legendary" : "rare"}
      role="dialog"
      aria-modal="true"
      aria-label={`Open your ${tierName} pack`}
      style={{ "--px": `${scale}px` } as React.CSSProperties}
    >
      <p className="gm-live" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      {torn ? (
        <div className="gm-reveal">
          {result.legendary && !reducedMotion ? (
            <>
              <div className="gm-goldFlash" aria-hidden="true" />
              <Confetti />
            </>
          ) : null}

          <div className="gm-revealCard" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="gm-sprite gm-fill" src={cardSrc} alt="" draggable={false} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="gm-sprite gm-cardEmblem"
              src={primary ? emblemFor(primary.symbol) : "/sprites/coin.png"}
              alt=""
              draggable={false}
            />
          </div>

          <div className="gm-revealText">
            <p className="gm-revealTier">{tierName}</p>
            {noPayout ? (
              <p className="gm-revealAmount">No stock payout recorded</p>
            ) : (
              <ul className="gm-revealList">
                {result.payouts.map((payout, index) => (
                  <li key={`${payout.symbol}-${index}`}>
                    <span className="gm-revealSymbol">{payout.symbol}</span>
                    <span className="gm-revealAmount">{payout.amount}</span>
                  </li>
                ))}
              </ul>
            )}
            {noPayout ? null : <p className="gm-revealValue">${result.valueUsd}</p>}
            <button
              ref={continueRef}
              type="button"
              className="gm-continue"
              onClick={onContinue}
            >
              Continue
            </button>
          </div>
        </div>
      ) : null}

      <div
        ref={groupRef}
        className="gm-packGroup"
        data-hidden={torn && reducedMotion ? "true" : undefined}
        data-torn={torn ? "true" : undefined}
        aria-hidden={torn ? "true" : undefined}
      >
        <div className="gm-packGrip" data-gripped={gripped ? "true" : undefined}>
          <div ref={tiltRef} className="gm-packTilt">
            <span className="gm-packMouth" aria-hidden="true" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="gm-sprite gm-fill"
              style={{ clipPath: BODY_CLIP }}
              src={packSrc}
              alt=""
              draggable={false}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={attachedRef}
              className="gm-sprite gm-fill"
              src={packSrc}
              alt=""
              draggable={false}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={peeledRef}
              className="gm-sprite gm-fill"
              src={packSrc}
              alt=""
              draggable={false}
            />

            {!torn ? (
              <button
                ref={hitRef}
                type="button"
                className="gm-packHit"
                aria-label={`Tear open your ${tierName} pack`}
                {...gesture}
                onClick={(event) => {
                  gesture.onClick(event);
                  handleReducedOpen();
                }}
              />
            ) : null}
          </div>
        </div>

        {!tearing ? (
          <p className="gm-tearHint" aria-hidden="true" data-gripped={gripped ? "true" : undefined}>
            {reducedMotion ? (
              "Press to open"
            ) : (
              <>
                <span className="gm-hintMouse">Hold + swipe the pack</span>
                <span className="gm-hintTouch">Swipe or tap the pack</span>
              </>
            )}
            <span className="gm-hintArrows">
              <i />
              <i />
              <i />
            </span>
          </p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
