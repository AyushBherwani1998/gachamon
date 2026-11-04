import type { Address } from "viem";

import { shortAddress } from "./format";
import type { FeedResponse, RecentPull } from "./types";

export async function fetchFeed(chainId: number): Promise<FeedResponse> {
  const response = await fetch(`/api/feed?chainId=${chainId}`, { cache: "no-store" });
  const body = (await response.json().catch(() => null)) as
    | (FeedResponse & { error?: string })
    | null;
  if (!response.ok) {
    throw new Error(body?.error ?? `Feed returned HTTP ${response.status}.`);
  }
  if (!body || !Array.isArray(body.pulls)) {
    throw new Error("Feed returned an unexpected response.");
  }
  return body;
}

interface BackendPull {
  pullId: string;
  player: string;
  resolved?: boolean;
  legendary?: boolean;
  stocks?: string[];
  amounts?: string[];
  resolvedTimestamp?: number;
  timestamp?: number;
}

interface BackendPlayerPulls {
  pulls?: BackendPull[];
}

/**
 * Optional: Ayush's backend indexes pulls in SQLite. It has no global feed
 * route, so it is used to supplement the connected player's history.
 */
export async function fetchBackendPulls(
  baseUrl: string,
  player: Address
): Promise<RecentPull[]> {
  const url = `${baseUrl.replace(/\/$/, "")}/players/${player}/pulls`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Backend returned HTTP ${response.status}.`);
  const body = (await response.json().catch(() => null)) as BackendPlayerPulls | null;
  if (!body || !Array.isArray(body.pulls)) return [];

  return body.pulls.flatMap((pull) => {
    if (!pull.resolved) return [];
    const id = BigInt(pull.pullId);
    const stocks = (pull.stocks ?? []).flatMap((address, index) => {
      const amount = BigInt(pull.amounts?.[index] ?? "0");
      if (amount === 0n) return [];
      return [{ address: address as Address, symbol: shortAddress(address), amount }];
    });
    return [
      {
        id,
        player: pull.player as Address,
        legendary: Boolean(pull.legendary),
        valueUsd6: 0n,
        resolvedAt: pull.resolvedTimestamp ?? pull.timestamp ?? 0,
        stocks,
      },
    ];
  });
}

/** Matches a backend pull id to the on-chain feed instead of duplicating it. */
export function dedupePulls(own: RecentPull[], chain: RecentPull[], limit = 20): RecentPull[] {
  const seen = new Set<string>();
  const merged: RecentPull[] = [];
  for (const pull of [...own, ...chain]) {
    const key = pull.id.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(pull);
  }
  return merged
    .sort((a, b) => {
      if (a.resolvedAt !== b.resolvedAt) return b.resolvedAt - a.resolvedAt;
      return a.id === b.id ? 0 : a.id > b.id ? -1 : 1;
    })
    .slice(0, limit);
}

export function pullResultToRecent(
  result: {
    pullId: bigint;
    player: Address;
    legendary: boolean;
    valueUsd6: bigint;
    stocks: Array<{ address: Address; symbol: string; amount: bigint }>;
  },
  resolvedAt = Math.floor(Date.now() / 1_000)
): RecentPull {
  return {
    id: result.pullId,
    player: result.player,
    legendary: result.legendary,
    valueUsd6: result.valueUsd6,
    resolvedAt,
    stocks: result.stocks,
  };
}
