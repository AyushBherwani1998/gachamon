import { getAddress, type Address } from "viem";

import { monadMainnet, monadTestnetChain, EXPLORERS } from "./chains";

export type NetworkKey = "mainnet" | "testnet";

export interface StockInfo {
  symbol: string;
  address: Address;
  decimals: number;
}

export interface Deployment {
  key: NetworkKey;
  chainId: typeof monadMainnet.id | typeof monadTestnetChain.id;
  chain: typeof monadMainnet | typeof monadTestnetChain;
  name: string;
  clawMachine: Address;
  usdc: Address;
  /** Known stock addresses. Testnet stocks are discovered on-chain via getStocks(). */
  stocks: StockInfo[];
  explorerUrl: string;
}

export const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

/** Canonical Monad mainnet USDC (6 decimals). */
export const USDC_MAINNET: Address = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603";

/** Canonical Pyth Entropy V2 address (same on mainnet and testnet). */
export const PYTH_ENTROPY: Address = "0xD458261E832415CFd3BAE5E416FdF3230ce6F134";

function envAddress(value: string | undefined, fallback: Address = ZERO_ADDRESS): Address {
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value)) return fallback;
  try {
    return getAddress(value);
  } catch {
    return fallback;
  }
}

const mainnetStocks: StockInfo[] = [
  {
    symbol: "TSLAx",
    address: "0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0",
    decimals: 18,
  },
  {
    symbol: "AAPLx",
    address: "0x9d275685dc284c8eb1c79f6aba7a63dc75ec890a",
    decimals: 18,
  },
  {
    symbol: "NVDAx",
    address: "0xc845b2894dbddd03858fd2d643b4ef725fe0849d",
    decimals: 18,
  },
  {
    symbol: "SPYx",
    address: "0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48",
    decimals: 18,
  },
];

export const deployments: Record<NetworkKey, Deployment> = {
  mainnet: {
    key: "mainnet",
    chainId: monadMainnet.id,
    chain: monadMainnet,
    name: "Monad",
    clawMachine: envAddress(process.env.NEXT_PUBLIC_CLAW_MACHINE_MAINNET),
    usdc: USDC_MAINNET,
    stocks: mainnetStocks,
    explorerUrl: EXPLORERS.mainnet,
  },
  testnet: {
    key: "testnet",
    chainId: monadTestnetChain.id,
    chain: monadTestnetChain,
    name: "Monad Testnet",
    clawMachine: envAddress(process.env.NEXT_PUBLIC_CLAW_MACHINE_TESTNET),
    usdc: envAddress(process.env.NEXT_PUBLIC_USDC_TESTNET),
    stocks: [],
    explorerUrl: EXPLORERS.testnet,
  },
};

export const DEFAULT_NETWORK: NetworkKey =
  process.env.NEXT_PUBLIC_DEFAULT_NETWORK === "mainnet" ? "mainnet" : "testnet";

export const deployment = deployments[DEFAULT_NETWORK];

export const IS_DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "mock";

/** True when a real contract address has been configured. */
export function isDeployed(address: Address | undefined): boolean {
  return Boolean(address) && address !== ZERO_ADDRESS;
}

export function explorerAddress(network: NetworkKey, address: string): string {
  return `${deployments[network].explorerUrl}/address/${address}`;
}

export function explorerTx(network: NetworkKey, hash: string): string {
  return `${deployments[network].explorerUrl}/tx/${hash}`;
}
