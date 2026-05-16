import express from 'express';
import dotenv from 'dotenv';
import { Readable } from 'stream';

dotenv.config();

const router = express.Router();
const LETTA_URL = process.env.LETTA_URL || 'http://localhost:8283';
const LETTA_PASSWORD = process.env.LETTA_PASSWORD || '';

// Proxy middleware to forward to Letta
router.use(async (req, res) => {
  const targetUrl = `${LETTA_URL}${req.path}`;
  const headers = {
    'Content-Type': 'application/json',
  };
  if (LETTA_PASSWORD) {
    headers['Authorization'] = `Bearer ${LETTA_PASSWORD}`;
  }

  try {
    const fetchOptions = {
      method: req.method,
      headers,
    };
    
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, fetchOptions);
    
    // For streaming responses (like SSE for messages)
    if (response.headers.get('content-type')?.includes('text/event-stream')) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      const stream = Readable.fromWeb(response.body);
      stream.pipe(res);
      return;
    }

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return res.status(response.status).json(data || { error: 'Letta API error' });
    }
    
    res.json(data);
  } catch (e) {
    console.error('[Letta Proxy] Error:', e.message);
    res.status(500).json({ error: 'Failed to connect to Letta Server' });
  }
});

export default router;
