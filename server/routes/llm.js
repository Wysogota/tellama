import express from 'express';
import { Readable } from 'stream';
import db from '../db.js';

const router = express.Router();

let notifyClients = () => {};
export function setNotifyClients(fn) {
  notifyClients = fn;
}

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
  mistral: {
    baseUrl: 'https://api.mistral.ai/v1',
    extraHeaders: {
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
let ACTIVE_PARAMS = {
  temperature: 0.7,
  top_p: 0.9,
  top_k: 40,
  max_tokens: 1024,
  repeat_penalty: 1.1,
};

// POST /llm/active-provider
router.post('/active-provider', (req, res) => {
  const { provider, model, temperature, top_p, top_k, max_tokens, repeat_penalty } = req.body;
  if (provider) ACTIVE_PROVIDER = provider;
  if (model) ACTIVE_MODEL = model;
  if (temperature !== undefined) ACTIVE_PARAMS.temperature = temperature;
  if (top_p !== undefined) ACTIVE_PARAMS.top_p = top_p;
  if (top_k !== undefined) ACTIVE_PARAMS.top_k = top_k;
  if (max_tokens !== undefined) ACTIVE_PARAMS.max_tokens = max_tokens;
  if (repeat_penalty !== undefined) ACTIVE_PARAMS.repeat_penalty = repeat_penalty;
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
    // If ACTIVE_MODEL is set, use it (allows upgrading existing Letta agents dynamically).
    // Otherwise, trust the model Letta is asking for (fixes the gpt-3.5-turbo background leak).
    realModel = ACTIVE_MODEL || model;
    
    // Safety check: if somehow realModel is still the hardcoded 'openai-proxy/gpt-3.5-turbo' 
    // from an old agent, we force it to a free model to avoid unexpected charges.
    if (realModel.includes('gpt-3.5-turbo')) {
      console.warn('[LLM Proxy] Intercepted gpt-3.5-turbo request! Falling back to a free model to prevent unwanted billing.');
      realModel = 'mistralai/mistral-7b-instruct:free'; // OpenRouter free fallback
    }
  }

  const config = PROVIDER_CONFIGS[baseProvider];
  if (!config) {
    return res.status(400).json({ error: `Unknown provider "${baseProvider}". Use llamacpp, openrouter, nvidia, or mistral.` });
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

    // Mistral (and some other providers) strictly forbid extra fields in message objects.
    // Letta can inject `reasoning_content` and other non-standard fields into assistant
    // messages when using thinking/chain-of-thought models. Strip them here.
    const STRICT_PROVIDERS = new Set(['mistral']);
    const ALLOWED_MSG_FIELDS = { role: 1, content: 1, name: 1, tool_calls: 1, tool_call_id: 1 };
    const sanitizedMessages = STRICT_PROVIDERS.has(baseProvider)
      ? messages.map(msg => {
          const clean = {};
          
          // Merge reasoning_content into content to prevent context loss
          if (msg.reasoning_content) {
            const extra = `<think>\n${msg.reasoning_content}\n</think>\n\n`;
            clean.content = msg.content ? (extra + msg.content) : extra;
          }

          for (const k of Object.keys(msg)) {
            if (ALLOWED_MSG_FIELDS[k]) {
              if (k === 'content' && clean.content) {
                // If we already merged reasoning_content, don't overwrite it directly,
                // but we already handled msg.content above, so skip it unless it's empty
                if (!msg.reasoning_content) clean.content = msg.content;
              } else {
                clean[k] = msg[k];
              }
            }
          }
          return clean;
        })
      : messages;

    const requestBody = {
      model: realModel || undefined,
      messages: sanitizedMessages,
      stream: req.body.stream ?? false,
      temperature: req.body.temperature ?? ACTIVE_PARAMS.temperature,
      top_p: req.body.top_p ?? ACTIVE_PARAMS.top_p,
      max_tokens: req.body.max_tokens ?? ACTIVE_PARAMS.max_tokens,
      ...(baseProvider === 'llamacpp' ? {
        top_k: req.body.top_k ?? ACTIVE_PARAMS.top_k,
        repeat_penalty: req.body.repeat_penalty ?? ACTIVE_PARAMS.repeat_penalty,
      } : {}),
    };

    // Determine the intent of the request by looking at the last message
    let intent = 'Agent Internal Loop';
    const lastMsg = sanitizedMessages[sanitizedMessages.length - 1];
    if (lastMsg) {
      if (lastMsg.role === 'user') intent = 'User Input (Initial)';
      else if (lastMsg.role === 'tool') intent = 'Tool Result (Follow-up)';
      else if (lastMsg.tool_calls) intent = 'Agent Tool Execution';
    }

    // Notify clients about the request Letta is sending
    notifyClients({
      type: 'letta_request',
      data: {
        provider: baseProvider,
        url: upstreamUrl,
        intent: intent,
        body: requestBody
      }
    });

    const upstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        ...config.extraHeaders,
      },
      body: JSON.stringify(requestBody),
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
      { id: ACTIVE_MODEL || 'tellama-dynamic-model', object: 'model', created: 1677610602, owned_by: 'tellama' },
      { id: 'gpt-3.5-turbo', object: 'model', created: 1677610602, owned_by: 'openai' },
      { id: 'openai/gpt-3.5-turbo', object: 'model', created: 1677610602, owned_by: 'openai' },
      { id: 'gpt-4o', object: 'model', created: 1677610602, owned_by: 'openai' },
      { id: 'openai/gpt-4o', object: 'model', created: 1677610602, owned_by: 'openai' },
      { id: 'mistralai/mistral-nemotron', object: 'model', created: 1677610602, owned_by: 'openrouter' },
      { id: 'test-model', object: 'model', created: 1677610602, owned_by: 'test' }
    ]
  });
});

