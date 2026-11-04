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
const DEFAULT_REFUND_TIMEOUT = 10n * 60n; // contract STUCK_PULL_TIMEOUT fallback

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
    refundable: false,
    refunded: false,
    refundTxHash: null,
    refundError: null,
    isRefunding: false,
    start,
    reset,
    refund: async () => {},
  };
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
  const [refundable, setRefundable] = useState(false);
  const [refunded, setRefunded] = useState(false);
  const [refundTxHash, setRefundTxHash] = useState<Hex | null>(null);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [isRefunding, setIsRefunding] = useState(false);
  const runId = useRef(0);
  const refundTimeout = useRef<bigint>(DEFAULT_REFUND_TIMEOUT);

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
    setRefundable(false);
    setRefunded(false);
    setRefundTxHash(null);
    setRefundError(null);
    setIsRefunding(false);

    try {
      const [pullPrice, allowance, timeout] = await Promise.all([
        publicClient.readContract({
          address: deployment.clawMachine,
          abi: clawMachineAbi,
          functionName: "pullPrice",
        }),
        publicClient.readContract({
          address: deployment.usdc,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, deployment.clawMachine],
        }),
        publicClient.readContract({
          address: deployment.clawMachine,
          abi: clawMachineAbi,
          functionName: "STUCK_PULL_TIMEOUT",
        }),
      ]);
      refundTimeout.current = timeout;

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

      // Read the entropy fee immediately before sending the pull. Approval
      // waits can be minutes long and the fee is not cached across them.
      const fee = await publicClient.readContract({
        address: deployment.clawMachine,
        abi: clawMachineAbi,
        functionName: "getFee",
      });

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
        let pull: PullStruct;
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
          setRefundable(false);

          // A zero-value resolved pull is a refund, not a prize.
          if (pull.valueUsd6 === 0n && !pull.legendary) {
            if (runId.current !== currentRun) return;
            setRefunded(true);
            setPhase("revealed");
            break;
          }

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

        const nowSeconds = BigInt(Math.floor(Date.now() / 1_000));
        if (
          pull.requestedAt > 0n &&
          nowSeconds > pull.requestedAt + refundTimeout.current
        ) {
          setRefundable(true);
        }

        const elapsed = Date.now() - startedAt;
        if (elapsed >= SLOW_AFTER_MS && !markedSlow) {
          markedSlow = true;
          setSlow(true);
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

  const refund = useCallback(async () => {
    if (pullId === null || !publicClient || !address) return;
    if (chainId !== deployment.chainId) {
      setRefundError(`Switch your wallet to ${deployment.name} first.`);
      return;
    }

    setIsRefunding(true);
    setRefundError(null);
    try {
      const hash = await writeContractAsync({
        address: deployment.clawMachine,
        abi: clawMachineAbi,
        functionName: "refundStuckPull",
        args: [pullId],
        chainId: deployment.chainId,
      });
      setRefundTxHash(hash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The refund transaction reverted.");

      runId.current += 1;
      setRefunded(true);
      setRefundable(false);
      setResult(null);
      setPhase("revealed");
    } catch (err) {
      setRefundError(friendlyError(err));
    } finally {
      setIsRefunding(false);
    }
  }, [pullId, publicClient, address, chainId, writeContractAsync]);

  const reset = useCallback(() => {
    runId.current += 1;
    setPhase("idle");
    setPullId(null);
    setResult(null);
    setError(null);
    setTxHash(null);
    setSlow(false);
    setRefundable(false);
    setRefunded(false);
    setRefundTxHash(null);
    setRefundError(null);
    setIsRefunding(false);
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
    refundable,
    refunded,
    refundTxHash,
    refundError,
    isRefunding,
    start,
    reset,
    refund,
  };
}
