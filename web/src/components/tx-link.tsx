import type { Hex } from "viem";

import { deployment, explorerTx } from "@/config/deployments";

export function TxLink({ hash }: { hash: Hex }) {
  return (
    <a
      href={explorerTx(deployment.key, hash)}
      target="_blank"
      rel="noopener noreferrer"
      className="amount inline-flex min-h-11 items-center text-[10px] text-primary underline decoration-dotted underline-offset-4 hover:text-foreground"
    >
      View transaction on explorer ↗
    </a>
  );
}
