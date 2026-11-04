"use client";

import { useAccount, useSwitchChain } from "wagmi";

import { Button } from "@/components/ui/8bit/button";
import { deployment, IS_DEMO_MODE } from "@/config/deployments";

export function NetworkBanner() {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending, error } = useSwitchChain();

  if (IS_DEMO_MODE || !isConnected || chainId === deployment.chainId) return null;

  return (
    <div
      className="border-b-4 border-destructive bg-destructive/15 px-4 py-2"
      role="alert"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2 text-xs">
        <p>
          Wrong network. This machine runs on <strong>{deployment.name}</strong>.
        </p>
        <Button
          size="sm"
          variant="destructive"
          className="min-h-11"
          disabled={isPending}
          onClick={() => switchChain({ chainId: deployment.chainId })}
        >
          {isPending ? "Switching…" : `Switch to ${deployment.name}`}
        </Button>
      </div>
      {error ? <p className="mx-auto w-full max-w-5xl text-[10px]">{error.message}</p> : null}
    </div>
  );
}
