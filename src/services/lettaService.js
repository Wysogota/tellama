const SERVER_URL = 'http://localhost:3001/letta';

/**
 * Service to interact with the Letta Server via our Node.js Proxy.
 */

// ── User Mapping ──────────────────────────────────────────────────────────────
let userCache = {}; // activeUser.id -> letta_user_id

const getLettaUserId = async (activeUser) => {
  if (userCache[activeUser.id]) return userCache[activeUser.id];
  
  let allUsers = [];
  try {
    let cursor = null;
    let hasMore = true;
    while(hasMore) {
       const url = `${SERVER_URL}/v1/admin/users/?limit=100${cursor ? '&after='+cursor : ''}`;
       const res = await fetch(url);
       if (!res.ok) break;
       const data = await res.json();
       if (!Array.isArray(data) || data.length === 0) break;
       allUsers.push(...data);
       if (data.length < 100) break;
       cursor = data[data.length - 1].id;
    }
  } catch(e) {
     console.error('[LettaService] Failed to list Letta users', e);
  }

  // Use activeUser.id as the Letta user name to guarantee uniqueness per profile
  const existing = allUsers.find(u => u.name === activeUser.id);
  if (existing) {
    userCache[activeUser.id] = existing.id;
    return existing.id;
  }

  try {
     const res = await fetch(`${SERVER_URL}/v1/admin/users/`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ name: activeUser.id, organization_id: 'org-00000000-0000-4000-8000-000000000000' })
     });
     if (res.ok) {
       const newUser = await res.json();
       userCache[activeUser.id] = newUser.id;
       return newUser.id;
     }
  } catch(e) {
     console.error('[LettaService] Failed to create Letta user', e);
  }
  return null;
};

const fetchLetta = async (url, options = {}, activeUser = null) => {
  const headers = { ...options.headers };
  if (activeUser) {
    const userId = await getLettaUserId(activeUser);
    if (userId) {
      headers['x-user-id'] = userId;
    }
  }
  return fetch(url, { ...options, headers });
};

// ── System Prompt ─────────────────────────────────────────────────────────────
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
    const listRes = await fetchLetta(`${SERVER_URL}/v1/agents?name=${agentName}`, {}, activeUser);
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

  const response = await fetchLetta(`${SERVER_URL}/v1/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }, activeUser);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Failed to create Letta agent: ${response.status} ${JSON.stringify(errorData)}`);
  }

  const agent = await response.json();
  return agent.id;
};

// ── Agent management utilities ────────────────────────────────────────────────

export const findAgentsForPersona = async (contactId, activeUser) => {
  const agentName = `persona_${contactId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const res = await fetchLetta(`${SERVER_URL}/v1/agents?name=${agentName}`, {}, activeUser);
  if (!res.ok) return [];
  const data = await res.json();
  const allAgents = Array.isArray(data) ? data : (data.agents ?? []);
  return allAgents;
};

export const deleteAgentsForPersona = async (contactId, activeUser) => {
  const agents = await findAgentsForPersona(contactId, activeUser);
  const results = [];
  for (const agent of agents) {
    const res = await fetchLetta(`${SERVER_URL}/v1/agents/${agent.id}`, { method: 'DELETE' }, activeUser);
    results.push({ id: agent.id, ok: res.ok, status: res.status });
    console.log(`[LettaService] Deleted agent ${agent.id} for persona ${contactId}:`, res.status);
  }
  return results;
};

export const resetAgentForPersona = async (contact, activeUser, settings) => {
  console.log(`[LettaService] Resetting agent for persona: ${contact.name} (${contact.id}) user: ${activeUser.name}`);
  await deleteAgentsForPersona(contact.id, activeUser);

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
  const res = await fetchLetta(`${SERVER_URL}/v1/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }, activeUser);
  if (!res.ok) throw new Error(`Failed to recreate agent: ${res.status}`);
  const agent = await res.json();
  console.log(`[LettaService] Recreated agent ${agent.id} for persona ${contact.name}`);
  return agent.id;
};

export const resetAllPersonaAgents = async () => {
  // Resetting all agents requires looping through all users if they're scoped, 
  // but since we only have the default fetch here, this will only reset default_user's agents.
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

export const sendMessageToAgent = async (agentId, messageText, onChunk, signal, activeUser) => {
  const response = await fetchLetta(`${SERVER_URL}/v1/agents/${agentId}/messages/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: messageText }]
    }),
    signal
  }, activeUser);

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
      }
    }
  }

  return {
    content: fullResponse,
    stats: { model: 'letta_agent' }
  };
};
