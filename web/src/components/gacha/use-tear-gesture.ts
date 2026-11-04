"use client";

import { useRef } from "react";
import type { MouseEvent, PointerEvent } from "react";

export type TearDirection = 1 | -1;

const LOCK_PX = 6;
const FINISH_AT = 0.92;
const RELEASE_AT = 0.55;
const FLICK_PX_PER_MS = 0.5;
const FLICK_MIN_PROGRESS = 0.15;
const TAP_MAX_PX = 8;
const TAP_MAX_MS = 300;
const VELOCITY_WINDOW_MS = 80;
/** A full tear takes 80% of the pack's width, so it finishes before the edge. */
const TRAVEL = 0.8;

type Active = {
  id: number;
  type: string;
  startX: number;
  startedAt: number;
  direction: TearDirection | 0;
  furthest: number;
  progress: number;
  samples: { x: number; t: number }[];
};

export type TearGestureOptions = {
  enabled: boolean;
  onGrab: () => void;
  onProgress: (progress: number, direction: TearDirection) => void;
  /** The swipe went far or fast enough. */
  onFinish: (progress: number, direction: TearDirection) => void;
  /** Let go early, or the browser cancelled the pointer. */
  onRelease: (progress: number) => void;
  /** Touch tap, or a keyboard / assistive-tech click. Never a mouse click. */
  onAutoTear: () => void;
};

/**
 * Hold and swipe to tear. A mouse must press and swipe; a plain click does
 * nothing. Touch can also tap, and the keyboard opens through the button click.
 */
export function useTearGesture({
  enabled,
  onGrab,
  onProgress,
  onFinish,
  onRelease,
  onAutoTear,
}: TearGestureOptions) {
  const active = useRef<Active | null>(null);

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    // The first pointer owns the gesture, so a second finger can't jump it.
    if (!enabled || active.current) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    active.current = {
      id: event.pointerId,
      type: event.pointerType,
      startX: event.clientX,
      startedAt: event.timeStamp,
      direction: 0,
      furthest: 0,
      progress: 0,
      samples: [{ x: event.clientX, t: event.timeStamp }],
    };
    onGrab();
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const gesture = active.current;
    if (!gesture || gesture.id !== event.pointerId) return;

    const dx = event.clientX - gesture.startX;
    gesture.furthest = Math.max(gesture.furthest, Math.abs(dx));
    gesture.samples.push({ x: event.clientX, t: event.timeStamp });
    gesture.samples = gesture.samples.filter(
      (sample) => event.timeStamp - sample.t <= VELOCITY_WINDOW_MS,
    );

    if (gesture.direction === 0) {
      if (Math.abs(dx) < LOCK_PX) return;
      gesture.direction = dx > 0 ? 1 : -1;
    }

    const travel = event.currentTarget.getBoundingClientRect().width * TRAVEL;
    const progress = Math.min(
      1,
      Math.max(0, (dx * gesture.direction) / Math.max(1, travel)),
    );
    gesture.progress = progress;
    onProgress(progress, gesture.direction);

    if (progress >= FINISH_AT) {
      active.current = null;
      onFinish(progress, gesture.direction);
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    const gesture = active.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    active.current = null;

    const isTap =
      gesture.type !== "mouse" &&
      gesture.furthest < TAP_MAX_PX &&
      event.timeStamp - gesture.startedAt < TAP_MAX_MS;
    if (isTap) {
      onRelease(0);
      onAutoTear();
      return;
    }

    const first = gesture.samples[0];
    const last = gesture.samples[gesture.samples.length - 1];
    const elapsed = last && first ? last.t - first.t : 0;
    const velocity =
      elapsed > 0 && gesture.direction !== 0
        ? ((last.x - first.x) * gesture.direction) / elapsed
        : 0;
    const flicked =
      velocity >= FLICK_PX_PER_MS && gesture.progress >= FLICK_MIN_PROGRESS;

    if (gesture.direction !== 0 && (gesture.progress >= RELEASE_AT || flicked)) {
      onFinish(gesture.progress, gesture.direction);
    } else {
      onRelease(gesture.progress);
    }
  };

  const onPointerCancel = (event: PointerEvent<HTMLElement>) => {
    const gesture = active.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    active.current = null;
    onRelease(gesture.progress);
  };

  // Keyboard and assistive-tech clicks report detail 0; real mouse and touch
  // clicks report 1 or more and are handled by the pointer events above.
  const onClick = (event: MouseEvent<HTMLElement>) => {
    if (enabled && event.detail === 0) onAutoTear();
  };

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClick };
}
