"use client";

import { useAccount } from "wagmi";

import { Button } from "@/components/ui/8bit/button";
import { useFaucet } from "@/hooks/use-faucet";
import { deployment, IS_DEMO_MODE } from "@/config/deployments";
import { TESTNET_FAUCET_URL } from "@/config/chains";

export function FaucetButton() {
  const { isConnected, chainId } = useAccount();
  const { claim, isPending, error } = useFaucet();

  if (IS_DEMO_MODE || deployment.key !== "testnet") return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <a
          href={TESTNET_FAUCET_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center text-[10px] underline decoration-dotted underline-offset-4 hover:text-foreground"
        >
          Need MON?
        </a>
        <Button
          size="sm"
          variant="secondary"
          className="min-h-11"
          disabled={!isConnected || chainId !== deployment.chainId || isPending}
          onClick={() => void claim()}
        >
          {isPending ? "Minting…" : "Get test USDC"}
        </Button>
      </div>
      {error ? (
        <p className="max-w-64 text-right text-[10px] text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
