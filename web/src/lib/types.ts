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
  /** Last read error, surfaced to the live feed. */
  error: string | null;
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
  /** True once the on-chain refund timeout has elapsed for a pending pull. */
  refundable: boolean;
  refunded: boolean;
  refundTxHash: Hex | null;
  refundError: string | null;
  isRefunding: boolean;
  start: () => Promise<void>;
  reset: () => void;
  refund: () => Promise<void>;
}

export interface BalanceSnapshot {
  mon?: bigint;
  usdc?: bigint;
  allowance?: bigint;
  stocks: Array<{ address: Address; symbol: string; balance: bigint }>;
  refetch: () => void;
}
