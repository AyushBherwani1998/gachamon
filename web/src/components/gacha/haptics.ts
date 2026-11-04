import { WebHaptics } from "web-haptics";

/**
 * Vibration for touch devices. Android can vibrate any time after the user's
 * first tap. iOS has no vibration API, so the library clicks a hidden iOS
 * switch instead, which is only expected to work during a real touch.
 */

const ENABLED_KEY = "gachamon:haptics";
/** Short pulses need full intensity: lower values are split into pulses too brief to feel. */
const FULL = 1;
/** Shorter pulses barely spin up many phone motors, so they can't be felt. */
const TICK_MS = 22;
const STRONG_TICK_MS = 30;
const RIP_MIN_MS = 25;
const RIP_MAX_MS = 40;
/** Each call replaces the last, so faster ticks would cut each other off. */
const RIP_GAP_MS = 55;

let instance: WebHaptics | null = null;
let lastRipAt = 0;
let enabledLoaded = false;
let enabled = true;
const listeners = new Set<() => void>();

function loadEnabled(): boolean {
  if (enabledLoaded) return enabled;
  enabledLoaded = true;
  try {
    enabled = window.localStorage.getItem(ENABLED_KEY) !== "0";
  } catch {
    enabled = true;
  }
  return enabled;
}

export function isHapticsEnabled(): boolean {
  return loadEnabled();
}

export function subscribeHaptics(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setHapticsEnabled(next: boolean): void {
  loadEnabled();
  enabled = next;
  try {
    window.localStorage.setItem(ENABLED_KEY, next ? "1" : "0");
  } catch {
    // Private windows can refuse storage; the choice still lasts this visit.
  }
  listeners.forEach((listener) => listener());
}

type Pattern = Parameters<WebHaptics["trigger"]>[0];

function fire(pattern: Pattern): void {
  if (!loadEnabled()) return;
  // Off on desktop, where the library would otherwise add a hidden control.
  if (!window.matchMedia("(pointer: coarse)").matches) return;
  instance ??= new WebHaptics();
  void instance.trigger(pattern);
}

const pulse = (duration: number, delay?: number) => ({
  duration,
  intensity: FULL,
  ...(delay ? { delay } : {}),
});

export const haptic = {
  /** A control was pressed. */
  press(): void {
    fire([pulse(20)]);
  },

  /** The pull went through and the machine took the coin. */
  coin(): void {
    fire([pulse(15), pulse(25, 70)]);
  },

  /** The pack lands in the tray. Timed to the visual landing, like the sound. */
  drop(legendary: boolean): void {
    fire(
      legendary
        ? [pulse(45, 160), pulse(20, 90), pulse(20, 60)]
        : [pulse(40, 160)],
    );
  },

  /** One tap per swing of the idle wobble. */
  rattle(swings: number, swingMs: number, strong: boolean): void {
    const duration = strong ? STRONG_TICK_MS : TICK_MS;
    fire(Array.from({ length: swings }, () => pulse(duration, swingMs - duration)));
  },

  /** The pack was grabbed. */
  grab(): void {
    fire([pulse(TICK_MS)]);
  },

  /** One tooth of the tear line giving way; it gets stronger along the tear. */
  rip(progress: number): void {
    const now = performance.now();
    if (now - lastRipAt < RIP_GAP_MS) return;
    lastRipAt = now;
    fire([pulse(Math.round(RIP_MIN_MS + (RIP_MAX_MS - RIP_MIN_MS) * progress))]);
  },

  /** The tear has gone far enough to finish. */
  tearDone(): void {
    fire([pulse(70)]);
  },

  reveal(legendary: boolean): void {
    fire(
      legendary
        ? [pulse(50), pulse(50, 70), pulse(50, 70), pulse(220, 70)]
        : [pulse(30), pulse(45, 60)],
    );
  },

  error(): void {
    fire([pulse(40), pulse(40, 50), pulse(40, 50)]);
  },
};
