import { Card, CardContent, CardHeader } from "@/components/ui/8bit/card";
import { cn } from "@/lib/utils";

import { PANEL_FONT, PanelHeader, PanelSkeleton, PanelTag } from "./panel-header";

function parseUsd(value: string): number | null {
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPct(value: number): string {
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}%`;
}

function StatCell({
  label,
  value,
  loading,
}: {
  label: string;
  value?: string;
  loading: boolean;
}) {
  return (
    <div className="min-w-0 border-2 border-foreground/15 bg-foreground/[0.03] p-2.5">
      <p className="retro text-[8px] uppercase leading-none text-muted-foreground">
        {label}
      </p>
      {loading ? (
        <PanelSkeleton className="mt-2 h-4 w-16" />
      ) : (
        <p className="mt-1.5 truncate font-mono text-sm font-semibold tabular-nums text-foreground">
          {value ?? "—"}
        </p>
      )}
    </div>
  );
}

export function OddsPanel({
  legendaryBps,
  commonUsd,
  legendaryUsd,
  pullPriceUsd,
  inventoryUsd,
  totalPulls,
  loading = false,
  statusLabel,
}: {
  legendaryBps: number;
  commonUsd: string;
  legendaryUsd: string;
  pullPriceUsd: string;
  inventoryUsd?: string;
  totalPulls?: string;
  loading?: boolean;
  statusLabel?: string;
}) {
  const legendaryPct = Math.min(Math.max(legendaryBps, 0), 10_000) / 100;
  const commonPct = 100 - legendaryPct;

  const price = parseUsd(pullPriceUsd);
  const common = parseUsd(commonUsd);
  const legendary = parseUsd(legendaryUsd);

  const ev =
    common !== null && legendary !== null
      ? (commonPct / 100) * common + (legendaryPct / 100) * legendary
      : null;
  const edge =
    ev !== null && price !== null && price > 0
      ? (1 - ev / price) * 100
      : null;

  const evLabel = ev === null ? "—" : `$${ev.toFixed(4)}`;
  const edgeLabel = edge === null ? "—" : `${edge.toFixed(2)}%`;

  return (
    <Card
      font="normal"
      className={cn("h-full", PANEL_FONT)}
      aria-busy={loading || undefined}
    >
      <CardHeader font="normal">
        <PanelHeader
          eyebrow="House math, in the open"
          title="Odds & EV"
          tag={
            <PanelTag tone={loading ? "muted" : "gold"}>
              {loading ? "Syncing" : statusLabel ?? "On-chain"}
            </PanelTag>
          }
        />
      </CardHeader>

      <CardContent font="normal" className="flex flex-col gap-4 pb-5">
        {loading ? (
          <span className="sr-only">Loading odds and expected value…</span>
        ) : null}

        {/* Odds bar: 98% common, 2% legendary. */}
        <div
          aria-hidden="true"
          className="flex h-3 w-full overflow-hidden border-2 border-foreground/20"
        >
          <div
            className="h-full bg-emerald-300"
            style={{ width: `${commonPct}%` }}
          />
          <div
            className="h-full bg-amber-300"
            style={{ width: `${legendaryPct}%` }}
          />
        </div>

        <table className="w-full border-collapse text-left">
          <caption className="sr-only">
            Prize odds, values and expected value per pull
          </caption>
          <thead>
            <tr className="text-muted-foreground">
              <th
                scope="col"
                className="pb-1.5 font-mono text-[9px] font-normal uppercase tracking-[0.12em]"
              >
                Chance
              </th>
              <th
                scope="col"
                className="pb-1.5 text-right font-mono text-[9px] font-normal uppercase tracking-[0.12em]"
              >
                Prize
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <>
                <tr className="border-t-2 border-foreground/10">
                  <td className="py-2.5">
                    <PanelSkeleton className="h-4 w-24" />
                  </td>
                  <td className="py-2.5">
                    <PanelSkeleton className="ml-auto h-4 w-16" />
                  </td>
                </tr>
                <tr className="border-t-2 border-foreground/10">
                  <td className="py-2.5">
                    <PanelSkeleton className="h-4 w-24" />
                  </td>
                  <td className="py-2.5">
                    <PanelSkeleton className="ml-auto h-4 w-16" />
                  </td>
                </tr>
              </>
            ) : (
              <>
                <tr className="border-t-2 border-foreground/10">
                  <th scope="row" className="py-2.5 text-left font-normal">
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="retro text-[8px] uppercase text-emerald-300">
                        Common
                      </span>
                      <span className="font-mono text-xs tabular-nums text-foreground">
                        {formatPct(commonPct)}
                      </span>
                    </span>
                  </th>
                  <td className="py-2.5 text-right">
                    <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                      {commonUsd}
                    </span>
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      of a stock
                    </span>
                  </td>
                </tr>
                <tr className="border-t-2 border-foreground/10">
                  <th scope="row" className="py-2.5 text-left font-normal">
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="retro text-[8px] uppercase text-amber-300">
                        Legendary
                      </span>
                      <span className="font-mono text-xs tabular-nums text-foreground">
                        {formatPct(legendaryPct)}
                      </span>
                    </span>
                  </th>
                  <td className="py-2.5 text-right">
                    <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                      {legendaryUsd}
                    </span>
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      of a stock
                    </span>
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>

        <dl className="space-y-1.5 border-t-2 border-dashed border-foreground/15 pt-3">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              EV per {pullPriceUsd} pull
            </dt>
            <dd className="font-mono text-sm font-semibold tabular-nums text-emerald-300">
              {loading ? <PanelSkeleton className="h-4 w-14" /> : evLabel}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              House edge
            </dt>
            <dd className="font-mono text-sm font-semibold tabular-nums text-amber-300">
              {loading ? <PanelSkeleton className="h-4 w-12" /> : edgeLabel}
            </dd>
          </div>
        </dl>

        <div className="grid grid-cols-2 gap-2">
          <StatCell label="Inventory left" value={inventoryUsd} loading={loading} />
          <StatCell label="Pulls so far" value={totalPulls} loading={loading} />
        </div>

        <p
          className={cn(
            "font-mono text-[9px] leading-relaxed tabular-nums text-muted-foreground",
            loading && "opacity-0",
          )}
          aria-hidden={loading || undefined}
        >
          EV = {formatPct(commonPct)} × {commonUsd} + {formatPct(legendaryPct)}{" "}
          × {legendaryUsd}
        </p>
      </CardContent>
    </Card>
  );
}
