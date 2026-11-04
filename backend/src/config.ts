import 'dotenv/config';
import {
  createPublicClient,
  http,
  isAddress,
  type Address,
  type Chain,
  type PublicClient,
} from 'viem';
import { defineChain } from 'viem';

export type NetworkName = 'mainnet' | 'testnet';

export const MONAD_MAINNET_CHAIN_ID = 143;
export const MONAD_TESTNET_CHAIN_ID = 10143;

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;

function parseNetwork(value: string | undefined): NetworkName {
  const normalized = (value ?? 'mainnet').trim().toLowerCase();

  if (normalized === '' || normalized === 'mainnet' || normalized === '143') {
    return 'mainnet';
  }
  if (normalized === 'testnet' || normalized === '10143') {
    return 'testnet';
  }

  throw new Error(`Unsupported NETWORK "${value}" (expected "mainnet" or "testnet")`);
}

function parseInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === '') return fallback;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name} "${value}" (expected a positive integer)`);
  }

  return parsed;
}

function parseBigInt(value: string | undefined, fallback: bigint, name: string): bigint {
  if (value === undefined || value.trim() === '') return fallback;

  try {
    const parsed = BigInt(value.trim());
    if (parsed < 0n) throw new Error('negative');
    return parsed;
  } catch {
    throw new Error(`Invalid ${name} "${value}" (expected a non-negative integer)`);
  }
}

function parseAddress(value: string | undefined, name: string): Address {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === ZERO_ADDRESS) return ZERO_ADDRESS;

  if (!isAddress(trimmed)) {
    throw new Error(`Invalid ${name} "${value}"`);
  }

  return trimmed;
}

export const network: NetworkName = parseNetwork(process.env.NETWORK);
export const chainId =
  network === 'testnet' ? MONAD_TESTNET_CHAIN_ID : MONAD_MAINNET_CHAIN_ID;

export const monadMainnet: Chain = defineChain({
  id: MONAD_MAINNET_CHAIN_ID,
  name: 'Monad',
  nativeCurrency: {
    decimals: 18,
    name: 'Monad',
    symbol: 'MON',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.monad.xyz'],
      webSocket: ['wss://rpc.monad.xyz'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Monadscan',
      url: 'https://monadscan.com',
    },
  },
});

export const monadTestnet: Chain = defineChain({
  id: MONAD_TESTNET_CHAIN_ID,
  name: 'Monad Testnet',
  testnet: true,
  nativeCurrency: {
    decimals: 18,
    name: 'Monad',
    symbol: 'MON',
  },
  rpcUrls: {
    default: {
      http: ['https://testnet-rpc.monad.xyz'],
      webSocket: ['wss://testnet-rpc.monad.xyz'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Monad Testnet Explorer',
      url: 'https://testnet.monadscan.com',
    },
  },
});

export const monad: Chain = network === 'testnet' ? monadTestnet : monadMainnet;

const startBlockConfigured = process.env.START_BLOCK !== undefined && process.env.START_BLOCK !== '';

export const config = {
  network,
  chainId,
  port: parseInteger(process.env.PORT, 3000, 'PORT'),

  rpcUrl:
    process.env.RPC_URL ||
    (network === 'testnet' ? 'https://testnet-rpc.monad.xyz' : 'https://rpc.monad.xyz'),
  wsUrl:
    process.env.WS_URL ||
    (network === 'testnet' ? 'wss://testnet-rpc.monad.xyz' : 'wss://rpc.monad.xyz'),

  clawMachineAddress: parseAddress(process.env.CLAW_MACHINE_ADDRESS, 'CLAW_MACHINE_ADDRESS'),
  isClawMachineConfigured:
    parseAddress(process.env.CLAW_MACHINE_ADDRESS, 'CLAW_MACHINE_ADDRESS') !== ZERO_ADDRESS,

  // Deployment block of the ClawMachine contract. Used when the local indexer
  // has no checkpoint yet.
  startBlock: parseBigInt(process.env.START_BLOCK, 0n, 'START_BLOCK'),
  startBlockConfigured,

  // Monad public RPC restricts eth_getLogs block ranges, so the indexer pages
  // through small ranges. Tune this down if the RPC rejects a request.
  indexerBlockRange: parseInteger(process.env.INDEXER_BLOCK_RANGE, 100, 'INDEXER_BLOCK_RANGE'),
  indexerPollIntervalMs: parseInteger(
    process.env.INDEXER_POLL_INTERVAL_MS,
    3000,
    'INDEXER_POLL_INTERVAL_MS',
  ),

  // The relay is opt-in. Players can always submit pull() directly to Monad.
  relayEnabled: process.env.RELAY_ENABLED === 'true',

  // Monad charges gas on the gas limit, so cap relayed transactions.
  maxGasLimit: parseBigInt(process.env.MAX_GAS_LIMIT, 500_000n, 'MAX_GAS_LIMIT'),

  // Rate limiting
  rateLimitWindow: parseInteger(process.env.RATE_LIMIT_WINDOW_MS, 3000, 'RATE_LIMIT_WINDOW_MS'),
} as const;

export const publicClient: PublicClient = createPublicClient({
  chain: monad,
  transport: http(config.rpcUrl),
});
