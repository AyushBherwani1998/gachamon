"use client";

import { TxLink } from "@/components/result-card";
import { Button } from "@/components/ui/8bit/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/8bit/card";
import { useOwed } from "@/hooks/use-owed";
import { formatToken, formatUsd6 } from "@/lib/format";

/**
 * Shown only when a payout transfer failed and the contract recorded an owed
 * balance (`owed(player, token)`). Withdrawing retries every token at once.
 */
export function OwedPanel() {
  const { entries, isWithdrawing, error, hash, withdraw } = useOwed();

  if (entries.length === 0) return null;

  return (
    <Card className="w-full border-x-4 border-[#ffd45f]" font="normal">
      <CardHeader className="pb-2">
        <CardTitle className="retro text-[10px] text-[#ffd45f]">CLAIMABLE BALANCE</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-[11px] text-muted-foreground">
          A payout transfer could not be delivered automatically. Claim it here — the tokens
          are held by the machine.
        </p>
        <ul className="divide-y divide-border/60 border-y-2 border-border/60">
          {entries.map((entry) => (
            <li key={entry.address} className="flex items-center justify-between gap-2 py-2">
              <span className="retro text-[9px]">{entry.symbol}</span>
              <span className="amount text-xs">
                {entry.symbol === "USDC"
                  ? formatUsd6(entry.amount, 2)
                  : formatToken(entry.amount, 8)}
              </span>
            </li>
          ))}
        </ul>
        <Button
          size="sm"
          className="min-h-11 w-full"
          disabled={isWithdrawing}
          onClick={() => void withdraw()}
        >
          {isWithdrawing ? "Claiming…" : "Claim tokens"}
        </Button>
        {error ? (
          <p className="text-[10px] text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {hash ? <TxLink hash={hash} /> : null}
      </CardContent>
    </Card>
  );
}
