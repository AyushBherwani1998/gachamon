"use client";

import { Button } from "@/components/ui/8bit/button";
import { Card, CardContent, CardHeader } from "@/components/ui/8bit/card";
import { cn } from "@/lib/utils";

import { PANEL_FONT, PanelHeader, PanelTag } from "./panel-header";
import { PixelGlyph, StockEmblem } from "./pixel";
import { ShareButton } from "./share-button";
import type { PanelPayout } from "./types";

const SHARE_MENTIONS = "@monad_dev @geeky_kartikey";

const ACCENTS = {
  legendary: {
    text: "text-amber-300",
    frame: "border-amber-300/35 bg-amber-300/[0.04]",
    badge: "bg-amber-300 text-amber-950",
    strip: "bg-amber-300",
  },
  common: {
    text: "text-emerald-300",
    frame: "border-emerald-300/30 bg-emerald-300/[0.03]",
    badge: "bg-emerald-300 text-emerald-950",
    strip: "bg-emerald-300",
  },
} as const;

function buildShareText(payouts: PanelPayout[]) {
  const pulled = payouts.length
    ? payouts.map((p) => `${p.amount} ${p.symbol}`).join(" + ")
    : "a real stock";

  return `I just pulled ${pulled} out of a pixel gacha machine on @monad. Real stocks, verifiable randomness by Pyth. #MonadBlitz ${SHARE_MENTIONS}`;
}

export function ResultCard({
  legendary,
  payouts,
  valueUsd,
  explorerUrl,
  shareUrl,
  onPullAgain,
}: {
  legendary: boolean;
  payouts: PanelPayout[];
  valueUsd: string;
  explorerUrl?: string;
  shareUrl?: string;
  onPullAgain?: () => void;
}) {
  const accent = legendary ? ACCENTS.legendary : ACCENTS.common;

  return (
    <Card font="normal" className={cn("relative h-full", PANEL_FONT)}>
      <span
        aria-hidden="true"
        className={cn("absolute inset-x-0 top-0 h-1.5", accent.strip)}
      />
      <CardHeader font="normal" className="pt-2 pb-3">
        <PanelHeader
          eyebrow="The claw paid out"
          title="Pull result"
          tag={
            <span
              className={cn(
                "retro inline-flex shrink-0 items-center gap-1.5 border-2 border-black px-2 py-1.5 text-[9px] uppercase leading-none shadow-[2px_2px_0_0_rgba(0,0,0,0.55)]",
                accent.badge,
              )}
            >
              <PixelGlyph
                name={legendary ? "crown" : "spark"}
                className="size-2.5"
              />
              {legendary ? "Legendary" : "Common"}
            </span>
          }
        />
      </CardHeader>

      <CardContent font="normal" className="@container flex flex-1 flex-col gap-4 pb-5">
        <div className={cn("border-2 border-dashed p-3", accent.frame)}>
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <p className="retro text-[8px] uppercase leading-none text-muted-foreground">
              You received
            </p>
            <span className="retro text-[8px] uppercase leading-none text-muted-foreground">
              xStocks
            </span>
          </div>

          {payouts.length > 0 ? (
            <ul className="space-y-2.5">
              {payouts.map((payout, index) => (
                <li
                  key={`${payout.symbol}-${index}`}
                  className="flex items-center gap-3"
                >
                  <StockEmblem symbol={payout.symbol} />
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-mono text-sm font-semibold tabular-nums text-foreground">
                      {payout.amount}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        {payout.symbol}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      Straight to your wallet
                    </p>
                  </div>
                  <p
                    className={cn(
                      "shrink-0 font-mono text-sm font-semibold tabular-nums",
                      accent.text,
                    )}
                  >
                    {payout.usd}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-3 text-xs text-muted-foreground">
              Payout details appear here once the pull resolves.
            </p>
          )}
        </div>

        <div className="flex items-end justify-between gap-3 border-t-2 border-dashed border-foreground/15 pt-3">
          <div>
            <p className="retro text-[8px] uppercase leading-none text-muted-foreground">
              Total value
            </p>
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              No claim step
            </p>
          </div>
          <p
            className={cn(
              "font-mono text-2xl leading-none font-bold tabular-nums tracking-tight",
              accent.text,
            )}
          >
            {valueUsd}
          </p>
        </div>

        <div className="mt-auto space-y-2">
          <div className="grid gap-2 @min-[420px]:grid-cols-2">
            <Button
              type="button"
              size="lg"
              onClick={onPullAgain}
              disabled={!onPullAgain}
              className={cn(
                "min-h-11 w-full text-[10px] leading-relaxed",
                "duration-150 ease-out [transition-property:transform,background-color,color,border-color,box-shadow] motion-reduce:transition-none",
                "active:translate-y-0 active:scale-[0.96] motion-reduce:active:scale-100 motion-reduce:active:translate-y-0",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground",
              )}
            >
              Pull again
            </Button>
            <ShareButton text={buildShareText(payouts)} url={shareUrl ?? ""} />
          </div>

          {explorerUrl ? (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex min-h-11 w-full items-center justify-center gap-2 px-2",
                "font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground",
                "underline decoration-dotted underline-offset-4",
                "transition-[transform,color] duration-150 ease-out hover:text-foreground motion-reduce:transition-none",
                "active:scale-[0.96] motion-reduce:active:scale-100",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground",
              )}
            >
              View on Monadscan
              <PixelGlyph name="arrow" className="size-2.5" />
            </a>
          ) : (
            <div className="flex min-h-11 items-center justify-center gap-2 px-2">
              <PanelTag tone={legendary ? "gold" : "live"}>
                {legendary ? "Legendary pull" : "Common pull"}
              </PanelTag>
              <span className="font-mono text-[10px] text-muted-foreground">
                verifiable by Pyth Entropy
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
