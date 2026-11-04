import type { GachaResult, GachaPayout } from "@/components/gacha";
import type { FeedItem, PanelPayout } from "@/components/panels";
import { formatToken, formatUsd6 } from "@/lib/format";
import type { MachineSnapshot, PullResult } from "@/lib/types";

/** Whole-dollar formatting used by the pixel machine (no leading $). */
export function usdPlain(valueUsd6: bigint | undefined): string {
  if (valueUsd6 === undefined) return "0.00";
  return (Number(valueUsd6) / 1_000_000).toFixed(2);
}

function priceFor(address: string, machine: MachineSnapshot): bigint | undefined {
  const index = machine.stocks.findIndex(
    (stock) => stock.address.toLowerCase() === address.toLowerCase()
  );
  return index >= 0 ? machine.prices[index] : undefined;
}

function stockUsd6(
  amount: bigint,
  address: string,
  machine: MachineSnapshot
): bigint | undefined {
  const price = priceFor(address, machine);
  if (price === undefined || price === 0n) return undefined;
  return (amount * price) / 10n ** 18n;
}

function payoutRows(
  stocks: PullResult["stocks"],
  machine: MachineSnapshot,
  totalValueUsd6: bigint
): Array<{ symbol: string; amount: bigint; usd6: bigint | undefined }> {
  return stocks.map((stock, index) => {
    const usd6 = stockUsd6(stock.amount, stock.address, machine);
    // If prices are unavailable (machine not read yet), keep the total value
    // visible on the first row instead of showing $0.00.
    const fallback = index === 0 ? totalValueUsd6 : undefined;
    return { ...stock, usd6: usd6 ?? fallback };
  });
}

export function toPanelPayouts(
  stocks: PullResult["stocks"],
  machine: MachineSnapshot,
  totalValueUsd6: bigint
): PanelPayout[] {
  return payoutRows(stocks, machine, totalValueUsd6).map((row) => ({
    symbol: row.symbol,
    amount: formatToken(row.amount, 8),
    usd: row.usd6 === undefined ? "—" : formatUsd6(row.usd6),
  }));
}

export function toGachaResult(
  result: PullResult,
  machine: MachineSnapshot,
  explorerUrl?: string
): GachaResult {
  const payouts: GachaPayout[] = payoutRows(
    result.stocks,
    machine,
    result.valueUsd6
  ).map((row) => ({
    symbol: row.symbol,
    amount: formatToken(row.amount, 8),
    usd: row.usd6 === undefined ? "0.00" : usdPlain(row.usd6),
  }));

  return {
    pullId: result.pullId.toString(),
    legendary: result.legendary,
    payouts,
    valueUsd: usdPlain(result.valueUsd6),
    explorerUrl,
  };
}

export function toFeedItems(machine: MachineSnapshot): FeedItem[] {
  return machine.recentPulls.map((pull) => ({
    pullId: pull.id.toString(),
    player: pull.player,
    legendary: pull.legendary,
    payouts: toPanelPayouts(pull.stocks, machine, pull.valueUsd6),
    valueUsd: formatUsd6(pull.valueUsd6),
    resolvedAt: Number(pull.resolvedAt),
  }));
}
