import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { validateAndRelayTransaction } from '../services/relay.js';
import { getMachineStatus } from '../services/contract.js';
import { getPriceUpdate } from '../services/pyth.js';
import { getPullById, getPullsByPlayer, getLeaderboard } from '../db/index.js';
import { RelayRequest } from '../types/index.js';

const app = new Hono();

// Enable CORS
app.use('/*', cors());

// Health check
app.get('/', (c) => {
  return c.json({ status: 'ok', service: 'xStocks Claw Machine Backend' });
});

// POST /relay - Validate and broadcast signed transaction
app.post('/relay', async (c) => {
  try {
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

// GET /price-update - Get Pyth price update data
app.get('/price-update', async (c) => {
  try {
    const symbols = c.req.query('symbols')?.split(',') || ['TSLAx', 'NVDAx', 'AAPLx', 'SPYx'];
    const priceUpdate = await getPriceUpdate(symbols);
    return c.json(priceUpdate);
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to fetch price update' }, 500);
  }
});

// GET /pulls/:id - Get pull by ID
app.get('/pulls/:id', async (c) => {
  try {
    const pullId = c.req.param('id');
    const pull = getPullById(pullId);
    
    if (!pull) {
      return c.json({ error: 'Pull not found' }, 404);
    }
    
    // Convert BigInt to string for JSON serialization
    const serializedPull = {
      ...pull,
      pullId: pull.pullId.toString(),
      sequenceNumber: pull.sequenceNumber.toString(),
      blockNumber: pull.blockNumber.toString(),
      resolvedBlockNumber: pull.resolvedBlockNumber?.toString(),
    };
    
    return c.json(serializedPull);
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to fetch pull' }, 500);
  }
});

// GET /players/:address/pulls - Get pulls by player address
app.get('/players/:address/pulls', async (c) => {
  try {
    const address = c.req.param('address');
    const pulls = getPullsByPlayer(address);
    
    // Convert BigInt to string for JSON serialization
    const serializedPulls = pulls.map(pull => ({
      ...pull,
      pullId: pull.pullId.toString(),
      sequenceNumber: pull.sequenceNumber.toString(),
      blockNumber: pull.blockNumber.toString(),
      resolvedBlockNumber: pull.resolvedBlockNumber?.toString(),
    }));
    
    // Calculate stats
    const totalPulls = pulls.length;
    const legendaryCount = pulls.filter(p => p.legendary).length;
    const commonCount = pulls.filter(p => p.resolved && !p.legendary).length;
    const totalValue = pulls.reduce((sum, p) => {
      if (!p.resolved) return sum;
      return sum + (p.legendary ? 10.0 : 0.73);
    }, 0);
    
    return c.json({
      address,
      totalPulls,
      legendaryCount,
      commonCount,
      totalValue: totalValue.toString(),
      pulls: serializedPulls,
    });
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to fetch player pulls' }, 500);
  }
});

// GET /leaderboard - Get leaderboard
app.get('/leaderboard', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '100');
    const leaderboard = getLeaderboard(limit);
    return c.json(leaderboard);
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to fetch leaderboard' }, 500);
  }
});

export default app;
