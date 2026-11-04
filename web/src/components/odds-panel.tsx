import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/8bit/card";
import { formatUsd6 } from "@/lib/format";
import type { MachineSnapshot } from "@/lib/types";

interface OddsPanelProps {
  machine: MachineSnapshot;
  demo?: boolean;
}

const DEFAULTS = {
  pullPrice: 1_000_000n,
  commonValue: 730_000n,
  legendaryValue: 10_000_000n,
  legendaryBps: 200,
};

export function OddsPanel({ machine, demo = false }: OddsPanelProps) {
  const pullPrice = machine.pullPrice ?? DEFAULTS.pullPrice;
  const commonValue = machine.commonValue ?? DEFAULTS.commonValue;
  const legendaryValue = machine.legendaryValue ?? DEFAULTS.legendaryValue;
  const bps = machine.legendaryBps ?? DEFAULTS.legendaryBps;

  const legendaryChance = bps / 100;
  const commonChance = 100 - legendaryChance;
  const ev =
    (Number(commonValue) * (10_000 - bps) + Number(legendaryValue) * bps) / 10_000;
  const edge = pullPrice > 0n ? (1 - ev / Number(pullPrice)) * 100 : 0;

  return (
    <Card className="w-full" font="normal">
      <CardHeader font="normal" className="pb-2">
        <CardTitle className="retro text-[10px]">ODDS &amp; VALUE</CardTitle>
      </CardHeader>
      <CardContent font="normal" className="flex flex-col gap-3 text-xs">
        <Row
          label="Legendary"
          hint={`${legendaryChance}% · ${formatUsd6(legendaryValue)}`}
          color="#ff5fa2"
        />
        <Row
          label="Common"
          hint={`${commonChance}% · ${formatUsd6(commonValue)}`}
          color="#d9ff57"
        />
        <div className="border-t-2 border-border/60 pt-3">
          <div className="flex items-center justify-between gap-2">
            <span className="retro text-[9px] text-muted-foreground">EV / PULL</span>
            <span className="amount text-sm">{formatUsd6(BigInt(Math.round(ev)), 4)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="retro text-[9px] text-muted-foreground">HOUSE EDGE</span>
            <span className="amount text-sm">{edge.toFixed(1)}%</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="retro text-[9px] text-muted-foreground">PULL PRICE</span>
            <span className="amount text-sm">{formatUsd6(pullPrice)} USDC</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="retro text-[9px] text-muted-foreground">ENTROPY FEE</span>
            <span className="amount text-sm">
              {machine.fee !== undefined
                ? `${(Number(machine.fee) / 1e18).toLocaleString("en-US", {
                    maximumFractionDigits: 4,
                  })} MON`
                : "—"}
            </span>
          </div>
        </div>
        {demo ? (
          <p className="border-t-2 border-border/60 pt-3 text-[10px] text-primary">
            DEMO MODE · simulated pulls, no real funds
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Row({ label, hint, color }: { label: string; hint: string; color: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2">
        <span aria-hidden="true" className="size-2" style={{ backgroundColor: color }} />
        <span className="retro text-[9px]">{label}</span>
      </span>
      <span className="amount text-xs">{hint}</span>
    </div>
  );
}
