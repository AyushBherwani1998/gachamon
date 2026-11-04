import { NextResponse, type NextRequest } from "next/server";
import type { Address, Hex } from "viem";

import { clawMachineAbi } from "@/abi/clawMachine";
import { erc20Abi } from "@/abi/erc20";
import { deployments, isDeployed, resolveNetwork } from "@/config/deployments";
import { serverClient } from "@/lib/server/clients";
import { shortAddress } from "@/lib/format";
import type { PriceQuote } from "@/lib/types";

const HERMES_URL =
  process.env.PYTH_HERMES_URL?.trim() || "https://pyth.dourolabs.app/hermes";

interface HermesParsedPrice {
  id?: string;
  price?: {
    price?: string;
    conf?: string;
    expo?: number;
    publish_time?: number;
  };
}

interface HermesResponse {
  binary?: { data?: string[] };
  parsed?: HermesParsedPrice[];
}

function jsonError(status: number, error: string, code: string, extra?: object) {
  return NextResponse.json(
    { error, code, ...extra },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

/**
 * Convert a raw Pyth integer + exponent to a USD-6 integer per 1e18 tokens.
 * Pyth publishes TSLA at expo -8, so 42_125_000_000 becomes 421_250_000.
 */
function pythToUsd6(rawPrice: string, expo: number): string {
  let value: bigint;
  try {
    value = BigInt(rawPrice);
  } catch {
    return "0";
  }
  if (value <= 0n) return "0";
  const shift = expo + 6;
  if (shift >= 0) return (value * 10n ** BigInt(shift)).toString();
  return (value / 10n ** BigInt(-shift)).toString();
}

function normalizeFeedId(id: string | undefined): string {
  if (!id) return "";
  return (id.startsWith("0x") ? id : `0x${id}`).toLowerCase();
}

async function readSymbols(
  network: keyof typeof deployments,
  tokens: readonly Address[]
): Promise<Map<string, string>> {
  const client = serverClient(network);
  const entries = await Promise.all(
    tokens.map(async (token) => {
      try {
        const symbol = await client.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "symbol",
        });
        return [token.toLowerCase(), symbol] as const;
      } catch {
        return [token.toLowerCase(), shortAddress(token)] as const;
      }
    })
  );
  return new Map(entries);
}

