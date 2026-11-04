"use client";

import type { Hex } from "viem";

import { Badge } from "@/components/ui/8bit/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/8bit/card";
import { deployment, explorerTx } from "@/config/deployments";
import { formatToken, formatUsd6 } from "@/lib/format";
import type { PullResult } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ResultCardProps {
  result: PullResult;
}

export function ResultCard({ result }: ResultCardProps) {
  const totalAmount = result.stocks.reduce((sum, stock) => sum + stock.amount, 0n);
  const txHash = result.txHash;

  return (
    <Card
      font="normal"
      className={cn(
        "w-full max-w-sm border-x-4",
        result.legendary
          ? "border-[#ff5fa2] shadow-[0_0_40px_rgba(255,95,162,0.25)]"
          : "border-primary/60"
      )}
    >
      <CardHeader font="normal" className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="retro text-[10px]">
          {result.legendary ? "LEGENDARY PULL" : "COMMON PULL"}
        </CardTitle>
        <Badge
          className={cn(
            "text-[8px]",
            result.legendary
              ? "border-[#ff5fa2] bg-[#ff5fa2] text-black"
              : "border-primary bg-primary text-primary-foreground"
          )}
        >
          PULL #{result.pullId.toString()}
        </Badge>
      </CardHeader>
      <CardContent font="normal" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="retro text-[8px] text-muted-foreground">YOU WON</p>
            <p className="retro mt-2 text-xl text-primary">
              {result.stocks.map((stock) => stock.symbol).join(" + ") || "—"}
            </p>
          </div>
          <div className="text-right">
            <p className="amount text-2xl font-semibold">{formatUsd6(result.valueUsd6)}</p>
            <p className="amount text-[11px] text-muted-foreground">
              {formatToken(totalAmount, 6)} tokens
            </p>
          </div>
        </div>

        <div className="divide-y divide-border/60 border-y-2 border-border/60">
          {result.stocks.map((stock) => (
            <div key={stock.address} className="flex items-center justify-between gap-2 py-2">
              <span className="retro text-[9px]">{stock.symbol}</span>
              <span className="amount text-xs">{formatToken(stock.amount, 8)}</span>
            </div>
          ))}
        </div>

        <p className="text-[10px] leading-relaxed text-muted-foreground">
          {result.legendary
            ? "Top 2% pull. Tokens are delivered automatically; blocked transfers show under Claimable balance."
            : "Delivered automatically — no claim step. Blocked transfers show under Claimable balance."}
        </p>

        {txHash ? <TxLink hash={txHash} /> : <p className="text-[10px] text-muted-foreground">Simulated demo pull</p>}
      </CardContent>
    </Card>
  );
}

export function TxLink({ hash }: { hash: Hex }) {
  return (
    <a
      href={explorerTx(deployment.key, hash)}
      target="_blank"
      rel="noopener noreferrer"
      className="amount inline-flex min-h-11 items-center text-[10px] text-primary underline decoration-dotted underline-offset-4 hover:text-foreground"
    >
      View transaction on explorer ↗
    </a>
  );
}
