"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/8bit/card";
import { cn } from "@/lib/utils";

import { PANEL_FONT, PanelHeader, PanelSkeleton, PanelTag } from "./panel-header";
import { PixelGlyph } from "./pixel";
import type { FeedItem } from "./types";
import { useNow } from "./use-now";

const ROW_HEIGHT = "h-[76px]";

function shortAddress(address: string) {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function pullRank(pullId: string) {
  try {
    return BigInt(pullId);
  } catch {
    return 0n;
  }
}

/** Newest first: resolved timestamp, then pull id as a stable tie-breaker. */
function sortFeed(items: FeedItem[]) {
  return [...items].sort((a, b) => {
    const timeDelta = (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0);
    if (timeDelta !== 0) return timeDelta;

    const aRank = pullRank(a.pullId);
    const bRank = pullRank(b.pullId);
    if (aRank === bRank) return 0;
    return bRank > aRank ? 1 : -1;
  });
}

function relativeTime(resolvedAt: number, now: number) {
  const seconds = Math.max(0, Math.floor(now / 1000) - resolvedAt);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

function FeedRow({
  item,
  now,
  explorerBase,
}: {
  item: FeedItem;
  now: number;
  explorerBase: string;
}) {
  const player = shortAddress(item.player);
  const symbols =
    item.payouts.map((payout) => payout.symbol).join(" + ") || "xStock";
  const href = `${explorerBase.replace(/\/$/, "")}/address/${item.player}`;

  return (
    <li
      className={cn(
        "flex items-center gap-3 border-l-4 pr-2 pl-3 sm:pl-4",
        ROW_HEIGHT,
        item.legendary
          ? "border-amber-300 bg-amber-300/[0.06]"
          : "border-transparent",
      )}
    >
      <div className="w-11 shrink-0">
        <p className="retro text-[7px] uppercase leading-none text-muted-foreground">
          Pull
        </p>
        <p className="mt-1.5 font-mono text-xs font-semibold tabular-nums text-foreground">
          #{item.pullId}
        </p>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="truncate font-mono text-[11px] tabular-nums text-foreground"
            title={item.player}
          >
            {player}
          </span>
          {item.legendary ? (
            <span className="retro shrink-0 bg-amber-300 px-1 py-0.5 text-[7px] leading-none text-amber-950">
              Legendary
            </span>
          ) : null}
        </div>
        <p className="mt-1.5 truncate font-mono text-[10px] tabular-nums text-muted-foreground">
          {symbols}{" "}
          <span
            className={item.legendary ? "text-amber-300" : "text-foreground"}
          >
            {item.valueUsd}
          </span>
        </p>
      </div>

      <div className="flex w-14 shrink-0 flex-col items-end gap-0.5">
        <time
          suppressHydrationWarning
          dateTime={
            item.resolvedAt
              ? new Date(item.resolvedAt * 1_000).toISOString()
              : undefined
          }
          title={
            item.resolvedAt
              ? new Date(item.resolvedAt * 1_000).toISOString()
              : undefined
          }
          className="font-mono text-[9px] tabular-nums text-muted-foreground"
        >
          {item.resolvedAt ? relativeTime(item.resolvedAt, now) : "—"}
        </time>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View ${item.player} on Monadscan`}
          title="View on Monadscan"
          className={cn(
            "grid size-11 place-items-center border-2 border-transparent text-muted-foreground",
            "transition-[transform,color,border-color] duration-150 ease-out motion-reduce:transition-none",
            "hover:border-foreground/20 hover:text-foreground",
            "active:scale-[0.96] motion-reduce:active:scale-100",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground",
          )}
        >
          <PixelGlyph name="arrow" className="size-3" />
        </a>
      </div>
    </li>
  );
}

function LoadingRows() {
  return (
    <ol aria-hidden="true" className="divide-y-2 divide-dashed divide-foreground/15">
      {Array.from({ length: 8 }, (_, index) => (
        <li
          key={index}
          className={cn(
            "flex items-center gap-3 border-l-4 border-transparent pr-2 pl-3 sm:pl-4",
            ROW_HEIGHT,
          )}
        >
          <PanelSkeleton className="h-3 w-10" />
          <div className="flex-1 space-y-2">
            <PanelSkeleton className="h-3 w-28 max-w-full" />
            <PanelSkeleton className="h-3 w-20 max-w-full" />
          </div>
          <PanelSkeleton className="size-8" />
        </li>
      ))}
    </ol>
  );
}

export function LiveFeed({
  items,
  loading = false,
  error,
  explorerBase,
}: {
  items: FeedItem[];
  loading?: boolean;
  error?: string;
  explorerBase: string;
}) {
  const now = useNow();
  const sorted = sortFeed(items);

  const tag = error ? (
    <PanelTag tone="gold">Offline</PanelTag>
  ) : loading ? (
    <PanelTag tone="muted">Syncing</PanelTag>
  ) : sorted.length === 0 ? (
    <PanelTag tone="muted">Waiting</PanelTag>
  ) : (
    <PanelTag tone="live">
      <span
        aria-hidden="true"
        className="size-1.5 bg-emerald-300 motion-safe:animate-pulse"
      />
      Live
    </PanelTag>
  );

  return (
    <Card
      font="normal"
      className={cn("h-full", PANEL_FONT)}
      aria-busy={loading || undefined}
    >
      <CardHeader font="normal">
        <PanelHeader
          eyebrow="Last 20 pulls, newest first"
          title="Live feed"
          tag={tag}
        />
      </CardHeader>

      <CardContent font="normal" className="p-0!">
        <p className="sr-only" aria-live="polite">
          {loading ? "Loading pulls" : `${sorted.length} pulls shown`}
        </p>

        {loading ? <LoadingRows /> : null}

        {!loading && error ? (
          <div
            role="alert"
            className="grid min-h-[304px] place-items-center px-6 py-10 text-center"
          >
            <div>
              <PixelGlyph
                name="capsule"
                className="mx-auto size-10 text-muted-foreground/60"
              />
              <p className="retro mt-4 text-[10px] text-amber-300">
                Feed offline
              </p>
              <p className="mt-2 break-words font-mono text-[11px] text-muted-foreground">
                {error}
              </p>
              <p className="mt-3 font-mono text-[10px] text-muted-foreground">
                Refresh the page to retry.
              </p>
            </div>
          </div>
        ) : null}

        {!loading && !error && sorted.length === 0 ? (
          <div className="grid min-h-[304px] place-items-center px-6 py-10 text-center">
            <div>
              <PixelGlyph
                name="capsule"
                className="mx-auto size-10 text-muted-foreground/60"
              />
              <p className="retro mt-4 text-[10px] text-foreground">
                The machine is waiting
              </p>
              <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                No pulls yet. Be the first.
              </p>
            </div>
          </div>
        ) : null}

        {!loading && !error && sorted.length > 0 ? (
          <ol className="divide-y-2 divide-dashed divide-foreground/15">
            {sorted.map((item) => (
              <FeedRow
                key={`${item.pullId}-${item.player}`}
                item={item}
                now={now}
                explorerBase={explorerBase}
              />
            ))}
          </ol>
        ) : null}
      </CardContent>
    </Card>
  );
}