export async function GET(request: NextRequest) {
  const chainParam = request.nextUrl.searchParams.get("chainId");
  const chainId = chainParam === null ? undefined : Number(chainParam);
  if (chainParam !== null && (chainId === undefined || !Number.isSafeInteger(chainId))) {
    return jsonError(400, "chainId must be 143 (mainnet) or 10143 (testnet).", "BAD_CHAIN");
  }

  const network = resolveNetwork(chainId);
  if (!network) {
    return jsonError(400, "Unsupported chainId. Use 143 (mainnet) or 10143 (testnet).", "BAD_CHAIN");
  }

  const deployment = deployments[network];
  if (!isDeployed(deployment.clawMachine)) {
    return jsonError(
      503,
      `ClawMachine is not configured for ${deployment.name}. Set NEXT_PUBLIC_CLAW_MACHINE_${network.toUpperCase()}.`,
      "MACHINE_NOT_CONFIGURED"
    );
  }

  const apiKey = process.env.PYTH_API_KEY?.trim();
  if (!apiKey) {
    return jsonError(
      500,
      "The price service is missing PYTH_API_KEY. Add the server-only key to the environment and restart.",
      "PRICE_KEY_MISSING"
    );
  }

  const client = serverClient(network);

  let tokens: readonly Address[];
  try {
    tokens = await client.readContract({
      address: deployment.clawMachine,
      abi: clawMachineAbi,
      functionName: "getSupportedTokens",
    });
  } catch {
    return jsonError(
      502,
      "Could not read the supported token list from the machine. Check the RPC and the deployed address.",
      "MACHINE_READ_FAILED"
    );
  }

  if (tokens.length === 0) {
    return jsonError(503, "The machine has no supported tokens yet.", "NO_TOKENS");
  }

  let tokenInfos: Array<{ token: Address; feedId: Hex }>;
  try {
    tokenInfos = await Promise.all(
      tokens.map(async (token) => {
        const info = await client.readContract({
          address: deployment.clawMachine,
          abi: clawMachineAbi,
          functionName: "tokenInfo",
          args: [token],
        });
        return { token, feedId: info[0] };
      })
    );
  } catch {
    return jsonError(
      502,
      "Could not read token feed ids from the machine.",
      "MACHINE_READ_FAILED"
    );
  }

  const feedIds = tokenInfos.map((info) => info.feedId.toLowerCase());
  const params = new URLSearchParams({ encoding: "hex", parsed: "true" });
  for (const feedId of feedIds) params.append("ids[]", feedId);
  const url = `${HERMES_URL.replace(/\/$/, "")}/v2/updates/price/latest?${params.toString()}`;

  let hermesResponse: Response;
  try {
    hermesResponse = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return jsonError(
      504,
      "Pyth Hermes did not respond. Try again in a moment.",
      "HERMES_TIMEOUT"
    );
  }

  if (hermesResponse.status === 401 || hermesResponse.status === 403) {
    return jsonError(
      hermesResponse.status,
      "Pyth Hermes rejected the API key or this key is not entitled to one of the machine's feeds.",
      "HERMES_NOT_ENTITLED",
      { upstreamStatus: hermesResponse.status }
    );
  }
  if (hermesResponse.status === 429) {
    return jsonError(
      429,
      "Pyth Hermes is rate limiting requests. Wait a moment and try again.",
      "HERMES_RATE_LIMITED",
      { upstreamStatus: 429 }
    );
  }
  if (!hermesResponse.ok) {
    return jsonError(
      502,
      `Pyth Hermes returned HTTP ${hermesResponse.status}.`,
      "HERMES_ERROR",
      { upstreamStatus: hermesResponse.status }
    );
  }

  let payload: HermesResponse;
  try {
    payload = (await hermesResponse.json()) as HermesResponse;
  } catch {
    return jsonError(502, "Pyth Hermes returned invalid JSON.", "HERMES_BAD_RESPONSE");
  }

  const binaryData = payload.binary?.data;
  if (!Array.isArray(binaryData) || binaryData.length === 0) {
    return jsonError(
      502,
      "Pyth Hermes returned no update data for the machine's feeds.",
      "HERMES_EMPTY"
    );
  }

  const updateData = binaryData.map((hex) =>
    (hex.startsWith("0x") ? hex : `0x${hex}`) as Hex
  );

  const parsedById = new Map(
    (payload.parsed ?? []).map((entry) => [normalizeFeedId(entry.id), entry])
  );
  const symbols = await readSymbols(network, tokens);

  const prices: PriceQuote[] = tokenInfos.flatMap(({ token, feedId }) => {
    const parsed = parsedById.get(feedId.toLowerCase());
    if (!parsed?.price) return [];
    const raw = parsed.price.price ?? "0";
    const expo = parsed.price.expo ?? 0;
    return [
      {
        token,
        symbol: symbols.get(token.toLowerCase()) ?? shortAddress(token),
        feedId,
        price: raw,
        expo,
        priceUsd6: pythToUsd6(raw, expo),
        publishTime: parsed.price.publish_time ?? 0,
      },
    ];
  });

  if (prices.length === 0) {
    return jsonError(
      502,
      "Pyth Hermes returned no parsed price for the machine's feeds.",
      "HERMES_EMPTY"
    );
  }
  if (prices.length !== tokenInfos.length) {
    return jsonError(
      502,
      "Pyth Hermes did not return a parsed price for every machine feed.",
      "HERMES_INCOMPLETE"
    );
  }

  return NextResponse.json(
    { updateData, prices },
    { headers: { "Cache-Control": "no-store" } }
  );
}
