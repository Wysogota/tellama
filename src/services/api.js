import { createAgent, sendMessageToAgent } from './lettaService.js';

export const generateChatResponse = async (
  settings, contact, activeUser, messages, onChunk, isSpontaneous = false, signal = null
) => {
  const startTime = performance.now();

  try {
    // 0. Update proxy's active provider + inference parameters
    await fetch('http://localhost:3001/llm/active-provider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: settings.provider,
        model: settings.modelName,
        temperature: settings.temperature,
        top_p: settings.top_p,
        top_k: settings.top_k,
        max_tokens: settings.max_tokens,
        repeat_penalty: settings.repeat_penalty,
      })
    });

    // 1. Ensure the Letta Agent exists for this persona
    const agentId = await createAgent(contact, activeUser, settings);

    // 2. Get the latest message to send
    let messageText = '';
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.sender === 'user') {
        messageText = lastMessage.content;
      }
    }

    if (isSpontaneous) {
      messageText = '*silence* (Please say something to initiate the conversation naturally)';
    }

    if (!messageText) {
      throw new Error("No user message found to send to Letta.");
    }

    // 3. Send message to Letta Agent and stream response
    const { content, stats } = await sendMessageToAgent(agentId, messageText, onChunk, signal, activeUser);

    const durationMs = performance.now() - startTime;
    return {
      content,
      stats: { ...stats, durationMs }
    };

  } catch (error) {
    console.error(`[Letta API] Error:`, error);
    throw error;
  }
};

export const fetchModelInfo = async (settings) => {
  // Letta handles the model internally. We just surface the configured provider setting.
  return { provider: 'letta', model: settings.modelName || 'Letta Agent' };
};
