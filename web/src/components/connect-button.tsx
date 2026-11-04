"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";

import { Button } from "@/components/ui/8bit/button";
import { shortAddress } from "@/lib/format";

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => disconnect()}
        aria-label="Disconnect wallet"
      >
        {shortAddress(address)}
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      disabled={isPending}
      onClick={() => {
        const connector = connectors[0];
        if (connector) connect({ connector });
      }}
    >
      {isPending ? "Connecting..." : "Connect"}
    </Button>
  );
}
