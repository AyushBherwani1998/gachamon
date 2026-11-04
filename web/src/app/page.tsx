"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";

import { useAuthActions } from "@/components/auth-actions";
import { BalancesPanel } from "@/components/balances-panel";
import { PixelGachaMachine } from "@/components/gacha";
import { NetworkBanner } from "@/components/network-banner";
import {
  LiveFeed,
  OddsPanel,
  QrCard,
  ResultCard,
  ShareButton,
} from "@/components/panels";
import { OwedPanel } from "@/components/owed-panel";
import { PullButton } from "@/components/pull-button";
import { TxLink } from "@/components/tx-link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/8bit/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/8bit/card";
import { deployment, explorerTx, IS_DEMO_MODE, isDeployed } from "@/config/deployments";
import { useBalances } from "@/hooks/use-balances";
import { useMachine } from "@/hooks/use-machine";
import { usePull } from "@/hooks/use-pull";
import { formatMon, formatUsd6 } from "@/lib/format";
import { toFeedItems, toGachaResult, toPanelPayouts } from "@/lib/pull-view";
import type { PullPhase } from "@/lib/types";

const BUSY_PHASES: PullPhase[] = ["approving", "confirming", "drawing"];

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";

const MACHINE_ENV =
  deployment.key === "mainnet"
    ? "NEXT_PUBLIC_CLAW_MACHINE_MAINNET"
    : "NEXT_PUBLIC_CLAW_MACHINE_TESTNET";

