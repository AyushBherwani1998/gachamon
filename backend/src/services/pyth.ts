import { config, publicClient } from '../config.js';
import { ClawMachineABI } from '../abi/ClawMachine.js';
import { PriceUpdateResponse } from '../types/index.js';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export type PriceUpdateErrorStatus = 400 | 401 | 403 | 429 | 502 | 503;

/**
 * Error that carries the HTTP status the /price-update route should return.
 * Hermes auth/rate-limit failures must reach the client instead of being
 * swallowed into an empty price update with a made-up fee.
 */
export class PriceUpdateError extends Error {
  readonly status: PriceUpdateErrorStatus;

  constructor(status: PriceUpdateErrorStatus, message: string) {
    super(message);
    this.name = 'PriceUpdateError';
    this.status = status;
  }
}

type ContractTokenInfo = readonly [pythFeedId: `0x${string}`, decimals: number, supported: boolean];

function feedIdsForSymbols(symbols: string[]): `0x${string}`[] {
  const unknown: string[] = [];
  const feedIds: `0x${string}`[] = [];

  for (const symbol of symbols) {
    const feedId = config.pythFeedIds[symbol as keyof typeof config.pythFeedIds];
    if (feedId) {
      feedIds.push(feedId as `0x${string}`);
    } else {
      unknown.push(symbol);
    }
  }

  if (unknown.length > 0) {
    throw new PriceUpdateError(400, `Unknown Pyth feed symbol(s): ${unknown.join(', ')}`);
  }

  return feedIds;
}

/**
 * Read the authoritative feed list from the ClawMachine contract. This keeps
 * the backend in sync when tokens are added or removed with addToken().
 */
async function feedIdsFromContract(): Promise<`0x${string}`[]> {
  const tokens = await publicClient.readContract({
    address: config.clawMachineAddress,
    abi: ClawMachineABI,
    functionName: 'getSupportedTokens',
  }) as readonly `0x${string}`[];

  const tokenInfos = await Promise.all(
    tokens.map((token) =>
      publicClient.readContract({
        address: config.clawMachineAddress,
        abi: ClawMachineABI,
        functionName: 'tokenInfo',
        args: [token],
      }) as Promise<ContractTokenInfo>
    )
  );

  return tokenInfos
    .filter(([, , supported]) => supported)
    .map(([pythFeedId]) => pythFeedId)
    .filter((feedId) => feedId && feedId !== `0x${'0'.repeat(64)}`);
}

async function resolveFeedIds(symbols?: string[]): Promise<`0x${string}`[]> {
  // An explicit ?symbols= request always wins (useful for tests/debugging).
  if (symbols && symbols.length > 0) {
    return feedIdsForSymbols(symbols);
  }

  if (config.clawMachineAddress && config.clawMachineAddress !== ZERO_ADDRESS) {
    try {
      const feedIds = await feedIdsFromContract();
      if (feedIds.length > 0) {
        return feedIds;
      }
      console.warn('ClawMachine has no supported tokens yet, falling back to PYTH_FEEDS');
    } catch (error: any) {
      console.warn(`Failed to read supported tokens from ClawMachine: ${error.message}. Falling back to PYTH_FEEDS`);
    }
  }

  return feedIdsForSymbols(config.pythFeeds);
}

export async function getPriceUpdate(symbols?: string[]): Promise<PriceUpdateResponse> {
  if (!config.pythApiKey) {
    throw new PriceUpdateError(503, 'PYTH_API_KEY is not configured on the backend');
  }

  const feedIds = await resolveFeedIds(symbols);
  if (feedIds.length === 0) {
    throw new PriceUpdateError(503, 'No Pyth price feeds are configured');
  }

  const url = new URL(config.pythHermesUrl);
  for (const feedId of feedIds) {
    url.searchParams.append('ids[]', feedId);
  }
  url.searchParams.set('encoding', 'hex');
  url.searchParams.set('parsed', 'true');

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${config.pythApiKey}`,
      },
    });
  } catch (error: any) {
    throw new PriceUpdateError(502, `Failed to reach Pyth Hermes: ${error.message}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const detail = body ? `: ${body.slice(0, 200)}` : '';
    const status: PriceUpdateErrorStatus =
      response.status === 401 || response.status === 403 || response.status === 429
        ? response.status
        : 502;

    throw new PriceUpdateError(
      status,
      `Pyth Hermes request failed (${response.status} ${response.statusText})${detail}`
    );
  }

  const data = await response.json() as { binary?: { data?: unknown } };
  const binaryData = data?.binary?.data;

  // Hermes returns one hex string per requested feed. Each is a separate
  // bytes element of priceUpdateData; they must not be concatenated.
  if (!Array.isArray(binaryData) || binaryData.length === 0) {
    throw new PriceUpdateError(502, 'Pyth Hermes returned no price update data');
  }

  const priceUpdateData = binaryData.map((entry) => {
    if (typeof entry !== 'string' || entry.length === 0) {
      throw new PriceUpdateError(502, 'Pyth Hermes returned malformed price update data');
    }
    return (entry.startsWith('0x') ? entry : `0x${entry}`) as `0x${string}`;
  });

  // The fee must come from the contract (Pyth update fee + Entropy fee).
  // Never substitute an estimate: the frontend uses this value as msg.value.
  let totalFee: bigint;
  try {
    totalFee = await publicClient.readContract({
      address: config.clawMachineAddress,
      abi: ClawMachineABI,
      functionName: 'getTotalFee',
      args: [priceUpdateData],
    }) as bigint;
  } catch (error: any) {
    throw new PriceUpdateError(
      502,
      `Failed to read getTotalFee from ClawMachine (${config.clawMachineAddress}): ${error.message}`
    );
  }

  return {
    priceUpdateData,
    fee: totalFee.toString(),
  };
}
