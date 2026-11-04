import type { Address, Hex } from "viem";

export interface StockMeta {
  address: Address;
  symbol: string;
  decimals: number;
  /** Chainlink price feed address (or legacy Pyth feed id) from `tokenInfo(token)`. */
  feedId: Hex;
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
  /** Unix seconds. */
  resolvedAt: number;
  stocks: TokenAmount[];
}

export interface MachineSnapshot {
  isDeployed: boolean;
  isLoading: boolean;
  paused: boolean;
  /** Computed from fresh off-chain prices, never from canPull()/getInventoryValue(). */
  pullable: boolean;
  pullPrice?: bigint;
  /** pullPrice * commonPayoutBps / 10000, in USDC 6 decimals. */
  commonPayout?: bigint;
  /** pullPrice * legendaryMultiplier, in USDC 6 decimals. */
  legendaryPayout?: bigint;
  legendaryBps?: number;
  legendaryMultiplier?: number;
  maxPriceAge?: bigint;
  /** `nextPullId()`: pull ids start at 0, so this is also the pull count. */
  totalPulls?: bigint;
  inventoryValueUsd6?: bigint;
  reservedValueUsd6?: bigint;
  /** Entropy fee in MON from `getEntropyFee()`. */
  entropyFee?: bigint;
  /** Latest Pyth publish time across the fetched feeds, unix seconds. */
  pricesUpdatedAt?: bigint;
  stocks: StockMeta[];
  /** Fresh USD price per stock, 6 decimals per 1e18 token units. */
  prices: bigint[];
  error: string | null;
  refetch: () => void;
}

export type PullPhase =
  | "idle"
  | "preparing"
  | "approving"
  | "confirming"
  | "drawing"
  | "revealed"
  | "error";

export interface PullResult {
  pullId: bigint;
  player: Address;
  /** Pyth Entropy sequence from the PullRequested log. */
  sequenceNumber: bigint;
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
  /** True once the 60 s reveal wait has passed; polling continues to 120 s. */
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

export interface PriceQuote {
  token: Address;
  symbol: string;
  feedId: Hex;
  /** Raw Pyth price integer. */
  price: string;
  expo: number;
  /** Normalized USD price, 6 decimals per 1e18 token units. */
  priceUsd6: string;
  publishTime: number;
}

export interface PriceUpdateResponse {
  updateData: Hex[];
  prices: PriceQuote[];
}

export interface FeedStock {
  token: Address;
  symbol: string;
  decimals: number;
  /** Token amount in native decimals, serialized for JSON. */
  amount: string;
}

export interface FeedPull {
  pullId: string;
  player: Address;
  legendary: boolean;
  stocks: FeedStock[];
  blockNumber: string;
  txHash: Hex;
  /** Unix seconds from the resolved block. */
  resolvedAt: number;
}

export interface FeedResponse {
  pulls: FeedPull[];
}
