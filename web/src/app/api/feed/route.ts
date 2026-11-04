import { NextResponse, type NextRequest } from "next/server";
import type { Address, Hex } from "viem";

import { clawMachineAbi } from "@/abi/clawMachine";
import { erc20Abi } from "@/abi/erc20";
import { deployments, isDeployed, resolveNetwork, type NetworkKey } from "@/config/deployments";
import { serverClient } from "@/lib/server/clients";
import { shortAddress } from "@/lib/format";
import type { FeedPull, FeedResponse, FeedStock } from "@/lib/types";

const LOOKBACK_BLOCKS = 1_500n;
const CHUNK_BLOCKS = 100n;
const MAX_CHUNKS_IN_FLIGHT = 8;
const MAX_INDEXED_LOGS = 50;
const MAX_PULLS = 20;
const CACHE_MS = 5_000;

type PullLog = {
  args: {
    pullId?: bigint;
    player?: Address;
    legendary?: boolean;
    stocks?: readonly Address[];
    amounts?: readonly bigint[];
  };
  blockNumber: bigint;
  logIndex: number;
  transactionHash: Hex;
};

interface PullIndex {
  logs: PullLog[];
  lastScanned: bigint | null;
  scan: Promise<void> | null;
}

const cache = new Map<number, { at: number; payload: FeedResponse }>();
const pullIndexes = new Map<NetworkKey, PullIndex>();

function pullIndex(network: NetworkKey): PullIndex {
  let index = pullIndexes.get(network);
  if (!index) {
    index = { logs: [], lastScanned: null, scan: null };
    pullIndexes.set(network, index);
  }
  return index;
}

function newestFirst(a: PullLog, b: PullLog) {
  if (a.blockNumber !== b.blockNumber) return a.blockNumber > b.blockNumber ? -1 : 1;
  return b.logIndex - a.logIndex;
}

/**
 * Index every `PullResolved` since the machine was deployed, then only top up
 * from the last scanned block. The public RPC caps `eth_getLogs` at 100 blocks,
 * so the range is chunked with a bounded number of requests in flight.
 */
async function scanPulls(network: NetworkKey, index: PullIndex): Promise<void> {
  const deployment = deployments[network];
  const client = serverClient(network);
  const latest = await client.getBlockNumber();
  const fromBlock =
    index.lastScanned !== null
      ? index.lastScanned + 1n
      : deployment.deployBlock ?? (latest > LOOKBACK_BLOCKS ? latest - LOOKBACK_BLOCKS : 0n);

  if (fromBlock > latest) return;

  const ranges: Array<{ from: bigint; to: bigint }> = [];
  for (let from = fromBlock; from <= latest; from += CHUNK_BLOCKS) {
    const to = from + CHUNK_BLOCKS - 1n > latest ? latest : from + CHUNK_BLOCKS - 1n;
    ranges.push({ from, to });
  }

  const found: PullLog[] = [];
  let next = 0;
  const workers = Array.from(
    { length: Math.min(MAX_CHUNKS_IN_FLIGHT, ranges.length) },
    async () => {
      while (next < ranges.length) {
        const range = ranges[next];
        next += 1;
        const chunk = await client.getContractEvents({
          address: deployment.clawMachine,
          abi: clawMachineAbi,
          eventName: "PullResolved",
          fromBlock: range.from,
          toBlock: range.to,
        });
        found.push(...(chunk as unknown as PullLog[]));
      }
    }
  );
  await Promise.all(workers);

  index.logs = [...index.logs, ...found].sort(newestFirst).slice(0, MAX_INDEXED_LOGS);
  index.lastScanned = latest;
}

/** Concurrent requests share one in-flight scan instead of duplicating work. */
async function indexedPulls(network: NetworkKey): Promise<PullLog[]> {
  const index = pullIndex(network);
  if (!index.scan) {
    index.scan = scanPulls(network, index).finally(() => {
      index.scan = null;
    });
  }
  await index.scan;
  return index.logs;
}

function jsonError(status: number, error: string) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

async function tokenMeta(
  network: NetworkKey,
  tokens: Address[]
): Promise<Map<string, { symbol: string; decimals: number }>> {
  const client = serverClient(network);
  const machine = deployments[network].clawMachine;
  const entries = await Promise.all(
    tokens.map(async (token) => {
      const [symbol, info] = await Promise.all([
        client
          .readContract({ address: token, abi: erc20Abi, functionName: "symbol" })
          .catch(() => shortAddress(token)),
        client
          .readContract({
            address: machine,
            abi: clawMachineAbi,
            functionName: "tokenInfo",
            args: [token],
          })
          .catch(() => null),
      ]);
      return [token.toLowerCase(), { symbol, decimals: info?.[1] ?? 18 }] as const;
    })
  );
  return new Map(entries);
}

async function readRecentPulls(network: NetworkKey): Promise<FeedResponse> {
  const client = serverClient(network);
  const recent = (await indexedPulls(network)).slice(0, MAX_PULLS);

  const blockNumbers = [...new Set(recent.map((log) => log.blockNumber.toString()))];
  const blocks = await Promise.all(
    blockNumbers.map(async (value) => {
      const block = await client
        .getBlock({ blockNumber: BigInt(value) })
        .catch(() => null);
      return [value, block ? Number(block.timestamp) : 0] as const;
    })
  );
  const timestamps = new Map(blocks);

  const tokenAddresses = [
    ...new Map(
      recent.flatMap((log) =>
        (log.args.stocks ?? [])
          .filter((_, index) => (log.args.amounts?.[index] ?? 0n) > 0n)
          .map((token) => [token.toLowerCase(), token] as const)
      )
    ).values(),
  ];
  const meta = await tokenMeta(network, tokenAddresses);

  const pulls: FeedPull[] = recent.flatMap((log) => {
    const args = log.args;
    if (args.pullId === undefined || !args.player) return [];

    const stocks: FeedStock[] = (args.stocks ?? []).flatMap((token, index) => {
      const amount = args.amounts?.[index] ?? 0n;
      if (amount === 0n) return [];
      const info = meta.get(token.toLowerCase());
      return [
        {
          token,
          symbol: info?.symbol ?? shortAddress(token),
          decimals: info?.decimals ?? 18,
          amount: amount.toString(),
        },
      ];
    });

    return [
      {
        pullId: args.pullId.toString(),
        player: args.player,
        legendary: Boolean(args.legendary),
        stocks,
        blockNumber: log.blockNumber.toString(),
        txHash: log.transactionHash,
        resolvedAt: timestamps.get(log.blockNumber.toString()) ?? 0,
      },
    ];
  });

  return { pulls };
}

export async function GET(request: NextRequest) {
  const chainParam = request.nextUrl.searchParams.get("chainId");
  const chainId = chainParam === null ? undefined : Number(chainParam);
  if (chainParam !== null && (chainId === undefined || !Number.isSafeInteger(chainId))) {
    return jsonError(400, "chainId must be 143 (mainnet) or 10143 (testnet).");
  }

  const network = resolveNetwork(chainId);
  if (!network) {
    return jsonError(400, "Unsupported chainId. Use 143 (mainnet) or 10143 (testnet).");
  }

  const deployment = deployments[network];
  if (!isDeployed(deployment.clawMachine)) {
    return jsonError(503, `ClawMachine is not configured for ${deployment.name}.`);
  }

  const cached = cache.get(deployment.chainId);
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return NextResponse.json(cached.payload, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    const payload = await readRecentPulls(network);
    cache.set(deployment.chainId, { at: Date.now(), payload });
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not read pull events from the RPC.";
    return jsonError(502, message);
  }
}
