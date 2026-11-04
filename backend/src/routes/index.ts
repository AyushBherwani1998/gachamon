import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { isAddress } from 'viem';
import { validateAndRelayTransaction } from '../services/relay.js';
import { getMachineStatus } from '../services/contract.js';
import { getLeaderboard, getPullById, getPullsByPlayer, getRecentPulls } from '../db/index.js';
import { config } from '../config.js';
import { Pull, RelayRequest } from '../types/index.js';

const app = new Hono();

// Enable CORS
app.use('/*', cors());

function serializePull(pull: Pull) {
  return {
    ...pull,
    pullId: pull.pullId.toString(),
    sequenceNumber: pull.sequenceNumber.toString(),
    blockNumber: pull.blockNumber.toString(),
    resolvedBlockNumber: pull.resolvedBlockNumber?.toString(),
    refundBlockNumber: pull.refundBlockNumber?.toString(),
  };
}

function formatUsd6(value: bigint): string {
  const whole = value / 1_000_000n;
  const fraction = value % 1_000_000n;

  if (fraction === 0n) return whole.toString();

  return `${whole}.${fraction.toString().padStart(6, '0').replace(/0+$/, '')}`;
}

function parseLimit(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number.parseInt(value || String(fallback), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

// Health check
app.get('/', (c) => {
  return c.json({
    status: 'ok',
    service: 'xStocks Claw Machine Backend',
    network: config.network,
    chainId: config.chainId,
    relayEnabled: config.relayEnabled,
  });
});

// POST /relay - Validate and broadcast a signed pull() transaction.
// Disabled by default; players can always submit pull() directly to Monad.
app.post('/relay', async (c) => {
  try {
    if (!config.relayEnabled) {
      return c.json(
        {
          error:
            'Relay is disabled. Submit the signed transaction directly to the Monad RPC, or set RELAY_ENABLED=true.',
        },
        503,
      );
    }

    const body = await c.req.json<RelayRequest>();

    if (!body.signedTx) {
      return c.json({ error: 'Missing signedTx' }, 400);
    }

    const result = await validateAndRelayTransaction(body.signedTx);

    if (result.error || result.status === 'reverted') {
      return c.json(result, 400);
    }

    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message || 'Internal server error' }, 500);
  }
});

// GET /machine - Get machine status
app.get('/machine', async (c) => {
  try {
    const status = await getMachineStatus();
    return c.json(status);
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to fetch machine status' }, 500);
  }
});

// GET /pulls - Get recently indexed pulls (newest first)
app.get('/pulls', (c) => {
  try {
    const limit = parseLimit(c.req.query('limit'), 20, 100);
    return c.json(getRecentPulls(limit).map(serializePull));
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to fetch recent pulls' }, 500);
  }
});

// GET /pulls/:id - Get pull by ID
app.get('/pulls/:id', (c) => {
  try {
    const pullId = c.req.param('id');
    const pull = getPullById(pullId);

    if (!pull) {
      return c.json({ error: 'Pull not found' }, 404);
    }

    return c.json(serializePull(pull));
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to fetch pull' }, 500);
  }
});

// GET /players/:address/pulls - Get pulls and stats for a player address
app.get('/players/:address/pulls', (c) => {
  try {
    const address = c.req.param('address');

    if (!isAddress(address)) {
      return c.json({ error: 'Invalid player address' }, 400);
    }

    const pulls = getPullsByPlayer(address);

    const legendaryCount = pulls.filter(
      (pull) => pull.resolved && !pull.refunded && pull.legendary,
    ).length;
    const commonCount = pulls.filter(
      (pull) => pull.resolved && !pull.refunded && !pull.legendary,
    ).length;
    const refundedCount = pulls.filter((pull) => pull.refunded).length;

    const totalValueUsd6 = pulls.reduce((sum, pull) => {
      if (!pull.resolved || pull.refunded) return sum;
      return sum + BigInt(pull.valueUsd6 ?? (pull.legendary ? '10000000' : '730000'));
    }, 0n);

    return c.json({
      address,
      totalPulls: pulls.length,
      legendaryCount,
      commonCount,
      refundedCount,
      totalValue: formatUsd6(totalValueUsd6),
      totalValueUsd6: totalValueUsd6.toString(),
      pulls: pulls.map(serializePull),
    });
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to fetch player pulls' }, 500);
  }
});

// GET /leaderboard - Get leaderboard
app.get('/leaderboard', (c) => {
  try {
    const limit = parseLimit(c.req.query('limit'), 100, 500);
    const leaderboard = getLeaderboard(limit).map((row) => {
      const totalValueUsd6 = BigInt(row.totalValueUsd6 ?? 0);

      return {
        player: row.player,
        totalPulls: row.totalPulls,
        legendaryCount: row.legendaryCount ?? 0,
        totalValue: formatUsd6(totalValueUsd6),
        totalValueUsd6: totalValueUsd6.toString(),
      };
    });

    return c.json(leaderboard);
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to fetch leaderboard' }, 500);
  }
});

export default app;
