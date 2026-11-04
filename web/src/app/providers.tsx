"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider as PrivyWagmiProvider } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";

import { InjectedAuthBridge, PrivyAuthBridge } from "@/components/auth-actions";
import { IS_PRIVY_ENABLED, PRIVY_APP_ID, privyConfig } from "@/config/privy";
import { privyWagmiConfig, wagmiConfig } from "@/config/wagmi";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  if (IS_PRIVY_ENABLED && PRIVY_APP_ID) {
    // Privy adds its connector at runtime, so its config intentionally has no
    // connectors. The app's wagmi Register type is based on the fallback
    // config, hence the cast at this provider boundary.
    const config = privyWagmiConfig as unknown as typeof wagmiConfig;
    return (
      <PrivyProvider appId={PRIVY_APP_ID} config={privyConfig}>
        <QueryClientProvider client={queryClient}>
          <PrivyWagmiProvider config={config}>
            <PrivyAuthBridge>{children}</PrivyAuthBridge>
          </PrivyWagmiProvider>
        </QueryClientProvider>
      </PrivyProvider>
    );
  }

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <InjectedAuthBridge>{children}</InjectedAuthBridge>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
