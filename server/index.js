import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { runServerMigrations } from './migrations.js';
import syncRouter, { setNotifyClients } from './routes/sync.js';

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

// Give the sync router a reference to the notifyClients function
setNotifyClients(notifyClients);

// Run migrations on start
runServerMigrations();

app.use('/sync', syncRouter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now(), clients: wss.clients.size });
});

httpServer.listen(PORT, () => {
  console.log(`[Tellama Server] Running at http://localhost:${PORT}`);
});
