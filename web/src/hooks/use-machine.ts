"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useSyncExternalStore } from "react";
import type { Address, Hex } from "viem";
import { useReadContracts } from "wagmi";

import { clawMachineAbi } from "@/abi/clawMachine";
import { erc20Abi } from "@/abi/erc20";
import { deployment, isDeployed, IS_DEMO_MODE, XSTOCK_DECIMALS } from "@/config/deployments";
import { getMockMachine, getMockState, subscribeMock } from "@/lib/mock";
import { fetchPriceUpdate, tokenAmountTo18 } from "@/lib/prices";
import type { MachineSnapshot, StockMeta } from "@/lib/types";
import { shortAddress } from "@/lib/format";

const MACHINE = deployment.clawMachine;
const ACTIVE = !IS_DEMO_MODE && isDeployed(MACHINE);

interface ReadResult {
  status: "success" | "failure";
  result?: unknown;
}

function pick<T>(data: readonly ReadResult[] | undefined, index: number): T | undefined {
  const item = data?.[index];
  return item?.status === "success" ? (item.result as T) : undefined;
}

/** Normalize a token amount to 18 decimals for USD math. */
function to18(amount: bigint, decimals: number): bigint {
  return tokenAmountTo18(amount, decimals);
}

/**
 * Reads the machine config, supported tokens and fresh off-chain prices.
 *
 * Availability is deliberately NOT `canPull()`/`getInventoryValue()`: those
 * use stored on-chain prices that go stale between pulls and report false/0
 * even when a pull would succeed. We value inventory with the same fresh Pyth
 * prices the pull will submit.
 */
