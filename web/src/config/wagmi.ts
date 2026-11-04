import { createConfig as createPrivyConfig } from "@privy-io/wagmi";
import { createConfig, http } from "wagmi";
import { injected, metaMask } from "wagmi/connectors";

import { DEFAULT_NETWORK, deployments } from "./deployments";
import { monadMainnet, monadTestnetChain } from "./chains";

/**
 * Chain order follows NEXT_PUBLIC_DEFAULT_NETWORK so the wallet and Privy open
 * on the network the deployment targets.
 */
export const supportedChains =
  DEFAULT_NETWORK === "mainnet"
    ? ([monadMainnet, monadTestnetChain] as const)
    : ([monadTestnetChain, monadMainnet] as const);

export const defaultChain = supportedChains[0];

const transports = {
  [monadTestnetChain.id]: http("https://testnet-rpc.monad.xyz"),
  [monadMainnet.id]: http(deployments.mainnet.rpcUrl),
} as const;

/**
 * Privy's wagmi config intentionally has no connectors: @privy-io/wagmi adds
 * the active Privy wallet (embedded or external) as a wagmi connector.
 */
export const privyWagmiConfig = createPrivyConfig({
  chains: supportedChains,
  transports,
  ssr: true,
});

/**
 * Fallback used when NEXT_PUBLIC_PRIVY_APP_ID is not configured. Behaves like
 * the pre-Privy app: injected + MetaMask only.
 */
export const wagmiConfig = createConfig({
  chains: supportedChains,
  connectors: [injected(), metaMask()],
  transports,
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
