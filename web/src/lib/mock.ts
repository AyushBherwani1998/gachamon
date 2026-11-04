import type { Address, Hex } from "viem";

import type { MachineSnapshot, PullResult, RecentPull } from "./types";

/**
 * In-memory chain simulator for NEXT_PUBLIC_DEMO_MODE=mock.
 * No wallet, RPC or contract needed — just enough shape to build/demo the UI.
 * The launch token list is TSLAx only, so the mock matches what players see.
 */

const TSLA_FEED_ID =
  "0x16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1" as Hex;

const TSLAX: Address = "0x8aD3c73F833d3F9A523aB01476625F269aEB7Cf0";
const TSLA_PRICE_USD6 = 421_250_000n;

const mockStockList = [
  {
    address: TSLAX,
    symbol: "TSLAx",
    decimals: 18,
    feedId: TSLA_FEED_ID,
    priceUsd6: TSLA_PRICE_USD6,
  },
];

export const MOCK_PULL_PRICE = 1_000_000n;
export const MOCK_COMMON_VALUE = 730_000n;
export const MOCK_LEGENDARY_VALUE = 10_000_000n;
export const MOCK_ENTROPY_FEE = 1_000_000_000_000_000n; // 0.001 MON
export const MOCK_LEGENDARY_BPS = 200;
export const MOCK_LEGENDARY_MULTIPLIER = 10;

const MOCK_PLAYER: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

function makePull(
  id: bigint,
  legendary: boolean,
  valueUsd6: bigint,
  player: Address,
  resolvedAt: number
): RecentPull {
  const stock = mockStockList[0];
  const amount = (valueUsd6 * 10n ** 18n) / stock.priceUsd6;
  return {
    id,
    player,
    legendary,
    valueUsd6,
    resolvedAt,
    stocks: [{ address: stock.address, symbol: stock.symbol, amount }],
  };
}

// Fixed near the event time so the mock feed does not show "390d ago".
const MOCK_NOW = 1_793_780_300;
const seededRecent: RecentPull[] = [
  makePull(6n, false, MOCK_COMMON_VALUE, "0x7a3f9c2e4b1d8a6f5e0c3b2d1a4f8e7c9b0d6a2e", MOCK_NOW - 60),
  makePull(5n, false, MOCK_COMMON_VALUE, "0x2c8e5a1f7b3d9e4c6a0f8b2d5e7c1a3f9b4d6e8c", MOCK_NOW - 120),
  makePull(4n, true, MOCK_LEGENDARY_VALUE, "0x9e1b4d7f2a6c8e0b3d5f7a9c1e4b6d8f0a2c5e7b", MOCK_NOW - 180),
  makePull(3n, false, MOCK_COMMON_VALUE, "0x4f6a8c0e2b4d7f9a1c3e5b7d0f2a4c6e8b1d3f5a", MOCK_NOW - 240),
  makePull(2n, false, MOCK_COMMON_VALUE, "0x8d0f2b4a6c8e1d3f5a7b9c0e2d4f6a8b1c3e5d7f", MOCK_NOW - 300),
  makePull(1n, false, MOCK_COMMON_VALUE, "0x6b8d0f2a4c6e8b1d3f5a7c9e0b2d4f6a8c1e3b5d", MOCK_NOW - 360),
];

interface MockState {
  totalPulls: bigint;
  recentPulls: RecentPull[];
}

let state: MockState = {
  totalPulls: 7n,
  recentPulls: seededRecent,
};

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeMock(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getMockState(): MockState {
  return state;
}

export function getMockFeed(): RecentPull[] {
  return state.recentPulls;
}

export function getMockMachine(): MachineSnapshot {
  return {
    isDeployed: true,
    isLoading: false,
    paused: false,
    pullable: true,
    pullPrice: MOCK_PULL_PRICE,
    commonPayout: MOCK_COMMON_VALUE,
    legendaryPayout: MOCK_LEGENDARY_VALUE,
    legendaryBps: MOCK_LEGENDARY_BPS,
    legendaryMultiplier: MOCK_LEGENDARY_MULTIPLIER,
    maxPriceAge: 60n,
    totalPulls: state.totalPulls,
    inventoryValueUsd6: 250_000_000n,
    reservedValueUsd6: 0n,
    entropyFee: MOCK_ENTROPY_FEE,
    pricesUpdatedAt: BigInt(MOCK_NOW),
    stocks: mockStockList.map(({ address, symbol, decimals, feedId }) => ({
      address,
      symbol,
      decimals,
      feedId,
    })),
    prices: mockStockList.map((stock) => stock.priceUsd6),
    error: null,
    refetch: () => {},
  };
}

export function getMockBalances() {
  return {
    mon: 12_480_000_000_000_000_000n,
    usdc: 42_500_000n,
    allowance: 0n,
    stocks: mockStockList.map((stock, index) => ({
      address: stock.address,
      symbol: stock.symbol,
      balance: BigInt(index + 1) * 3_210_000_000_000_000_000n,
    })),
  };
}

/** 2% legendary, matching the contract defaults. */
export function drawMockPull(): PullResult {
  const pullId = state.totalPulls;
  const legendary = Math.random() * 10_000 < MOCK_LEGENDARY_BPS;
  const valueUsd6 = legendary ? MOCK_LEGENDARY_VALUE : MOCK_COMMON_VALUE;
  const stock = mockStockList[0];
  const amount = (valueUsd6 * 10n ** 18n) / stock.priceUsd6;
  const result: PullResult = {
    pullId,
    player: MOCK_PLAYER,
    sequenceNumber: pullId + 1_000n,
    legendary,
    valueUsd6,
    stocks: [{ address: stock.address, symbol: stock.symbol, amount }],
  };

  state = {
    totalPulls: pullId + 1n,
    recentPulls: [
      {
        id: pullId,
        player: MOCK_PLAYER,
        legendary,
        valueUsd6,
        resolvedAt: Math.floor(Date.now() / 1_000),
        stocks: result.stocks,
      },
      ...state.recentPulls,
    ].slice(0, 10),
  };
  emit();
  return result;
}