export function useMachine(): MachineSnapshot {
  useSyncExternalStore(subscribeMock, getMockState, getMockState);

  const coreCalls = useMemo(
    () =>
      [
        { address: MACHINE, abi: clawMachineAbi, functionName: "paused" },
        { address: MACHINE, abi: clawMachineAbi, functionName: "pullPrice" },
        { address: MACHINE, abi: clawMachineAbi, functionName: "commonPayoutBps" },
        { address: MACHINE, abi: clawMachineAbi, functionName: "legendaryRarityBps" },
        { address: MACHINE, abi: clawMachineAbi, functionName: "legendaryMultiplier" },
        { address: MACHINE, abi: clawMachineAbi, functionName: "maxPriceAge" },
        { address: MACHINE, abi: clawMachineAbi, functionName: "pendingReservations" },
        { address: MACHINE, abi: clawMachineAbi, functionName: "nextPullId" },
        { address: MACHINE, abi: clawMachineAbi, functionName: "getEntropyFee" },
        { address: MACHINE, abi: clawMachineAbi, functionName: "getSupportedTokens" },
      ] as const,
    []
  );

  const reads = useReadContracts({
    contracts: coreCalls.map((call) => ({ ...call, chainId: deployment.chainId })),
    query: {
      enabled: ACTIVE,
      refetchInterval: 5_000,
      staleTime: 2_000,
      retry: 1,
    },
  });

  const data = reads.data as readonly ReadResult[] | undefined;

  const tokens = useMemo<Address[]>(() => {
    const onchain = pick<readonly Address[]>(data, 9);
    return onchain ? [...onchain] : [];
  }, [data]);

  const infoContracts = useMemo(
    () =>
      tokens.map((token) => ({
        address: MACHINE,
        abi: clawMachineAbi,
        functionName: "tokenInfo" as const,
        args: [token] as const,
        chainId: deployment.chainId,
      })),
    [tokens]
  );

  const infosRead = useReadContracts({
    contracts: infoContracts,
    query: { enabled: ACTIVE && tokens.length > 0, staleTime: 60_000, retry: 1 },
  });

  const symbolContracts = useMemo(
    () =>
      tokens.map((token) => ({
        address: token,
        abi: erc20Abi,
        functionName: "symbol" as const,
        chainId: deployment.chainId,
      })),
    [tokens]
  );

  const symbolsRead = useReadContracts({
    contracts: symbolContracts,
    query: { enabled: ACTIVE && tokens.length > 0, staleTime: 60_000, retry: 1 },
  });

  const balanceContracts = useMemo(
    () =>
      tokens.map((token) => ({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf" as const,
        args: [MACHINE] as const,
        chainId: deployment.chainId,
      })),
    [tokens]
  );

  const balancesRead = useReadContracts({
    contracts: balanceContracts,
    query: {
      enabled: ACTIVE && tokens.length > 0,
      refetchInterval: 5_000,
      retry: 1,
    },
  });

  const priceQuery = useQuery({
    queryKey: ["price-update", deployment.chainId],
    queryFn: () => fetchPriceUpdate(deployment.chainId),
    enabled: ACTIVE,
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: 1,
  });

  const stocks = useMemo<StockMeta[]>(() => {
    const infos = infosRead.data as readonly ReadResult[] | undefined;
    const symbols = symbolsRead.data as readonly ReadResult[] | undefined;
    return tokens.map((token, index) => {
      const info = pick<readonly [Hex, number, boolean]>(infos, index);
      const symbol = pick<string>(symbols, index) ?? shortAddress(token);
      return {
        address: token,
        symbol,
        decimals: info?.[1] ?? XSTOCK_DECIMALS,
        feedId: info?.[0] ?? (`0x${"0".repeat(64)}` as Hex),
      };
    });
  }, [tokens, infosRead.data, symbolsRead.data]);

  const prices = useMemo<bigint[]>(() => {
    const quotes = new Map(
      (priceQuery.data?.prices ?? []).map((quote) => [
        quote.token.toLowerCase(),
        BigInt(quote.priceUsd6 || "0"),
      ])
    );
    return stocks.map((stock) => quotes.get(stock.address.toLowerCase()) ?? 0n);
  }, [priceQuery.data, stocks]);

  const balances = useMemo(() => {
    const results = balancesRead.data as readonly ReadResult[] | undefined;
    return tokens.map((_, index) => pick<bigint>(results, index) ?? 0n);
  }, [tokens, balancesRead.data]);

  const pullPrice = pick<bigint>(data, 1);
  const commonBps = pick<number>(data, 2);
  const legendaryBps = pick<number>(data, 3);
  const legendaryMultiplier = pick<number>(data, 4);
  const pendingReservations = pick<bigint>(data, 6) ?? 0n;

  const legendaryPayout =
    pullPrice !== undefined && legendaryMultiplier !== undefined
      ? pullPrice * BigInt(legendaryMultiplier)
      : undefined;
  const commonPayout =
    pullPrice !== undefined && commonBps !== undefined
      ? (pullPrice * BigInt(commonBps)) / 10_000n
      : undefined;

  const inventoryValueUsd6 = useMemo(() => {
    if (stocks.length === 0 || prices.length !== stocks.length) return undefined;
    if (prices.every((price) => price === 0n)) return undefined;
    return stocks.reduce((total, stock, index) => {
      const balance = balances[index] ?? 0n;
      const price = prices[index] ?? 0n;
      if (balance === 0n || price === 0n) return total;
      return total + (to18(balance, stock.decimals) * price) / 10n ** 18n;
    }, 0n);
  }, [stocks, prices, balances]);

  const paused = pick<boolean>(data, 0) ?? false;
  const pullable =
    ACTIVE &&
    !paused &&
    inventoryValueUsd6 !== undefined &&
    legendaryPayout !== undefined &&
    inventoryValueUsd6 >= legendaryPayout + pendingReservations;

  const pricesUpdatedAt = useMemo(() => {
    const times = (priceQuery.data?.prices ?? []).map((quote) => quote.publishTime);
    if (times.length === 0) return undefined;
    return BigInt(Math.max(...times));
  }, [priceQuery.data]);

  const priceError = priceQuery.error instanceof Error ? priceQuery.error.message : null;

  if (IS_DEMO_MODE) return getMockMachine();

  return {
    isDeployed: ACTIVE,
    isLoading: ACTIVE && (reads.isLoading || infosRead.isLoading || priceQuery.isLoading),
    paused,
    pullable,
    pullPrice,
    commonPayout,
    legendaryPayout,
    legendaryBps,
    legendaryMultiplier,
    maxPriceAge: pick<bigint>(data, 5),
    totalPulls: pick<bigint>(data, 7),
    inventoryValueUsd6,
    reservedValueUsd6: pendingReservations,
    entropyFee: pick<bigint>(data, 8),
    pricesUpdatedAt,
    stocks,
    prices,
    error:
      reads.error instanceof Error
        ? reads.error.message
        : priceError ??
          (balancesRead.error instanceof Error
            ? balancesRead.error.message
            : infosRead.error instanceof Error
              ? infosRead.error.message
              : null),
    refetch: () => {
      void reads.refetch();
      void infosRead.refetch();
      void symbolsRead.refetch();
      void balancesRead.refetch();
      void priceQuery.refetch();
    },
  };
}
