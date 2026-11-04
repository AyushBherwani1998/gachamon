"use client";

import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import { createPortal } from "react-dom";

import { Confetti } from "./confetti";
import { haptic } from "./haptics";
import { sfx } from "./sfx";
import { SoundToggle } from "./sound-toggle";
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

/** How long the pack rests after it lands, or after an abandoned tear. */
const TEMPT_DELAY_MS = 900;
const TEMPT_MS_PER_SWING = 85;
const TEMPT_SETTLE_MS = 140;
const LEGENDARY_RATTLE = 1.35;
/** The wobble keeps going, but its sound and buzz stop before they can get annoying. */
const TEMPT_SOUND_BURSTS = 5;
/**
 * The pack gets more restless the longer it's left alone, then holds at the
 * last burst. `swings` are degrees from upright; `peek` lifts the foil strip
 * (as tear progress) so each burst also points at where to tear.
 */
const TEMPT_BURSTS = [
  { swings: [-1.2, 1.2, -0.6], peek: 0.06, rest: 1800 },
  { swings: [-2, 2, -1.4, 0.8], peek: 0.1, rest: 1500 },
  { swings: [-3, 3, -2.4, 2, -1.2, 0.6], peek: 0.14, rest: 1300 },
] as const;

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
  const temptRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const peeledRef = useRef<HTMLImageElement>(null);
  const attachedRef = useRef<HTMLImageElement>(null);
  const hitRef = useRef<HTMLButtonElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const frame = useRef(0);
  const finishing = useRef(false);
  const peeking = useRef(false);
  const ripTooth = useRef(0);
  const tearBuzzed = useRef(false);
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

  // One tick per tooth of the tear line, so the sound follows the finger.
  const playRip = (progress: number) => {
    const tooth = Math.floor((progress * PACK_W) / TOOTH);
    if (tooth <= ripTooth.current) return;
    ripTooth.current = tooth;
    sfx.rip(progress);
    // After the swipe's final buzz, another tick would cut it short.
    if (!tearBuzzed.current) haptic.rip(progress);
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
      const progress = from + (to - from) * ease(t);
      paint(progress, direction);
      if (finishing.current) playRip(progress);
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
    sfx.tearDone();
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
    // Fired here, not when the strip leaves: on letting go this is still inside
    // the touch, which iOS needs, and the reveal's pattern can't cancel it.
    tearBuzzed.current = true;
    haptic.tearDone();

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
      ripTooth.current = 0;
      haptic.grab();
      // Drop an idle foil peek so the real tear starts from a closed pack.
      if (peeking.current) {
        peeking.current = false;
        paint(0, 1);
      }
      setGripped(true);
    },
    onProgress: (progress, direction) => {
      paint(progress, direction);
      playRip(progress);
    },
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

  // Idle wobble: short bursts with long rests, so it reads as the pack wanting
  // to be opened rather than as a loading state. Stops as soon as it's touched.
  const legendary = result.legendary;
  useEffect(() => {
    const tempt = temptRef.current;
    if (!tempt || gripped || tearing || reducedMotion) return;

    let burst = 0;
    let running: Animation | null = null;
    let timer = 0;

    const playBurst = () => {
      const { swings, peek, rest } =
        TEMPT_BURSTS[Math.min(burst, TEMPT_BURSTS.length - 1)];
      burst += 1;

      const rattle = legendary ? LEGENDARY_RATTLE : 1;
      if (burst <= TEMPT_SOUND_BURSTS && !document.hidden) {
        sfx.rattle(swings.length, TEMPT_MS_PER_SWING / 1000, rattle);
        haptic.rattle(swings.length, TEMPT_MS_PER_SWING, legendary);
      }
      const keyframes = [0, ...swings, 0].map((degrees) => ({
        transform: `rotate(${degrees * rattle}deg)`,
        easing: "cubic-bezier(0.37, 0, 0.63, 1)",
      }));
      running = tempt.animate(keyframes, {
        duration: (swings.length + 1) * TEMPT_MS_PER_SWING,
      });
      running.onfinish = () => {
        running = null;
        timer = window.setTimeout(playBurst, rest);
      };

      peeking.current = true;
      animate(0, peek, 160, EASE_OUT, 1, () => {
        animate(peek, 0, 220, EASE_IN_OUT, 1, () => {
          peeking.current = false;
        });
      });
    };

    timer = window.setTimeout(playBurst, TEMPT_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
      if (!running) return;
      // Ease back from wherever the swing is, so a grab never makes it snap.
      const current = getComputedStyle(tempt).transform;
      running.cancel();
      tempt.animate([{ transform: current }, { transform: "none" }], {
        duration: TEMPT_SETTLE_MS,
        easing: "cubic-bezier(0.23, 1, 0.32, 1)",
      });
    };
    // `animate` only touches refs, so a stale closure of it is safe here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gripped, tearing, reducedMotion, legendary]);

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

  const hasPayout = result.payouts.length > 0;
  const revealSounded = useRef(false);
  useEffect(() => {
    if (!torn || revealSounded.current) return;
    revealSounded.current = true;
    // No fanfare when there's nothing to celebrate.
    if (hasPayout) {
      sfx.reveal(result.legendary);
      haptic.reveal(result.legendary);
    }
  }, [torn, hasPayout, result.legendary]);

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

      <SoundToggle />

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
          <div ref={temptRef} className="gm-packTempt">
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
