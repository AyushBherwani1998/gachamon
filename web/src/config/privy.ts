import type { PrivyClientConfig } from "@privy-io/react-auth";

import { IS_DEMO_MODE } from "./deployments";
import { defaultChain, supportedChains } from "./wagmi";

/** Privy app id from the dashboard. Missing id keeps the injected-wallet fallback. */
export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim();

// Privy app ids are exactly 25 characters. Treat anything else as missing so a
// placeholder value falls back to the injected connector instead of breaking
// the build (Privy throws while rendering an invalid id).
export const IS_PRIVY_ENABLED =
  !!PRIVY_APP_ID && PRIVY_APP_ID.length === 25 && !IS_DEMO_MODE;

export const privyConfig: PrivyClientConfig = {
  loginMethods: ["email", "google", "wallet"],
  supportedChains: [...supportedChains],
  defaultChain,
  embeddedWallets: {
    ethereum: {
      createOnLogin: "users-without-wallets",
    },
  },
  appearance: {
    theme: "dark",
    accentColor: "#d9ff57",
    landingHeader: "Sign in to pull",
    loginMessage: "Use email, Google, or MetaMask. A wallet is created for you if needed.",
    walletList: ["metamask", "detected_wallets"],
    showWalletLoginFirst: false,
  },
};
