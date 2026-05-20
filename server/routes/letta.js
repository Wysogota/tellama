import express from 'express';
import dotenv from 'dotenv';
import { Readable } from 'stream';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';

dotenv.config();

const router = express.Router();
const LETTA_URL = process.env.LETTA_URL || 'http://localhost:8283';
const LETTA_PASSWORD = process.env.LETTA_PASSWORD || '';

// Injected by index.js after WS server is created
let notifyClients = () => {};
export function setNotifyClients(fn) { notifyClients = fn; }

function parseThoughtsAndContent(text) {
  let thoughts = '';
  let content = text;
  
  let openTag = '<thought>';
  let closeTag = '</thought>';
  
  let openIndex = text.indexOf(openTag);
  if (openIndex === -1) {
    openTag = '<think>';
    closeTag = '</think>';
    openIndex = text.indexOf(openTag);
  }
  
  if (openIndex !== -1) {
    const closeIndex = text.indexOf(closeTag);
    if (closeIndex !== -1) {
      thoughts = text.substring(openIndex + openTag.length, closeIndex);
      content = text.substring(0, openIndex) + text.substring(closeIndex + closeTag.length);
    } else {
      thoughts = text.substring(openIndex + openTag.length);
      content = text.substring(0, openIndex);
    }
  }
  
  return { thoughts: thoughts.trim(), content: content.trim() };
}

function persistAssistantMessage(sessionId, parentMessageId, content, lettaMessageId, reasoning = '') {
  if (!sessionId || !content) return;
  
  const parsed = parseThoughtsAndContent(content);
  const finalContent = parsed.content || '...';
  const combinedReasoning = (reasoning || parsed.thoughts || '').trim();

  try {
    if (!db.prepare('SELECT 1 FROM chat_sessions WHERE id = ?').get(sessionId)) {
      console.warn('[Letta Proxy] persist skipped: session not in DB:', sessionId);
      return;
    }
    // Skip if a non-user reply with this parent already exists (client beat us to it)
    if (parentMessageId && db.prepare(
      `SELECT 1 FROM messages WHERE session_id = ? AND role != 'user' AND parent_message_id = ?`
    ).get(sessionId, parentMessageId)) {
      return;
    }

    const now = Date.now();
    const idToUse = uuidv4();
    const metadataObj = {};
    if (lettaMessageId) metadataObj.letta_id = lettaMessageId;
    if (combinedReasoning) metadataObj.reasoning = combinedReasoning;
    const metadata = JSON.stringify(metadataObj);
    
    db.prepare(
      `INSERT INTO messages (id, session_id, role, content, parent_message_id, created_at, updated_at, metadata)
       VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?)`
    ).run(idToUse, sessionId, finalContent, parentMessageId ?? null, now, now, metadata);

    console.log(`[Letta Proxy] ✓ Persisted assistant reply (${finalContent.length} chars) with reasoning (${combinedReasoning.length} chars) → session ${sessionId} with letta_id ${lettaMessageId}`);
    notifyClients({ type: 'invalidate', tables: ['messages'], from: 'server', timestamp: now });
  } catch (e) {
    console.error('[Letta Proxy] Failed to persist assistant message:', e.message);
  }
}

// Proxy middleware — forwards all /letta/* requests to the Letta server.
router.use(async (req, res) => {
  const targetUrl = `${LETTA_URL}${req.url}`;
  const headers = { 'Content-Type': 'application/json' };
  if (LETTA_PASSWORD) headers['Authorization'] = `Bearer ${LETTA_PASSWORD}`;
  if (req.headers['x-user-id']) headers['user_id'] = req.headers['x-user-id'];

  // Context passed by the browser so we can persist the reply server-side
  const sessionId = req.headers['x-session-id'] || null;
  const parentMessageId = req.headers['x-parent-message-id'] || null;

  try {
    const fetchOptions = { method: req.method, headers };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, fetchOptions);

    if (response.headers.get('content-type')?.includes('text/event-stream')) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const nodeStream = Readable.fromWeb(response.body);

      // Only intercept /messages/stream when we have a sessionId to persist to
      if (!req.url.includes('/messages/stream') || !sessionId) {
        nodeStream.pipe(res);
        return;
      }

      // Buffer assistant_message content while forwarding the stream to the client
      let assistantContent = '';
      let internalMonologue = '';
      let assistantMessageId = null;
      const decoder = new TextDecoder('utf-8');
      let clientDisconnected = false;

      res.on('close', () => { clientDisconnected = true; });

      notifyClients({ type: 'stream_start', sessionId });

      nodeStream.on('data', (chunk) => {
        if (!res.writableEnded) res.write(chunk);

        const text = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
        for (const eventStr of text.split('\n\n')) {
          let dataStr = '';
          for (const line of eventStr.split('\n')) {
            if (line.startsWith('data: ')) dataStr = line.slice(6);
          }
          if (!dataStr || dataStr === '[DONE]') continue;
          try {
            const msg = JSON.parse(dataStr);
            console.log("[DEBUG Letta Proxy] message:", msg);
            if (msg.message_type === 'assistant_message' && msg.content) {
              if (msg.id) assistantMessageId = msg.id;
              assistantContent += msg.content;
              notifyClients({ type: 'stream_chunk', sessionId, content: assistantContent });
            } else if ((msg.message_type === 'internal_monologue' && msg.internal_monologue) || 
                       (msg.message_type === 'reasoning_message' && msg.reasoning)) {
              internalMonologue += msg.internal_monologue || msg.reasoning;
            }
          } catch (_) { /* non-JSON SSE line */ }
        }
      });

      nodeStream.on('end', () => {
        if (!res.writableEnded) res.end();
        // Only persist server-side when the client disconnected before the stream ended.
        if (clientDisconnected && assistantContent) {
          persistAssistantMessage(sessionId, parentMessageId, assistantContent, assistantMessageId, internalMonologue);
        }
        notifyClients({ type: 'stream_end', sessionId });
      });

      nodeStream.on('error', () => { if (!res.writableEnded) res.end(); });
      return;
    }

    const data = await response.json().catch(() => null);
    if (!response.ok) return res.status(response.status).json(data || { error: 'Letta API error' });
    res.json(data);
  } catch (e) {
    console.error('[Letta Proxy] Error:', e.message);
    res.status(500).json({ error: 'Failed to connect to Letta Server' });
  }
});

export default router;
