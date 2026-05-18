import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { runServerMigrations } from './migrations.js';
import syncRouter, { setNotifyClients } from './routes/sync.js';
import llmRouter, { setNotifyClients as setNotifyClientsLLM } from './routes/llm.js';
import lettaRouter, { setNotifyClients as setNotifyClientsLetta } from './routes/letta.js';

import * as dotenv from 'dotenv';
dotenv.config();

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});

// Create HTTP server + WebSocket server on the same port
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

// Broadcast a message to ALL connected WebSocket clients
function notifyClients(payload) {
  const msg = JSON.stringify(payload);
  wss.clients.forEach(client => {
    if (client.readyState === 1 /* OPEN */) {
      client.send(msg);
    }
  });
}

wss.on('connection', (ws) => {
  console.log('[WS] Client connected, total:', wss.clients.size);
  ws.on('close', () => console.log('[WS] Client disconnected, total:', wss.clients.size));
  ws.on('error', (e) => console.error('[WS] Error:', e.message));
});

// Give the routers a reference to the notifyClients function
setNotifyClients(notifyClients);
setNotifyClientsLLM(notifyClients);
setNotifyClientsLetta(notifyClients);

// Run migrations on start
runServerMigrations();

app.use('/sync', syncRouter);
app.use('/llm', llmRouter);
app.use('/letta', lettaRouter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now(), clients: wss.clients.size });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[Tellama Server] Running and accessible on port ${PORT}`);
});
