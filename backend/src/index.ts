import 'dotenv/config';
import { serve } from '@hono/node-server';
import app from './routes/index.js';
import { initWebSocketServer } from './services/websocket.js';
import { startIndexer, stopIndexer } from './services/indexer.js';
import { config } from './config.js';

console.log('Starting xStocks Claw Machine Backend...');
console.log(`Network: ${config.network} (${config.chainId})`);
console.log(`RPC: ${config.rpcUrl}`);
console.log(`Contract: ${config.clawMachineAddress}`);
console.log(`Relay: ${config.relayEnabled ? 'enabled' : 'disabled'}`);

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
console.log('  POST /relay                 (only when RELAY_ENABLED=true)');
console.log('  GET  /machine');
console.log('  GET  /pulls?limit=20');
console.log('  GET  /pulls/:id');
console.log('  GET  /players/:address/pulls');
console.log('  GET  /leaderboard');
console.log('  WS   /events');

function shutdown() {
  stopIndexer();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
