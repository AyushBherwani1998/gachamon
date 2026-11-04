import type { Address, Hex } from "viem";

export interface StockMeta {
  address: Address;
  symbol: string;
  decimals: number;
}

export interface TokenAmount {
  address: Address;
  symbol: string;
  amount: bigint;
}

export interface RecentPull {
  id: bigint;
  player: Address;
  legendary: boolean;
  valueUsd6: bigint;
  resolvedAt: bigint;
  stocks: TokenAmount[];
}

export interface MachineSnapshot {
  isDeployed: boolean;
  isLoading: boolean;
  canPull: boolean;
  paused: boolean;
  fee?: bigint;
  pullPrice?: bigint;
  commonValue?: bigint;
  legendaryValue?: bigint;
  legendaryBps?: number;
  totalPulls?: bigint;
  inventoryValueUsd6?: bigint;
  reservedValueUsd6?: bigint;
  pricesUpdatedAt?: bigint;
  stocks: StockMeta[];
  prices: bigint[];
  recentPulls: RecentPull[];
  refetch: () => void;
}

export type PullPhase =
  | "idle"
  | "approving"
  | "confirming"
  | "drawing"
  | "revealed"
  | "error";

export interface PullResult {
  pullId: bigint;
  legendary: boolean;
  valueUsd6: bigint;
  stocks: TokenAmount[];
  txHash?: Hex;
}

export interface PullState {
  phase: PullPhase;
  pullId: bigint | null;
  result: PullResult | null;
  error: string | null;
  txHash: Hex | null;
  /** True once the 60 s reveal wait has passed; polling continues. */
  slow: boolean;
  start: () => Promise<void>;
  reset: () => void;
}

export interface BalanceSnapshot {
  mon?: bigint;
  usdc?: bigint;
  allowance?: bigint;
  stocks: Array<{ address: Address; symbol: string; balance: bigint }>;
  refetch: () => void;
}
