import { defineChain, isAddress, type Address, type Chain } from "viem";
import type { PriceSource } from "./prices";

export const monadMainnet: Chain = defineChain({
  id: 143,
  name: "Monad",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.monad.xyz"] } },
  blockExplorers: {
    default: { name: "Monadscan", url: "https://monadscan.com" },
  },
});

export const monadTestnet: Chain = defineChain({
  id: 10_143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
  blockExplorers: {
    default: { name: "Monad Testnet Scan", url: "https://testnet.monadscan.com" },
  },
  testnet: true,
});

export type NetworkName = "mainnet" | "testnet";

export interface Config {
  network: NetworkName;
  chain: Chain;
  rpcUrl: string;
  explorerUrl: string;
  contract?: Address;
  privateKey?: `0x${string}`;
  intervalSeconds: number;
  priceSource: PriceSource;
  pythApiKey?: string;
  maxDeviationBps: bigint;
}

function parseNetwork(value: string | undefined): NetworkName {
  const network = (value || "mainnet").trim().toLowerCase();
  if (network !== "mainnet" && network !== "testnet") {
    throw new Error(`NETWORK must be "mainnet" or "testnet", got "${value}"`);
  }
  return network;
}

function parseInteger(name: string, value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer, got "${value}"`);
  }
  return parsed;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const network = parseNetwork(env.NETWORK);
  const chain = network === "mainnet" ? monadMainnet : monadTestnet;
  const explorerUrl = chain.blockExplorers?.default.url ?? "https://monadscan.com";

  const address = env.CLAW_MACHINE_ADDRESS?.trim();
  if (address && !isAddress(address)) {
    throw new Error(`CLAW_MACHINE_ADDRESS is not a valid address: "${address}"`);
  }

  const privateKey = env.KEEPER_PRIVATE_KEY?.trim();
  if (privateKey && !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("KEEPER_PRIVATE_KEY must be a 0x-prefixed 32-byte hex string");
  }

  const source = (env.PRICE_SOURCE || "xstocks").trim().toLowerCase();
  if (source !== "xstocks" && source !== "pyth" && source !== "auto") {
    throw new Error(`PRICE_SOURCE must be "xstocks", "pyth" or "auto", got "${env.PRICE_SOURCE}"`);
  }

  const maxDeviationBps = BigInt(parseInteger("MAX_DEVIATION_BPS", env.MAX_DEVIATION_BPS, 2_500));
  if (maxDeviationBps > 10_000n) {
    throw new Error("MAX_DEVIATION_BPS must be <= 10000 (100%)");
  }

  return {
    network,
    chain,
    rpcUrl: env.RPC_URL?.trim() || chain.rpcUrls.default.http[0],
    explorerUrl,
    contract: address ? (address as Address) : undefined,
    privateKey: privateKey ? (privateKey as `0x${string}`) : undefined,
    intervalSeconds: parseInteger("INTERVAL_SECONDS", env.INTERVAL_SECONDS, 60),
    priceSource: source,
    pythApiKey: env.PYTH_API_KEY?.trim() || undefined,
    maxDeviationBps,
  };
}
