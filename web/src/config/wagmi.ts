import { createConfig, http } from "wagmi";
import { injected, metaMask } from "wagmi/connectors";

import { monadMainnet, monadTestnetChain } from "./chains";
import { DEFAULT_NETWORK } from "./deployments";

const chains =
  DEFAULT_NETWORK === "mainnet"
    ? ([monadMainnet, monadTestnetChain] as const)
    : ([monadTestnetChain, monadMainnet] as const);

export const wagmiConfig = createConfig({
  chains,
  connectors: [injected(), metaMask()],
  transports: {
    [monadTestnetChain.id]: http("https://testnet-rpc.monad.xyz"),
    [monadMainnet.id]: http("https://rpc.monad.xyz"),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
