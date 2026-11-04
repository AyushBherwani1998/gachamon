"use client";

import type { PullPhase } from "@/lib/types";
import { cn } from "@/lib/utils";

interface GachaMachineProps {
  phase: PullPhase;
  legendary?: boolean;
  label: string;
}

/**
 * Placeholder pixel claw machine. The visual-polish PR replaces the internals;
 * keep the props/contract stable so the page keeps working.
 */
export function GachaMachine({ phase, legendary = false, label }: GachaMachineProps) {
  const drawing = phase === "drawing" || phase === "confirming" || phase === "approving";

  return (
    <div className="relative mx-auto w-full max-w-sm">
      <div
        className={cn(
          "relative border-y-8 border-x-4 border-foreground/80 bg-[#1d1d2b] p-3 pixel-shadow",
          drawing && "machine-drawing"
        )}
        aria-hidden="true"
      >
        <div className="flex items-center justify-between border-b-4 border-foreground/30 pb-2">
          <span className="retro text-[8px] text-primary">X-STOCKS</span>
          <span className="retro text-[8px] text-muted-foreground">1 USDC / PULL</span>
        </div>

        <div className="relative mt-3 h-56 overflow-hidden border-4 border-foreground/60 bg-[#0d0d16]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(217,255,87,0.16),transparent_60%)]" />
          <div className="absolute inset-x-3 top-4 grid grid-cols-2 gap-2">
            {["TSLAx", "AAPLx", "NVDAx", "SPYx"].map((symbol, index) => (
              <div
                key={symbol}
                className={cn(
                  "retro grid h-12 place-items-center border-2 text-[7px]",
                  index % 2 === 0
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-[#57e2ff]/50 bg-[#57e2ff]/10 text-[#57e2ff]"
                )}
              >
                {symbol}
              </div>
            ))}
          </div>

          <div className="absolute left-1/2 top-0 h-20 w-[2px] -translate-x-1/2 bg-foreground/60" />
          <div className="absolute left-1/2 top-[76px] -translate-x-1/2">
            <div className="h-2 w-8 -translate-x-[9px] bg-foreground/80" />
            <div className="h-6 w-[2px] translate-x-[5px] rotate-[24deg] bg-foreground/80" />
            <div className="absolute left-0 top-6 h-6 w-[2px] -rotate-[24deg] bg-foreground/80" />
          </div>

          <div className="absolute inset-x-0 bottom-0 h-8 border-t-4 border-foreground/40 bg-[#14141f]">
            <div className="mx-auto mt-1 h-4 w-16 border-2 border-foreground/30 bg-black/60" />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between border-t-4 border-foreground/30 pt-2">
          <span className="retro text-[7px] text-muted-foreground">
            {legendary ? "LEGENDARY" : "COMMON"} ODDS
          </span>
          <span className="amount text-[10px] text-muted-foreground">98 / 2</span>
        </div>
      </div>

      <p
        className="retro mt-4 text-center text-[9px] leading-relaxed text-muted-foreground"
        aria-hidden="true"
      >
        {label}
      </p>
    </div>
  );
}
