"use client";

import { useSyncExternalStore } from "react";

/**
 * A tiny shared wall clock. Server snapshot is 0 so prerendering never reads
 * the current time; after hydration the store ticks every 30s and every
 * subscriber sees the same value.
 */
let now = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function tick() {
  now = Date.now();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  if (timer === null) {
    tick();
    timer = setInterval(tick, 30_000);
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot() {
  return now;
}

function getServerSnapshot() {
  return 0;
}

export function useNow() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
