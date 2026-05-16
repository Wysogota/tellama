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
  llamacpp: {
    baseUrl: 'http://127.0.0.1:8080/v1',
    extraHeaders: {},
  },
};

// ── Active Settings State (In-Memory) ───────────────────────────────────────
let ACTIVE_PROVIDER = 'openrouter';
let ACTIVE_MODEL = '';

// POST /llm/active-provider
router.post('/active-provider', (req, res) => {
  const { provider, model } = req.body;
  if (provider) ACTIVE_PROVIDER = provider;
  if (model) ACTIVE_MODEL = model;
  res.json({ ok: true });
});

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

// POST /llm/proxy/:provider/chat/completions  — forwards chat/completions to OpenRouter or NVIDIA or llamacpp
router.post('/proxy/:provider/chat/completions', async (req, res) => {
  const provider = req.params.provider;
  const { messages, model, temperature } = req.body;

  if (!provider || !messages) {
    return res.status(400).json({ error: 'Missing provider or messages' });
  }

  let baseProvider = provider.replace(/^memory_/, '');
  let realModel = model;

  if (baseProvider === 'dynamic') {
    baseProvider = ACTIVE_PROVIDER.replace(/^memory_/, '');
    realModel = ACTIVE_MODEL || model;
  }

  const config = PROVIDER_CONFIGS[baseProvider];
  if (!config) {
    return res.status(400).json({ error: `Unknown provider "${baseProvider}". Use llamacpp, openrouter, or nvidia.` });
  }

  // Read key — if missing, tell the user clearly

  let apiKey = '';
  if (baseProvider !== 'llamacpp') {
    try {
      const row = db.prepare('SELECT key_value FROM api_keys WHERE provider = ?').get(baseProvider);
      if (!row) {
        return res.status(401).json({ error: `API key for ${baseProvider} is not configured. Add it in Settings.` });
      }
      apiKey = row.key_value;
    } catch (e) {
      return res.status(500).json({ error: 'Failed to read API key: ' + e.message });
    }
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
    console.log(`[LLM Proxy] → ${baseProvider} ${upstreamUrl} model=${realModel}`);

    const upstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        ...config.extraHeaders,
      },
      body: JSON.stringify({
        model: realModel || undefined,
        messages,
        stream: req.body.stream ?? false,
        temperature: temperature ?? 0.7,
      }),
      signal: abortController.signal,
    });

    console.log(`[LLM Proxy] ← ${baseProvider} status=${upstream.status}`);

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => upstream.statusText);
      console.error(`[LLM Proxy] ${baseProvider} error ${upstream.status}: ${errText}`);
      return res.status(upstream.status).json({
        error: `${baseProvider} API error ${upstream.status}: ${errText}`,
      });
    }

    const isStreaming = req.body.stream ?? false;

    if (isStreaming) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      const nodeStream = Readable.fromWeb(upstream.body);
      nodeStream.pipe(res);
      nodeStream.on('error', () => { if (!res.writableEnded) res.end(); });
    } else {
      // Non-streaming: forward JSON body as-is
      const json = await upstream.json();
      res.json(json);
    }

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

// Mock /models endpoint to bypass Letta's model validation
router.get('/proxy/:provider/models', (req, res) => {
  res.json({
    object: 'list',
    data: [
      { id: 'gpt-3.5-turbo', object: 'model', created: 1677610602, owned_by: 'openai' },
      { id: 'openai/gpt-3.5-turbo', object: 'model', created: 1677610602, owned_by: 'openai' },
      { id: 'gpt-4o', object: 'model', created: 1677610602, owned_by: 'openai' },
      { id: 'openai/gpt-4o', object: 'model', created: 1677610602, owned_by: 'openai' },
      { id: 'mistralai/mistral-nemotron', object: 'model', created: 1677610602, owned_by: 'openrouter' },
      { id: 'test-model', object: 'model', created: 1677610602, owned_by: 'test' }
    ]
  });
});

export default router;
