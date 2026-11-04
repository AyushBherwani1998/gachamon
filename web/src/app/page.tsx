"use client";

import { useMemo } from "react";
import { useAccount, useConnect, useSwitchChain } from "wagmi";

import { BalancesPanel } from "@/components/balances-panel";
import { GachaMachine } from "@/components/gacha/gacha-machine";
import { NetworkBanner } from "@/components/network-banner";
import { OddsPanel } from "@/components/odds-panel";
import { OwedPanel } from "@/components/owed-panel";
import { PullButton } from "@/components/pull-button";
import { RecentPulls } from "@/components/recent-pulls";
import { ResultCard, TxLink } from "@/components/result-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent } from "@/components/ui/8bit/card";
import { deployment, isDeployed, IS_DEMO_MODE } from "@/config/deployments";
import { useBalances } from "@/hooks/use-balances";
import { useMachine } from "@/hooks/use-machine";
import { usePull } from "@/hooks/use-pull";
import { formatUsd6 } from "@/lib/format";
import type { PullPhase } from "@/lib/types";

const BUSY_PHASES: PullPhase[] = ["approving", "confirming", "drawing"];

function machineLabel(phase: PullPhase): string {
  switch (phase) {
    case "approving":
      return "CHECKING USDC ALLOWANCE";
    case "confirming":
      return "WAITING FOR YOUR SIGNATURE";
    case "drawing":
      return "CLAW IS SHAKING…";
    case "revealed":
      return "PRIZE DELIVERED";
    case "error":
      return "PULL FAILED — TRY AGAIN";
    default:
      return "INSERT 1 USDC TO PLAY";
  }
}

