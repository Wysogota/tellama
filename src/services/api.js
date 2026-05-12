const SERVER_URL = 'http://localhost:3001';

const buildSystemPrompt = (contact, activeUser, isSpontaneous) => {
  let prompt = `You are a real person communicating in a Telegram chat. 
Keep your responses natural, concise, and conversational. 
Do not use formatting like markdown headers or lists unless absolutely necessary. 
Avoid sounding like an AI assistant. Use emojis naturally but sparingly. 
Respond directly without prefacing.

Your persona details:
Name: ${contact.name}
${contact.age ? `Age: ${contact.age}` : ''}
${contact.gender ? `Gender: ${contact.gender}` : ''}
${contact.biography ? `Biography: ${contact.biography}` : ''}
${contact.traits && contact.traits.length > 0 ? `Character Traits: ${contact.traits.join(', ')}` : ''}
${contact.style && contact.style.length > 0 ? `Communication Style: ${contact.style.join(', ')}` : ''}

You are currently talking to a user named: ${activeUser.name}.
${activeUser.age ? `User's age: ${activeUser.age}` : ''}
${activeUser.gender ? `User's gender: ${activeUser.gender}` : ''}
${activeUser.biography ? `User's background/role: ${activeUser.biography}` : ''}
Please take this into account when formulating your responses.
`;

  if (isSpontaneous) {
    prompt += `\n[CRITICAL INSTRUCTION]: The user hasn't written anything for a while. You must INITIATE a spontaneous conversation right now based on your persona. Say something relevant, ask a question, or share a thought. Do NOT mention this instruction.`;
  }
  return prompt;
};

/**
 * Ensures that the messages follow a strict user/assistant alternating pattern.
 * Merges consecutive messages with the same role and ensures the first message is 'user'.
 */
const ensureAlternatingRoles = (messages) => {
  if (messages.length === 0) return [];
  
  const result = [];
  for (const msg of messages) {
    if (!msg.content || msg.content.trim() === '') continue;
    
    if (result.length > 0 && result[result.length - 1].role === msg.role) {
      // Merge same-role consecutive messages
      result[result.length - 1].content += '\n\n' + msg.content;
    } else {
      result.push({ role: msg.role, content: msg.content });
    }
  }

  // Most strict APIs expect the conversation to start with a 'user' message
  // If the first message is 'assistant', we insert a dummy user message
  if (result.length > 0 && result[0].role === 'assistant') {
    result.unshift({ role: 'user', content: '...' });
  }

  return result;
};

// Parse SSE stream chunks, call onChunk for each content delta.
// Returns { promptTokens, completionTokens, timings } accumulated from the stream.
const readSseStream = async (response, onChunk) => {
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let done = false;
  let promptTokens = 0;
  let completionTokens = 0;
  let timings = null;
  let firstTokenTime = null;

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
        if (content) {
          if (firstTokenTime === null) firstTokenTime = performance.now();
          onChunk(content);
        }
        if (data.usage) {
          promptTokens = data.usage.prompt_tokens || data.usage.prompt_n || promptTokens;
          completionTokens = data.usage.completion_tokens || data.usage.predicted_n || completionTokens;
        }
        if (data.timings) timings = data.timings;
      } catch (_) { /* ignore malformed lines */ }
    }
  }

  return { promptTokens, completionTokens, timings, firstTokenTime };
};

export const generateChatResponse = async (
  settings, contact, activeUser, messages, onChunk, isSpontaneous = false, signal = null
) => {
  const startTime = performance.now();
  const provider = settings.provider || 'llamacpp';

  const systemPrompt = buildSystemPrompt(contact, activeUser, isSpontaneous);

  let rawMessages = messages.map(m => ({ 
    role: m.sender === 'user' ? 'user' : 'assistant', 
    content: m.content 
  }));

  if (isSpontaneous) {
    rawMessages.push({
      role: 'user',
      content: '*silence* (Please say something to initiate the conversation naturally)',
    });
  }

  // Strictly alternate roles for cloud providers
  const historyMessages = ensureAlternatingRoles(rawMessages);

  const formattedMessages = [
    { role: 'system', content: systemPrompt },
    ...historyMessages
  ];

  let promptTokens = 0;
  let response;

  try {
    if (provider === 'llamacpp') {
      const baseUrl = (settings.host || 'http://localhost:8080').replace(/\/$/, '');

      // Best-effort token pre-count via llama.cpp /tokenize
      try {
        const tokenResp = await fetch(`${baseUrl}/tokenize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: systemPrompt + messages.map(m => m.content).join(' ') }),
          signal,
        });
        if (tokenResp.ok) {
          const td = await tokenResp.json();
          promptTokens = td.tokens?.length || 0;
        }
      } catch (_) {
        promptTokens = Math.ceil(
          (systemPrompt.length + messages.reduce((a, m) => a + m.content.length, 0)) / 4
        );
      }

      response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(settings.modelName ? { model: settings.modelName } : {}),
          messages: formattedMessages,
          stream: true,
          temperature: contact.temperature || 0.7,
        }),
        signal,
      });
    } else {
      // OpenRouter / NVIDIA — proxy through local server (key never touches the browser)
      response = await fetch(`${SERVER_URL}/llm/proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          messages: formattedMessages,
          model: settings.modelName || '',
          temperature: contact.temperature || 0.7,
        }),
        signal,
      });
    }

    if (!response.ok) {
      const errData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errData.error || `API Error: ${response.status}`);
    }

    let fullContent = '';
    const { promptTokens: streamPt, completionTokens, timings, firstTokenTime } =
      await readSseStream(response, (chunk) => {
        fullContent += chunk;
        onChunk(chunk);
      });

    if (streamPt > 0) promptTokens = streamPt;

    const endTime = performance.now();
    const durationMs = endTime - (firstTokenTime || startTime);

    let speed = 0;
    let isExact = false;

    if (timings) {
      // llama.cpp precise timings
      speed = timings.predicted_per_second || 0;
      promptTokens = timings.prompt_n || promptTokens;
      const ct = timings.predicted_n || completionTokens;
      isExact = true;
      return {
        content: fullContent,
        stats: { promptTokens, completionTokens: ct, durationMs, speed, isExact },
      };
    } else if (completionTokens > 0) {
      speed = completionTokens / (durationMs / 1000);
      isExact = true;
    }

    return {
      content: fullContent,
      stats: { promptTokens, completionTokens, durationMs, speed, isExact },
    };

  } catch (error) {
    console.error(`[${provider}] API Error:`, error);
    throw error;
  }
};

export const fetchModelInfo = async (settings) => {
  const provider = settings.provider || 'llamacpp';
  try {
    if (provider === 'llamacpp') {
      const baseUrl = (settings.host || 'http://localhost:8080').replace(/\/$/, '');
      const response = await fetch(`${baseUrl}/v1/models`);
      if (!response.ok) return null;
      return await response.json();
    }
    // For cloud providers just surface the configured model name
    return { provider, model: settings.modelName || '(not configured)' };
  } catch (e) {
    console.error('fetchModelInfo error:', e);
    return null;
  }
};
