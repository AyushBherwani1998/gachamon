"use client";

import { useAccount } from "wagmi";

import { Button } from "@/components/ui/8bit/button";
import { useFaucet } from "@/hooks/use-faucet";
import { deployment, IS_DEMO_MODE } from "@/config/deployments";

export function FaucetButton() {
  const { isConnected, chainId } = useAccount();
  const { claim, isPending, error } = useFaucet();

  if (IS_DEMO_MODE || deployment.key !== "testnet") return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="secondary"
        className="min-h-11"
        disabled={!isConnected || chainId !== deployment.chainId || isPending}
        onClick={() => void claim()}
      >
        {isPending ? "Minting…" : "Get test USDC"}
      </Button>
      {error ? (
        <p className="max-w-64 text-right text-[10px] text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
