"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { Address } from "viem";
import { useReadContracts } from "wagmi";

import { clawMachineAbi } from "@/abi/clawMachine";
import { erc20Abi } from "@/abi/erc20";
import { deployment, isDeployed, IS_DEMO_MODE } from "@/config/deployments";
import { getMockMachine, getMockState, subscribeMock } from "@/lib/mock";
import type { MachineSnapshot, RecentPull, StockMeta } from "@/lib/types";
import { shortAddress } from "@/lib/format";

const MACHINE = deployment.clawMachine;
const ACTIVE = isDeployed(MACHINE);

interface ReadResult {
  status: "success" | "failure";
  result?: unknown;
}

function pick<T>(data: readonly ReadResult[] | undefined, index: number): T | undefined {
  const item = data?.[index];
  return item?.status === "success" ? (item.result as T) : undefined;
}

interface PullStruct {
  player: Address;
  sequenceNumber: bigint;
  status: number;
  legendary: boolean;
  requestedAt: bigint;
  resolvedAt: bigint;
  valueUsd6: bigint;
}

export function useMachine(): MachineSnapshot {
  useSyncExternalStore(subscribeMock, getMockState, getMockState);

  const calls = useMemo(
    () =>
      [
        { address: MACHINE, abi: clawMachineAbi, functionName: "canPull", chainId: deployment.chainId },
        { address: MACHINE, abi: clawMachineAbi, functionName: "getFee", chainId: deployment.chainId },
        { address: MACHINE, abi: clawMachineAbi, functionName: "pullPrice", chainId: deployment.chainId },
        { address: MACHINE, abi: clawMachineAbi, functionName: "commonValue", chainId: deployment.chainId },
        { address: MACHINE, abi: clawMachineAbi, functionName: "legendaryValue", chainId: deployment.chainId },
        { address: MACHINE, abi: clawMachineAbi, functionName: "legendaryBps", chainId: deployment.chainId },
        { address: MACHINE, abi: clawMachineAbi, functionName: "totalPulls", chainId: deployment.chainId },
        { address: MACHINE, abi: clawMachineAbi, functionName: "inventoryValueUsd6", chainId: deployment.chainId },
        { address: MACHINE, abi: clawMachineAbi, functionName: "reservedValueUsd6", chainId: deployment.chainId },
        { address: MACHINE, abi: clawMachineAbi, functionName: "getStocks", chainId: deployment.chainId },
        { address: MACHINE, abi: clawMachineAbi, functionName: "getPrices", chainId: deployment.chainId },
        { address: MACHINE, abi: clawMachineAbi, functionName: "paused", chainId: deployment.chainId },
        { address: MACHINE, abi: clawMachineAbi, functionName: "getRecentPulls", args: [10n], chainId: deployment.chainId },
      ] as const,
    []
  );

  const reads = useReadContracts({
    contracts: calls,
    query: {
      enabled: ACTIVE && !IS_DEMO_MODE,
      refetchInterval: 3_000,
      staleTime: 1_000,
      retry: 1,
    },
  });

  const data = reads.data as readonly ReadResult[] | undefined;

  const stockAddresses = useMemo<Address[]>(() => {
    const onchain = pick<readonly Address[]>(data, 9);
    if (onchain && onchain.length > 0) return [...onchain];
    return deployment.stocks.map((stock) => stock.address);
  }, [data]);

  const symbolContracts = useMemo(
    () =>
      stockAddresses.map((address) => ({
        address,
        abi: erc20Abi,
        functionName: "symbol" as const,
        chainId: deployment.chainId,
      })),
    [stockAddresses]
  );

  const symbolsRead = useReadContracts({
    contracts: symbolContracts,
    query: {
      enabled: ACTIVE && !IS_DEMO_MODE && stockAddresses.length > 0,
      staleTime: 60_000,
      retry: 1,
    },
  });

  const symbols = useMemo(() => {
    const map = new Map<string, string>();
    stockAddresses.forEach((address, index) => {
      const symbol = pick<string>(symbolsRead.data as readonly ReadResult[] | undefined, index);
      const fallback =
        deployment.stocks.find((stock) => stock.address.toLowerCase() === address.toLowerCase())
          ?.symbol ?? shortAddress(address);
      map.set(address.toLowerCase(), symbol ?? fallback);
    });
    return map;
  }, [stockAddresses, symbolsRead.data]);

  const recentIds = useMemo(() => [...(pick<readonly bigint[]>(data, 12) ?? [])], [data]);

  const detailContracts = useMemo(
    () =>
      recentIds.flatMap((pullId) => [
        {
          address: MACHINE,
          abi: clawMachineAbi,
          functionName: "getPull" as const,
          args: [pullId] as const,
          chainId: deployment.chainId,
        },
        {
          address: MACHINE,
          abi: clawMachineAbi,
          functionName: "getPullPayout" as const,
          args: [pullId] as const,
          chainId: deployment.chainId,
        },
      ]),
    [recentIds]
  );

  const detailsRead = useReadContracts({
    contracts: detailContracts,
    query: {
      enabled: ACTIVE && !IS_DEMO_MODE && detailContracts.length > 0,
      refetchInterval: 3_000,
      retry: 1,
    },
  });

  const recentPulls = useMemo<RecentPull[]>(() => {
    const details = detailsRead.data as readonly ReadResult[] | undefined;
    return recentIds.flatMap((pullId, index) => {
      const pull = pick<PullStruct>(details, index * 2);
      if (!pull || pull.status !== 2) return [];
      const payout = pick<readonly [readonly Address[], readonly bigint[]]>(details, index * 2 + 1);
      const payoutStocks = payout?.[0] ?? [];
      const amounts = payout?.[1] ?? [];
      return [
        {
          id: pullId,
          player: pull.player,
          legendary: pull.legendary,
          valueUsd6: pull.valueUsd6,
          resolvedAt: pull.resolvedAt,
          stocks: payoutStocks.map((address, i) => ({
            address,
            symbol: symbols.get(address.toLowerCase()) ?? shortAddress(address),
            amount: amounts[i] ?? 0n,
          })),
        },
      ];
    });
  }, [detailsRead.data, recentIds, symbols]);

  if (IS_DEMO_MODE) {
    return getMockMachine();
  }

  const pricesTuple = pick<readonly [readonly bigint[], bigint]>(data, 10);
  const prices = pricesTuple?.[0] ? [...pricesTuple[0]] : [];
  const stockMeta: StockMeta[] = stockAddresses.map((address) => ({
    address,
    symbol: symbols.get(address.toLowerCase()) ?? shortAddress(address),
    decimals: 18,
  }));

  return {
    isDeployed: ACTIVE,
    isLoading: ACTIVE && reads.isLoading,
    canPull: pick<boolean>(data, 0) ?? false,
    paused: pick<boolean>(data, 11) ?? false,
    fee: pick<bigint>(data, 1),
    pullPrice: pick<bigint>(data, 2),
    commonValue: pick<bigint>(data, 3),
    legendaryValue: pick<bigint>(data, 4),
    legendaryBps: pick<number>(data, 5),
    totalPulls: pick<bigint>(data, 6),
    inventoryValueUsd6: pick<bigint>(data, 7),
    reservedValueUsd6: pick<bigint>(data, 8),
    pricesUpdatedAt: pricesTuple?.[1],
    stocks: stockMeta,
    prices,
    recentPulls,
    refetch: () => {
      void reads.refetch();
      void symbolsRead.refetch();
      void detailsRead.refetch();
    },
  };
}
