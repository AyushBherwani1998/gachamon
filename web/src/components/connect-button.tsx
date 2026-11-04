"use client";

import { useAccount } from "wagmi";

import { useAuthActions } from "@/components/auth-actions";
import { Button } from "@/components/ui/8bit/button";
import { shortAddress } from "@/lib/format";

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { signIn, signOut, isPending, ready, error, mode } = useAuthActions();
  const privy = mode === "privy";

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        <span className="amount text-[10px] text-muted-foreground sm:text-xs">
          {shortAddress(address)}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="min-h-11"
          onClick={signOut}
          aria-label={privy ? "Log out of Privy" : "Disconnect wallet"}
        >
          {privy ? "Log out" : "Disconnect"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        className="min-h-11"
        disabled={isPending || !ready}
        onClick={signIn}
      >
        {isPending ? "Connecting…" : privy ? "Sign in" : "Connect wallet"}
      </Button>
      {error ? (
        <p className="max-w-56 text-right text-[10px] text-destructive" role="alert">
          {error.includes("rejected") ? "Sign-in cancelled." : error}
        </p>
      ) : null}
    </div>
  );
}
