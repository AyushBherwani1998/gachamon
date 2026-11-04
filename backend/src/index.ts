import 'dotenv/config';
import { serve } from '@hono/node-server';
import app from './routes/index.js';
import { initWebSocketServer } from './services/websocket.js';
import { startIndexer } from './services/indexer.js';
import { config } from './config.js';

console.log('Starting xStocks Claw Machine Backend...');
console.log(`Chain: Monad (143)`);
console.log(`RPC: ${config.rpcUrl}`);
console.log(`WS: ${config.wsUrl}`);
console.log(`Contract: ${config.clawMachineAddress}`);

const server = serve({
  fetch: app.fetch,
  port: config.port,
});

// Initialize WebSocket server
initWebSocketServer(server);

// Start event indexer
startIndexer().catch(console.error);

console.log(`Server running on http://localhost:${config.port}`);
console.log(`WebSocket endpoint: ws://localhost:${config.port}/events`);
console.log('\nEndpoints:');
console.log('  POST /relay');
console.log('  GET  /machine');
console.log('  GET  /price-update?symbols=TSLAx');
console.log('  GET  /pulls/:id');
console.log('  GET  /players/:address/pulls');
console.log('  GET  /leaderboard');
console.log('  WS   /events');
