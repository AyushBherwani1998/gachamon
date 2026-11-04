import { getAddress, type Address } from "viem";

import { monadMainnet, monadTestnetChain, EXPLORERS } from "./chains";

export type NetworkKey = "mainnet" | "testnet";

export interface Deployment {
  key: NetworkKey;
  chainId: typeof monadMainnet.id | typeof monadTestnetChain.id;
  chain: typeof monadMainnet | typeof monadTestnetChain;
  name: string;
  clawMachine: Address;
  /** Block the ClawMachine was deployed at, so feeds can backfill every pull. */
  deployBlock?: bigint;
  usdc: Address;
  rpcUrl: string;
  explorerUrl: string;
}

export const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

/** Canonical Monad mainnet USDC (6 decimals). */
export const USDC_MAINNET: Address = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603";

/** USDC amounts use 6 decimals; xStocks payouts use 18. */
export const USDC_DECIMALS = 6;
export const XSTOCK_DECIMALS = 18;

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

export const deployments: Record<NetworkKey, Deployment> = {
  mainnet: {
    key: "mainnet",
    chainId: monadMainnet.id,
    chain: monadMainnet,
    name: "Monad",
    clawMachine: envAddress(process.env.NEXT_PUBLIC_CLAW_MACHINE_MAINNET),
    deployBlock: 119_302_850n,
    usdc: USDC_MAINNET,
    // Optional override, e.g. a local `anvil --fork-url https://rpc.monad.xyz` for rehearsals.
    rpcUrl: process.env.NEXT_PUBLIC_MONAD_RPC_URL || "https://rpc.monad.xyz",
    explorerUrl: EXPLORERS.mainnet,
  },
  testnet: {
    key: "testnet",
    chainId: monadTestnetChain.id,
    chain: monadTestnetChain,
    name: "Monad Testnet",
    clawMachine: envAddress(process.env.NEXT_PUBLIC_CLAW_MACHINE_TESTNET),
    usdc: envAddress(process.env.NEXT_PUBLIC_USDC_TESTNET),
    rpcUrl: "https://testnet-rpc.monad.xyz",
    explorerUrl: EXPLORERS.testnet,
  },
};

/**
 * Mainnet is the real demo; testnet stays one env var away. The stock list is
 * never configured here: the app reads `getSupportedTokens()` + `tokenInfo()`
 * so a token added on-chain shows up without a rebuild.
 */
export const DEFAULT_NETWORK: NetworkKey =
  process.env.NEXT_PUBLIC_DEFAULT_NETWORK === "testnet" ? "testnet" : "mainnet";

export const deployment = deployments[DEFAULT_NETWORK];

export const IS_DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "mock";

/** True when a real contract address has been configured. */
export function isDeployed(address: Address | undefined): boolean {
  return Boolean(address) && address !== ZERO_ADDRESS;
}

export function networkByChainId(chainId: number): NetworkKey | undefined {
  if (chainId === monadMainnet.id) return "mainnet";
  if (chainId === monadTestnetChain.id) return "testnet";
  return undefined;
}

/** Server routes accept ?chainId=143|10143; default to the configured network. */
export function resolveNetwork(chainId: number | undefined): NetworkKey | undefined {
  if (chainId === undefined) return DEFAULT_NETWORK;
  return networkByChainId(chainId);
}

export function explorerAddress(network: NetworkKey, address: string): string {
  return `${deployments[network].explorerUrl}/address/${address}`;
}

export function explorerTx(network: NetworkKey, hash: string): string {
  return `${deployments[network].explorerUrl}/tx/${hash}`;
}