export default function Home() {
  const { isConnected, chainId, address } = useAccount();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { switchChain } = useSwitchChain();
  const machine = useMachine();
  const balances = useBalances();
  const pull = usePull();

  const demo = IS_DEMO_MODE;
  const busy = BUSY_PHASES.includes(pull.phase);
  const wrongNetwork = !demo && isConnected && chainId !== deployment.chainId;
  const needsApproval =
    !demo &&
    isConnected &&
    !wrongNetwork &&
    machine.pullPrice !== undefined &&
    (balances.allowance ?? 0n) < machine.pullPrice;
  const insufficientUsdc =
    !demo &&
    isConnected &&
    !wrongNetwork &&
    machine.pullPrice !== undefined &&
    balances.usdc !== undefined &&
    balances.usdc < machine.pullPrice;
  const insufficientMon =
    !demo &&
    isConnected &&
    !wrongNetwork &&
    machine.fee !== undefined &&
    balances.mon !== undefined &&
    balances.mon < machine.fee;
  const usdcReady = demo || isDeployed(deployment.usdc);
  const machineReady = demo || (machine.isDeployed && machine.canPull);

  const label = useMemo(() => {
    if (demo) {
      if (busy) return pull.phase === "drawing" ? "Drawing…" : "Starting…";
      return pull.phase === "revealed" ? "Pull again" : "Pull · 1 USDC";
    }
    if (busy) {
      if (pull.phase === "approving") return "Approving USDC…";
      if (pull.phase === "confirming") return "Confirm in wallet…";
      return pull.slow ? "Still drawing…" : "Drawing…";
    }
    if (!isConnected) return "Connect wallet";
    if (wrongNetwork) return `Switch to ${deployment.name}`;
    if (!machine.isDeployed) return "Machine not deployed";
    if (!usdcReady) return "USDC not configured";
    if (machine.isLoading) return "Checking machine…";
    if (machine.paused) return "Machine paused";
    if (!machine.canPull) return "Machine refilling";
    if (pull.phase === "revealed") return "Pull again";
    if (pull.phase === "error") return "Try again";
    if (insufficientUsdc) return "Not enough USDC";
    if (insufficientMon) return "Not enough MON";
    if (needsApproval) return "Approve USDC";
    return "Pull · 1 USDC";
  }, [
    demo,
    busy,
    isConnected,
    wrongNetwork,
    machine.isDeployed,
    usdcReady,
    machine.isLoading,
    machine.paused,
    machine.canPull,
    pull.phase,
    pull.slow,
    insufficientUsdc,
    insufficientMon,
    needsApproval,
  ]);

  const disablePrimary =
    busy ||
    connecting ||
    (!demo && isConnected && !wrongNetwork && !machineReady) ||
    (!demo && isConnected && !wrongNetwork && machineReady && (!usdcReady || insufficientUsdc || insufficientMon));

  const handlePrimary = () => {
    if (busy) return;
    if (!demo && !isConnected) {
      const connector =
        connectors.find((candidate) => candidate.id === "injected") ?? connectors[0];
      if (connector) connect({ connector });
      return;
    }
    if (!demo && wrongNetwork) {
      switchChain({ chainId: deployment.chainId });
      return;
    }
    if (!demo && (!machine.isDeployed || !usdcReady || !machineReady || insufficientUsdc || insufficientMon)) return;
    if (pull.phase === "revealed" || pull.phase === "error") {
      pull.reset();
    }
    void pull.start();
  };

  const liveMessage = useMemo(() => {
    if (pull.phase === "approving") return "Approving USDC. Confirm the approval in your wallet.";
    if (pull.phase === "confirming") return "Confirm the pull transaction in your wallet.";
    if (pull.phase === "drawing") {
      return pull.slow
        ? "Still waiting for Pyth Entropy. The pull is pending; keep this page open."
        : "Drawing your card. Waiting for Pyth Entropy randomness.";
    }
    if (pull.phase === "revealed" && pull.result) {
      const symbols = pull.result.stocks.map((stock) => stock.symbol).join(", ");
      return `${pull.result.legendary ? "Legendary" : "Common"} pull! You received ${symbols} worth ${formatUsd6(pull.result.valueUsd6)}.`;
    }
    if (pull.phase === "error" && pull.error) return `Pull failed: ${pull.error}`;
    return "";
  }, [pull.phase, pull.result, pull.error, pull.slow]);

  return (
    <div className="flex min-h-screen flex-col">
      <NetworkBanner />
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
        <SiteHeader />

        <main className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="flex flex-col items-center gap-5">
            <div className="flex w-full max-w-sm items-center justify-between border-y-2 border-border/60 py-2 text-[9px] text-muted-foreground">
              <span className="retro">
                PULLS <span className="amount text-foreground">{machine.totalPulls?.toString() ?? "0"}</span>
              </span>
              <span className="retro">
                INVENTORY{" "}
                <span className="amount text-foreground">
                  {formatUsd6(machine.inventoryValueUsd6)}
                </span>
              </span>
              <span
                className={
                  machine.canPull || demo
                    ? "text-primary"
                    : machine.isDeployed
                      ? "text-destructive"
                      : "text-[#ffd45f]"
                }
              >
                {!machine.isDeployed && !demo
                  ? "NOT DEPLOYED"
                  : machine.isLoading
                    ? "SYNCING"
                    : machine.canPull || demo
                      ? "READY"
                      : "REFILLING"}
              </span>
            </div>

            <GachaMachine phase={pull.phase} result={pull.result} label={machineLabel(pull.phase)} />

            <PullButton
              label={label}
              onClick={handlePrimary}
              disabled={disablePrimary}
              busy={busy || connecting}
            />

            {needsApproval && !busy && !insufficientUsdc && !insufficientMon ? (
              <p className="-mt-2 text-[10px] text-muted-foreground">
                One approval covers 5 pulls.
              </p>
            ) : null}

            <p aria-live="polite" role="status" className="sr-only">
              {liveMessage}
            </p>

            <div className="flex w-full max-w-sm flex-col items-center gap-3">
              {pull.phase === "drawing" || pull.phase === "confirming" ? (
                <Card className="w-full" font="normal">
                  <CardContent font="normal" className="flex flex-col gap-2 py-4 text-center">
                    <p className="retro text-[10px] text-primary">DRAWING…</p>
                    <p className="text-[11px] text-muted-foreground">
                      {pull.slow
                        ? "Entropy is taking longer than usual. Keep this page open — we are still polling."
                        : "Your pull is in flight. The callback usually lands within a few seconds."}
                    </p>
                    {pull.pullId !== null ? (
                      <p className="amount text-[10px] text-muted-foreground">
                        Pull #{pull.pullId.toString()}
                      </p>
                    ) : null}
                    {pull.txHash ? <TxLink hash={pull.txHash} /> : null}
                  </CardContent>
                </Card>
              ) : pull.phase === "revealed" && pull.result ? (
                <ResultCard result={pull.result} />
              ) : pull.phase === "error" ? (
                <Card className="w-full border-x-4 border-destructive" font="normal">
                  <CardContent font="normal" className="flex flex-col gap-2 py-4">
                    <p className="retro text-[10px] text-destructive">PULL FAILED</p>
                    <p className="text-[11px] text-muted-foreground" role="alert">
                      {pull.error}
                    </p>
                    {pull.txHash ? <TxLink hash={pull.txHash} /> : null}
                  </CardContent>
                </Card>
              ) : (
                <div className="grid min-h-24 w-full place-items-center border-4 border-dashed border-border/60 px-4 py-5 text-center">
                  <p className="retro text-[9px] leading-relaxed text-muted-foreground">
                    YOUR PRIZE APPEARS HERE
                  </p>
                </div>
              )}
            </div>
          </section>

          <aside className="flex flex-col gap-5">
            <OddsPanel machine={machine} demo={demo} />
            <BalancesPanel />
            <OwedPanel />
            <RecentPulls pulls={machine.recentPulls} player={address} />
          </aside>
        </main>

        <SiteFooter />
      </div>
    </div>
  );
}
