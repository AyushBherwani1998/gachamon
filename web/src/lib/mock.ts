import type { Address } from "viem";

import type { MachineSnapshot, PullResult, RecentPull, StockMeta } from "./types";

/**
 * In-memory chain simulator for NEXT_PUBLIC_DEMO_MODE=mock.
 * No wallet, RPC or contract needed — just enough shape to build/demo the UI.
 */

const mockStockList: Array<StockMeta & { priceUsd6: bigint }> = [
  {
    address: "0x1111111111111111111111111111111111111111",
    symbol: "TSLAx",
    decimals: 18,
    priceUsd6: 421_250_000n,
  },
  {
    address: "0x2222222222222222222222222222222222222222",
    symbol: "AAPLx",
    decimals: 18,
    priceUsd6: 232_440_000n,
  },
  {
    address: "0x3333333333333333333333333333333333333333",
    symbol: "NVDAx",
    decimals: 18,
    priceUsd6: 138_210_000n,
  },
  {
    address: "0x4444444444444444444444444444444444444444",
    symbol: "SPYx",
    decimals: 18,
    priceUsd6: 601_320_000n,
  },
];

export const MOCK_PULL_PRICE = 1_000_000n;
export const MOCK_COMMON_VALUE = 730_000n;
export const MOCK_LEGENDARY_VALUE = 10_000_000n;
export const MOCK_FEE = 1_000_000_000_000_000n; // 0.001 MON
export const MOCK_LEGENDARY_BPS = 200;

const players: Address[] = [
  "0x7a3f9c2e4b1d8a6f5e0c3b2d1a4f8e7c9b0d6a2e",
  "0x2c8e5a1f7b3d9e4c6a0f8b2d5e7c1a3f9b4d6e8c",
  "0x9e1b4d7f2a6c8e0b3d5f7a9c1e4b6d8f0a2c5e7b",
  "0x4f6a8c0e2b4d7f9a1c3e5b7d0f2a4c6e8b1d3f5a",
  "0x8d0f2b4a6c8e1d3f5a7b9c0e2d4f6a8b1c3e5d7f",
  "0x6b8d0f2a4c6e8b1d3f5a7c9e0b2d4f6a8c1e3b5d",
];

function makePull(
  id: bigint,
  legendary: boolean,
  stockIndex: number,
  valueUsd6: bigint,
  playerIndex: number,
  resolvedAt: bigint
): RecentPull {
  const stock = mockStockList[stockIndex % mockStockList.length];
  const amount = (valueUsd6 * 10n ** 18n) / stock.priceUsd6;
  return {
    id,
    player: players[playerIndex % players.length],
    legendary,
    valueUsd6,
    resolvedAt,
    stocks: [
      {
        address: stock.address,
        symbol: stock.symbol,
        amount,
      },
    ],
  };
}

// Fixed near the event time so the mock feed doesn't show "390d ago".
const MOCK_NOW = 1_793_780_300n;
const seededRecent: RecentPull[] = [
  makePull(136n, false, 2, 730_000n, 0, MOCK_NOW - 60n),
  makePull(135n, false, 3, 730_000n, 1, MOCK_NOW - 120n),
  makePull(134n, true, 0, 10_000_000n, 2, MOCK_NOW - 180n),
  makePull(133n, false, 1, 730_000n, 3, MOCK_NOW - 240n),
  makePull(132n, false, 0, 730_000n, 4, MOCK_NOW - 300n),
  makePull(131n, false, 2, 730_000n, 5, MOCK_NOW - 360n),
];

interface MockState {
  totalPulls: bigint;
  recentPulls: RecentPull[];
}

let state: MockState = {
  totalPulls: 136n,
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

export function getMockMachine(): MachineSnapshot {
  return {
    isDeployed: true,
    isLoading: false,
    canPull: true,
    paused: false,
    fee: MOCK_FEE,
    pullPrice: MOCK_PULL_PRICE,
    commonValue: MOCK_COMMON_VALUE,
    legendaryValue: MOCK_LEGENDARY_VALUE,
    legendaryBps: MOCK_LEGENDARY_BPS,
    totalPulls: state.totalPulls,
    inventoryValueUsd6: 250_000_000n,
    reservedValueUsd6: 0n,
    pricesUpdatedAt: 0n,
    stocks: mockStockList.map(({ address, symbol, decimals }) => ({
      address,
      symbol,
      decimals,
    })),
    prices: mockStockList.map((stock) => stock.priceUsd6),
    recentPulls: state.recentPulls,
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

/** 2% legendary, matching the contract. */
export function drawMockPull(): PullResult {
  const pullId = state.totalPulls + 1n;
  const legendary = Math.random() * 10_000 < MOCK_LEGENDARY_BPS;
  const valueUsd6 = legendary ? MOCK_LEGENDARY_VALUE : MOCK_COMMON_VALUE;
  const stock = mockStockList[Math.floor(Math.random() * mockStockList.length)];
  const amount = (valueUsd6 * 10n ** 18n) / stock.priceUsd6;
  const result: PullResult = {
    pullId,
    legendary,
    valueUsd6,
    stocks: [{ address: stock.address, symbol: stock.symbol, amount }],
  };

  state = {
    totalPulls: pullId,
    recentPulls: [
      {
        id: pullId,
        player: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
        legendary,
        valueUsd6,
        resolvedAt: BigInt(Math.floor(Date.now() / 1000)),
        stocks: result.stocks,
      },
      ...state.recentPulls,
    ].slice(0, 10),
  };
  emit();
  return result;
}
