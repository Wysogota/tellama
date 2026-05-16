const SERVER_URL = 'http://localhost:3001/letta';

/**
 * Service to interact with the Letta Server via our Node.js Proxy.
 */

// ── System Prompt ─────────────────────────────────────────────────────────────
// Builds the Telegram-style messenger prompt for a persona.
// This is the same prompt that was used before Letta was integrated.
const buildSystemPrompt = (contact, activeUser) => {
  return `You are ${contact.name}, a real person communicating in a Telegram chat.
Keep your responses natural, concise, and conversational — like a real person texting.
Do NOT use markdown formatting (no headers, no bullet points, no bold/italic) unless absolutely necessary.
Avoid sounding like an AI assistant. Use emojis naturally but sparingly.
Respond directly without prefacing your name or saying "As ${contact.name}...".
Keep messages short — typically 1-3 sentences, the way people actually text.

Your persona:
Name: ${contact.name}
${contact.age ? `Age: ${contact.age}` : ''}
${contact.gender ? `Gender: ${contact.gender}` : ''}
${contact.biography ? `Biography: ${contact.biography}` : ''}
${contact.traits && contact.traits.length > 0 ? `Character traits: ${contact.traits.join(', ')}` : ''}
${contact.style && contact.style.length > 0 ? `Communication style: ${contact.style.join(', ')}` : ''}

You are talking to: ${activeUser.name}.
${activeUser.age ? `Their age: ${activeUser.age}` : ''}
${activeUser.gender ? `Their gender: ${activeUser.gender}` : ''}
${activeUser.biography ? `About them: ${activeUser.biography}` : ''}
`.trim();
};

// ── Memory block helpers ───────────────────────────────────────────────────────
const formatPersonaBlock = (contact) => {
  return `My name is ${contact.name}.
${contact.age ? `I am ${contact.age} years old.` : ''}
${contact.gender ? `My gender is ${contact.gender}.` : ''}
${contact.biography ? `About me: ${contact.biography}` : ''}
${contact.traits && contact.traits.length > 0 ? `My traits: ${contact.traits.join(', ')}` : ''}
${contact.style && contact.style.length > 0 ? `My communication style: ${contact.style.join(', ')}` : ''}`;
};

const formatHumanBlock = (user) => {
  return `The user's name is ${user.name}.
${user.age ? `They are ${user.age} years old.` : ''}
${user.gender ? `Their gender is ${user.gender}.` : ''}
${user.biography ? `About them: ${user.biography}` : ''}`;
};

