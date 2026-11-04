import type { Address } from "viem";

import type { GachaResult, GachaPayout } from "@/components/gacha";
import type { FeedItem, PanelPayout } from "@/components/panels";
import { formatTokenAmount, formatUsd6 } from "@/lib/format";
import { tokenAmountTo18 } from "@/lib/tokens";
import type { MachineSnapshot, PullResult, RecentPull, TokenAmount } from "@/lib/types";

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

/** Value a token amount with the machine's fresh USD-6 price. */
export function usd6ForAmount(
  amount: bigint,
  decimals: number,
  address: string,
  machine: MachineSnapshot
): bigint | undefined {
  const price = priceFor(address, machine);
  if (price === undefined || price === 0n) return undefined;
  return (tokenAmountTo18(amount, decimals) * price) / 10n ** 18n;
}

interface PayoutInput {
  address: Address;
  symbol: string;
  amount: bigint;
  decimals?: number;
}

function payoutRows(
  stocks: PayoutInput[],
  machine: MachineSnapshot,
  fallbackValueUsd6?: bigint
): Array<{ symbol: string; amount: bigint; decimals: number; usd6: bigint | undefined }> {
  return stocks.map((stock, index) => {
    const decimals = stock.decimals ?? 18;
    const usd6 = usd6ForAmount(stock.amount, decimals, stock.address, machine);
    // If prices are unavailable (machine not read yet), keep the total value
    // visible on the first row instead of showing $0.00.
    const fallback = index === 0 ? fallbackValueUsd6 : undefined;
    return { ...stock, decimals, usd6: usd6 ?? fallback };
  });
}

function rowsToPanelPayouts(
  rows: ReturnType<typeof payoutRows>
): PanelPayout[] {
  return rows.map((row) => ({
    symbol: row.symbol,
    amount: formatTokenAmount(row.amount, row.decimals, 8),
    usd: row.usd6 === undefined ? "—" : formatUsd6(row.usd6),
  }));
}

export function toPanelPayouts(
  stocks: TokenAmount[],
  machine: MachineSnapshot,
  totalValueUsd6: bigint
): PanelPayout[] {
  return rowsToPanelPayouts(
    payoutRows(stocks, machine, totalValueUsd6 > 0n ? totalValueUsd6 : undefined)
  );
}

/** Snapshot value, falling back to fresh machine prices if the snapshot is 0. */
export function resultValueUsd6(result: PullResult, machine: MachineSnapshot): bigint {
  if (result.valueUsd6 > 0n) return result.valueUsd6;
  return result.stocks.reduce((total, stock) => {
    const value = usd6ForAmount(stock.amount, 18, stock.address, machine);
    return value === undefined ? total : total + value;
  }, 0n);
}

export function toGachaResult(
  result: PullResult,
  machine: MachineSnapshot,
  explorerUrl?: string
): GachaResult {
  const payouts: GachaPayout[] = payoutRows(
    result.stocks,
    machine,
    result.valueUsd6 > 0n ? result.valueUsd6 : undefined
  ).map((row) => ({
    symbol: row.symbol,
    amount: formatTokenAmount(row.amount, row.decimals, 8),
    usd: row.usd6 === undefined ? "0.00" : usdPlain(row.usd6),
  }));

  return {
    pullId: result.pullId.toString(),
    legendary: result.legendary,
    payouts,
    valueUsd: usdPlain(resultValueUsd6(result, machine)),
    explorerUrl,
  };
}

/** Value a feed row; the total comes from the pull snapshot when available. */
function feedItem(pull: RecentPull, machine: MachineSnapshot): FeedItem {
  const rows = payoutRows(
    pull.stocks,
    machine,
    pull.valueUsd6 > 0n ? pull.valueUsd6 : undefined
  );
  const knownTotal = rows.reduce(
    (total, row) => (row.usd6 === undefined ? total : total + row.usd6),
    0n
  );
  const total = pull.valueUsd6 > 0n ? pull.valueUsd6 : knownTotal;
  const unknown = rows.some((row) => row.usd6 === undefined);

  return {
    pullId: pull.id.toString(),
    player: pull.player,
    legendary: pull.legendary,
    payouts: rowsToPanelPayouts(rows),
    valueUsd: unknown && total === 0n ? "—" : formatUsd6(total),
    resolvedAt: pull.resolvedAt,
  };
}

export function toFeedItems(pulls: RecentPull[], machine: MachineSnapshot): FeedItem[] {
  return pulls.map((pull) => feedItem(pull, machine));
}
