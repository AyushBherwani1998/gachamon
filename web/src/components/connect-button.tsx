"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";

import { Button } from "@/components/ui/8bit/button";
import { shortAddress } from "@/lib/format";

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        <span className="amount hidden text-xs text-muted-foreground sm:inline">
          {shortAddress(address)}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="min-h-11"
          onClick={() => disconnect()}
          aria-label="Disconnect wallet"
        >
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        className="min-h-11"
        disabled={isPending}
        onClick={() => {
          const connector =
            connectors.find((candidate) => candidate.id === "injected") ?? connectors[0];
          if (connector) connect({ connector });
        }}
      >
        {isPending ? "Connecting…" : "Connect wallet"}
      </Button>
      {error ? (
        <p className="max-w-56 text-right text-[10px] text-destructive" role="alert">
          {error.message.includes("rejected") ? "Connection cancelled." : error.message}
        </p>
      ) : null}
    </div>
  );
}
