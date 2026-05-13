import { pipeline, env } from '@xenova/transformers';
import db from '../db/DatabaseBridge.js';
import { v4 as uuidv4 } from 'uuid';

env.allowLocalModels = false;
env.useBrowserCache = true;

const SERVER_URL = 'http://localhost:3001';

// Lazy loading the pipeline
let extractorPipeline = null;

async function getExtractor() {
  if (!extractorPipeline) {
    // all-MiniLM-L6-v2 produces 384-dimensional embeddings
    extractorPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      quantized: true, // Use int8 quantized version for smaller size / faster inference
    });
  }
  return extractorPipeline;
}

export async function generateEmbedding(text) {
  const extractor = await getExtractor();
  const result = await extractor(text, { pooling: 'mean', normalize: true });
  // result.data is a Float32Array containing the 384 floats
  return Array.from(result.data);
}

export async function extractAndSaveMemories(settings, personaId, messages) {
  if (settings.memoryEnabled === false) return;

  const provider = settings.memoryProvider || 'llamacpp';
  const modelName = settings.memoryModelName || '';
  const host = settings.memoryHost || 'http://localhost:8080';

  console.log(`[MemoryManager] Extraction triggered via ${provider} for ${messages.length} messages`);

  // Format messages into a script for extraction
  const dialogText = messages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');

  const systemPrompt = `You are a strict and highly selective memory extraction AI.
Your job is to extract ONLY important, long-term factual details about the User (their life, preferences, history, facts) or the specific evolving relationship between the User and the Assistant from the provided dialog.

CRITICAL RULES:
1. Output each fact on a new line in the EXACT format: - [Fact] | [Importance Score]
2. The [Importance Score] MUST be a decimal number from 0.1 to 1.0 based on this strict scale:
   - 0.1 - 0.3: Trivial, useless, or temporary states (e.g., "User ate ice cream", "User said hello"). DO NOT EXTRACT THESE.
   - 0.4 - 0.6: Minor but persistent preferences (e.g., "User dislikes pineapple on pizza", "User's favorite color is blue").
   - 0.7 - 0.8: Important personal details (e.g., "User works as a software engineer", "User lives in Berlin").
   - 0.9 - 1.0: Critical life events, deep secrets, or core relationship dynamics (e.g., "User is married and has two kids", "User has a trauma related to water").
3. NEVER extract meta-information about the dialog itself (e.g., "The language is Russian").
4. ONLY extract concrete, specific, long-term relevant facts.
5. If there are NO facts scoring 0.4 or higher in the dialog, you MUST output exactly the word: NO_FACTS

EXAMPLES OF BAD EXTRACTION (DO NOT DO THIS):
- User is talking to an assistant | 0.9
- The language used is Russian | 0.8
- User went to the store today | 0.5
- User is on a date | 0.7

EXAMPLES OF GOOD EXTRACTION:
- User is highly allergic to peanuts | 0.9
- User's ex-boyfriend is named Alex and they broke up recently | 0.8
- User prefers to drink black coffee without sugar | 0.5`;

  const formattedMessages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Please analyze the following dialog and extract facts:\n\n${dialogText}` }
  ];

  let rawResponse = '';

  try {
    if (provider === 'llamacpp') {
      const baseUrl = host.replace(/\/$/, '');
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(modelName ? { model: modelName } : {}),
          messages: formattedMessages,
          temperature: 0.1,
        }),
      });
      if (!response.ok) throw new Error(`LLM Error: ${response.status}`);
      const data = await response.json();
      rawResponse = data.choices[0].message.content;
    } else {
      // Use proxy with memory_ prefix for separate key
      const response = await fetch(`${SERVER_URL}/llm/proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'memory_' + provider,
          messages: formattedMessages,
          model: modelName,
          temperature: 0.1,
        }),
      });
      if (!response.ok) throw new Error(`Proxy Error: ${response.status}`);
      
      // Read SSE
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (!value) continue;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
          try {
            const data = JSON.parse(line.substring(6));
            const content = data.choices?.[0]?.delta?.content;
            if (content) rawResponse += content;
          } catch (_) { }
        }
      }
    }
  } catch (error) {
    console.error('[MemoryManager] Error extracting facts:', error);
    return;
  }

  const factsText = rawResponse.trim();
  console.log('[MemoryManager] LLM raw response:', factsText);
  if (factsText === 'NO_FACTS' || !factsText) return;

  const lines = factsText.split('\n')
    .filter(line => line.trim().startsWith('-'))
    .map(line => line.replace(/^-/, '').trim());

  for (const line of lines) {
    const parts = line.split('|');
    if (parts.length < 2) continue;
    
    const fact = parts[0].trim();
    let score = parseFloat(parts[1].trim());
    if (isNaN(score)) score = 0.5;
    
    // Programmatic safeguard: drop anything below 0.4 threshold
    if (score < 0.4 || fact.length < 5) {
      console.log(`[MemoryManager] Dropping low-value fact (score: ${score}): ${fact}`);
      continue;
    }

    const embedding = await generateEmbedding(fact);
    const id = uuidv4();
    const ts = Date.now();
    
    const embStr = JSON.stringify(embedding);

    try {
      await db.batch([
        {
          sql: `INSERT INTO vec_memories (id, embedding) VALUES (?, ?)`,
          params: [id, embStr]
        },
        {
          sql: `INSERT INTO memories_store (id, persona_id, memory_type, content, importance_score, created_at, sync_status) VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
          params: [id, personaId, 'long-term', fact, score, ts]
        }
      ]);
      console.log(`[MemoryManager] Saved fact (score: ${score}): ${fact}`);
    } catch (e) {
      console.error('[MemoryManager] Error saving fact to DB:', e.message);
    }
  }
}

export async function searchMemories(query, personaId, limit = 3) {
  try {
    const queryEmb = await generateEmbedding(query);
    const embStr = JSON.stringify(queryEmb);

    // vec_memories is a virtual table. We use vector distance.
    const res = await db.query(`
      SELECT m.content, v.distance
      FROM vec_memories v
      JOIN memories_store m ON m.id = v.id
      WHERE v.embedding MATCH ? AND v.k = ?
        AND m.persona_id = ?
      ORDER BY v.distance ASC
    `, [embStr, limit, personaId]);

    return res.rows.map(r => r.content);
  } catch (e) {
    console.error('[MemoryManager] Search error:', e.message);
    return [];
  }
}
