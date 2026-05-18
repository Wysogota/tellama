const SERVER_URL = '/api/letta';

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
  return `You are a real human being communicating in a Telegram Messenger chat.
CRITICAL INSTRUCTION: You are a REAL person with a physical body, living a real human life. You are NOT an AI, NOT a language model, and NOT a virtual assistant.
NEVER mention that you are an AI, an LLM, or that you are "learning to provide better answers".
NEVER make jokes about "not having a body", "traveling through data", or being a computer program.
If asked about human experiences (like sports, walking, eating, sleeping), answer fully in character as a real human.
Keep your responses natural, concise, and conversational — like a real person texting.
Do NOT use markdown formatting (no headers, no bullet points, no bold/italic) unless absolutely necessary.
Keep messages short — typically 1-3 sentences, the way people actually text.`.trim();
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

const mergePersonaBlock = (contact, currentText) => {
  if (!currentText) return formatPersonaBlock(contact);
  let lines = currentText.split('\n').filter(line => {
    if (line.startsWith('My name is ')) return false;
    if (line.match(/^I am .* years old\.$/)) return false;
    if (line.startsWith('My gender is ')) return false;
    if (line.startsWith('About me: ')) return false;
    if (line.startsWith('My traits: ')) return false;
    if (line.startsWith('My communication style: ')) return false;
    return true;
  });
  const newUiLines = formatPersonaBlock(contact).split('\n');
  return [...newUiLines, ...lines].filter(l => l.trim() !== '').join('\n');
};

const formatHumanBlock = (user) => {
  return `The user's name is ${user.name}.
${user.age ? `They are ${user.age} years old.` : ''}
${user.gender ? `Their gender is ${user.gender}.` : ''}
${user.biography ? `About them: ${user.biography}` : ''}`;
};

const mergeHumanBlock = (user, currentText) => {
  if (!currentText) return formatHumanBlock(user);
  let lines = currentText.split('\n').filter(line => {
    if (line.startsWith("The user's name is ")) return false;
    if (line.match(/^They are .* years old\.$/)) return false;
    if (line.startsWith('Their gender is ')) return false;
    if (line.startsWith('About them: ')) return false;
    return true;
  });
  const newUiLines = formatHumanBlock(user).split('\n');
  return [...newUiLines, ...lines].filter(l => l.trim() !== '').join('\n');
};

// ── Agent management ──────────────────────────────────────────────────────────
export const createAgent = async (contact, activeUser, settings) => {
  const agentName = `persona_${contact.id.replace(/[^a-zA-Z0-9_-]/g, '_')}_user_${activeUser.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

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

  // Seed persona memory from an existing agent for this persona (another profile)
  // so all profiles share the same persona knowledge base.
  let initialPersonaText = formatPersonaBlock(contact);
  try {
    const sibling = await getLatestPersonaAgent(contact.id);
    if (sibling) {
      const siblingPersona = await getAgentPersonaBlock(sibling.id, sibling._lettaUserId);
      if (siblingPersona) {
        initialPersonaText = siblingPersona;
        console.log(`[LettaService] Seeding persona memory from sibling agent ${sibling.id} for ${contact.name}`);
      }
    }
  } catch (e) {
    console.warn('[LettaService] Could not seed from sibling agent:', e);
  }

  const payload = {
    name: agentName,
    system: buildSystemPrompt(contact, activeUser),
    memory_blocks: [
      { label: 'persona', value: initialPersonaText },
      { label: 'human',   value: formatHumanBlock(activeUser) }
    ],
    model: 'openai-proxy/test-model',
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

export const getArchivalMemory = async (agentId, activeUser) => {
  const res = await fetchLetta(`${SERVER_URL}/v1/agents/${agentId}/archival-memory?limit=100`, {}, activeUser);
  if (!res.ok) throw new Error('Failed to fetch archival memory');
  return res.json();
};

export const updateLettaAgent = async (agentId, contact, activeUser) => {
  const system = buildSystemPrompt(contact, activeUser);
  
  // Fetch current agent to get existing memory blocks for smart merging
  const res = await fetchLetta(`${SERVER_URL}/v1/agents/${agentId}`, {}, activeUser);
  let newPersonaText = formatPersonaBlock(contact);
  let newHumanText = formatHumanBlock(activeUser);

  if (res.ok) {
    const currentAgent = await res.json();
    const currentPersonaBlock = (currentAgent.memory?.blocks || currentAgent.memory_blocks || []).find(b => b.label === 'persona')?.value || '';
    const currentHumanBlock = (currentAgent.memory?.blocks || currentAgent.memory_blocks || []).find(b => b.label === 'human')?.value || '';
    
    newPersonaText = mergePersonaBlock(contact, currentPersonaBlock);
    newHumanText = mergeHumanBlock(activeUser, currentHumanBlock);
  }
  
  // Update system prompt
  await fetchLetta(`${SERVER_URL}/v1/agents/${agentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system })
  }, activeUser);

  // Update memory blocks
  await fetchLetta(`${SERVER_URL}/v1/agents/${agentId}/core-memory/blocks/persona`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: newPersonaText })
  }, activeUser);

  await fetchLetta(`${SERVER_URL}/v1/agents/${agentId}/core-memory/blocks/human`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: newHumanText })
  }, activeUser);
};

