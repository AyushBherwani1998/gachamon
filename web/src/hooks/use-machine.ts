"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { Address } from "viem";
import { useReadContracts } from "wagmi";

import { clawMachineAbi } from "@/abi/clawMachine";
import { erc20Abi } from "@/abi/erc20";
import {
  deployment,
  isDeployed,
  IS_DEMO_MODE,
  XSTOCK_DECIMALS,
  ZERO_ADDRESS,
} from "@/config/deployments";
import { getMockMachine, getMockState, subscribeMock } from "@/lib/mock";
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

/**
 * Reads machine config, supported tokens and live Chainlink prices.
 *
 * Availability is `canPull()` + `paused()`: the Chainlink version reads live
 * on-chain prices, so the old stale-price caveat no longer applies.
 */
export function useMachine(): MachineSnapshot {
  useSyncExternalStore(subscribeMock, getMockState, getMockState);

  const coreCalls = useMemo(
    () =>
      [
        { address: MACHINE, abi: clawMachineAbi, functionName: "paused" },
        { address: MACHINE, abi: clawMachineAbi, functionName: "canPull" },
        { address: MACHINE, abi: clawMachineAbi, functionName: "pullPrice" },
        { address: MACHINE, abi: clawMachineAbi, functionName: "commonPayoutBps" },
        { address: MACHINE, abi: clawMachineAbi, functionName: "legendaryRarityBps" },
        { address: MACHINE, abi: clawMachineAbi, functionName: "legendaryMultiplier" },
        { address: MACHINE, abi: clawMachineAbi, functionName: "maxPriceAge" },
        { address: MACHINE, abi: clawMachineAbi, functionName: "pendingReservations" },
        { address: MACHINE, abi: clawMachineAbi, functionName: "nextPullId" },
        { address: MACHINE, abi: clawMachineAbi, functionName: "getFee" },
        { address: MACHINE, abi: clawMachineAbi, functionName: "getSupportedTokens" },
        { address: MACHINE, abi: clawMachineAbi, functionName: "getInventoryValue" },
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
    const onchain = pick<readonly Address[]>(data, 10);
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

  const priceContracts = useMemo(
    () =>
      tokens.map((token) => ({
        address: MACHINE,
        abi: clawMachineAbi,
        functionName: "getTokenPrice" as const,
        args: [token] as const,
        chainId: deployment.chainId,
      })),
    [tokens]
  );

  const pricesRead = useReadContracts({
    contracts: priceContracts,
    query: {
      enabled: ACTIVE && tokens.length > 0,
      refetchInterval: 10_000,
      retry: 1,
    },
  });

  const stocks = useMemo<StockMeta[]>(() => {
    const infos = infosRead.data as readonly ReadResult[] | undefined;
    const symbols = symbolsRead.data as readonly ReadResult[] | undefined;
    return tokens.map((token, index) => {
      const info = pick<readonly [Address, number, boolean]>(infos, index);
      const symbol = pick<string>(symbols, index) ?? shortAddress(token);
      return {
        address: token,
        symbol,
        decimals: info?.[1] ?? XSTOCK_DECIMALS,
        priceFeed: info?.[0] ?? ZERO_ADDRESS,
      };
    });
  }, [tokens, infosRead.data, symbolsRead.data]);

  const prices = useMemo(() => {
    const results = pricesRead.data as readonly ReadResult[] | undefined;
    return tokens.map(
      (_, index) => pick<readonly [bigint, bigint]>(results, index)?.[0] ?? 0n
    );
  }, [tokens, pricesRead.data]);

  const pullPrice = pick<bigint>(data, 2);
  const commonBps = pick<number>(data, 3);
  const legendaryBps = pick<number>(data, 4);
  const legendaryMultiplier = pick<number>(data, 5);

  const legendaryPayout =
    pullPrice !== undefined && legendaryMultiplier !== undefined
      ? pullPrice * BigInt(legendaryMultiplier)
      : undefined;
  const commonPayout =
    pullPrice !== undefined && commonBps !== undefined
      ? (pullPrice * BigInt(commonBps)) / 10_000n
      : undefined;

  const pricesUpdatedAt = useMemo(() => {
    const results = pricesRead.data as readonly ReadResult[] | undefined;
    const times = tokens.flatMap((_, index) => {
      const updatedAt = pick<readonly [bigint, bigint]>(results, index)?.[1];
      return updatedAt === undefined ? [] : [updatedAt];
    });
    if (times.length === 0) return undefined;
    return times.reduce((max, time) => (time > max ? time : max));
  }, [tokens, pricesRead.data]);

  if (IS_DEMO_MODE) return getMockMachine();

  const paused = pick<boolean>(data, 0) ?? false;
  const canPull = pick<boolean>(data, 1) ?? false;

  return {
    isDeployed: ACTIVE,
    isLoading:
      ACTIVE && (reads.isLoading || infosRead.isLoading || pricesRead.isLoading),
    paused,
    pullable: ACTIVE && canPull && !paused,
    pullPrice,
    commonPayout,
    legendaryPayout,
    legendaryBps,
    legendaryMultiplier,
    maxPriceAge: pick<bigint>(data, 6),
    totalPulls: pick<bigint>(data, 8),
    inventoryValueUsd6: pick<bigint>(data, 11),
    reservedValueUsd6: pick<bigint>(data, 7) ?? 0n,
    entropyFee: pick<bigint>(data, 9),
    pricesUpdatedAt,
    stocks,
    prices,
    error:
      reads.error instanceof Error
        ? reads.error.message
        : pricesRead.error instanceof Error
          ? pricesRead.error.message
          : infosRead.error instanceof Error
            ? infosRead.error.message
            : symbolsRead.error instanceof Error
              ? symbolsRead.error.message
              : null,
    refetch: () => {
      void reads.refetch();
      void infosRead.refetch();
      void symbolsRead.refetch();
      void pricesRead.refetch();
    },
  };
}
