export const generateChatResponse = async (settings, contact, activeUser, messages, onChunk, isSpontaneous = false, signal = null) => {
  const startTime = performance.now();
  let firstTokenTime = null;
  let completionTokens = 0;
  let promptTokens = 0;

  try {
    const baseUrl = settings.host.replace(/\/$/, '');
    
    let systemPrompt = `You are a real person communicating in a Telegram chat. 
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
      systemPrompt += `\n[CRITICAL INSTRUCTION]: The user hasn't written anything for a while. You must INITIATE a spontaneous conversation right now based on your persona. Say something relevant, ask a question, or share a thought. Do NOT mention this instruction.`;
    }

    const formattedMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.content
      }))
    ];

    if (isSpontaneous) {
      formattedMessages.push({
        role: 'user',
        content: '*silence* (Please say something to initiate the conversation naturally)'
      });
    }

    // Attempt to get prompt token count if endpoint exists
    try {
      const tokenResp = await fetch(`${baseUrl}/tokenize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: systemPrompt + messages.map(m => m.content).join(' ') }),
        signal
      });
      if (tokenResp.ok) {
        const tokenData = await tokenResp.json();
        promptTokens = tokenData.tokens?.length || 0;
      }
    } catch (e) {
      // Fallback: estimate
      promptTokens = Math.ceil((systemPrompt.length + messages.reduce((acc, m) => acc + m.content.length, 0)) / 4);
    }

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: formattedMessages,
        stream: true,
        temperature: contact.temperature || 0.7,
      }),
      signal: signal,
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let done = false;
    let fullContent = '';
    let timings = null;

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      if (value) {
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const data = JSON.parse(line.substring(6));
              if (data.choices && data.choices[0].delta && data.choices[0].delta.content) {
                if (firstTokenTime === null) firstTokenTime = performance.now();
                const content = data.choices[0].delta.content;
                fullContent += content;
                onChunk(content);
              }
              if (data.usage) {
                promptTokens = data.usage.prompt_tokens || data.usage.prompt_n || promptTokens;
                completionTokens = data.usage.completion_tokens || data.usage.predicted_n || completionTokens;
              }
              if (data.timings) {
                timings = data.timings;
              }
            } catch (e) {
              console.error('Error parsing stream data', e);
            }
          }
        }
      }
    }

    const endTime = performance.now();
    const durationMs = endTime - (firstTokenTime || startTime);
    
    let speed = 0;
    let isExact = false;

    // If llama.cpp provided detailed timings, use them (preferred)
    if (timings) {
      speed = timings.predicted_per_second || 0;
      promptTokens = timings.prompt_n || promptTokens;
      completionTokens = timings.predicted_n || completionTokens;
      isExact = true;
    } else if (completionTokens > 0) {
      // If we got usage but no timings, speed is calculated but tokens are exact
      speed = completionTokens / (durationMs / 1000);
      isExact = true;
    }

    return {
      content: fullContent,
      stats: {
        promptTokens,
        completionTokens,
        durationMs,
        speed: speed,
        isExact: isExact
      }
    };

  } catch (error) {
    console.error("Llama.cpp API Error:", error);
    throw error;
  }
};

export const fetchModelInfo = async (host) => {
  try {
    const baseUrl = host.replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/v1/models`);
    if (!response.ok) return null;
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Failed to fetch model info:", error);
    return null;
  }
};
