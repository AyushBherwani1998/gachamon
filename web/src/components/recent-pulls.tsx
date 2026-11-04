import { Badge } from "@/components/ui/8bit/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/8bit/card";
import { formatUsd6, shortAddress } from "@/lib/format";
import type { RecentPull } from "@/lib/types";
import { cn } from "@/lib/utils";

interface RecentPullsProps {
  pulls: RecentPull[];
  player?: string;
}

export function RecentPulls({ pulls, player }: RecentPullsProps) {
  return (
    <Card className="w-full" font="normal">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="retro text-[10px]">RECENT PULLS</CardTitle>
        <span className="amount text-[10px] text-muted-foreground">{pulls.length} shown</span>
      </CardHeader>
      <CardContent>
        {pulls.length === 0 ? (
          <p className="py-4 text-center text-[11px] text-muted-foreground">
            No pulls yet. Be the first.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {pulls.map((pull) => {
              const isYou = player && pull.player.toLowerCase() === player.toLowerCase();
              return (
                <li key={pull.id.toString()} className="flex items-center justify-between gap-2 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="amount text-[10px] text-muted-foreground">
                      #{pull.id.toString()}
                    </span>
                    <span className="amount truncate text-[10px] text-muted-foreground">
                      {isYou ? "you" : shortAddress(pull.player)}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="amount text-[10px]">
                      {pull.stocks.map((stock) => stock.symbol).join(", ") || "—"}
                    </span>
                    <span className="amount text-[10px] text-muted-foreground">
                      {formatUsd6(pull.valueUsd6)}
                    </span>
                    <Badge
                      className={cn(
                        "text-[7px]",
                        pull.legendary
                          ? "border-[#ff5fa2] bg-[#ff5fa2] text-black"
                          : "border-border bg-secondary text-secondary-foreground"
                      )}
                    >
                      {pull.legendary ? "LEG" : "CMN"}
                    </Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
