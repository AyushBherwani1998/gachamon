"use client";

import { useCallback, useMemo, useState } from "react";
import type { Address, Hex } from "viem";
import { BaseError } from "viem";
import { useAccount, usePublicClient, useReadContract, useReadContracts, useWriteContract } from "wagmi";

import { clawMachineAbi } from "@/abi/clawMachine";
import { erc20Abi } from "@/abi/erc20";
import { deployment, isDeployed, IS_DEMO_MODE } from "@/config/deployments";
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
  decimals: number;
}

function friendlyError(error: unknown): string {
  if (error instanceof BaseError) {
    if (/user rejected|denied/i.test(error.shortMessage)) return "Transaction cancelled.";
    return error.shortMessage;
  }
  if (error instanceof Error) {
    if (/user rejected|denied/i.test(error.message)) return "Transaction cancelled.";
    return error.message;
  }
  return "Could not claim the balance.";
}

/**
 * Tokens whose automatic transfer failed are recorded in `owed(player, token)`.
 * This hook exposes them so the player can retry with `withdrawOwed()`.
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

  const stocksRead = useReadContract({
    address: deployment.clawMachine,
    abi: clawMachineAbi,
    functionName: "getStocks",
    chainId: deployment.chainId,
    query: { enabled },
  });

  const stockAddresses = useMemo<Address[]>(() => {
    const onchain = (stocksRead.data as readonly Address[] | undefined) ?? [];
    return onchain.length > 0 ? [...onchain] : [];
  }, [stocksRead.data]);

  const tokens = useMemo<Address[]>(() => {
    const list = [...stockAddresses];
    if (isDeployed(deployment.usdc)) list.push(deployment.usdc);
    return list;
  }, [stockAddresses]);

  const owedRead = useReadContracts({
    contracts: tokens.map((token) => ({
      address: deployment.clawMachine,
      abi: clawMachineAbi,
      functionName: "owed" as const,
      args: address ? ([address, token] as const) : undefined,
      chainId: deployment.chainId,
    })),
    query: { enabled: enabled && Boolean(address) && tokens.length > 0, refetchInterval: 5_000 },
  });

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
    const owedData = owedRead.data as readonly ReadResult[] | undefined;
    const result: OwedBalance[] = [];
    stockAddresses.forEach((token, index) => {
      const amount = pick<bigint>(owedData, index) ?? 0n;
      if (amount === 0n) return;
      const symbol =
        pick<string>(symbolsRead.data as readonly ReadResult[] | undefined, index) ??
        deployment.stocks.find((stock) => stock.address.toLowerCase() === token.toLowerCase())
          ?.symbol ??
        shortAddress(token);
      result.push({ address: token, symbol, amount, decimals: 18 });
    });
    const usdcIndex = stockAddresses.length;
    const usdcOwed = pick<bigint>(owedData, usdcIndex) ?? 0n;
    if (usdcOwed > 0n && isDeployed(deployment.usdc)) {
      result.push({
        address: deployment.usdc,
        symbol: "USDC",
        amount: usdcOwed,
        decimals: 6,
      });
    }
    return result;
  }, [owedRead.data, symbolsRead.data, stockAddresses]);

  const refetch = useCallback(() => {
    void owedRead.refetch();
  }, [owedRead]);

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
      setError(friendlyError(err));
    } finally {
      setIsWithdrawing(false);
    }
  }, [address, publicClient, writeContractAsync, refetch]);

  return { entries, isWithdrawing, error, hash, withdraw, refetch };
}
