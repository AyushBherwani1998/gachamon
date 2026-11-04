"use client";

import { useAccount } from "wagmi";

import { FaucetButton } from "@/components/faucet-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/8bit/card";
import { IS_DEMO_MODE } from "@/config/deployments";
import { useBalances } from "@/hooks/use-balances";
import { formatMon, formatToken, formatUsd6 } from "@/lib/format";

export function BalancesPanel() {
  const { isConnected, address } = useAccount();
  const balances = useBalances();

  return (
    <Card className="w-full" font="normal">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="retro text-[10px]">YOUR WALLET</CardTitle>
        <FaucetButton />
      </CardHeader>
      <CardContent>
        {!isConnected && !IS_DEMO_MODE ? (
          <p className="py-4 text-center text-[11px] text-muted-foreground">
            Connect a wallet to see balances.
          </p>
        ) : (
          <dl className="flex flex-col gap-2 text-xs">
            <BalanceRow label="MON" value={formatMon(balances.mon)} />
            <BalanceRow label="USDC" value={formatUsd6(balances.usdc)} />
            <div className="border-t-2 border-border/60 pt-2">
              <p className="retro mb-2 text-[8px] text-muted-foreground">xSTOCKS</p>
              {balances.stocks.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  {IS_DEMO_MODE ? "—" : "Stocks appear once the machine is deployed."}
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {balances.stocks.map((stock) => (
                    <BalanceRow
                      key={stock.address}
                      label={stock.symbol}
                      value={formatToken(stock.balance)}
                    />
                  ))}
                </div>
              )}
            </div>
            {address ? (
              <p className="amount truncate border-t-2 border-border/60 pt-2 text-[9px] text-muted-foreground">
                {address}
              </p>
            ) : null}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function BalanceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="retro text-[9px] text-muted-foreground">{label}</dt>
      <dd className="amount">{value}</dd>
    </div>
  );
}
