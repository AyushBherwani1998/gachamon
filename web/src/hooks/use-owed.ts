"use client";

import { useCallback, useMemo, useState } from "react";
import type { Address, Hex } from "viem";
import { useAccount, usePublicClient, useReadContract, useReadContracts, useWriteContract } from "wagmi";

import { clawMachineAbi } from "@/abi/clawMachine";
import { erc20Abi } from "@/abi/erc20";
import { deployment, isDeployed, IS_DEMO_MODE } from "@/config/deployments";
import { friendlyTxError } from "@/lib/errors";
import { shortAddress } from "@/lib/format";

interface ReadResult {
  status: "success" | "failure";
  result?: unknown;
}

function pick<T>(data: readonly ReadResult[] | undefined, index: number): T | undefined {
  const item = data?.[index];
  return item?.status === "success" ? (item.result as T) : undefined;
}

export interface OwedBalance {
  address: Address;
  symbol: string;
  amount: bigint;
}

/**
 * Tokens whose automatic transfer failed are recorded on-chain and returned by
 * `getOwedBalance(player)`. `withdrawOwed()` retries every token at once.
 */
export function useOwed() {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient({ chainId: deployment.chainId });
  const { writeContractAsync } = useWriteContract();
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<Hex | null>(null);

  const enabled =
    !IS_DEMO_MODE &&
    Boolean(address) &&
    chainId === deployment.chainId &&
    isDeployed(deployment.clawMachine);

  const owedRead = useReadContract({
    address: deployment.clawMachine,
    abi: clawMachineAbi,
    functionName: "getOwedBalance",
    args: address ? [address] : undefined,
    chainId: deployment.chainId,
    query: { enabled, refetchInterval: 5_000 },
  });

  const [stockAddresses, amounts] = useMemo(() => {
    const tuple = owedRead.data as
      | readonly [readonly Address[], readonly bigint[]]
      | undefined;
    return [tuple?.[0] ?? [], tuple?.[1] ?? []] as const;
  }, [owedRead.data]);

  const symbolsRead = useReadContracts({
    contracts: stockAddresses.map((token) => ({
      address: token,
      abi: erc20Abi,
      functionName: "symbol" as const,
      chainId: deployment.chainId,
    })),
    query: { enabled: enabled && stockAddresses.length > 0, staleTime: 60_000 },
  });

  const entries = useMemo<OwedBalance[]>(() => {
    return stockAddresses.flatMap((token, index) => {
      const amount = amounts[index] ?? 0n;
      if (amount === 0n) return [];
      const symbol =
        pick<string>(symbolsRead.data as readonly ReadResult[] | undefined, index) ??
        shortAddress(token);
      return [{ address: token, symbol, amount }];
    });
  }, [stockAddresses, amounts, symbolsRead.data]);

  const refetch = useCallback(() => {
    void owedRead.refetch();
    void symbolsRead.refetch();
  }, [owedRead, symbolsRead]);

  const withdraw = useCallback(async () => {
    if (!address || !publicClient || !isDeployed(deployment.clawMachine)) return;
    setIsWithdrawing(true);
    setError(null);
    setHash(null);
    try {
      const txHash = await writeContractAsync({
        address: deployment.clawMachine,
        abi: clawMachineAbi,
        functionName: "withdrawOwed",
        chainId: deployment.chainId,
      });
      setHash(txHash);
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      refetch();
    } catch (err) {
      setError(friendlyTxError(err));
    } finally {
      setIsWithdrawing(false);
    }
  }, [address, publicClient, writeContractAsync, refetch]);

  return { entries, isWithdrawing, error, hash, withdraw, refetch };
}
