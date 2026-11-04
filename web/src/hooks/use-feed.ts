"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useSyncExternalStore } from "react";
import { useAccount } from "wagmi";

import type { FeedItem } from "@/components/panels";
import { deployment, isDeployed, IS_DEMO_MODE } from "@/config/deployments";
import { dedupePulls, fetchBackendPulls, fetchFeed, pullResultToRecent } from "@/lib/feed";
import { getMockFeed, getMockState, subscribeMock } from "@/lib/mock";
import { tokenAmountTo18 } from "@/lib/prices";
import { toFeedItems } from "@/lib/pull-view";
import type { FeedPull, MachineSnapshot, PullResult, RecentPull } from "@/lib/types";

function feedPullToRecent(pull: FeedPull): RecentPull {
  return {
    id: BigInt(pull.pullId),
    player: pull.player,
    legendary: pull.legendary,
    // The feed values pulls with fresh machine prices; snapshots are only
    // available on the pull's own result card.
    valueUsd6: 0n,
    resolvedAt: pull.resolvedAt,
    stocks: pull.stocks.map((stock) => ({
      address: stock.token,
      symbol: stock.symbol,
      amount: tokenAmountTo18(BigInt(stock.amount), stock.decimals),
    })),
  };
}

/** Fresh `PullResolved` feed; the player's own pull is inserted immediately. */
export function useFeed(machine: MachineSnapshot, ownPull: PullResult | null): {
  items: FeedItem[];
  loading: boolean;
  error: string | null;
} {
  useSyncExternalStore(subscribeMock, getMockState, getMockState);
  const { address } = useAccount();

  const enabled = !IS_DEMO_MODE && isDeployed(deployment.clawMachine);

  const feedQuery = useQuery({
    queryKey: ["feed", deployment.chainId],
    queryFn: () => fetchFeed(deployment.chainId),
    enabled,
    refetchInterval: 5_000,
    staleTime: 4_000,
    retry: 1,
  });

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.trim();
  const backendQuery = useQuery({
    queryKey: ["backend-pulls", backendUrl, address],
    queryFn: () => fetchBackendPulls(backendUrl as string, address as `0x${string}`),
    enabled: Boolean(enabled && backendUrl && address),
    refetchInterval: 15_000,
    retry: 0,
  });

  const items = useMemo(() => {
    const own: RecentPull[] = ownPull ? [pullResultToRecent(ownPull)] : [];

    if (IS_DEMO_MODE) {
      return toFeedItems(dedupePulls(own, getMockFeed(), 20), machine);
    }

    const symbolFor = new Map(
      machine.stocks.map((stock) => [stock.address.toLowerCase(), stock.symbol])
    );
    const backendPulls = (backendQuery.data ?? []).map((pull) => ({
      ...pull,
      stocks: pull.stocks.map((stock) => ({
        ...stock,
        symbol: symbolFor.get(stock.address.toLowerCase()) ?? stock.symbol,
      })),
    })).slice(0, 10);
    const chainPulls = (feedQuery.data?.pulls ?? []).map(feedPullToRecent);
    return toFeedItems(
      dedupePulls([...own, ...backendPulls], chainPulls, 20),
      machine
    );
  }, [ownPull, machine, backendQuery.data, feedQuery.data]);

  return {
    items,
    loading: enabled && feedQuery.isLoading && items.length === 0,
    error: feedQuery.error instanceof Error ? feedQuery.error.message : null,
  };
}