const formatModelName = (id) => {
  if (!id) return '';
  // Remove vendor prefix if present (e.g., 'meta/' or 'mistralai/')
  const parts = id.split('/');
  let name = parts[parts.length - 1];

  // Replace hyphens and underscores with spaces
  name = name.replace(/[-_]/g, ' ');

  // Capitalize each word
  return name
    .split(' ')
    .map(word => {
      if (!word) return '';
      // Keep things like '7B', '8B', 'IT' as they are or uppercase them
      if (/^\d+[bB]$/.test(word)) return word.toUpperCase();
      if (word.toLowerCase() === 'it') return 'IT';
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
};

/**
 * Returns recommended inference parameters for a model based on its family.
 * contextLength comes from the provider API (e.g. OpenRouter's context_length field).
 */
const getModelDefaults = (id, contextLength) => {
  const s = id.toLowerCase();
  const ctx = contextLength || 4096;
  // Sensible max_tokens: no more than 4096, but also no more than 1/4 of context window
  const maxTok = (cap) => Math.min(cap, Math.max(256, Math.floor(ctx / 4)));

  // ── Model-family detection ─────────────────────────────────────────────────
  if (s.includes('gemma'))                      return { temperature: 1.0,  top_p: 0.95, max_tokens: maxTok(8192) };
  if (s.includes('llama'))                      return { temperature: 0.8,  top_p: 0.9,  max_tokens: maxTok(4096) };
  if (s.includes('claude'))                     return { temperature: 1.0,  top_p: 1.0,  max_tokens: maxTok(8192) };
  if (s.includes('gpt-4') || s.includes('o1') || s.includes('o3') || s.includes('o4'))
                                                return { temperature: 0.8,  top_p: 1.0,  max_tokens: maxTok(4096) };
  if (s.includes('gpt'))                        return { temperature: 0.9,  top_p: 1.0,  max_tokens: maxTok(2048) };
  if (s.includes('mixtral'))                    return { temperature: 0.7,  top_p: 0.9,  max_tokens: maxTok(4096) };
  if (s.includes('mistral'))                    return { temperature: 0.7,  top_p: 0.9,  max_tokens: maxTok(4096) };
  if (s.includes('qwen'))                       return { temperature: 0.7,  top_p: 0.8,  max_tokens: maxTok(4096) };
  if (s.includes('deepseek'))                   return { temperature: 0.7,  top_p: 0.9,  max_tokens: maxTok(4096) };
  if (s.includes('phi'))                        return { temperature: 0.8,  top_p: 0.95, max_tokens: maxTok(4096) };
  if (s.includes('command') || s.includes('cohere'))
                                                return { temperature: 0.8,  top_p: 0.95, max_tokens: maxTok(4096) };
  if (s.includes('falcon'))                     return { temperature: 0.8,  top_p: 0.9,  max_tokens: maxTok(2048) };
  if (s.includes('yi') || s.includes('01-ai')) return { temperature: 0.7,  top_p: 0.9,  max_tokens: maxTok(4096) };
  if (s.includes('solar'))                      return { temperature: 0.7,  top_p: 0.9,  max_tokens: maxTok(4096) };
  if (s.includes('wizard'))                     return { temperature: 0.7,  top_p: 0.9,  max_tokens: maxTok(2048) };
  if (s.includes('zephyr'))                     return { temperature: 0.7,  top_p: 0.9,  max_tokens: maxTok(2048) };
  if (s.includes('vicuna') || s.includes('alpaca'))
                                                return { temperature: 0.9,  top_p: 0.9,  max_tokens: maxTok(2048) };
  if (s.includes('nemotron'))                   return { temperature: 0.6,  top_p: 0.9,  max_tokens: maxTok(4096) };
  if (s.includes('granite'))                    return { temperature: 0.7,  top_p: 0.9,  max_tokens: maxTok(4096) };

  // Default fallback
  return { temperature: 0.8, top_p: 0.9, max_tokens: maxTok(2048) };
};

// Fetch models from providers for the UI
router.get('/models/:provider', async (req, res) => {
  const provider = req.params.provider;

  try {
    const favorites = db.prepare('SELECT model_id FROM favorite_models').all().map(r => r.model_id);
    const isFav = (id) => favorites.includes(id);

    if (provider === 'openrouter') {
      const resp = await fetch('https://openrouter.ai/api/v1/models');
      const data = await resp.json();

      const seenIds = new Set();
      const filtered = data.data.filter(m => {
        if (seenIds.has(m.id)) return false;
        seenIds.add(m.id);

        // Filter models that support tools (for Letta)
        const hasTools = m.supported_parameters?.includes('tools') || m.supported_parameters?.includes('tool_choice');
        return hasTools;
      }).map(m => {
        const isFree = m.pricing?.prompt === "0" || m.pricing?.prompt === 0 || m.id.endsWith(':free');
        return {
          id: m.id,
          name: m.name || formatModelName(m.id),
          isFree: isFree,
          isFavorite: isFav(m.id),
          link: `https://openrouter.ai/${m.id}`,
          context_length: m.context_length || null,
          defaultParams: getModelDefaults(m.id, m.context_length),
        };
      });

      // Sort models: favorites first, then alphabetically
      filtered.sort((a, b) => {
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
        return a.name.localeCompare(b.name);
      });

      res.json(filtered);
    } else if (provider === 'nvidia') {
      const resp = await fetch('https://integrate.api.nvidia.com/v1/models');
      const data = await resp.json();

      const seenIds = new Set();
      const mapped = data.data
        .filter(m => {
          if (seenIds.has(m.id)) return false;
          seenIds.add(m.id);
          return true;
        })
        .map(m => ({
          id: m.id,
          name: formatModelName(m.id),
          isFree: false,
          isFavorite: isFav(m.id),
          link: `https://build.nvidia.com/${m.id}/modelcard`,
          context_length: m.context_length || null,
          defaultParams: getModelDefaults(m.id, m.context_length),
        }));

      mapped.sort((a, b) => {
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
        return a.name.localeCompare(b.name);
      });
      res.json(mapped);
    } else if (provider === 'mistral') {
      // Mistral requires an API key to list models
      const keyRow = db.prepare('SELECT key_value FROM api_keys WHERE provider = ?').get('mistral');
      if (!keyRow) {
        return res.status(401).json({ error: 'Mistral API key not configured. Add it in Settings first.' });
      }
      const resp = await fetch('https://api.mistral.ai/v1/models', {
        headers: { 'Authorization': `Bearer ${keyRow.key_value}` },
      });
      const data = await resp.json();

      const seenIds = new Set();
      const mapped = (data.data || [])
        .filter(m => {
          if (seenIds.has(m.id)) return false;
          seenIds.add(m.id);
          // Only include text-generation / chat models
          return m.capabilities?.completion_chat === true || !m.capabilities;
        })
        .map(m => ({
          id: m.id,
          name: m.name || formatModelName(m.id),
          isFree: false,
          isFavorite: isFav(m.id),
          link: `https://docs.mistral.ai/getting-started/models/`,
          context_length: m.max_context_window || null,
          defaultParams: getModelDefaults(m.id, m.max_context_window),
        }));

      mapped.sort((a, b) => {
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
        return a.name.localeCompare(b.name);
      });
      res.json(mapped);
    } else {
      res.json([]);
    }
  } catch (e) {
    console.error(`[LLM Models] ${provider} error:`, e);
    res.status(500).json({ error: e.message });
  }
});

// Icon proxy to avoid CORP/CORS issues
router.get('/icon', async (req, res) => {
  const { domain } = req.query;
  if (!domain) return res.status(400).end();
  try {
    const iconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
    const resp = await fetch(iconUrl);
    const buffer = await resp.arrayBuffer();
    res.setHeader('Content-Type', resp.headers.get('Content-Type') || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(Buffer.from(buffer));
  } catch (e) {
    res.status(500).end();
  }
});

// ── Favorite Models ─────────────────────────────────────────────────────────

router.get('/favorites', (req, res) => {
  try {
    const rows = db.prepare('SELECT model_id FROM favorite_models').all();
    res.json(rows.map(r => r.model_id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/favorites', (req, res) => {
  const { modelId } = req.body;
  if (!modelId) return res.status(400).json({ error: 'Missing modelId' });
  try {
    db.prepare('INSERT OR IGNORE INTO favorite_models (model_id, created_at) VALUES (?, ?)').run(modelId, Date.now());
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/favorites/:modelId', (req, res) => {
  const { modelId } = req.params;
  try {
    db.prepare('DELETE FROM favorite_models WHERE model_id = ?').run(modelId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