export default function Home() {
  const { isConnected, chainId } = useAccount();
  const { signIn, isPending: connecting, error: connectError, mode } = useAuthActions();
  const { switchChain } = useSwitchChain();
  const machine = useMachine();
  const balances = useBalances();
  const pull = usePull();
  const [revealed, setRevealed] = useState(false);

  const demo = IS_DEMO_MODE;
  const busy = BUSY_PHASES.includes(pull.phase);
  const wrongNetwork = !demo && isConnected && chainId !== deployment.chainId;
  const notDeployed = !demo && !machine.isDeployed;
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

  const gachaPhase = pull.refunded ? "idle" : pull.phase;
  const gachaResult = pull.result
    ? toGachaResult(
        pull.result,
        machine,
        pull.txHash ? explorerTx(deployment.key, pull.txHash) : undefined
      )
    : undefined;
  const panelPayouts = pull.result
    ? toPanelPayouts(pull.result.stocks, machine, pull.result.valueUsd6)
    : [];
  const feedItems = toFeedItems(machine);

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
    if (connecting) return mode === "privy" ? "Opening sign-in…" : "Connecting…";
    if (!isConnected) return mode === "privy" ? "Sign in to play" : "Connect wallet";
    if (wrongNetwork) return `Switch to ${deployment.name}`;
    if (!machine.isDeployed) return "Machine not deployed";
    if (!usdcReady) return "USDC not configured";
    if (machine.isLoading) return "Checking machine…";
    if (machine.paused) return "Machine paused";
    if (!machine.canPull) return "Machine refilling";
    if (pull.phase === "revealed" || pull.refunded) return "Pull again";
    if (pull.phase === "error") return "Try again";
    if (insufficientUsdc) return "Not enough USDC";
    if (insufficientMon) return "Not enough MON";
    if (needsApproval) return "Approve USDC";
    return "Pull · 1 USDC";
  }, [
    demo,
    busy,
    connecting,
    mode,
    isConnected,
    wrongNetwork,
    machine.isDeployed,
    usdcReady,
    machine.isLoading,
    machine.paused,
    machine.canPull,
    pull.phase,
    pull.slow,
    pull.refunded,
    insufficientUsdc,
    insufficientMon,
    needsApproval,
  ]);

  const disablePrimary =
    busy ||
    connecting ||
    pull.isRefunding ||
    (!demo && isConnected && !wrongNetwork && !machineReady) ||
    (!demo &&
      isConnected &&
      !wrongNetwork &&
      machineReady &&
      (!usdcReady || insufficientUsdc || insufficientMon));

  const handlePrimary = () => {
    if (busy || pull.isRefunding) return;
    if (!demo && !isConnected) {
      signIn();
      return;
    }
    if (!demo && wrongNetwork) {
      switchChain({ chainId: deployment.chainId });
      return;
    }
    if (
      !demo &&
      (!machine.isDeployed || !usdcReady || !machineReady || insufficientUsdc || insufficientMon)
    ) {
      return;
    }
    if (pull.phase === "revealed" || pull.phase === "error") {
      pull.reset();
    }
    setRevealed(false);
    void pull.start();
  };

  const liveMessage = useMemo(() => {
    if (pull.refunded) return "Pull refunded. The 1 USDC pull price was returned.";
    if (pull.phase === "approving") return "Approving USDC. Confirm the approval in your wallet.";
    if (pull.phase === "confirming") return "Confirm the pull transaction in your wallet.";
    if (pull.phase === "drawing") {
      if (pull.refundable) {
        return "This pull has been pending for over ten minutes. A refund is available.";
      }
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
  }, [pull.phase, pull.result, pull.error, pull.slow, pull.refundable, pull.refunded]);

  return (
    <div className="flex min-h-screen flex-col">
      <NetworkBanner />
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
        <SiteHeader />

        {notDeployed ? <NotDeployedNotice /> : null}

        <main className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
          <section className="flex flex-col items-center gap-5">
            <div className="mx-auto w-full min-w-0 max-w-[480px]">
              <PixelGachaMachine
                phase={gachaPhase}
                result={gachaResult}
                onRevealed={() => setRevealed(true)}
              />
            </div>

            <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-3">
              <PullButton
                label={label}
                onClick={handlePrimary}
                disabled={disablePrimary}
                busy={busy || connecting || pull.isRefunding}
              />

              {machine.fee !== undefined ? (
                <p className="amount -mt-1 text-[10px] text-muted-foreground">
                  + {formatMon(machine.fee)} Pyth Entropy fee
                </p>
              ) : null}

              {needsApproval && !busy && !insufficientUsdc && !insufficientMon ? (
                <p className="text-[10px] text-muted-foreground">
                  One approval covers 5 pulls.
                </p>
              ) : null}

              {connectError && !isConnected ? (
                <p className="max-w-sm text-center text-[10px] text-destructive" role="alert">
                  {connectError.includes("rejected")
                    ? "Sign-in cancelled."
                    : connectError}
                </p>
              ) : null}

              <p aria-live="polite" role="status" className="sr-only">
                {liveMessage}
              </p>
            </div>

            {!notDeployed ? (
              <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
                {pull.refunded ? (
                  <RefundedCard refundTxHash={pull.refundTxHash} />
                ) : pull.phase === "drawing" || pull.phase === "confirming" ? (
                  <PendingCard
                    pullId={pull.pullId}
                    txHash={pull.txHash}
                    slow={pull.slow}
                    refundable={pull.refundable}
                    isRefunding={pull.isRefunding}
                    refundError={pull.refundError}
                    onRefund={() => void pull.refund()}
                  />
                ) : pull.phase === "revealed" && pull.result ? (
                  revealed ? (
                    <ResultCard
                      legendary={pull.result.legendary}
                      payouts={panelPayouts}
                      valueUsd={formatUsd6(pull.result.valueUsd6)}
                      explorerUrl={
                        pull.txHash
                          ? explorerTx(deployment.key, pull.txHash)
                          : undefined
                      }
                      shareUrl={SITE_URL}
                      onPullAgain={handlePrimary}
                    />
                  ) : (
                    <div className="grid min-h-20 place-items-center border-4 border-dashed border-border/60 px-4 py-4 text-center">
                      <p className="retro text-[9px] leading-relaxed text-muted-foreground">
                        Tear the card in the machine to reveal it
                      </p>
                    </div>
                  )
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
                  <div className="grid min-h-24 place-items-center border-4 border-dashed border-border/60 px-4 py-5 text-center">
                    <p className="retro text-[9px] leading-relaxed text-muted-foreground">
                      {demo ? "DEMO MODE READY" : "YOUR PULL APPEARS HERE"}
                    </p>
                  </div>
                )}
              </div>
            ) : null}
          </section>

          <aside className="flex flex-col gap-5">
            <OddsPanel
              legendaryBps={machine.legendaryBps ?? 200}
              commonUsd={formatUsd6(machine.commonValue ?? 730_000n)}
              legendaryUsd={formatUsd6(machine.legendaryValue ?? 10_000_000n)}
              pullPriceUsd={formatUsd6(machine.pullPrice ?? 1_000_000n)}
              inventoryUsd={
                machine.inventoryValueUsd6 === undefined
                  ? undefined
                  : formatUsd6(machine.inventoryValueUsd6)
              }
              totalPulls={machine.totalPulls?.toLocaleString("en-US")}
              loading={machine.isDeployed && machine.isLoading}
              statusLabel={notDeployed ? "Offline" : undefined}
            />

            <BalancesPanel />
            <OwedPanel />
          </aside>
        </main>

        <section className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
          <LiveFeed
            items={feedItems}
            loading={machine.isDeployed && machine.isLoading && feedItems.length === 0}
            error={
              notDeployed
                ? `ClawMachine is not deployed on ${deployment.name} yet.`
                : machine.error ?? undefined
            }
            explorerBase={deployment.explorerUrl}
          />

          <div className="flex flex-col gap-4">
            <QrCard
              url={SITE_URL}
              caption={
                deployment.key === "testnet"
                  ? "Free play on testnet · scan to pull"
                  : "Scan to pull real xStocks"
              }
              networkLabel={deployment.key === "testnet" ? "Testnet" : "Mainnet"}
            />
            <ShareButton
              text="Pull real tokenized stocks from the pixel claw machine on @monad. 1 USDC per pull, verifiable randomness by Pyth. #MonadBlitz @monad_dev @geeky_kartikey"
              url={SITE_URL}
              label="Share the machine"
            />
          </div>
        </section>

        <SiteFooter />
      </div>
    </div>
  );
}

