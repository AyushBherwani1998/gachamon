"use client";

import { usePrivy } from "@privy-io/react-auth";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useConnect, useDisconnect } from "wagmi";

export interface AuthActions {
  /** Opens the Privy login modal, or the injected connector in fallback mode. */
  signIn: () => void;
  signOut: () => void;
  isPending: boolean;
  ready: boolean;
  error: string | null;
  mode: "privy" | "injected";
}

const AuthActionsContext = createContext<AuthActions | null>(null);

export function useAuthActions(): AuthActions {
  const context = useContext(AuthActionsContext);
  if (!context) {
    throw new Error("useAuthActions must be used inside the app providers");
  }
  return context;
}

/** Provides login/logout for the Privy tree. */
export function PrivyAuthBridge({ children }: { children: ReactNode }) {
  const { login, logout, ready, error } = usePrivy();

  const value = useMemo<AuthActions>(
    () => ({
      signIn: () => login(),
      signOut: () => {
        void logout();
      },
      isPending: false,
      ready,
      error: error?.message ?? null,
      mode: "privy",
    }),
    [login, logout, ready, error]
  );

  return (
    <AuthActionsContext.Provider value={value}>{children}</AuthActionsContext.Provider>
  );
}

/** Provides connect/disconnect for the no-Privy fallback tree. */
export function InjectedAuthBridge({ children }: { children: ReactNode }) {
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();

  const signIn = useCallback(() => {
    const connector =
      connectors.find((candidate) => candidate.id === "injected") ?? connectors[0];
    if (connector) connect({ connector });
  }, [connect, connectors]);

  const value = useMemo<AuthActions>(
    () => ({
      signIn,
      signOut: () => disconnect(),
      isPending,
      ready: true,
      error: error?.message ?? null,
      mode: "injected",
    }),
    [signIn, disconnect, isPending, error]
  );

  return (
    <AuthActionsContext.Provider value={value}>{children}</AuthActionsContext.Provider>
  );
}
