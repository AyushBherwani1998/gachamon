import { createConfig, http } from "wagmi";
import { injected, metaMask } from "wagmi/connectors";

import { monadMainnet, monadTestnetChain } from "./chains";

export const wagmiConfig = createConfig({
  chains: [monadTestnetChain, monadMainnet],
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
