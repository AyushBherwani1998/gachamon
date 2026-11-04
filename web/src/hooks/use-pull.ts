"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BaseError, parseEventLogs, type Address, type Hex } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";

import { clawMachineAbi, PullStatus } from "@/abi/clawMachine";
import { erc20Abi } from "@/abi/erc20";
import { deployment, isDeployed, IS_DEMO_MODE } from "@/config/deployments";
import { drawMockPull } from "@/lib/mock";
import type { PullPhase, PullResult, PullState, TokenAmount } from "@/lib/types";
import { shortAddress } from "@/lib/format";

const POLL_INTERVAL_MS = 500;
const SLOW_AFTER_MS = 60_000;
const GIVE_UP_AFTER_MS = 5 * 60_000;

function friendlyError(error: unknown): string {
  if (error instanceof BaseError) {
    if (/user rejected|denied/i.test(error.shortMessage)) return "Transaction cancelled.";
    return error.shortMessage;
  }
  if (error instanceof Error) {
    if (/user rejected|denied/i.test(error.message)) return "Transaction cancelled.";
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Simulated pull for NEXT_PUBLIC_DEMO_MODE=mock. Same interface as the real
 * hook, resolves after a 1.5 s "draw" with 2% legendary odds.
 */
function useMockPull(): PullState {
  const [phase, setPhase] = useState<PullPhase>("idle");
  const [result, setResult] = useState<PullResult | null>(null);
  const [slow, setSlow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const start = useCallback(async () => {
    setSlow(false);
    setResult(null);
    setPhase("drawing");
    await new Promise<void>((resolve) => {
      timer.current = setTimeout(resolve, 1_500);
    });
    setResult(drawMockPull());
    setPhase("revealed");
  }, []);

  const reset = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setPhase("idle");
    setResult(null);
    setSlow(false);
  }, []);

  return {
    phase,
    pullId: result?.pullId ?? null,
    result,
    error: null,
    txHash: null,
    slow,
    start,
    reset,
  };
}

export function usePull(): PullState {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient({ chainId: deployment.chainId });
  const { writeContractAsync } = useWriteContract();

  const [phase, setPhase] = useState<PullPhase>("idle");
  const [pullId, setPullId] = useState<bigint | null>(null);
  const [result, setResult] = useState<PullResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [slow, setSlow] = useState(false);
  const runId = useRef(0);

  useEffect(
    () => () => {
      runId.current += 1;
    },
    []
  );

  const start = useCallback(async () => {
    if (IS_DEMO_MODE) return;
    if (!address) {
      setError("Connect a wallet first.");
      setPhase("error");
      return;
    }
    if (chainId !== deployment.chainId) {
      setError(`Switch your wallet to ${deployment.name} first.`);
      setPhase("error");
      return;
    }
    if (!publicClient || !isDeployed(deployment.clawMachine)) {
      setError("The machine is not deployed on this network yet.");
      setPhase("error");
      return;
    }
    if (!isDeployed(deployment.usdc)) {
      setError("USDC is not configured for this network.");
      setPhase("error");
      return;
    }

    const currentRun = ++runId.current;
    setError(null);
    setResult(null);
    setPullId(null);
    setTxHash(null);
    setSlow(false);

    try {
      const [pullPrice, fee, allowance] = await Promise.all([
        publicClient.readContract({
          address: deployment.clawMachine,
          abi: clawMachineAbi,
          functionName: "pullPrice",
        }),
        publicClient.readContract({
          address: deployment.clawMachine,
          abi: clawMachineAbi,
          functionName: "getFee",
        }),
        publicClient.readContract({
          address: deployment.usdc,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, deployment.clawMachine],
        }),
      ]);

      if (allowance < pullPrice) {
        setPhase("approving");
        const approveHash = await writeContractAsync({
          address: deployment.usdc,
          abi: erc20Abi,
          functionName: "approve",
          args: [deployment.clawMachine, pullPrice * 5n],
          chainId: deployment.chainId,
        });
        const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash });
        if (approveReceipt.status !== "success") throw new Error("USDC approval reverted.");
      }

      if (runId.current !== currentRun) return;
      setPhase("confirming");
      const hash = await writeContractAsync({
        address: deployment.clawMachine,
        abi: clawMachineAbi,
        functionName: "pull",
        value: fee,
        chainId: deployment.chainId,
      });
      setTxHash(hash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The pull transaction reverted.");
      if (runId.current !== currentRun) return;

      let nextPullId: bigint | undefined;

      // Decode PullRequested from the pull() receipt.
      const events = parseEventLogs({
        abi: clawMachineAbi,
        eventName: "PullRequested",
        logs: receipt.logs,
      });
      if (events.length > 0) {
        nextPullId = events[0].args.pullId;
      }

      if (nextPullId === undefined) {
        throw new Error("Pull succeeded but no pull id was found in the receipt.");
      }

      setPullId(nextPullId);
      setPhase("drawing");

      const startedAt = Date.now();
      let resolved = false;
      let markedSlow = false;
      let pollFailures = 0;
      while (runId.current === currentRun) {
        let pull;
        try {
          pull = await publicClient.readContract({
            address: deployment.clawMachine,
            abi: clawMachineAbi,
            functionName: "getPull",
            args: [nextPullId],
          });
          pollFailures = 0;
        } catch (pollError) {
          pollFailures += 1;
          if (pollFailures > 20) throw pollError;
          await sleep(POLL_INTERVAL_MS);
          continue;
        }

        if (pull.status === PullStatus.Resolved) {
          resolved = true;
          const [payoutStocks, amounts] = await publicClient.readContract({
            address: deployment.clawMachine,
            abi: clawMachineAbi,
            functionName: "getPullPayout",
            args: [nextPullId],
          });

          const tokens: TokenAmount[] = await Promise.all(
            payoutStocks.map(async (stock: Address, index: number) => {
              let symbol = shortAddress(stock);
              try {
                symbol = await publicClient.readContract({
                  address: stock,
                  abi: erc20Abi,
                  functionName: "symbol",
                });
              } catch {
                // keep the short address fallback
              }
              return { address: stock, symbol, amount: amounts[index] ?? 0n };
            })
          );

          if (runId.current !== currentRun) return;
          setResult({
            pullId: nextPullId,
            legendary: pull.legendary,
            valueUsd6: pull.valueUsd6,
            stocks: tokens,
            txHash: hash,
          });
          setPhase("revealed");
          break;
        }

        const elapsed = Date.now() - startedAt;
        if (elapsed >= SLOW_AFTER_MS && !markedSlow) {
          markedSlow = true;
          setSlow(true);
        }
        if (elapsed >= GIVE_UP_AFTER_MS) {
          throw new Error(
            "The entropy callback is taking longer than usual. Track the pull on the explorer or try again."
          );
        }
        await sleep(POLL_INTERVAL_MS);
      }

      if (!resolved && runId.current === currentRun) {
        throw new Error("Pull did not resolve. Check the explorer for its status.");
      }
    } catch (err) {
      if (runId.current !== currentRun) return;
      setError(friendlyError(err));
      setPhase("error");
    }
  }, [address, chainId, publicClient, writeContractAsync]);

  const reset = useCallback(() => {
    runId.current += 1;
    setPhase("idle");
    setPullId(null);
    setResult(null);
    setError(null);
    setTxHash(null);
    setSlow(false);
  }, []);

  const mock = useMockPull();

  if (IS_DEMO_MODE) return mock;

  return {
    phase,
    pullId,
    result,
    error,
    txHash,
    slow,
    start,
    reset,
  };
}