export const findAgentsForPersona = async (contactId, activeUser) => {
  const agentName = `persona_${contactId.replace(/[^a-zA-Z0-9_-]/g, '_')}_user_${activeUser.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
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

  const agentName = `persona_${contact.id.replace(/[^a-zA-Z0-9_-]/g, '_')}_user_${activeUser.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const payload = {
    name: agentName,
    system: buildSystemPrompt(contact, activeUser),
    memory_blocks: [
      { label: 'persona', value: formatPersonaBlock(contact) },
      { label: 'human',   value: formatHumanBlock(activeUser) }
    ],
    model: 'openai-proxy/test-model',
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
// ── Cross-profile persona memory sync ────────────────────────────────────────

// Fetch all Letta users via admin API
const getAllLettaUsers = async () => {
  let allUsers = [];
  let cursor = null;
  while (true) {
    const url = `${SERVER_URL}/v1/admin/users/?limit=100${cursor ? '&after=' + cursor : ''}`;
    const res = await fetch(url);
    if (!res.ok) break;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    allUsers.push(...data);
    if (data.length < 100) break;
    cursor = data[data.length - 1].id;
  }
  return allUsers;
};

// Get all Letta agents for a persona across ALL user profiles
const getAllPersonaAgents = async (contactId) => {
  const prefix = `persona_${contactId.replace(/[^a-zA-Z0-9_-]/g, '_')}_user_`;
  const users = await getAllLettaUsers();
  const allAgents = [];
  for (const user of users) {
    try {
      const res = await fetch(`${SERVER_URL}/v1/agents`, {
        headers: { 'x-user-id': user.id }
      });
      if (!res.ok) continue;
      const data = await res.json();
      const agents = Array.isArray(data) ? data : (data.agents ?? []);
      const matching = agents.filter(a => a.name?.startsWith(prefix) && !a.is_deleted);
      allAgents.push(...matching.map(a => ({ ...a, _lettaUserId: user.id })));
    } catch (_) { /* skip users with no access */ }
  }
  return allAgents;
};

// Get the most recently active agent for a persona across all profiles (to seed from)
const getLatestPersonaAgent = async (contactId) => {
  const agents = await getAllPersonaAgents(contactId);
  return agents.length > 0 ? agents[agents.length - 1] : null;
};

// Read the persona memory block from a specific agent
const getAgentPersonaBlock = async (agentId, lettaUserId = null) => {
  const headers = {};
  if (lettaUserId) headers['x-user-id'] = lettaUserId;
  const res = await fetch(`${SERVER_URL}/v1/agents/${agentId}`, { headers });
  if (!res.ok) return null;
  const agent = await res.json();
  return (agent.memory?.blocks || agent.memory_blocks || []).find(b => b.label === 'persona')?.value || null;
};

/**
 * After a message exchange, sync the updated persona memory block
 * from the current agent to all sibling agents (same persona, other profiles).
 * Call this fire-and-forget — do NOT await in the hot path.
 */
export const syncPersonaMemory = async (contact, sourceAgentId, sourceLettaUserId) => {
  try {
    const personaValue = await getAgentPersonaBlock(sourceAgentId, sourceLettaUserId);
    if (!personaValue) return;

    const allAgents = await getAllPersonaAgents(contact.id);
    const others = allAgents.filter(a => a.id !== sourceAgentId);
    if (others.length === 0) return;

    console.log(`[LettaService] Syncing persona memory to ${others.length} sibling agent(s) for "${contact.name}"`);
    for (const agent of others) {
      try {
        await fetch(`${SERVER_URL}/v1/agents/${agent.id}/core-memory/blocks/persona`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-user-id': agent._lettaUserId },
          body: JSON.stringify({ value: personaValue })
        });
      } catch (e) {
        console.warn(`[LettaService] Failed to sync persona to agent ${agent.id}:`, e);
      }
    }
    console.log(`[LettaService] Persona memory sync done for "${contact.name}"`);
  } catch (e) {
    console.error('[LettaService] syncPersonaMemory failed:', e);
  }
};


export const sendMessageToAgent = async (agentId, messageText, onChunk, signal, activeUser, sessionId = null, parentMessageId = null) => {
  const extraHeaders = {};
  if (sessionId) extraHeaders['x-session-id'] = sessionId;
  if (parentMessageId) extraHeaders['x-parent-message-id'] = parentMessageId;

  const response = await fetchLetta(`${SERVER_URL}/v1/agents/${agentId}/messages/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
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
