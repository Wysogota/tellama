import React, { useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { generateChatResponse } from '../services/api';

const CHECK_INTERVAL = 15000; // 15 seconds

const FREQUENCY_MAP = {
  never: 0,
  rare: 0.05,
  normal: 0.15,
  often: 0.30
};

const STALE_THRESHOLD = 60000; // 1 minute (for testing, ideally longer in prod)

const AutoInitiator = () => {
  const { contacts, messages, addMessage, settings, userProfiles, activeUserProfileId, getNewAbortSignal, clearGeneration, setStreamingMessage, clearStreamingMessage } = useAppContext();
  const isGeneratingRef = useRef(false);

  // We use refs to keep track of latest state inside setInterval
  const contactsRef = useRef(contacts);
  const messagesRef = useRef(messages);
  const settingsRef = useRef(settings);
  const userProfilesRef = useRef(userProfiles);
  const activeUserProfileIdRef = useRef(activeUserProfileId);

  useEffect(() => {
    contactsRef.current = contacts;
    messagesRef.current = messages;
    settingsRef.current = settings;
    userProfilesRef.current = userProfiles;
    activeUserProfileIdRef.current = activeUserProfileId;
  }, [contacts, messages, settings, userProfiles, activeUserProfileId]);

  useEffect(() => {
    const interval = setInterval(async () => {
      if (isGeneratingRef.current) return;

      const currentContacts = contactsRef.current;
      const currentMessages = messagesRef.current;
      const currentSettings = settingsRef.current;
      
      const activeUser = userProfilesRef.current.find(p => p.id === activeUserProfileIdRef.current) || userProfilesRef.current[0];

      // Find eligible contacts
      const eligibleContacts = currentContacts.filter(c => {
        const freq = c.initiativeFrequency || 'never';
        if (freq === 'never') return false;

        const chatData = currentMessages[c.id];
        if (!chatData || !chatData.rootId) return true; // Can initiate first message

        // Compute linear path to find last message
        let curr = chatData.rootId;
        let lastMessage = null;
        while (curr && chatData.nodes[curr]) {
          lastMessage = chatData.nodes[curr];
          const activeIdx = chatData.activeChildIndex[curr] || 0;
          curr = lastMessage.childrenIds[activeIdx];
        }

        if (!lastMessage) return true;

        const timeSinceLast = Date.now() - lastMessage.timestamp;

        // If user just sent a message, we let the normal chat handler deal with it,
        // though if it's been a minute and no response, maybe we can trigger.
        // But mainly we trigger if conversation is stale.
        return timeSinceLast > STALE_THRESHOLD;
      });

      if (eligibleContacts.length === 0) return;

      // Pick a random eligible contact to evaluate
      const contactToEvaluate = eligibleContacts[Math.floor(Math.random() * eligibleContacts.length)];
      const probability = FREQUENCY_MAP[contactToEvaluate.initiativeFrequency || 'never'];

      if (Math.random() < probability) {
        // Trigger spontaneous message
        isGeneratingRef.current = true;
        console.log(`[AutoInitiator] Triggering spontaneous message for ${contactToEvaluate.name}`);

        const chatId = contactToEvaluate.id;
        const chatData = currentMessages[chatId];
        
        let chatMessages = [];
        let currNode = chatData?.rootId;
        let lastMsgId = null;
        while (currNode && chatData.nodes[currNode]) {
          const node = chatData.nodes[currNode];
          chatMessages.push(node);
          lastMsgId = node.id;
          const activeIdx = chatData.activeChildIndex[currNode] || 0;
          currNode = node.childrenIds[activeIdx];
        }

        let botResponseText = '';

        try {
          const signal = getNewAbortSignal(chatId, false);
          await generateChatResponse(currentSettings, contactToEvaluate, activeUser, chatMessages, (chunk) => {
            botResponseText += chunk;
            // Stream text into global state so ChatArea shows typing bubble
            setStreamingMessage(chatId, botResponseText);
          }, true, signal);
          
          if (botResponseText) {
            await addMessage(chatId, { sender: 'bot', content: botResponseText }, lastMsgId);
          }
        } catch (e) {
          if (e && e.name === 'AbortError') {
            console.log(`[AutoInitiator] Generation aborted for chat ${chatId} (user sent a message).`);
          } else {
            console.error('[AutoInitiator] Error:', e);
          }
        } finally {
          clearStreamingMessage(chatId);
          clearGeneration(chatId);
          isGeneratingRef.current = false;
        }
      }

    }, CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, [addMessage]);

  return null; // This component doesn't render anything
};

export default AutoInitiator;
