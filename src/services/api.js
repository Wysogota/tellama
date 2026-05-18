import { createAgent, sendMessageToAgent, syncPersonaMemory } from './lettaService.js';

export const generateChatResponse = async (
  settings, contact, activeUser, messages, onChunk, isSpontaneous = false, signal = null, isRegeneration = false,
  sessionId = null, parentMessageId = null
) => {
  const startTime = performance.now();

  try {
    // 0. Update proxy's active provider + inference parameters
    await fetch(`/api/llm/active-provider`, {
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
        if (isRegeneration) {
          messageText += "\n\n[CRITICAL SYSTEM DIRECTIVE: The user is regenerating the response. You MUST provide a completely new and fresh answer. You are STRICTLY FORBIDDEN from acknowledging that this is a second attempt. Do NOT say things like 'Let me try again', 'Ah, then another masterpiece', or 'Sorry about that'. Pretend the previous response NEVER happened. Respond natively and perfectly in character as if hearing this for the very first time.]";
        }
      }
    }

    if (isSpontaneous) {
      messageText = '*silence* (Please say something to initiate the conversation naturally)';
    }

    if (!messageText) {
      throw new Error("No user message found to send to Letta.");
    }

    const currentTime = new Date().toLocaleString('en-US', { 
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', 
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const finalMessageText = `[Current System Time: ${currentTime}]\n${messageText}`;

    // 3. Send message to Letta Agent and stream response
    const { content, stats } = await sendMessageToAgent(agentId, finalMessageText, onChunk, signal, activeUser, sessionId, parentMessageId);

    // 4. Fire-and-forget: sync updated persona memory to all sibling agents (other profiles)
    syncPersonaMemory(contact, agentId).catch(e => console.warn('[API] Persona memory sync error:', e));

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
