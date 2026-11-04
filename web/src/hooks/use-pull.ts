"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseEventLogs, toHex, type Address, type Hex } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";

import { clawMachineAbi } from "@/abi/clawMachine";
import { erc20Abi } from "@/abi/erc20";
import { deployment, isDeployed, IS_DEMO_MODE } from "@/config/deployments";
import { friendlyTxError } from "@/lib/errors";
import { drawMockPull } from "@/lib/mock";
import { fetchPriceUpdate, tokenAmountTo18 } from "@/lib/prices";
import type { PullPhase, PullResult, PullState, TokenAmount } from "@/lib/types";
import { shortAddress } from "@/lib/format";

const POLL_INTERVAL_MS = 1_500;
const MAX_WAIT_MS = 120_000;
const SLOW_AFTER_MS = 60_000;
const LOG_CHUNK = 100n;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Simulated pull for NEXT_PUBLIC_DEMO_MODE=mock. Same interface as the real hook. */
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

async function readSymbol(
  client: NonNullable<ReturnType<typeof usePublicClient>>,
  token: Address
): Promise<string> {
  try {
    return await client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "symbol",
    });
  } catch {
    return shortAddress(token);
  }
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
      // 1. Fresh signed Pyth update from the server proxy (key stays server-side).
      const priceUpdate = await fetchPriceUpdate(deployment.chainId);
      if (runId.current !== currentRun) return;
      let updateData = priceUpdate.updateData;

      const [pullPrice, allowance] = await Promise.all([
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
      ]);

      // 2. Approve the exact pull price when the allowance is short.
      let approved = false;
      if (allowance < pullPrice) {
        if (runId.current !== currentRun) return;
        setPhase("approving");
        const approveHash = await writeContractAsync({
          address: deployment.usdc,
          abi: erc20Abi,
          functionName: "approve",
          args: [deployment.clawMachine, pullPrice],
          chainId: deployment.chainId,
        });
        const approveReceipt = await publicClient.waitForTransactionReceipt({
          hash: approveHash,
        });
        if (approveReceipt.status !== "success") throw new Error("USDC approval reverted.");
        approved = true;
      }

      if (runId.current !== currentRun) return;
      setPhase("confirming");

      // An approval can take minutes; Pyth updates are only valid for the
      // contract's maxPriceAge (60 s by default). Refresh after approval.
      if (approved) {
        const refreshed = await fetchPriceUpdate(deployment.chainId);
        if (runId.current !== currentRun) return;
        updateData = refreshed.updateData;
      }

      // 3. Read the total fee immediately before sending; the first read may be
      // stale after a slow approval. Simulate, then send pull(random, update).
      const fee = await publicClient.readContract({
        address: deployment.clawMachine,
        abi: clawMachineAbi,
        functionName: "getTotalFee",
        args: [updateData],
      });

      const userRandomNumber = toHex(crypto.getRandomValues(new Uint8Array(32)));
      const args = [userRandomNumber, updateData] as const;

      await publicClient.simulateContract({
        address: deployment.clawMachine,
        abi: clawMachineAbi,
        functionName: "pull",
        args,
        value: fee,
        account: address,
      });

      const hash = await writeContractAsync({
        address: deployment.clawMachine,
        abi: clawMachineAbi,
        functionName: "pull",
        args,
        value: fee,
        chainId: deployment.chainId,
      });
      setTxHash(hash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The pull transaction reverted.");
      if (runId.current !== currentRun) return;

      // 5. PullRequested carries the id and the Entropy sequence.
      const requested = parseEventLogs({
        abi: clawMachineAbi,
        eventName: "PullRequested",
        logs: receipt.logs,
      })[0];
      if (!requested) {
        throw new Error("Pull succeeded but no pull id was found in the receipt.");
      }

      const nextPullId = requested.args.pullId;
      const sequenceNumber = requested.args.sequenceNumber;
      setPullId(nextPullId);
      setPhase("drawing");

      // 6. Poll PullResolved (indexed pullId) from the receipt block forward,
      // in chunks of at most 100 blocks, for up to 120 s.
      const startedAt = Date.now();
      let cursor = receipt.blockNumber;
      const found: {
        args: {
          player: Address;
          legendary: boolean;
          stocks: readonly Address[];
          amounts: readonly bigint[];
        } | null;
      } = { args: null };

      while (Date.now() - startedAt < MAX_WAIT_MS) {
        if (runId.current !== currentRun) return;
        try {
          const latest = await publicClient.getBlockNumber();
          let scan = cursor;
          while (scan <= latest) {
            const toBlock = scan + LOG_CHUNK - 1n > latest ? latest : scan + LOG_CHUNK - 1n;
            const logs = await publicClient.getContractEvents({
              address: deployment.clawMachine,
              abi: clawMachineAbi,
              eventName: "PullResolved",
              args: { pullId: nextPullId },
              fromBlock: scan,
              toBlock,
            });
            if (logs.length > 0) {
              found.args = logs[0].args as unknown as typeof found.args;
              break;
            }
            scan = toBlock + 1n;
          }
          cursor = latest + 1n;
        } catch {
          // Transient RPC error: keep the cursor and retry on the next tick.
        }

        if (found.args) break;

        if (Date.now() - startedAt >= SLOW_AFTER_MS) setSlow(true);
        await sleep(POLL_INTERVAL_MS);
      }

      if (!found.args) {
        throw new Error(
          "The entropy callback has not arrived yet. The pull may still resolve; check the explorer."
        );
      }

      const resolved = found.args;

      // 7. USD value from the pull's on-chain price snapshot (USDC per 1e18).
      const rawStocks = resolved.stocks ?? [];
      const rawAmounts = resolved.amounts ?? [];
      const payouts = rawStocks
        .map((token, index) => ({ token, amount: rawAmounts[index] ?? 0n }))
        .filter((payout) => payout.amount > 0n);

      const snapshots = await Promise.all(
        payouts.map(async ({ token, amount }) => {
          try {
            const price = await publicClient.readContract({
              address: deployment.clawMachine,
              abi: clawMachineAbi,
              functionName: "getPullPriceSnapshot",
              args: [nextPullId, token],
            });
            return (tokenAmountTo18(amount, 18) * price) / 10n ** 18n;
          } catch {
            return 0n;
          }
        })
      );
      const valueUsd6 = snapshots.reduce((total, value) => total + value, 0n);

      const stocks: TokenAmount[] = await Promise.all(
        payouts.map(async ({ token, amount }) => ({
          address: token,
          symbol: await readSymbol(publicClient, token),
          amount,
        }))
      );

      if (runId.current !== currentRun) return;
      setResult({
        pullId: nextPullId,
        player: resolved.player,
        sequenceNumber,
        legendary: resolved.legendary,
        valueUsd6,
        stocks,
        txHash: hash,
      });
      setPhase("revealed");
    } catch (err) {
      if (runId.current !== currentRun) return;
      setError(friendlyTxError(err));
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
