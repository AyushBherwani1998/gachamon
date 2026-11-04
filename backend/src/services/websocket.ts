import WebSocket, { WebSocketServer } from 'ws';
import { EventMessage } from '../types/index.js';

let wss: WebSocketServer | null = null;

export function initWebSocketServer(server: any) {
  wss = new WebSocketServer({ server, path: '/events' });
  
  wss.on('connection', (ws: WebSocket) => {
    console.log('New WebSocket client connected');
    
    ws.on('close', () => {
      console.log('WebSocket client disconnected');
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });
  
  console.log('WebSocket server initialized on /events');
}

export function broadcastEvent(event: EventMessage) {
  if (!wss) return;
  
  const message = JSON.stringify(event);
  
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}