function PendingCard({
  pullId,
  txHash,
  slow,
  refundable,
  isRefunding,
  refundError,
  onRefund,
}: {
  pullId: bigint | null;
  txHash: `0x${string}` | null;
  slow: boolean;
  refundable: boolean;
  isRefunding: boolean;
  refundError: string | null;
  onRefund: () => void;
}) {
  return (
    <Card className="w-full" font="normal">
      <CardHeader font="normal" className="pb-2">
        <CardTitle className="retro text-[10px] text-primary">DRAWING…</CardTitle>
      </CardHeader>
      <CardContent font="normal" className="flex flex-col gap-3">
        <p className="text-[11px] text-muted-foreground">
          {slow
            ? "Pyth Entropy is taking longer than usual. Keep this page open while we poll."
            : "Your pull is in flight. The entropy callback usually lands within a few seconds."}
        </p>
        {pullId !== null ? (
          <p className="amount text-[10px] text-muted-foreground">
            Pull #{pullId.toString()}
          </p>
        ) : null}
        {txHash ? <TxLink hash={txHash} /> : null}

        {refundable ? (
          <div className="flex flex-col gap-2 border-t-2 border-border/60 pt-3">
            <p className="text-[11px] text-muted-foreground">
              This pull has been pending for over ten minutes. You can refund the
              1 USDC pull price instead of waiting.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="min-h-11 w-full"
              disabled={isRefunding}
              onClick={onRefund}
            >
              {isRefunding ? "Refunding…" : "Refund pull"}
            </Button>
            {refundError ? (
              <p className="text-[10px] text-destructive" role="alert">
                {refundError}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="border-t-2 border-border/60 pt-3 text-[10px] text-muted-foreground">
            If the callback never arrives, a refund unlocks 10 minutes after the request.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function RefundedCard({ refundTxHash }: { refundTxHash: `0x${string}` | null }) {
  return (
    <Card className="w-full border-x-4 border-[#ffd45f]" font="normal">
      <CardHeader font="normal" className="pb-2">
        <CardTitle className="retro text-[10px] text-[#ffd45f]">PULL REFUNDED</CardTitle>
      </CardHeader>
      <CardContent font="normal" className="flex flex-col gap-2">
        <p className="text-[11px] text-muted-foreground">
          The entropy callback did not arrive in time, so the pull price was
          returned. If the machine could not send it immediately, it appears in
          your claimable balance.
        </p>
        {refundTxHash ? <TxLink hash={refundTxHash} /> : null}
      </CardContent>
    </Card>
  );
}

function NotDeployedNotice() {
  return (
    <Card className="w-full border-x-4 border-[#ffd45f]" font="normal">
      <CardHeader font="normal" className="pb-2">
        <CardTitle className="retro text-[10px] text-[#ffd45f]">
          NOT DEPLOYED ON {deployment.name.toUpperCase()} YET
        </CardTitle>
      </CardHeader>
      <CardContent font="normal" className="flex flex-col gap-3 text-[11px] text-muted-foreground">
        <p>
          The ClawMachine address for this network is not configured. Set{" "}
          <code className="amount text-foreground">{MACHINE_ENV}</code>
          {deployment.key === "testnet" ? (
            <>
              {" "}and <code className="amount text-foreground">NEXT_PUBLIC_USDC_TESTNET</code>
            </>
          ) : null}{" "}
          to the deployed addresses, then rebuild.
        </p>
        <p>
          Want to try the full flow without a chain? Run{" "}
          <code className="amount text-foreground">
            NEXT_PUBLIC_DEMO_MODE=mock bun run dev
          </code>{" "}
          or open the{" "}
          <Link href="/preview" className="text-primary underline decoration-dotted underline-offset-4">
            static UI preview
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  );
}
