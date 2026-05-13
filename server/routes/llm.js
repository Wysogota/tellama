import express from 'express';
import { Readable } from 'stream';
import db from '../db.js';

const router = express.Router();

const PROVIDER_CONFIGS = {
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    extraHeaders: {
      'HTTP-Referer': 'http://localhost:5173',
      'X-Title': 'Tellama',
      'Accept': 'text/event-stream',
    },
  },
  nvidia: {
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    extraHeaders: {
      // NVIDIA NIM requires this header to enable SSE streaming
      'Accept': 'text/event-stream',
    },
  },
};

// ── Key management ──────────────────────────────────────────────────────────

// POST /llm/keys  { provider, key }  — store API key (write-only from browser)
router.post('/keys', (req, res) => {
  const { provider, key } = req.body;
  if (!provider || !key || !key.trim()) {
    return res.status(400).json({ error: 'Missing provider or key' });
  }
  const baseProvider = provider.replace(/^memory_/, '');
  if (!PROVIDER_CONFIGS[baseProvider]) {
    return res.status(400).json({ error: 'Invalid provider' });
  }
  try {
    db.prepare(
      `INSERT INTO api_keys (provider, key_value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(provider) DO UPDATE SET key_value=excluded.key_value, updated_at=excluded.updated_at`
    ).run(provider, key.trim(), Date.now());
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /llm/key-status?provider=X  — returns { configured: bool }, NEVER the key itself
router.get('/key-status', (req, res) => {
  const { provider } = req.query;
  if (!provider) return res.status(400).json({ error: 'Missing provider' });
  try {
    const row = db.prepare('SELECT 1 FROM api_keys WHERE provider = ?').get(provider);
    res.json({ configured: !!row });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /llm/keys/:provider  — remove stored key
router.delete('/keys/:provider', (req, res) => {
  const { provider } = req.params;
  const baseProvider = provider.replace(/^memory_/, '');
  if (!PROVIDER_CONFIGS[baseProvider]) {
    return res.status(400).json({ error: 'Invalid provider' });
  }
  try {
    db.prepare('DELETE FROM api_keys WHERE provider = ?').run(provider);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Streaming proxy ─────────────────────────────────────────────────────────

// POST /llm/proxy  — forwards chat/completions to OpenRouter or NVIDIA, injects key server-side
router.post('/proxy', async (req, res) => {
  const { provider, messages, model, temperature } = req.body;

  if (!provider || !messages) {
    return res.status(400).json({ error: 'Missing provider or messages' });
  }

  const baseProvider = provider.replace(/^memory_/, '');
  const config = PROVIDER_CONFIGS[baseProvider];
  if (!config) {
    return res.status(400).json({ error: `Unknown provider "${provider}". Use llamacpp (direct) or openrouter/nvidia (proxy).` });
  }

  // Read key — if missing, tell the user clearly
  let apiKey;
  try {
    const row = db.prepare('SELECT key_value FROM api_keys WHERE provider = ?').get(provider);
    if (!row) {
      return res.status(401).json({ error: `API key for ${provider} is not configured. Add it in Settings.` });
    }
    apiKey = row.key_value;
  } catch (e) {
    return res.status(500).json({ error: 'Failed to read API key: ' + e.message });
  }

  const abortController = new AbortController();

  // Listen on the RESPONSE close, not the request — req 'close' fires as soon
  // as express.json() finishes consuming the body, causing an immediate abort.
  // res 'close' correctly fires only when the client drops the connection.
  res.on('close', () => {
    if (!res.writableEnded) abortController.abort();
  });

  try {
    const upstreamUrl = `${config.baseUrl}/chat/completions`;
    console.log(`[LLM Proxy] → ${provider} ${upstreamUrl} model=${model}`);

    const upstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        ...config.extraHeaders,
      },
      body: JSON.stringify({
        model: model || undefined,
        messages,
        stream: true,
        temperature: temperature ?? 0.7,
      }),
      signal: abortController.signal,
    });

    console.log(`[LLM Proxy] ← ${provider} status=${upstream.status}`);

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => upstream.statusText);
      console.error(`[LLM Proxy] ${provider} error ${upstream.status}: ${errText}`);
      return res.status(upstream.status).json({
        error: `${provider} API error ${upstream.status}: ${errText}`,
      });
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const nodeStream = Readable.fromWeb(upstream.body);
    nodeStream.pipe(res);
    nodeStream.on('error', () => { if (!res.writableEnded) res.end(); });

  } catch (e) {
    if (e.name === 'AbortError') {
      if (!res.headersSent) res.status(499).end();
      else res.end();
      return;
    }
    console.error('[LLM Proxy]', e);
    if (!res.headersSent) res.status(500).json({ error: e.message });
    else res.end();
  }
});

export default router;
