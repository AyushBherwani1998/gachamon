"use client";

import { useMemo } from "react";
import type { Address } from "viem";
import { useAccount, useBalance, useReadContract, useReadContracts } from "wagmi";

import { clawMachineAbi } from "@/abi/clawMachine";
import { erc20Abi } from "@/abi/erc20";
import { deployment, isDeployed, IS_DEMO_MODE } from "@/config/deployments";
import { getMockBalances } from "@/lib/mock";
import type { BalanceSnapshot } from "@/lib/types";
import { shortAddress } from "@/lib/format";

interface ReadResult {
  status: "success" | "failure";
  result?: unknown;
}

function pick<T>(data: readonly ReadResult[] | undefined, index: number): T | undefined {
  const item = data?.[index];
  return item?.status === "success" ? (item.result as T) : undefined;
}

export function useBalances(): BalanceSnapshot {
  const { address, chainId } = useAccount();
  const enabled =
    !IS_DEMO_MODE && Boolean(address) && chainId === deployment.chainId;
  const machineDeployed = isDeployed(deployment.clawMachine);

  const monRead = useBalance({
    address,
    chainId: deployment.chainId,
    query: { enabled, refetchInterval: 5_000 },
  });

  const usdcRead = useReadContract({
    address: deployment.usdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: deployment.chainId,
    query: { enabled: enabled && isDeployed(deployment.usdc), refetchInterval: 5_000 },
  });

  const allowanceRead = useReadContract({
    address: deployment.usdc,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, deployment.clawMachine] : undefined,
    chainId: deployment.chainId,
    query: {
      enabled: enabled && isDeployed(deployment.usdc) && machineDeployed,
      refetchInterval: 5_000,
    },
  });

  const tokensRead = useReadContract({
    address: deployment.clawMachine,
    abi: clawMachineAbi,
    functionName: "getSupportedTokens",
    chainId: deployment.chainId,
    query: { enabled: enabled && machineDeployed },
  });

  const stockAddresses = useMemo<Address[]>(() => {
    const onchain = tokensRead.data as readonly Address[] | undefined;
    return onchain ? [...onchain] : [];
  }, [tokensRead.data]);

  const infoRead = useReadContracts({
    contracts: stockAddresses.map((token) => ({
      address: deployment.clawMachine,
      abi: clawMachineAbi,
      functionName: "tokenInfo" as const,
      args: [token] as const,
      chainId: deployment.chainId,
    })),
    query: { enabled: enabled && stockAddresses.length > 0, staleTime: 60_000 },
  });

  const balanceContracts = useMemo(
    () =>
      stockAddresses.map((token) => ({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf" as const,
        args: address ? ([address] as const) : undefined,
        chainId: deployment.chainId,
      })),
    [stockAddresses, address]
  );

  const balancesRead = useReadContracts({
    contracts: balanceContracts,
    query: {
      enabled: enabled && Boolean(address) && stockAddresses.length > 0,
      refetchInterval: 5_000,
    },
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

  if (IS_DEMO_MODE) {
    const mock = getMockBalances();
    return { ...mock, refetch: () => {} };
  }

  const stocks = stockAddresses.map((token, index) => {
    const symbol =
      pick<string>(symbolsRead.data as readonly ReadResult[] | undefined, index) ??
      shortAddress(token);
    return {
      address: token,
      symbol,
      balance: pick<bigint>(balancesRead.data as readonly ReadResult[] | undefined, index) ?? 0n,
    };
  });

  return {
    mon: monRead.data?.value,
    usdc: usdcRead.data as bigint | undefined,
    allowance: allowanceRead.data as bigint | undefined,
    stocks,
    refetch: () => {
      void monRead.refetch();
      void usdcRead.refetch();
      void allowanceRead.refetch();
      void tokensRead.refetch();
      void infoRead.refetch();
      void balancesRead.refetch();
      void symbolsRead.refetch();
    },
  };
}
