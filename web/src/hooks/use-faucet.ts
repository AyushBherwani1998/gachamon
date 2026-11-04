"use client";

import { useCallback, useState } from "react";
import type { Hex } from "viem";
import { BaseError } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";

import { mockUsdcAbi } from "@/abi/erc20";
import { deployment, isDeployed, IS_DEMO_MODE } from "@/config/deployments";

function friendlyError(error: unknown): string {
  if (error instanceof BaseError) {
    if (/user rejected|denied/i.test(error.shortMessage)) return "Transaction cancelled.";
    return error.shortMessage;
  }
  if (error instanceof Error) {
    if (/user rejected|denied/i.test(error.message)) return "Transaction cancelled.";
    return error.message;
  }
  return "Could not claim test USDC.";
}

/** Calls MockUSDC.faucet() on testnet (100 USDC per claim). */
export function useFaucet() {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient({ chainId: deployment.chainId });
  const { writeContractAsync } = useWriteContract();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<Hex | null>(null);

  const claim = useCallback(async () => {
    if (IS_DEMO_MODE) return;
    if (!address) {
      setError("Connect a wallet first.");
      return;
    }
    if (chainId !== deployment.chainId) {
      setError(`Switch to ${deployment.name} first.`);
      return;
    }
    if (!publicClient || !isDeployed(deployment.usdc)) {
      setError("Test USDC is not configured yet.");
      return;
    }

    setError(null);
    setIsPending(true);
    try {
      const txHash = await writeContractAsync({
        address: deployment.usdc,
        abi: mockUsdcAbi,
        functionName: "faucet",
        chainId: deployment.chainId,
      });
      setHash(txHash);
      await publicClient.waitForTransactionReceipt({ hash: txHash });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setIsPending(false);
    }
  }, [address, chainId, publicClient, writeContractAsync]);

  return { claim, isPending, error, hash };
}
