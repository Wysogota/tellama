import React, { createContext, useContext, useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import db, { initDatabase } from '../db/DatabaseBridge.js';
import { runMigrations } from '../db/migrations.js';
import * as queries from '../db/queries.js';
import * as sync from '../sync/SyncManager.js';


const SERVER_URL = 'http://localhost:3001';

const ACCENT_COLORS = {
  blue: { light: '#5288c1', dark: '#7695ff' },
  green: { light: '#5fb389', dark: '#74c399' },
  orange: { light: '#d48b52', dark: '#e1a36f' },
  red: { light: '#c46b6b', dark: '#d48282' },
  pink: { light: '#c8759d', dark: '#d68eb0' },
  indigo: { light: '#7d70b3', dark: '#9b8fc3' },
};

const AppContext = createContext();

export const AppProvider = ({ children }) => {
  const [personas, setPersonas] = useState([]);
  const [chatSessions, setChatSessions] = useState([]);
  const [userProfiles, setUserProfiles] = useState([]);
  const [activeUserProfileId, setActiveUserProfileId] = useState(null);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState({});
  const [settings, setSettings] = useState(() => {
    const defaultSettings = { 
      host: 'http://localhost:8080', 
      theme: 'light', 
      accentColor: 'blue',
      bgIntensity: 50 
    };
    try {
      const ls = localStorage.getItem('tellama_settings');
      return ls ? { ...defaultSettings, ...JSON.parse(ls) } : defaultSettings;
    } catch (e) {
      return defaultSettings;
    }
  });
  const [isLoading, setIsLoading] = useState(true);

  const initRanRef = React.useRef(false);

  // Initialization: SQLite -> load data -> fallback to localStorage if empty
  useEffect(() => {
    if (initRanRef.current) return; // prevent double-run in React StrictMode
    initRanRef.current = true;
    async function init() {
      try {
        await initDatabase();
        await runMigrations();

        // --- DEBUG: snapshot localStorage at startup ---
        const _lsC = localStorage.getItem('tellama_contacts');
        const _lsP = localStorage.getItem('tellama_user_profiles');
        console.log('[Init] localStorage contacts:', _lsC ? JSON.parse(_lsC).length : 0, 'items');
        console.log('[Init] localStorage profiles:', _lsP ? JSON.parse(_lsP).length : 0, 'items');

        // Load from SQLite
        let profiles = await queries.getAllProfiles();
        let personas = await queries.getAllPersonas();
        console.log('[Init] SQLite profiles:', profiles.length, '| personas:', personas.length);

        // Fallback: if SQLite is empty (in-memory mode after refresh or first run)
        if (profiles.length === 0) {
          const lsProfiles = JSON.parse(localStorage.getItem('tellama_user_profiles') || '[]');
          const lsActiveUser = localStorage.getItem('tellama_active_user');
          console.log('[Init] Profiles fallback — lsProfiles:', lsProfiles.length);

          if (lsProfiles.length > 0) {
            for (const p of lsProfiles) {
              try {
                // Check tombstone before restoring from localStorage
                const { rows: tombRows } = await db.query(
                  "SELECT 1 FROM deleted_records WHERE id = ? AND table_name = 'user_profiles'",
                  [p.id]
                );
                if (tombRows.length > 0) {
                  console.log('[Init] Skipping tombstoned profile from localStorage:', p.id);
                  continue;
                }
                await queries.upsertProfile({ ...p, updatedAt: 1 });
              } catch(e) { console.warn('upsertProfile failed:', e.message); }
            }
            // Re-read after filtering tombstoned entries
            profiles = await queries.getAllProfiles();
            if (lsActiveUser) await queries.setSyncMeta('active_user_id', lsActiveUser).catch(() => {});
          }
          // If still empty after filtering tombstones — create a default profile
          if (profiles.length === 0) {
            const defaultProfile = { id: uuidv4(), name: 'User', biography: '', age: '', gender: '', avatar: null, createdAt: Date.now() };
            await queries.upsertProfile(defaultProfile);
            profiles = [defaultProfile];
            console.log('[Init] Created default profile');
          }
        }

        if (personas.length === 0) {
          const lsContacts = JSON.parse(localStorage.getItem('tellama_contacts') || '[]');
          const lsMessages = JSON.parse(localStorage.getItem('tellama_messages') || '{}');
          const profileId = localStorage.getItem('tellama_active_user') || profiles[0]?.id;
          console.log('[Init] Personas fallback — lsContacts:', lsContacts.length, '| profileId:', profileId);

          if (lsContacts.length > 0) {
            for (const c of lsContacts) {
              try {
                // Check tombstone before restoring from localStorage
                const { rows: tombRows } = await db.query(
                  "SELECT 1 FROM deleted_records WHERE id = ? AND table_name = 'personas'",
                  [c.id]
                );
                if (tombRows.length > 0) {
                  console.log('[Init] Skipping tombstoned persona from localStorage:', c.id);
                  continue;
                }
                await queries.upsertPersona({ ...c, updatedAt: 1 });
              } catch(e) { console.warn('upsertPersona failed:', e.message); }
            }
            // Import legacy messages for non-tombstoned personas
            for (const [personaId, chatData] of Object.entries(lsMessages)) {
              // Check tombstone for sessions too
              const { rows: tombRows } = await db.query(
                "SELECT 1 FROM deleted_records WHERE id = ? AND table_name = 'chat_sessions'",
                [personaId]
              ).catch(() => ({ rows: [] }));
              if (tombRows.length > 0) continue;

              if (chatData?.nodes && Object.keys(chatData.nodes).length > 0) {
                try {
                  await queries.upsertSession({ id: personaId, userProfileId: profileId, personaId: personaId, createdAt: 1, updatedAt: 1 });
                } catch(e) {}
                for (const node of Object.values(chatData.nodes)) {
                  try { await queries.insertMessage({ ...node, sessionId: personaId, timestamp: node.timestamp || 1 }); } catch(e) {}
                }
                for (const [parentKey, idx] of Object.entries(chatData.activeChildIndex || {})) {
                  try { await queries.upsertBranchState(personaId, parentKey === 'null' ? null : parentKey, idx); } catch(e) {}
                }
              }
            }
            personas = await queries.getAllPersonas();
          }
          console.log('[Init] Personas after fallback:', personas.length);
        }

        // Load sessions and messages from SQLite
        const sessions = await queries.getAllSessions();
        console.log('[Init] Sessions loaded:', sessions.length);
        const allMessages = {};
        for (const session of sessions) {
          const msgRows = await queries.getMessagesForSession(session.id);
          const branchRows = await queries.getBranchStateForSession(session.id);
          allMessages[session.id] = queries.buildMessageTree(msgRows, branchRows);
        }

        const activeUserId = await queries.getSyncMeta('active_user_id').catch(() => null)
          || localStorage.getItem('tellama_active_user')
          || profiles[0]?.id;

        console.log('[Init] Setting state — profiles:', profiles.length, '| personas:', personas.length, '| activeUser:', activeUserId);
        setUserProfiles(profiles);
        setPersonas(personas);
        setChatSessions(sessions);
        setActiveUserProfileId(activeUserId);
        setMessages(allMessages);

        const dbSettings = await queries.getAllSettings();
        if (Object.keys(dbSettings).length > 0) {
          setSettings(prev => ({ ...prev, ...dbSettings }));
        } else {
          const lsSettings = JSON.parse(localStorage.getItem('tellama_settings') || 'null');
          if (lsSettings) {
            setSettings(prev => ({ ...prev, ...lsSettings }));
          }
        }

        const activeChatIdFromStorage = await queries.getSyncMeta('active_chat_id').catch(() => null)
          || localStorage.getItem('tellama_active_chat');

        console.log('[Init] Restore activeChatId — stored:', activeChatIdFromStorage, '| sessions:', sessions.length);
        if (activeChatIdFromStorage && sessions.some(s => s.id === activeChatIdFromStorage)) {
          console.log('[Init] Activating session:', activeChatIdFromStorage);
          setActiveChatId(activeChatIdFromStorage);
        } else {
          console.log('[Init] No session to restore or session not found');
        }

        setIsLoading(false);


        // Start sync — pass a callback to refresh React state after each pull
        const reloadFromDB = async () => {
          try {
            const dbPersonas = await queries.getAllPersonas();
            const dbProfiles = await queries.getAllProfiles();
            const mergedSessions = await queries.getAllSessions();
            setChatSessions(mergedSessions);
            const mergedMessages = {};
            for (const session of mergedSessions) {
              const msgRows = await queries.getMessagesForSession(session.id);
              const branchRows = await queries.getBranchStateForSession(session.id);
              mergedMessages[session.id] = queries.buildMessageTree(msgRows, branchRows);
            }

            if (dbProfiles.length > 0) {
              // Keep local profile if it is newer (user is editing)
              setUserProfiles(prev => dbProfiles.map(dbP => {
                const local = prev.find(p => p.id === dbP.id);
                return (local?.updatedAt > dbP.updatedAt) ? local : dbP;
              }));
            }

            if (dbPersonas.length > 0) {
              // Keep local persona if it is newer (user is editing)
              setPersonas(prev => {
                const merged = dbPersonas.map(dbC => {
                  const local = prev.find(c => c.id === dbC.id);
                  return (local?.updatedAt > dbC.updatedAt) ? local : dbC;
                });
                // We do NOT add localOnly here because if the server deleted it, it won't be in dbPersonas!
                // Any newly created persona is already in SQLite, so it will be in dbPersonas.
                return merged;
              });
            }

            if (Object.keys(mergedMessages).length > 0) setMessages(mergedMessages);

            const dbSettings = await queries.getAllSettings();
            if (Object.keys(dbSettings).length > 0) {
              setSettings(prev => ({ ...prev, ...dbSettings }));
            }
          } catch (e) { console.warn('[AppContext] reloadFromDB failed:', e.message); }
        };

        try {
          sync.startSync(SERVER_URL, reloadFromDB); // WS handles instant updates; 60s poll is fallback
        } catch (e) {
          console.warn('[AppContext] SyncManager failed to start:', e.message);
        }

      } catch (e) {
        console.error('[AppContext] Init failed:', e);
        const lsProfiles = JSON.parse(localStorage.getItem('tellama_user_profiles') || '[]');
        const lsContacts = JSON.parse(localStorage.getItem('tellama_contacts') || '[]');
        const lsMessages = JSON.parse(localStorage.getItem('tellama_messages') || '{}');
        const lsSettings = JSON.parse(localStorage.getItem('tellama_settings') || 'null');
        const lsActiveUser = localStorage.getItem('tellama_active_user');
        if (lsProfiles.length > 0) setUserProfiles(lsProfiles);
        if (lsContacts.length > 0) setPersonas(lsContacts);
        if (Object.keys(lsMessages).length > 0) setMessages(lsMessages);
        if (lsSettings) setSettings(lsSettings);
        if (lsActiveUser) setActiveUserProfileId(lsActiveUser);
        const lsActiveChat = localStorage.getItem('tellama_active_chat');
        if (lsActiveChat) setActiveChatId(lsActiveChat);
        setIsLoading(false);
      }
    }
    init();
  }, []);

  // localStorage backup writes (resilience for in-memory SQLite mode)
  // Wrapped in try-catch to handle QuotaExceededError gracefully
  // IMPORTANT: only write if list is non-empty to avoid overwriting a "all deleted" state
  // with an empty array that might be misread as "no data yet" on next boot.
  useEffect(() => {
    if (personas.length > 0) {
      try { localStorage.setItem('tellama_contacts', JSON.stringify(personas)); } catch(e) { console.warn('localStorage quota exceeded for contacts'); }
    }
  }, [personas]);
  useEffect(() => {
    if (userProfiles.length > 0) {
      try { localStorage.setItem('tellama_user_profiles', JSON.stringify(userProfiles)); } catch(e) { console.warn('localStorage quota exceeded for profiles'); }
    }
  }, [userProfiles]);

  useEffect(() => {
    if (isLoading) return; // Wait until initialization is complete
    if (activeChatId) {
      localStorage.setItem('tellama_active_chat', activeChatId);
      queries.setSyncMeta('active_chat_id', activeChatId).catch(() => {});
    } else {
      localStorage.removeItem('tellama_active_chat');
      queries.setSyncMeta('active_chat_id', '').catch(() => {});
    }
  }, [activeChatId, isLoading]);
  useEffect(() => {
    if (isLoading) return;
    if (activeUserProfileId) {
      try { localStorage.setItem('tellama_active_user', activeUserProfileId); } catch(e) {}
    }
  }, [activeUserProfileId, isLoading]);
  useEffect(() => {
    if (Object.keys(messages).length > 0) {
      try { localStorage.setItem('tellama_messages', JSON.stringify(messages)); } catch(e) { console.warn('localStorage quota exceeded for messages (too large)'); }
    }
  }, [messages]);


  // Settings persistence
  useEffect(() => {
    localStorage.setItem('tellama_settings', JSON.stringify(settings));
    
    // Theme
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    // Accent Color
    const colors = ACCENT_COLORS[settings.accentColor] || ACCENT_COLORS.blue;
    const accentValue = settings.theme === 'dark' ? colors.dark : colors.light;
    
    document.documentElement.style.setProperty('--tg-link-color', accentValue);
    document.documentElement.style.setProperty('--tg-button-color', accentValue);
    document.documentElement.style.setProperty('--tg-sidebar-active', accentValue);
    
    // Derived colors for bubbles or highlights
    const rgb = hexToRgb(accentValue);
    document.documentElement.style.setProperty('--tg-accent-color-rgb', rgb);
    
    // Background Adaptation: Calculate a tinted background color
    if (settings.theme === 'dark') {
      // Deeper tint for dark mode
      document.documentElement.style.setProperty('--tg-chat-bg', `rgba(${rgb}, 0.15)`);
      document.documentElement.style.setProperty('--tg-bg-color', '#1c1c1c'); // Revert to original panel color
      document.documentElement.style.setProperty('--tg-chat-bubble-out', accentValue);
      document.documentElement.style.setProperty('--tg-chat-bubble-out-text', '#ffffff');
    } else {
      // Soft tint for light mode
      document.documentElement.style.setProperty('--tg-chat-bg', `rgba(${rgb}, 0.12)`);
      document.documentElement.style.setProperty('--tg-bg-color', '#ffffff');
      
      // Adaptive light bubble: very light version of accent
      const lightBubble = getLightenedColor(rgb, 0.85);
      document.documentElement.style.setProperty('--tg-chat-bubble-out', lightBubble);
      document.documentElement.style.setProperty('--tg-chat-bubble-out-text', '#000000');
    }
    
    // BG Intensity
    document.documentElement.style.setProperty('--tg-bg-intensity', (settings.bgIntensity / 100).toString());

  }, [settings]);

  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '0, 0, 0';
  };

  const getLightenedColor = (rgbStr, amount) => {
    const [r, g, b] = rgbStr.split(',').map(Number);
    const nr = Math.round(r + (255 - r) * amount);
    const ng = Math.round(g + (255 - g) * amount);
    const nb = Math.round(b + (255 - b) * amount);
    return `rgb(${nr}, ${ng}, ${nb})`;
  };

  // Derived state: calculate all unique tags used across contacts
  const allTags = React.useMemo(() => {
    const tagsSet = new Set();
    personas.forEach(c => {
      if (Array.isArray(c.traits)) c.traits.forEach(t => tagsSet.add(t));
      if (Array.isArray(c.style)) c.style.forEach(t => tagsSet.add(t));
    });
    return Array.from(tagsSet);
  }, [personas]);

  // Contact operations
  const addPersona = async (contactInfo) => {
    const id = uuidv4();
    const newPersona = { 
      id, 
      ...contactInfo, 
      traits: Array.isArray(contactInfo.traits) ? contactInfo.traits : [],
      style: Array.isArray(contactInfo.style) ? contactInfo.style : [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    try {
      await queries.upsertPersona(newPersona);
    } catch (e) {
      console.error('[addPersona] SQLite failed (data kept in localStorage):', e.message);
    }
    // Always update React state so localStorage backup fires
    setPersonas(prev => [newPersona, ...prev]);
    // Push immediately so other browsers get the new persona via WebSocket
    sync.syncPush(SERVER_URL).catch(e => console.warn('[addPersona] Immediate push failed:', e.message));
    return id;
  };

  const updatePersona = async (id, updates) => {
    const persona = personas.find(c => c.id === id);
    if (!persona) return;
    // Set updatedAt so reloadFromDB knows this is newer than anything from server
    const updated = { ...persona, ...updates, updatedAt: Date.now() };
    try {
      await queries.upsertPersona(updated);
    } catch (e) {
      console.error('[updatePersona] SQLite failed (data kept in localStorage):', e.message);
    }
    // Always update React state regardless of SQLite result
    setPersonas(prev => prev.map(c => c.id === id ? updated : c));
    // Push immediately so other browsers get the update without waiting for the interval
    sync.syncPush(SERVER_URL).catch(e => console.warn('[updatePersona] Immediate push failed:', e.message));
  };

  const deletePersona = async (id) => {
    await queries.deletePersona(id);
    setPersonas(prev => prev.filter(p => p.id !== id));
    sync.syncPush(SERVER_URL).catch(e => console.warn('[deletePersona] Immediate push failed:', e.message));
  };

  const startChat = async (personaId) => {
    const existingSession = chatSessions.find(s => s.persona_id === personaId && s.user_profile_id === activeUserProfileId);
    if (existingSession) {
      setActiveChatId(existingSession.id);
      return existingSession.id;
    }
    const sessionId = uuidv4();
    const newSession = {
      id: sessionId,
      userProfileId: activeUserProfileId || userProfiles[0]?.id,
      personaId: personaId,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    try {
      await queries.upsertSession(newSession);
    } catch (e) {
      console.error('[startChat] SQLite failed:', e.message);
    }
    const newSessionRow = {
      id: sessionId,
      user_profile_id: newSession.userProfileId,
      persona_id: newSession.personaId,
      created_at: newSession.createdAt,
      updated_at: newSession.updatedAt
    };
    setChatSessions(prev => [newSessionRow, ...prev]);
    setMessages(prev => ({ ...prev, [sessionId]: { nodes: {}, rootId: null, activeChildIndex: {} } }));
    setActiveChatId(sessionId);
    // Push immediately so other browsers see the new session
    sync.syncPush(SERVER_URL).catch(e => console.warn('[startChat] Immediate push failed:', e.message));
    return sessionId;
  };

  const deleteChat = async (chatId) => {
    await queries.deleteSession(chatId);
    setChatSessions(prev => prev.filter(s => s.id !== chatId));
    setMessages(prev => {
      const newMessages = { ...prev };
      delete newMessages[chatId];
      return newMessages;
    });
    if (activeChatId === chatId) {
      setActiveChatId(null);
    }
    sync.syncPush(SERVER_URL).catch(e => console.warn('[deleteChat] Immediate push failed:', e.message));
  };

  // User Profile operations
  const addUserProfile = async (profileInfo) => {
    const id = uuidv4();
    const newProfile = { id, ...profileInfo, createdAt: Date.now(), updatedAt: Date.now() };
    await queries.upsertProfile(newProfile);
    setUserProfiles(prev => [...prev, newProfile]);
    // Push immediately so other browsers get the new profile via WebSocket
    sync.syncPush(SERVER_URL).catch(e => console.warn('[addUserProfile] Immediate push failed:', e.message));
    return id;
  };

  const updateUserProfile = async (id, updates) => {
    const profile = userProfiles.find(p => p.id === id);
    if (!profile) return;
    // Set updatedAt so reloadFromDB knows this is newer than anything from server
    const updated = { ...profile, ...updates, updatedAt: Date.now() };
    try {
      await queries.upsertProfile(updated);
    } catch (e) {
      console.error('[updateUserProfile] SQLite failed (data kept in localStorage):', e.message);
    }
    setUserProfiles(prev => prev.map(p => p.id === id ? updated : p));
    // Push immediately so other browsers get the update without waiting for the interval
    sync.syncPush(SERVER_URL).catch(e => console.warn('[updateUserProfile] Immediate push failed:', e.message));
  };

  const deleteUserProfile = async (id) => {
    if (userProfiles.length <= 1) return;
    await queries.deleteProfile(id);
    setUserProfiles(prev => prev.filter(p => p.id !== id));
    if (activeUserProfileId === id) {
      const nextId = userProfiles.find(p => p.id !== id).id;
      setActiveUserProfileId(nextId);
      await queries.setSyncMeta('active_user_id', nextId);
    }
    // Push tombstone immediately so other browsers learn about the deletion
    sync.syncPush(SERVER_URL).catch(e => console.warn('[deleteUserProfile] Immediate push failed:', e.message));
  };

  // Tree Message operations
  const addMessage = async (chatId, message, parentId = null) => {
    const id = message.id || uuidv4();
    const chatData = messages[chatId] || { nodes: {}, rootId: null, activeChildIndex: {} };
    
    let actualParentId = parentId;
    if (actualParentId === null) {
      let curr = chatData.rootId;
      while (curr && chatData.nodes[curr] && chatData.nodes[curr].childrenIds.length > 0) {
        const activeIdx = chatData.activeChildIndex[curr] || 0;
        const nextChild = chatData.nodes[curr].childrenIds[activeIdx];
        if (!nextChild) break;
        curr = nextChild;
      }
      actualParentId = curr;
    }

    const newNode = { id, parentId: actualParentId, childrenIds: [], timestamp: Date.now(), ...message };
    
    // Save to SQL (non-fatal: message always added to React state tree)
    try {
      await queries.insertMessage({ ...newNode, sessionId: chatId });
      if (actualParentId !== null) {
        const parentNode = chatData.nodes[actualParentId];
        const currentChildCount = parentNode ? parentNode.childrenIds.length : 0;
        await queries.upsertBranchState(chatId, actualParentId, currentChildCount);
      }
    } catch (e) {
      console.error('[addMessage] SQLite failed (message kept in memory/localStorage):', e.message);
    }

    // Update State
    setMessages(prev => {
      const prevChat = prev[chatId] || { nodes: {}, rootId: null, activeChildIndex: {} };
      const newNodes = { ...prevChat.nodes, [id]: newNode };
      const newActiveChildIndex = { ...prevChat.activeChildIndex };
      let newRootId = prevChat.rootId;

      if (actualParentId === null) {
        newRootId = id;
      } else if (newNodes[actualParentId]) {
        newNodes[actualParentId] = {
          ...newNodes[actualParentId],
          childrenIds: [...newNodes[actualParentId].childrenIds, id]
        };
        newActiveChildIndex[actualParentId] = newNodes[actualParentId].childrenIds.length - 1;
      }

      return { ...prev, [chatId]: { nodes: newNodes, rootId: newRootId, activeChildIndex: newActiveChildIndex } };
    });
    sync.syncPush(SERVER_URL).catch(e => console.warn('[addMessage] Immediate push failed:', e.message));
    return id;
  };

  const updateMessage = async (chatId, messageId, contentDelta) => {
    const chatData = messages[chatId];
    if (!chatData || !chatData.nodes[messageId]) return;
    const newContent = chatData.nodes[messageId].content + contentDelta;
    await queries.updateMessageContent(messageId, newContent);

    setMessages(prev => ({
      ...prev,
      [chatId]: {
        ...prev[chatId],
        nodes: {
          ...prev[chatId].nodes,
          [messageId]: { ...prev[chatId].nodes[messageId], content: newContent }
        }
      }
    }));
    sync.syncPush(SERVER_URL).catch(e => console.warn('[updateMessage] Immediate push failed:', e.message));
  };

  const setFullMessageContent = async (chatId, messageId, fullContent) => {
    await queries.updateMessageContent(messageId, fullContent);
    setMessages(prev => ({
      ...prev,
      [chatId]: {
        ...prev[chatId],
        nodes: {
          ...prev[chatId].nodes,
          [messageId]: { ...prev[chatId].nodes[messageId], content: fullContent }
        }
      }
    }));
    sync.syncPush(SERVER_URL).catch(e => console.warn('[setFullMessageContent] Immediate push failed:', e.message));
  };

  const deleteMessageNode = async (chatId, messageId) => {
    await queries.deleteMessageCascade(messageId);
    // Reload messages for this session to be safe with cascade delete
    const msgRows = await queries.getMessagesForSession(chatId);
    const branchRows = await queries.getBranchStateForSession(chatId);
    setMessages(prev => ({
      ...prev,
      [chatId]: queries.buildMessageTree(msgRows, branchRows)
    }));
    sync.syncPush(SERVER_URL).catch(e => console.warn('[deleteMessageNode] Immediate push failed:', e.message));
  };

  const updateMessageMetadata = async (chatId, messageId, metadata) => {
    await queries.updateMessageMetadata(messageId, metadata);
    setMessages(prev => {
      const chat = prev[chatId];
      if (!chat || !chat.nodes[messageId]) return prev;
      return {
        ...prev,
        [chatId]: {
          ...chat,
          nodes: {
            ...chat.nodes,
            [messageId]: { ...chat.nodes[messageId], stats: metadata }
          }
        }
      };
    });
    sync.syncPush(SERVER_URL).catch(e => console.warn('[updateMessageMetadata] Immediate push failed:', e.message));
  };

  const switchBranch = async (chatId, parentId, childIndex) => {
    await queries.upsertBranchState(chatId, parentId, childIndex);
    setMessages(prev => ({
      ...prev,
      [chatId]: {
        ...prev[chatId],
        activeChildIndex: { ...prev[chatId].activeChildIndex, [parentId]: childIndex }
      }
    }));
    sync.syncPush(SERVER_URL).catch(e => console.warn('[switchBranch] Immediate push failed:', e.message));
  };

  const updateSettings = async (newSettings) => {
    setSettings(prev => {
      const updated = { ...prev, ...newSettings };
      // Persist to DB
      Object.entries(newSettings).forEach(([k, v]) => {
        queries.upsertSetting(k, v).catch(err => console.error('Failed to save setting:', k, err));
      });
      return updated;
    });
    // Trigger immediate push
    sync.syncPush(SERVER_URL).catch(e => console.warn('[updateSettings] Immediate push failed:', e.message));
  };

  const abortControllersRef = React.useRef({}); // chatId -> AbortController

  // Get a new abort signal for a specific chat.
  // If forceAbort=true and that chat already has an in-flight request, cancel it first.
  const getNewAbortSignal = (chatId, forceAbort = true) => {
    if (forceAbort && abortControllersRef.current[chatId]) {
      abortControllersRef.current[chatId].abort();
    }
    const controller = new AbortController();
    abortControllersRef.current[chatId] = controller;
    return controller.signal;
  };

  const clearGeneration = (chatId) => {
    delete abortControllersRef.current[chatId];
  };

  const isGlobalGenerating = (chatId) => !!abortControllersRef.current[chatId];

  // Per-chat streaming text (for showing typing bubble for background spontaneous messages)
  const [streamingMessages, setStreamingMessages] = useState({});

  const setStreamingMessage = (chatId, text) => {
    setStreamingMessages(prev => ({ ...prev, [chatId]: text }));
  };

  const clearStreamingMessage = (chatId) => {
    setStreamingMessages(prev => {
      const next = { ...prev };
      delete next[chatId];
      return next;
    });
  };

  const changeActiveUserProfile = async (id) => {
    setActiveUserProfileId(id);
    await queries.setSyncMeta('active_user_id', id);
  };

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[var(--tg-bg-color)] text-[var(--tg-text-color)]">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-[var(--tg-link-color)] border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-lg font-medium">Initializing Database...</p>
        </div>
      </div>
    );
  }

  return (
    <AppContext.Provider value={{
      personas, chatSessions, activeChatId, setActiveChatId, messages, settings, allTags,
      userProfiles, activeUserProfileId, setActiveUserProfileId: changeActiveUserProfile,
      addPersona, updatePersona, deletePersona, startChat, deleteChat,
      addUserProfile, updateUserProfile, deleteUserProfile,
      addMessage, updateMessage, updateMessageMetadata, setFullMessageContent, deleteMessageNode, switchBranch, updateSettings,
      getNewAbortSignal, clearGeneration, isGlobalGenerating,
      streamingMessages, setStreamingMessage, clearStreamingMessage
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => useContext(AppContext);
