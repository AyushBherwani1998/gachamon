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
const MAX_PULLS = 20;
const CACHE_MS = 5_000;

const cache = new Map<number, { at: number; payload: FeedResponse }>();

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
  const deployment = deployments[network];
  const client = serverClient(network);
  const latest = await client.getBlockNumber();
  const fromBlock = latest > LOOKBACK_BLOCKS ? latest - LOOKBACK_BLOCKS : 0n;

  const logs: Array<{
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
  }> = [];

  for (let scan = fromBlock; scan <= latest; scan += CHUNK_BLOCKS) {
    const toBlock = scan + CHUNK_BLOCKS - 1n > latest ? latest : scan + CHUNK_BLOCKS - 1n;
    const chunk = await client.getContractEvents({
      address: deployment.clawMachine,
      abi: clawMachineAbi,
      eventName: "PullResolved",
      fromBlock: scan,
      toBlock,
    });
    logs.push(...(chunk as unknown as typeof logs));
  }

  // Newest first, then trim before doing any metadata reads.
  logs.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber > b.blockNumber ? -1 : 1;
    return b.logIndex - a.logIndex;
  });
  const recent = logs.slice(0, MAX_PULLS);

  const blockNumbers = [...new Set(recent.map((log) => log.blockNumber.toString()))];
  const blocks = await Promise.all(
    blockNumbers.map(async (value) => {
      const block = await client.getBlock({ blockNumber: BigInt(value) });
      return [value, Number(block.timestamp)] as const;
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
