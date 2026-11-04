"use client";

import { useSyncExternalStore } from "react";
import type { JSX } from "react";

import { isMuted, setMuted, sfx, subscribeMuted } from "./sfx";

// The server can't know the saved choice, so the first render assumes sound on.
const serverMuted = () => false;

export function SoundToggle(): JSX.Element {
  const muted = useSyncExternalStore(subscribeMuted, isMuted, serverMuted);

  return (
    <button
      type="button"
      className="gm-soundToggle"
      aria-label="Mute sound effects"
      aria-pressed={muted}
      onClick={() => {
        setMuted(!muted);
        // Muting is its own confirmation; unmuting proves sound is back.
        if (muted) sfx.blip();
      }}
    >
      <svg viewBox="0 0 12 12" width="24" height="24" shapeRendering="crispEdges" aria-hidden="true">
        <path fill="currentColor" d="M0 4h2v4H0zM2 3h1v6H2zM3 2h1v8H3zM4 1h1v10H4z" />
        {muted ? (
          <path
            fill="currentColor"
            d="M7 4h1v1H7zM8 5h1v1H8zM9 6h1v1H9zM10 7h1v1h-1zM10 4h1v1h-1zM9 5h1v1H9zM8 6h1v1H8zM7 7h1v1H7z"
          />
        ) : (
          <path fill="currentColor" d="M7 4h1v4H7zM9 2h1v1H9zM10 3h1v6h-1zM9 9h1v1H9z" />
        )}
      </svg>
    </button>
  );
}