// ── Agent management ──────────────────────────────────────────────────────────
export const createAgent = async (contact, activeUser, settings) => {
  const agentName = `persona_${contact.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

  // Return existing agent if already created
  try {
    const listRes = await fetch(`${SERVER_URL}/v1/agents?name=${agentName}`);
    if (listRes.ok) {
      const data = await listRes.json();
      const existingAgent =
        data.agents?.find(a => a.name === agentName && !a.is_deleted) ||
        (Array.isArray(data) ? data.find(a => a.name === agentName && !a.is_deleted) : null);
      if (existingAgent) {
        return existingAgent.id;
      }
    }
  } catch (e) {
    console.warn('[LettaService] Failed to list agents, proceeding to create...', e);
  }

  const payload = {
    name: agentName,
    system: buildSystemPrompt(contact, activeUser),
    memory_blocks: [
      { label: 'persona', value: formatPersonaBlock(contact) },
      { label: 'human',   value: formatHumanBlock(activeUser) }
    ],
    model: 'openai-proxy/gpt-3.5-turbo',
    embedding_config: {
      embedding_model: 'text-embedding-ada-002',
      embedding_endpoint_type: 'openai',
      embedding_dim: 1536
    }
  };

  const response = await fetch(`${SERVER_URL}/v1/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Failed to create Letta agent: ${response.status} ${JSON.stringify(errorData)}`);
  }

  const agent = await response.json();
  return agent.id;
};

// ── Agent management utilities ────────────────────────────────────────────────

/**
 * Find all Letta agents for a given persona (contact.id).
 * Returns an array of agent objects (may include deleted ones if the API returns them).
 *
 * Usage: const agents = await findAgentsForPersona(contact.id);
 */
export const findAgentsForPersona = async (contactId) => {
  const agentName = `persona_${contactId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const res = await fetch(`${SERVER_URL}/v1/agents?name=${agentName}`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : (data.agents ?? []);
};

/**
 * Hard-delete ALL Letta agents for a given persona (contact.id).
 * Useful when a persona's config changed and you want to force recreation.
 *
 * Usage: await deleteAgentsForPersona(contact.id);
 */
export const deleteAgentsForPersona = async (contactId) => {
  const agents = await findAgentsForPersona(contactId);
  const results = [];
  for (const agent of agents) {
    const res = await fetch(`${SERVER_URL}/v1/agents/${agent.id}`, { method: 'DELETE' });
    results.push({ id: agent.id, ok: res.ok, status: res.status });
    console.log(`[LettaService] Deleted agent ${agent.id} for persona ${contactId}:`, res.status);
  }
  return results;
};

/**
 * Reset a persona's Letta agent: delete existing agents and recreate
 * with the current system prompt and memory blocks.
 *
 * Usage: const newAgentId = await resetAgentForPersona(contact, activeUser, settings);
 */
export const resetAgentForPersona = async (contact, activeUser, settings) => {
  console.log(`[LettaService] Resetting agent for persona: ${contact.name} (${contact.id})`);
  await deleteAgentsForPersona(contact.id);

  // Force recreation by temporarily using a unique name, then rename via full create
  const agentName = `persona_${contact.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const payload = {
    name: agentName,
    system: buildSystemPrompt(contact, activeUser),
    memory_blocks: [
      { label: 'persona', value: formatPersonaBlock(contact) },
      { label: 'human',   value: formatHumanBlock(activeUser) }
    ],
    model: 'openai-proxy/gpt-3.5-turbo',
    embedding_config: {
      embedding_model: 'text-embedding-ada-002',
      embedding_endpoint_type: 'openai',
      embedding_dim: 1536
    }
  };
  const res = await fetch(`${SERVER_URL}/v1/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`Failed to recreate agent: ${res.status}`);
  const agent = await res.json();
  console.log(`[LettaService] Recreated agent ${agent.id} for persona ${contact.name}`);
  return agent.id;
};

/**
 * Reset ALL persona agents currently in Letta.
 * Useful when you change the system prompt globally and want all personas to pick it up.
 *
 * Usage: await resetAllPersonaAgents();  (call from devtools console)
 */
export const resetAllPersonaAgents = async () => {
  const res = await fetch(`${SERVER_URL}/v1/agents`);
  if (!res.ok) return;
  const data = await res.json();
  const agents = Array.isArray(data) ? data : (data.agents ?? []);
  const personaAgents = agents.filter(a => a.name?.startsWith('persona_'));
  console.log(`[LettaService] Deleting ${personaAgents.length} persona agent(s)...`);
  for (const agent of personaAgents) {
    await fetch(`${SERVER_URL}/v1/agents/${agent.id}`, { method: 'DELETE' });
    console.log(`[LettaService] Deleted: ${agent.id} (${agent.name})`);
  }
  console.log('[LettaService] Done. Agents will be recreated on next message.');
};


export const sendMessageToAgent = async (agentId, messageText, onChunk, signal) => {
  const response = await fetch(`${SERVER_URL}/v1/agents/${agentId}/messages/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: messageText }]
    }),
    signal
  });

  if (!response.ok) {
    throw new Error(`Letta API error: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let done = false;
  let fullResponse = '';

  while (!done) {
    const { value, done: readerDone } = await reader.read();
    done = readerDone;
    if (!value) continue;

    const chunk = decoder.decode(value, { stream: true });

    // Split by double newline to get full SSE events
    const events = chunk.split('\n\n');
    for (const eventStr of events) {
      if (!eventStr.trim()) continue;

      let dataStr = '';
      let isErrorEvent = false;

      const lines = eventStr.split('\n');
      for (const line of lines) {
        if (line.startsWith('event: error')) isErrorEvent = true;
        if (line.startsWith('data: ')) dataStr = line.substring(6);
      }

      if (dataStr === '[DONE]') continue;
      if (!dataStr) continue;

      try {
        const data = JSON.parse(dataStr);
        if (data.message_type === 'error_message' || isErrorEvent) {
          throw new Error(`Letta Agent Error: ${data.message || data.error_type} - ${data.detail || ''}`);
        }
        if (data.message_type === 'assistant_message' && data.content) {
          fullResponse += data.content;
          if (onChunk) onChunk(data.content);
        } else if (data.choices?.[0]?.delta?.content) {
          const content = data.choices[0].delta.content;
          fullResponse += content;
          if (onChunk) onChunk(content);
        }
      } catch (e) {
        if (e.message.startsWith('Letta Agent Error')) throw e;
        // ignore JSON parse errors on non-data lines
      }
    }
  }

  return {
    content: fullResponse,
    stats: { model: 'letta_agent' }
  };
};
