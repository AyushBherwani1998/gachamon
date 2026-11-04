import { createPublicClient, http, type PublicClient } from "viem";
import { monad, monadTestnet } from "viem/chains";

import { deployments, type NetworkKey } from "@/config/deployments";

/** Server-only viem client for route handlers. */
export function serverClient(network: NetworkKey): PublicClient {
  const deployment = deployments[network];
  return createPublicClient({
    chain: network === "mainnet" ? monad : monadTestnet,
    transport: http(deployment.rpcUrl, { timeout: 10_000 }),
  }) as PublicClient;
}
