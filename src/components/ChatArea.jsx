import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { Paperclip, SendHorizontal, MoreVertical, Loader2, Edit2, Trash2, RotateCcw, ChevronLeft, ChevronRight, ArrowLeft, CheckCheck, Check, Smile, Mic, Search, X, Calendar, FileText, Image as ImageIcon, XCircle, FileCode, FileType, File, Download, Maximize2, Reply, Copy, Languages, Pin, Forward, CheckCircle2, ArrowDown } from 'lucide-react';
import { generateChatResponse, updateMessageInLetta, deleteMessageInLetta } from '../services/api';
import { requestNotificationPermission, sendNotification } from '../utils/notifications';
import EmojiPicker, { Theme } from 'emoji-picker-react';

const getDayDiff = (d1, d2) => {
  const t1 = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate()).getTime();
  const t2 = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate()).getTime();
  return Math.floor((t2 - t1) / (1000 * 60 * 60 * 24));
};

const getDateLabel = (timestamp) => {
  const date = new Date(timestamp);
  const today = new Date();

  const dayDiff = getDayDiff(date, today);

  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff < 7 && dayDiff > 0) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[date.getDay()];
  }

  return date.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' });
};

const isSameDay = (d1, d2) => d1.toDateString() === d2.toDateString();

const getCalendarDays = (currentDate) => {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const startDay = firstDay === 0 ? 6 : firstDay - 1;

  const days = [];

  const startDate = new Date(year, month, 1);
  startDate.setDate(startDate.getDate() - startDay);

  for (let i = 0; i < 42; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    days.push({
      date: d,
      isCurrentMonth: d.getMonth() === month,
      isToday: d.toDateString() === new Date().toDateString()
    });
  }

  return days;
};

const ChatArea = ({ onOpenModelInfo }) => {
  const { personas, chatSessions, activeChatId, setActiveChatId, messages, addMessage, updateMessage, setFullMessageContent, deleteMessageNode, switchBranch, settings, userProfiles, activeUserProfileId, deleteChat, renameChat, getNewAbortSignal, clearGeneration, streamingMessages, updateMessageMetadata } = useAppContext();
  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [statusOverride, setStatusOverride] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [tempChatName, setTempChatName] = useState('');
  const [contextMenu, setContextMenu] = useState(null); // { x, y, msg }
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showScrollDown, setShowScrollDown] = useState(false);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const menuRef = useRef(null);
  const searchContainerRef = useRef(null);
  const emojiPickerRef = useRef(null);

  const activeChat = chatSessions.find(s => s.id === activeChatId);
  const activePersona = activeChat ? personas.find(p => p.id === activeChat.persona_id) : null;
  const activeUser = userProfiles.find(p => p.id === activeUserProfileId) || userProfiles[0];
  const chatData = messages[activeChatId];

  // Compute linear path
  const activeMessages = React.useMemo(() => {
    if (!chatData) return [];
    if (Array.isArray(chatData)) return chatData;

    const rootSiblings = Object.values(chatData.nodes)
      .filter(n => n.parentId === null)
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(n => n.id);

    if (rootSiblings.length === 0) return [];

    const path = [];
    const activeRootIdx = chatData.activeChildIndex[null] || 0;
    let curr = rootSiblings[activeRootIdx];

    while (curr && chatData.nodes[curr]) {
      const node = chatData.nodes[curr];
      path.push(node);
      const activeIdx = chatData.activeChildIndex[curr] || 0;
      curr = node.childrenIds[activeIdx];
    }
    return path;
  }, [chatData]);

  const scrollToBottom = (instant = false) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: instant ? 'auto' : 'smooth',
        block: 'end'
      });
    }
  };

  useEffect(() => {
    if (wasAtBottomRef.current) {
      scrollToBottom();
    }
  }, [activeMessages.length, isGenerating]);

  useEffect(() => {
    if (activeChatId) {
      scrollToBottom(true);
      wasAtBottomRef.current = true;
      setShowScrollDown(false);
    }
  }, [activeChatId]);


  useEffect(() => {
    const handlePopState = (event) => {
      // Close local UI elements in priority order
      if (previewFile) {
        setPreviewFile(null);
      } else if (showEmojiPicker) {
        setShowEmojiPicker(false);
      } else if (isSearchActive) {
        setIsSearchActive(false);
        setChatSearchQuery('');
      } else if (isMenuOpen) {
        setIsMenuOpen(false);
      } else if (contextMenu) {
        setContextMenu(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [previewFile, showEmojiPicker, isSearchActive, isMenuOpen, contextMenu]);

  // Track previous local states
  const prevLocalStates = useRef({ previewFile, showEmojiPicker, isSearchActive, isMenuOpen, contextMenu });

  // Push history state when local UI elements open
  useEffect(() => {
    const openedPreview = previewFile && !prevLocalStates.current.previewFile;
    const openedEmoji = showEmojiPicker && !prevLocalStates.current.showEmojiPicker;
    const openedSearch = isSearchActive && !prevLocalStates.current.isSearchActive;
    const openedMenu = isMenuOpen && !prevLocalStates.current.isMenuOpen;
    const openedContext = contextMenu && !prevLocalStates.current.contextMenu;

    if (openedPreview || openedEmoji || openedSearch || openedMenu || openedContext) {
      window.history.pushState({ isChatInternalModal: true }, '');
    }
    prevLocalStates.current = { previewFile, showEmojiPicker, isSearchActive, isMenuOpen, contextMenu };
  }, [previewFile, showEmojiPicker, isSearchActive, isMenuOpen, contextMenu]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) {
        setShowSearchResults(false);
      }
      if (contextMenu) {
        setContextMenu(null);
      }
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [contextMenu]);

  const [streamingText, setStreamingText] = useState('');
  const [streamingParentId, setStreamingParentId] = useState(null);
  const [streamingThoughts, setStreamingThoughts] = useState('');
  const [expandedThoughts, setExpandedThoughts] = useState(new Set());

  const toggleThought = (msgId) => {
    setExpandedThoughts(prev => {
      const next = new Set(prev);
      if (next.has(msgId)) {
        next.delete(msgId);
      } else {
        next.add(msgId);
      }
      return next;
    });
  };

  const displayStreamingText = streamingText || streamingMessages[activeChatId] || '';
  const displayIsGenerating = isGenerating || activeChatId in streamingMessages;

  const lastSeenStatus = React.useMemo(() => {
    const botMessages = activeMessages.filter(m => m.sender === 'bot');
    if (botMessages.length === 0) return 'last seen a long time ago';
    const lastTs = botMessages[botMessages.length - 1].timestamp;
    const diff = Date.now() - lastTs;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'last seen just now';
    if (mins < 60) return `last seen ${mins} min ago`;
    const date = new Date(lastTs);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (date.toDateString() === today.toDateString()) return `last seen today at ${timeStr}`;
    if (date.toDateString() === yesterday.toDateString()) return `last seen yesterday at ${timeStr}`;
    return `last seen ${date.toLocaleDateString([], { day: 'numeric', month: 'short' })} at ${timeStr}`;
  }, [activeMessages]);



  const startGeneration = async (historyToPass, parentNodeId, isRegeneration = false) => {
    setIsGenerating(true);
    setStreamingText('');
    setStreamingParentId(parentNodeId);
    setStreamingThoughts('');

    const signal = getNewAbortSignal(activeChatId, true);

    let botResponseText = '';
    let stats = null;
    let aborted = false;
    let returnedUserMessageId = null;
    let returnedAssistantMessageId = null;
    try {
      const result = await generateChatResponse(settings, activePersona, activeUser, historyToPass, (chunk, isMonologue) => {
        if (isMonologue) {
          setStreamingThoughts(prev => prev + chunk);
        } else {
          botResponseText += chunk;
          setStreamingText(botResponseText);
        }
        scrollToBottom();
      }, false, signal, activeChatId, parentNodeId);
      stats = result.stats;
      returnedUserMessageId = result.userMessageId;
      returnedAssistantMessageId = result.assistantMessageId;

      if (stats && stats.promptTokens) {
        updateMessageMetadata(activeChatId, parentNodeId, {
          promptTokens: stats.promptTokens,
          isExact: true,
          ...(returnedUserMessageId ? { letta_id: returnedUserMessageId } : {})
        });
      } else if (returnedUserMessageId) {
        updateMessageMetadata(activeChatId, parentNodeId, { letta_id: returnedUserMessageId });
      }
    } catch (e) {
      if (e && e.name === 'AbortError') {
        aborted = true;
      } else {
        console.error('Generation error:', e);
      }
    } finally {
      clearGeneration(activeChatId);
      setIsGenerating(false);
      if (!aborted && botResponseText) {
        await addMessage(activeChatId, {
          sender: 'bot',
          content: botResponseText,
          stats: stats,
          metadata: returnedAssistantMessageId ? { letta_id: returnedAssistantMessageId } : {}
        }, parentNodeId);

        // Trigger notification if tab is hidden
        sendNotification(activePersona?.name || 'Tellama', botResponseText);
      }
      setStreamingText('');
      setStreamingParentId(null);
      setStreamingThoughts('');

      if (!aborted && botResponseText) {
        setStatusOverride('online');
        setTimeout(() => {
          setStatusOverride(null);
        }, 4000);
      }
    }
  };

  const handleSendRobust = async () => {
    if ((!inputText.trim() && attachments.length === 0) || !activePersona || isGenerating) return;

    // Request notification permission on first user interaction
    requestNotificationPermission();

    let finalContent = inputText.trim();
    let llmContent = finalContent;
    if (attachments.length > 0) {
      const attachmentsText = attachments.map(att => {
        if (att.content) {
          return `\n[File: ${att.name}]\n${att.content}\n[End of File: ${att.name}]`;
        } else {
          return `\n[Attached binary file: ${att.name}]`;
        }
      }).join('\n');
      llmContent = llmContent ? `${llmContent}\n\n${attachmentsText}` : attachmentsText;
    }

    const messageAttachments = attachments.map(att => ({
      id: att.id,
      name: att.name,
      type: att.type,
      size: att.size,
      content: att.content,
      previewUrl: att.previewUrl,
      dataUrl: att.dataUrl
    }));

    setInputText('');
    setAttachments([]);

    const textarea = document.querySelector('textarea');
    if (textarea) textarea.style.height = 'auto';

    const historyToPass = [...activeMessages, { sender: 'user', content: llmContent }];
    const lastMsgId = activeMessages.length > 0 ? activeMessages[activeMessages.length - 1].id : null;

    // PRUNE INACTIVE BRANCHES: Make the currently selected branch "the main one forever"
    if (lastMsgId) {
      const lastNode = chatData.nodes[lastMsgId];
      if (lastNode && lastNode.parentId) {
        const parentNode = chatData.nodes[lastNode.parentId];
        if (parentNode && parentNode.childrenIds && parentNode.childrenIds.length > 1) {
          for (const siblingId of [...parentNode.childrenIds]) {
            if (siblingId !== lastMsgId) {
              // Cascade delete from Letta
              const lettaIdsToDelete = [];
              const traverse = (nodeId) => {
                const node = chatData.nodes[nodeId];
                if (!node) return;
                if (node.metadata?.letta_id) {
                  lettaIdsToDelete.push(node.metadata.letta_id);
                }
                if (node.childrenIds) {
                  node.childrenIds.forEach(traverse);
                }
              };
              traverse(siblingId);

              for (const lettaId of lettaIdsToDelete) {
                try {
                  await deleteMessageInLetta(lettaId, activeUser);
                } catch (e) {
                  console.warn('Failed to delete message in Letta during pruning:', e);
                }
              }
              // Cascade delete locally
              await deleteMessageNode(activeChatId, siblingId);
            }
          }
        }
      }
    }

    const userMsgId = await addMessage(activeChatId, {
      sender: 'user',
      content: finalContent,
      stats: {
        attachments: messageAttachments
      }
    }, lastMsgId);

    await startGeneration(historyToPass, userMsgId);
  };

  const handleRegenerate = async (msg) => {
    if (isGenerating) return;
    // msg is the USER message whose response we want to regenerate
    const oldUserMsgId = msg.id;
    const oldUserNode = chatData.nodes[oldUserMsgId];

    // Find the currently active bot response for this user message
    const activeBotIdx = chatData.activeChildIndex[oldUserMsgId] ?? 0;
    const activeBotChildId = oldUserNode?.childrenIds?.[activeBotIdx];
    const activeBotNode = activeBotChildId ? chatData.nodes[activeBotChildId] : null;

    // We MUST delete the old branch from Letta's memory right now!
    // Otherwise Letta receives them sequentially and hallucinates duplicate messages.
    // Letta memory is strictly linear and only remembers the CURRENT active branch.
    if (activeBotNode?.metadata?.letta_id) {
      await deleteMessageInLetta(activeBotNode.metadata.letta_id, activeUser).catch(() => { });
    }
    if (msg.metadata?.letta_id) {
      await deleteMessageInLetta(msg.metadata.letta_id, activeUser).catch(() => { });
    }

    // Build history up to (but EXCLUDING) this user message
    const historyToPass = [];
    let curr = chatData.rootId;
    while (curr && chatData.nodes[curr]) {
      const currNode = chatData.nodes[curr];
      if (curr === oldUserMsgId) break;
      historyToPass.push(currNode);
      const idx = chatData.activeChildIndex[curr] ?? 0;
      curr = currNode.childrenIds[idx];
    }

    // Create a NEW user message as a sibling to the old one (branching)
    const newUserMsgId = await addMessage(activeChatId, {
      sender: 'user',
      content: msg.content,
      stats: msg.stats || {}
    }, msg.parentId);

    // Add the new user message to history
    historyToPass.push({ ...msg, id: newUserMsgId });

    // Generate new bot response under the new user message
    await startGeneration(historyToPass, newUserMsgId, true);
  };

  const handleSwitchBranch = async (parentId, newIndex) => {
    // 1. Identify the currently active User and Bot messages
    const activeUserIdx = chatData.activeChildIndex[parentId] ?? 0;

    // We only need to patch if the branch is actually changing
    if (activeUserIdx === newIndex) {
      switchBranch(activeChatId, parentId, newIndex);
      return;
    }

    let activeUserId = null;
    let newUserId = null;

    if (parentId === null) {
      const rootSiblings = Object.values(chatData.nodes).filter(n => n.parentId === null).sort((a, b) => a.timestamp - b.timestamp).map(n => n.id);
      activeUserId = rootSiblings[activeUserIdx];
      newUserId = rootSiblings[newIndex];
    } else {
      const parentNode = chatData.nodes[parentId];
      if (!parentNode) return;
      activeUserId = parentNode.childrenIds[activeUserIdx];
      newUserId = parentNode.childrenIds[newIndex];
    }

    const activeUserNode = chatData.nodes[activeUserId];

    const activeBotIdx = chatData.activeChildIndex[activeUserId] ?? 0;
    const activeBotId = activeUserNode?.childrenIds?.[activeBotIdx];
    const activeBotNode = activeBotId ? chatData.nodes[activeBotId] : null;

    if (!activeBotNode?.metadata?.letta_id || !activeUserNode?.metadata?.letta_id) {
      switchBranch(activeChatId, parentId, newIndex);
      return;
    }

    const aliveLettaUserId = activeUserNode.metadata.letta_id;
    const aliveLettaBotId = activeBotNode.metadata.letta_id;

    // 2. Identify the target User and Bot messages we are switching to
    const newUserNode = chatData.nodes[newUserId];

    const newBotIdx = chatData.activeChildIndex[newUserId] ?? 0;
    const newBotId = newUserNode?.childrenIds?.[newBotIdx];
    const newBotNode = newBotId ? chatData.nodes[newBotId] : null;

    if (!newBotNode) {
      switchBranch(activeChatId, parentId, newIndex);
      return;
    }

    // 3. Update UI instantly
    switchBranch(activeChatId, parentId, newIndex);

    // 4. Patch the Letta messages with the target text in the background
    (async () => {
      try {
        await updateMessageInLetta(aliveLettaUserId, newUserNode.content, activeUser, 'user');
        await updateMessageInLetta(aliveLettaBotId, newBotNode.content, activeUser, 'assistant');

        // 5. Update local metadata so the new active branch owns the alive Letta IDs
        await updateMessageMetadata(activeChatId, newUserId, { letta_id: aliveLettaUserId });
        await updateMessageMetadata(activeChatId, newBotId, { letta_id: aliveLettaBotId });

      } catch (e) {
        console.warn('Failed to restore branch state in Letta:', e);
      }
    })();
  };

  const handleEditSubmit = async (msg, triggerRegeneration = false) => {
    if (!editingText.trim() || isGenerating) return;

    if (editingText !== msg.content) {
      await updateMessage(activeChatId, msg.id, { content: editingText });

      if (msg.metadata && msg.metadata.letta_id) {
        try {
          const role = msg.sender === 'user' ? 'user' : 'assistant';
          await updateMessageInLetta(msg.metadata.letta_id, editingText, activeUser, role);
        } catch (e) {
          console.warn('Failed to update message in Letta:', e);
        }
      }
    }

    setEditingMessageId(null);

    if (triggerRegeneration && msg.sender === 'user') {
      // Delete all children (model responses) of this user message
      const node = chatData.nodes[msg.id];
      if (node && node.childrenIds && node.childrenIds.length > 0) {
        for (const childId of [...node.childrenIds]) {
          const childNode = chatData.nodes[childId];
          if (childNode) {
            if (childNode.metadata && childNode.metadata.letta_id) {
              await deleteMessageInLetta(childNode.metadata.letta_id, activeUser).catch(() => { });
            }
            await deleteMessageNode(activeChatId, childId);
          }
        }
      }

      const historyToPass = [];
      let curr = chatData.rootId;
      while (curr && chatData.nodes[curr]) {
        const currNode = chatData.nodes[curr];
        historyToPass.push(currNode);
        if (curr === msg.id) break;
        const activeIdx = chatData.activeChildIndex[curr] || 0;
        curr = currNode.childrenIds[activeIdx];
      }

      await startGeneration(historyToPass, msg.id, true);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendRobust();
    }
  };

  const onEmojiClick = (emojiData) => {
    setInputText(prev => prev + emojiData.emoji);
  };

  const handleFileAttach = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    files.forEach(file => {
      const isImage = file.type.startsWith('image/');
      const attachment = {
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        type: file.type,
        size: file.size,
        content: null,
        previewUrl: isImage ? URL.createObjectURL(file) : null,
        dataUrl: null
      };

      if (isImage) {
        const reader = new FileReader();
        reader.onload = (re) => {
          attachment.dataUrl = re.target.result;
          setAttachments(prev => [...prev, attachment]);
        };
        reader.readAsDataURL(file);
      } else if (file.type.startsWith('text/') || file.name.match(/\.(md|json|js|py|html|css)$/)) {
        const reader = new FileReader();
        reader.onload = (re) => {
          attachment.content = re.target.result;
          setAttachments(prev => [...prev, attachment]);
        };
        reader.readAsText(file);
      } else {
        setAttachments(prev => [...prev, attachment]);
      }
    });
    e.target.value = '';
  };

  const handleRenameChat = (e) => {
    e.stopPropagation();
    setIsMenuOpen(false);
    setTempChatName(activeChat.name || activePersona.name);
    setIsRenaming(true);
  };

  const submitRename = () => {
    if (tempChatName.trim() && tempChatName !== (activeChat.name || activePersona.name)) {
      renameChat(activeChatId, tempChatName.trim());
    }
    setIsRenaming(false);
  };

  const handleRenameKeyDown = (e) => {
    if (e.key === 'Enter') submitRename();
    if (e.key === 'Escape') setIsRenaming(false);
  };

  const handleDeleteChat = (e) => {
    e.stopPropagation();
    setIsMenuOpen(false);
    if (window.confirm(`Are you sure you want to delete the chat with ${activePersona.name}?`)) {
      deleteChat(activeChatId);
    }
  };

  const removeAttachment = (id) => {
    setAttachments(prev => {
      const att = prev.find(a => a.id === id);
      if (att && att.previewUrl && att.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(att.previewUrl);
      }
      return prev.filter(a => a.id !== id);
    });
  };

  const handleDeleteMessage = async (msg) => {
    // Collect all message IDs in the subtree to delete from Letta
    const lettaIdsToDelete = [];
    const traverse = (nodeId) => {
      const node = chatData.nodes[nodeId];
      if (!node) return;
      if (node.metadata?.letta_id) {
        lettaIdsToDelete.push(node.metadata.letta_id);
      }
      if (node.childrenIds) {
        node.childrenIds.forEach(traverse);
      }
    };
    traverse(msg.id);

    // Delete all collected IDs from Letta
    for (const lettaId of lettaIdsToDelete) {
      try {
        await deleteMessageInLetta(lettaId, activeUser);
      } catch (e) {
        console.warn('Failed to delete message in Letta:', e);
      }
    }

    // Cascade delete locally
    await deleteMessageNode(activeChatId, msg.id);
  };

  const handleContextMenu = (e, msg) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      msg
    });
  };

  const handleCopyText = (text) => {
    navigator.clipboard.writeText(text);
    setContextMenu(null);
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const renderMessageAttachments = (allAttachments) => {
    if (!allAttachments || allAttachments.length === 0) return null;
    return (
      <div className="flex flex-col gap-1 w-full max-w-[280px]">
        <div className={`grid gap-[2px] rounded-[18px] overflow-hidden ${allAttachments.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {allAttachments.map(att => {
            const isImage = att.type.startsWith('image/');
            const extension = att.name.split('.').pop().toLowerCase().slice(0, 3);
            return (
              <div key={att.id} onClick={() => setPreviewFile(att)} className="relative cursor-pointer overflow-hidden bg-black/5 aspect-square flex flex-col items-center justify-center group">
                {isImage ? (
                  <img src={att.dataUrl || att.previewUrl} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" alt={att.name} />
                ) : (
                  <div className="w-full h-full bg-green-500/10 dark:bg-green-500/5 flex flex-col items-center justify-center p-4 relative">
                    <div className="w-12 h-12 bg-green-500 rounded-xl flex items-center justify-center relative flex-shrink-0 shadow-sm overflow-hidden mb-2">
                      <div className="absolute top-0 right-0 w-3 h-3 bg-green-600 rounded-bl-sm shadow-sm"></div>
                      <span className="text-white font-bold text-[13px] uppercase mt-0.5">{extension}</span>
                    </div>
                    <span className="text-[12px] font-semibold text-[var(--tg-text-color)] text-center line-clamp-2 px-2 leading-tight">{att.name}</span>
                    <span className="text-[10px] text-[var(--tg-hint-color)] mt-1">{formatSize(att.size)}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderMessageBubbles = (msg, prevMsg, nextMsg) => {
    const isUser = msg.sender === 'user';
    const isEditing = editingMessageId === msg.id;
    const hasAttachments = msg.stats?.attachments && msg.stats.attachments.length > 0;

    const isStartOfChain = !prevMsg || prevMsg.sender !== msg.sender;
    const isEndOfChain = !nextMsg || nextMsg.sender !== msg.sender;

    // Branches helper data
    let siblings = [];
    let currentVariantIndex = 0;
    if (msg.parentId && chatData.nodes[msg.parentId]) {
      siblings = chatData.nodes[msg.parentId].childrenIds;
      currentVariantIndex = chatData.activeChildIndex[msg.parentId] || 0;
    } else if (msg.parentId === null) {
      // Root message siblings
      siblings = Object.values(chatData.nodes).filter(n => n.parentId === null).sort((a, b) => a.timestamp - b.timestamp).map(n => n.id);
      currentVariantIndex = chatData.activeChildIndex[null] || 0;
    }
    // We branch on user messages now. 
    // The switcher should appear if this message has siblings.
    const hasVariants = siblings.length > 1;

    if (isEditing) {
      return (
        <div key={msg.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} group p-1 w-full`}>
          <div className="max-w-[75%] rounded-[18px] p-3 shadow-sm bg-[var(--tg-secondary-bg-color)] border border-[var(--tg-link-color)]">
            <textarea className="w-full bg-transparent text-[var(--tg-text-color)] outline-none resize-y min-h-[60px]" value={editingText} onChange={(e) => setEditingText(e.target.value)} autoFocus />
            <div className="flex justify-end gap-2 mt-2">
              <button onClick={() => setEditingMessageId(null)} className="text-xs text-[var(--tg-hint-color)] px-2 py-1">Cancel</button>
              <button onClick={() => handleEditSubmit(msg)} className="text-xs bg-[var(--tg-button-color)] text-[var(--tg-button-text-color)] px-3 py-1 rounded">Save</button>
              {isUser && (
                <button onClick={() => handleEditSubmit(msg, true)} className="text-xs bg-[var(--tg-link-color)] text-white px-3 py-1 rounded flex items-center gap-1">
                  <RotateCcw size={12} /> Save & Regenerate
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    const contentParts = (msg.content && !hasAttachments) ? msg.content.split(/\n\s*\n/).filter(p => p.trim()) : [msg.content].filter(Boolean);

    return (
      <div key={msg.id} id={`msg-${msg.id}`} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} group transition-colors duration-500 p-1 w-full relative`}>
        <div className={`flex flex-col gap-1 w-full max-w-[85%] max-w-[520px] ${isUser ? 'items-end' : 'items-start'}`}>
          {hasAttachments && (
            <div
              onContextMenu={(e) => handleContextMenu(e, msg)}
              style={{
                borderTopLeftRadius: (isStartOfChain || isUser) ? '18px' : '4px',
                borderTopRightRadius: (isStartOfChain || !isUser) ? '18px' : '4px',
                borderBottomLeftRadius: (isEndOfChain && !msg.content || isUser) ? '18px' : '4px',
                borderBottomRightRadius: (isEndOfChain && !msg.content || !isUser) ? '18px' : '4px',
                minWidth: '150px'
              }}
              className={`flex flex-col shadow-sm relative transition-all duration-300 ${isUser ? 'bg-[var(--tg-chat-bubble-out)] tg-bubble-out' : 'bg-[var(--tg-chat-bubble-in)] tg-bubble-in'} p-1 select-none`}            >
              {renderMessageAttachments(msg.stats.attachments)}
              {!isUser && expandedThoughts.has(msg.id) && (msg.stats?.reasoning || msg.stats?.monologue) && (
                <div
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--tg-link-color) 10%, transparent)',
                    borderColor: 'color-mix(in srgb, var(--tg-link-color) 20%, transparent)',
                    color: 'color-mix(in srgb, var(--tg-text-color) 80%, transparent)'
                  }}
                  className="relative group/thought mx-1 mt-1 mb-1 p-2 rounded-[10px] text-[11px] font-mono tracking-tight whitespace-pre-wrap leading-tight border"
                >
                  {msg.stats.reasoning || msg.stats.monologue}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleThought(msg.id); }}
                    className="absolute bottom-[-10px] left-1/2 -translate-x-1/2 w-[48px] h-[20px] bg-[var(--tg-bg-color)] border border-[var(--tg-border-color)] text-[var(--tg-hint-color)] hover:text-[var(--tg-link-color)] hover:border-[var(--tg-link-color)]/40 rounded-full flex items-center justify-center shadow-md z-20 transition-all duration-300 opacity-0 scale-90 translate-y-1 pointer-events-none group-hover/thought:opacity-100 group-hover/thought:scale-100 group-hover/thought:translate-y-0 group-hover/thought:pointer-events-auto"
                    title="Hide thoughts"
                  >
                    <ArrowDown size={12} />
                  </button>
                </div>
              )}
              {msg.content && (
                <div className="px-3 py-1.5 whitespace-pre-wrap break-words text-[var(--tg-chat-bubble-in-text)]">
                  {msg.content}
                  <div className="px-0 pb-0 text-[11px] text-right mt-1 opacity-70 flex justify-end items-center">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {isUser && (chatData.nodes[msg.id]?.childrenIds?.length > 0 ? <CheckCheck size={16} className="ml-1 opacity-80" /> : <Check size={16} className="ml-1 opacity-80" />)}
                  </div>
                </div>
              )}
              {!msg.content && isEndOfChain && (
                <div className={`absolute bottom-0 ${isUser ? '-right-2' : '-left-2'} pointer-events-none`}>
                  <div className={isUser ? 'tg-bubble-out-tail' : 'tg-bubble-in-tail'} />
                </div>
              )}
            </div>
          )}

          {!hasAttachments && contentParts.map((part, pIdx) => {
            const isFirstInThisMsg = pIdx === 0;
            const isLastInThisMsg = pIdx === contentParts.length - 1;

            const isVeryFirstInChain = isStartOfChain && isFirstInThisMsg;
            const isVeryLastInChain = isEndOfChain && isLastInThisMsg;

            const tl = isVeryFirstInChain || isUser ? '18px' : '4px';
            const tr = isVeryFirstInChain || !isUser ? '18px' : '4px';
            const bl = isVeryLastInChain || isUser ? '18px' : '4px';
            const br = isVeryLastInChain || !isUser ? '18px' : '4px';

            return (
              <div
                key={`${msg.id}-p${pIdx}`}
                onContextMenu={(e) => handleContextMenu(e, msg)}
                style={{ borderTopLeftRadius: tl, borderTopRightRadius: tr, borderBottomLeftRadius: bl, borderBottomRightRadius: br, minWidth: '150px' }}
                className={`flex flex-col shadow-sm text-[15px] relative transition-all duration-300 ${isUser ? 'bg-[var(--tg-chat-bubble-out)] text-[var(--tg-chat-bubble-out-text)] tg-bubble-out' : 'bg-[var(--tg-chat-bubble-in)] text-[var(--tg-chat-bubble-in-text)] tg-bubble-in'} ${isVeryLastInChain ? (isUser ? 'tg-bubble-out-tail' : 'tg-bubble-in-tail') : ''} select-none`}              >
                {isFirstInThisMsg && !isUser && expandedThoughts.has(msg.id) && (msg.stats?.reasoning || msg.stats?.monologue) && (
                  <div
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--tg-link-color) 10%, transparent)',
                      borderColor: 'color-mix(in srgb, var(--tg-link-color) 20%, transparent)',
                      color: 'color-mix(in srgb, var(--tg-text-color) 80%, transparent)'
                    }}
                    className="relative group/thought mx-2 mt-2 mb-1 p-2 rounded-[10px] text-[11px] font-mono tracking-tight whitespace-pre-wrap leading-tight border"
                  >
                    {msg.stats.reasoning || msg.stats.monologue}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleThought(msg.id); }}
                      className="absolute bottom-[-10px] left-1/2 -translate-x-1/2 w-[48px] h-[20px] bg-[var(--tg-bg-color)] border border-[var(--tg-border-color)] text-[var(--tg-hint-color)] hover:text-[var(--tg-link-color)] hover:border-[var(--tg-link-color)]/40 rounded-full flex items-center justify-center shadow-md z-20 transition-all duration-300 opacity-0 scale-90 translate-y-1 pointer-events-none group-hover/thought:opacity-100 group-hover/thought:scale-100 group-hover/thought:translate-y-0 group-hover/thought:pointer-events-auto"
                      title="Hide thoughts"
                    >
                      <ArrowDown size={12} />
                    </button>
                  </div>
                )}
                <div className="px-3 py-1.5 whitespace-pre-wrap break-words">{part}</div>
                {isLastInThisMsg && (
                  <div className="px-3 pb-1 text-[11px] text-right mt-0 opacity-70 flex justify-end items-center">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {isUser && (chatData.nodes[msg.id]?.childrenIds?.length > 0 ? <CheckCheck size={16} className="ml-1 opacity-80" /> : <Check size={16} className="ml-1 opacity-80" />)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
          {!isEditing && (
            <>
              {hasVariants && (
                <div className={`flex items-center gap-2 mt-1 text-xs text-[var(--tg-hint-color)] ${isUser ? 'mr-2' : 'ml-2'}`}>
                  <button
                    onClick={() => handleSwitchBranch(msg.parentId, Math.max(0, currentVariantIndex - 1))}
                    disabled={currentVariantIndex === 0}
                    className="hover:text-[var(--tg-text-color)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="font-medium">{currentVariantIndex + 1} / {siblings.length}</span>
                  <button
                    onClick={() => handleSwitchBranch(msg.parentId, Math.min(siblings.length - 1, currentVariantIndex + 1))}
                    disabled={currentVariantIndex === siblings.length - 1}
                    className="hover:text-[var(--tg-text-color)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  const scrollToMessage = (id) => {
    const element = document.getElementById(`msg-${id}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('bg-blue-500/10');
      setTimeout(() => element.classList.remove('bg-blue-500/10'), 2000);
    }
    setIsSearchActive(false);
    setChatSearchQuery('');
  };

  const searchResults = chatSearchQuery.trim()
    ? activeMessages.filter(m => m.content.toLowerCase().includes(chatSearchQuery.toLowerCase()))
    : [];

  const getFileIcon = (att) => {
    if (att.type.startsWith('image/')) return <ImageIcon size={16} className="text-purple-400" />;
    if (att.type.includes('javascript') || att.type.includes('python') || att.name.match(/\.(js|py|html|css|json)$/)) return <FileCode size={16} className="text-yellow-400" />;
    if (att.type.includes('text') || att.name.match(/\.(txt|md)$/)) return <FileText size={16} className="text-blue-400" />;
    return <File size={16} className="text-gray-400" />;
  };

  const containerRef = useRef(null);
  const wasAtBottomRef = useRef(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
      wasAtBottomRef.current = isAtBottom;
      setShowScrollDown(!isAtBottom);
    };

    const resizeObserver = new ResizeObserver(() => {
      if (wasAtBottomRef.current) {
        scrollToBottom(true);
      }
    });

    container.addEventListener('scroll', handleScroll);
    const messagesList = container.querySelector('.messages-list-container');
    if (messagesList) {
      resizeObserver.observe(messagesList);
    }

    return () => {
      container.removeEventListener('scroll', handleScroll);
      resizeObserver.disconnect();
    };
  }, []);
  if (!activePersona) {
    return (
      <div className="flex-grow flex flex-col h-full bg-transparent relative overflow-hidden">
        <div className="h-[60px] w-full bg-[var(--tg-bg-color)] flex-shrink-0 z-10 md:border-l md:border-r border-[var(--tg-border-color)]"></div>
        <div className="flex-grow flex items-center justify-center relative">
          <div className="absolute inset-0 bg-cover bg-center bg-no-repeat" style={{ backgroundImage: 'var(--tg-chat-bg-image)' }}></div>
          <div className="bg-[var(--tg-bg-color)] px-4 py-1.5 rounded-full text-sm text-[var(--tg-hint-color)] shadow-sm z-10">
            Select a chat to start messaging
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex-grow flex flex-col h-full bg-transparent relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.05] pointer-events-none" style={{ backgroundSize: '400px' }}></div>

      {/* Header */}
      <div className="h-[60px] flex-shrink-0 bg-[var(--tg-bg-color)] flex items-center px-2 md:px-4 z-30 relative md:border-l md:border-r border-[var(--tg-border-color)]">
        <button
          onClick={() => {
            if (window.history.state?.isTellamaModal || window.history.state?.isChatInternalModal) {
              window.history.back();
            } else {
              setActiveChatId(null);
            }
          }}
          className="md:hidden p-2 mr-1 text-[var(--tg-hint-color)] hover:bg-[var(--tg-secondary-bg-color)] rounded-full transition-colors flex-shrink-0"
        >
          <ArrowLeft size={24} />
        </button>
        <div className="flex-grow flex items-center cursor-pointer overflow-hidden p-1 rounded-lg min-w-0" onClick={onOpenModelInfo}>
          <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-blue-400 to-blue-600 flex-shrink-0 flex items-center justify-center text-white font-semibold text-lg mr-3 shadow-sm">
            {activePersona.avatar ? <img src={activePersona.avatar} className="w-full h-full object-cover" /> : activePersona.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex flex-col flex-grow min-w-0">
            {isRenaming ? (
              <input
                autoFocus
                className="bg-[var(--tg-secondary-bg-color)] text-[var(--tg-text-color)] text-[16px] font-semibold outline-none border-b border-[var(--tg-link-color)] w-full"
                value={tempChatName}
                onChange={(e) => setTempChatName(e.target.value)}
                onBlur={submitRename}
                onKeyDown={handleRenameKeyDown}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <h2 className="font-semibold text-[var(--tg-text-color)] text-[16px] leading-tight truncate">
                {activeChat.name || activePersona.name}
              </h2>
            )}
            <span className="text-[13px] font-medium truncate" style={{ color: (displayIsGenerating || statusOverride === 'online') ? 'var(--tg-link-color)' : 'var(--tg-status-color)' }}>{displayIsGenerating ? 'typing...' : (statusOverride === 'online' ? 'online' : lastSeenStatus)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 ml-1">
          <button onClick={() => setIsSearchActive(!isSearchActive)} className={`p-2 rounded-full transition-colors ${isSearchActive ? 'bg-[var(--tg-secondary-bg-color)] text-[var(--tg-link-color)]' : 'text-[var(--tg-hint-color)] hover:bg-[var(--tg-secondary-bg-color)]'}`}><Search size={20} /></button>
          <div className="relative" ref={menuRef}>
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} className={`p-2 text-[var(--tg-hint-color)] hover:bg-[var(--tg-secondary-bg-color)] rounded-full transition-colors ${isMenuOpen ? 'bg-[var(--tg-secondary-bg-color)] text-[var(--tg-link-color)]' : ''}`}><MoreVertical size={20} /></button>
            {isMenuOpen && (
              <div className="absolute right-0 top-[100%] mt-2 w-64 bg-[var(--tg-search-bg)] border border-[var(--tg-border-color)] rounded-xl shadow-2xl overflow-hidden z-50 py-2 transition-all flex flex-col gap-1">
                <button className="mx-1 flex items-center justify-between px-2 py-2 text-[var(--tg-text-color)] hover:bg-white/10 transition-colors rounded-xl text-[15px] opacity-50 cursor-default">
                  <div className="flex items-center gap-3">
                    <RotateCcw size={18} className="text-[var(--tg-hint-color)]" />
                    <span>Auto-delete</span>
                  </div>
                  <ChevronRight size={16} className="text-[var(--tg-hint-color)]" />
                </button>

                <button className="mx-1 flex items-center gap-3 px-2 py-2 text-[var(--tg-text-color)] hover:bg-white/10 transition-colors rounded-xl text-[15px] opacity-50 cursor-default">
                  <CheckCheck size={18} className="text-[var(--tg-hint-color)]" />
                  <span>Select Messages</span>
                </button>

                <button
                  onClick={handleRenameChat}
                  className="mx-1 flex items-center gap-3 px-2 py-2 text-[var(--tg-text-color)] hover:bg-white/10 transition-colors rounded-xl text-[15px]"
                >
                  <Edit2 size={18} className="text-[var(--tg-hint-color)]" />
                  <span>Rename Chat</span>
                </button>

                <button
                  onClick={handleDeleteChat}
                  className="mx-1 flex items-center gap-3 px-2 py-2 text-red-500 hover:bg-red-500/10 transition-colors rounded-xl text-[15px]"
                >
                  <Trash2 size={18} />
                  <span>Delete Chat</span>
                </button>
              </div>
            )}
          </div>
        </div>
        {isSearchActive && (
          <div className="absolute inset-0 bg-[var(--tg-bg-color)] z-40 flex flex-col animate-in fade-in duration-200">
            <div className="h-[60px] flex items-center px-2 md:px-4 flex-shrink-0">
              <button className="md:hidden p-2 mr-1 opacity-0 pointer-events-none flex-shrink-0">
                <ArrowLeft size={24} />
              </button>
              <div className="p-1 flex items-center mr-2 flex-shrink-0"><div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-blue-400 to-blue-600 flex-shrink-0 flex items-center justify-center text-white font-semibold text-lg shadow-sm">{activePersona.avatar ? <img src={activePersona.avatar} className="w-full h-full object-cover" /> : activePersona.name.charAt(0).toUpperCase()}</div></div>
              <div className="flex-grow flex items-center h-full relative min-w-0" ref={searchContainerRef}>
                <div className={`flex-grow flex items-center h-[40px] px-4 transition-all duration-200 min-w-0 relative ${isSearchFocused ? 'bg-[var(--tg-search-bg-focused)] shadow-[0_2px_8px_rgba(0,0,0,0.2)]' : 'bg-[var(--tg-search-bg)]'} ${chatSearchQuery.trim() && showSearchResults ? 'rounded-t-[20px] after:content-[""] after:absolute after:bottom-0 after:left-4 after:right-4 after:h-[1px] after:bg-[var(--tg-border-color)]' : 'rounded-full'}`}><Search size={18} className="mr-3 text-[var(--tg-hint-color)] flex-shrink-0" /><input autoFocus type="text" className="flex-grow bg-transparent text-[var(--tg-text-color)] text-[16px] outline-none caret-[var(--tg-link-color)]" placeholder="Search" value={chatSearchQuery} onChange={(e) => { setChatSearchQuery(e.target.value); setShowSearchResults(true); }} onFocus={() => { setIsSearchFocused(true); setShowSearchResults(true); }} onBlur={() => setIsSearchFocused(false)} /></div>
                {chatSearchQuery.trim() && showSearchResults && (<div className={`absolute top-[50px] left-0 right-0 max-h-[400px] overflow-y-auto shadow-2xl rounded-b-2xl z-50 custom-scrollbar transition-all duration-300 origin-top ${isSearchFocused ? 'bg-[var(--tg-search-bg-focused)]' : 'bg-[var(--tg-search-bg)]'}`}>{searchResults.length > 0 ? (<div className="flex flex-col py-2 gap-1">{searchResults.map((msg) => (<div key={msg.id} onClick={() => scrollToMessage(msg.id)} className="flex items-center mx-1 px-2 py-2 hover:bg-[var(--tg-border-color)] cursor-pointer transition-colors rounded-xl"><div className="w-10 h-10 rounded-full overflow-hidden bg-blue-500/20 flex-shrink-0 mr-3">{(msg.sender === 'user' ? activeUser : activePersona)?.avatar ? <img src={(msg.sender === 'user' ? activeUser : activePersona).avatar} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-blue-500 font-bold">{(msg.sender === 'user' ? activeUser : activePersona)?.name?.charAt(0).toUpperCase()}</div>}</div><div className="flex-grow min-w-0"><div className="flex justify-between items-baseline"><span className="font-semibold text-[15px] truncate text-[var(--tg-text-color)]">{(msg.sender === 'user' ? activeUser : activePersona)?.name}</span><span className="text-[12px] text-[var(--tg-hint-color)] ml-2 flex-shrink-0">{new Date(msg.timestamp).toLocaleDateString()}</span></div><p className="text-[14px] text-[var(--tg-hint-color)] truncate">{msg.content}</p></div></div>))}</div>) : <div className="p-8 text-center text-[var(--tg-hint-color)]">No results found</div>}</div>)}
              </div>
              <button onClick={() => { setIsSearchActive(false); setChatSearchQuery(''); }} className="p-2 text-[var(--tg-hint-color)] hover:bg-[var(--tg-secondary-bg-color)] rounded-full transition-colors"><X size={20} /></button>
              <button onClick={() => setIsCalendarOpen(true)} className="p-2 text-[var(--tg-hint-color)] hover:bg-[var(--tg-secondary-bg-color)] rounded-full transition-colors">
                <Calendar size={20} />
              </button>
            </div>
          </div>
        )}
      </div>

      <div
        ref={containerRef}
        className="flex-grow overflow-y-auto z-10 custom-scrollbar"
        style={{ overflowAnchor: 'auto' }}
      >
        <div className="max-w-[700px] mx-auto w-full p-4 flex flex-col space-y-2 messages-list-container">
          {activeMessages.map((msg, idx) => {
            const prevMsg = activeMessages[idx - 1];
            const msgDate = new Date(msg.timestamp);
            const prevMsgDate = prevMsg ? new Date(prevMsg.timestamp) : null;

            const showDateSeparator = !prevMsgDate || !isSameDay(msgDate, prevMsgDate);

            return (
              <React.Fragment key={msg.id}>
                {showDateSeparator && (
                  <div className="flex justify-center my-2">
                    <div
                      onClick={() => {
                        setSelectedDate(new Date(msg.timestamp));
                        setCalendarDate(new Date(msg.timestamp));
                        setIsCalendarOpen(true);
                      }}
                      className="bg-[var(--tg-secondary-bg-color)] text-[var(--tg-hint-color)] text-[13px] font-medium px-4 py-1 rounded-full shadow-sm cursor-pointer hover:bg-[var(--tg-border-color)] transition-colors"
                    >
                      {getDateLabel(msg.timestamp)}
                    </div>
                  </div>
                )}
                {renderMessageBubbles(msg, prevMsg, activeMessages[idx + 1])}
              </React.Fragment>
            );
          })}

          {/* Initial Loading Spinner (Before thoughts or text starts) */}
          {displayIsGenerating && !streamingThoughts && !displayStreamingText && (
            <div className="flex justify-start p-1">
              <div className="max-w-[80%] rounded-[18px] px-4 py-2.5 shadow-sm bg-[var(--tg-chat-bubble-in)] text-[var(--tg-chat-bubble-in-text)] rounded-bl-[4px] flex items-center animate-in fade-in duration-300 tg-bubble-in tg-bubble-in-tail">
                <Loader2 size={16} className="animate-spin text-[var(--tg-link-color)] mr-3 animate-pulse" />
                <span className="text-[15px] font-medium text-[var(--tg-hint-color)] animate-pulse">Thinking...</span>
              </div>
            </div>
          )}

          {/* Detailed Thinking / Monologue State & Streaming Text State */}
          {displayIsGenerating && (streamingThoughts || displayStreamingText) && (
            <div className="flex flex-col gap-1 max-w-[80%] items-start self-start group p-1">
              <div
                style={{ minWidth: '150px' }}
                className={`flex flex-col shadow-sm text-[15px] relative transition-all duration-300 bg-[var(--tg-chat-bubble-in)] text-[var(--tg-chat-bubble-in-text)] tg-bubble-in rounded-[18px] tg-bubble-in-tail select-none`}
              >
                {/* Render Thoughts only in the first bubble */}
                {streamingThoughts && (
                  <div
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--tg-link-color) 10%, transparent)',
                      borderColor: 'color-mix(in srgb, var(--tg-link-color) 20%, transparent)',
                      color: 'color-mix(in srgb, var(--tg-text-color) 80%, transparent)'
                    }}
                    className="relative mx-2 mt-2 mb-1 p-2 rounded-[10px] text-[11px] font-mono tracking-tight whitespace-pre-wrap leading-tight border"
                  >
                    {streamingThoughts}
                  </div>
                )}
                {/* Thinking indicator: shown inside last bubble while no response text yet */}
                <div className="px-4 py-2.5 flex items-center">
                  <Loader2 size={16} className="animate-spin text-[var(--tg-link-color)] mr-3 animate-pulse" />
                  <span className="text-[15px] font-medium text-[var(--tg-hint-color)] animate-pulse">Thinking...</span>
                </div>

              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="pt-0.5 px-2 pb-1 md:pt-1 md:px-4 md:pb-3 z-10 flex flex-col items-center bg-transparent">
        <div className="w-full max-w-[680px] flex items-center gap-2 relative">
          <input type="file" ref={fileInputRef} onChange={handleFileAttach} className="hidden" multiple />
          <div className="flex-grow flex flex-col bg-[var(--tg-secondary-bg-color)] rounded-[24px] relative tg-input-bubble-tail" ref={emojiPickerRef}>
            {showEmojiPicker && (
              <div className="absolute bottom-[calc(100%+8px)] left-0 w-[calc(50%+40px)] z-[100] animate-in slide-in-from-bottom-2 fade-in duration-200">
                <div className="overflow-hidden rounded-[20px] shadow-2xl backdrop-blur-xl bg-[var(--tg-secondary-bg-color)]/95">
                  <EmojiPicker
                    onEmojiClick={onEmojiClick}
                    theme={settings.theme === 'dark' ? Theme.DARK : Theme.LIGHT}
                    emojiStyle="apple"
                    skinTonesDisabled
                    searchDisabled={false}
                    width="100%"
                    height={400}
                    lazyLoadEmojis={true}
                    previewConfig={{ showPreview: false }}
                    searchPlaceholder="Search emojis..."
                  />
                </div>
              </div>
            )}
            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${attachments.length > 0 ? 'max-h-[90px] opacity-100' : 'max-h-0 opacity-0'}`}><div className="flex overflow-x-auto px-2 gap-2 custom-scrollbar pt-2 pb-2">{attachments.map(att => (<div key={att.id} className="flex-shrink-0 relative group"><div onClick={() => setPreviewFile(att)} className="cursor-pointer">{att.previewUrl ? <div className="w-14 h-14 rounded-xl overflow-hidden shadow-sm"><img src={att.previewUrl} className="w-full h-full object-cover" /></div> : <div className="w-14 h-14 rounded-xl bg-[var(--tg-bg-color)] shadow-sm flex flex-col items-center justify-center p-1 text-center">{getFileIcon(att)}<span className="text-[8px] truncate w-full">{att.name}</span></div>}</div><button onClick={(e) => { e.stopPropagation(); removeAttachment(att.id); }} className="absolute -top-1 -right-1 bg-[var(--tg-bg-color)] text-red-500 rounded-full shadow-md w-5 h-5 flex items-center justify-center border opacity-0 group-hover:opacity-100 transition-opacity"><X size={12} /></button></div>))}</div></div>
            {attachments.length > 0 && <div className="mx-8 h-[1px] bg-[var(--tg-border-color)] opacity-40" />}
            <div className="flex items-center px-2 py-1 min-h-[48px]">
              <button
                onClick={(e) => { e.stopPropagation(); setShowEmojiPicker(!showEmojiPicker); }}
                className={`p-2 transition-colors ${showEmojiPicker ? 'text-[var(--tg-link-color)]' : 'text-[var(--tg-hint-color)] hover:text-[var(--tg-link-color)]'}`}
              >
                <Smile size={24} />
              </button>
              <textarea
                className="w-full bg-transparent text-[var(--tg-text-color)] py-2.5 px-1 outline-none resize-none max-h-32 text-[16px] leading-tight custom-scrollbar"
                placeholder="Message"
                rows={1}
                value={inputText}
                onChange={(e) => { setInputText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px'; }}
                onKeyDown={handleKeyDown}
              />
              <button onClick={() => fileInputRef.current?.click()} className="p-2 text-[var(--tg-hint-color)] hover:text-[var(--tg-link-color)] transition-colors">
                <Paperclip size={24} />
              </button>
            </div>
          </div>
          <div className="relative flex-shrink-0 flex flex-col items-center">
            <button
              onClick={() => scrollToBottom()}
              className={`absolute left-1/2 -translate-x-1/2 w-[48px] h-[48px] bg-[var(--tg-secondary-bg-color)] hover:bg-[var(--tg-link-color)] text-[var(--tg-hint-color)] hover:text-white rounded-full flex items-center justify-center z-40 transition-all duration-300 ${showScrollDown
                ? 'bottom-[calc(100%+12px)] opacity-100 scale-100 pointer-events-auto'
                : 'bottom-[calc(100%-20px)] opacity-0 scale-90 pointer-events-none'
                }`}
            >
              <ArrowDown size={20} />
            </button>
            <button onClick={handleSendRobust} className="w-[48px] h-[48px] bg-[var(--tg-secondary-bg-color)] text-[var(--tg-hint-color)] hover:bg-[var(--tg-link-color)] hover:text-white rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all flex-shrink-0">{inputText.trim() || attachments.length > 0 ? <SendHorizontal size={20} fill="currentColor" className="ml-0.5" /> : <Mic size={20} />}</button>
          </div>
        </div>
      </div>

      {isCalendarOpen && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center animate-in fade-in duration-200" onClick={() => setIsCalendarOpen(false)}>
          <div className="bg-[var(--tg-bg-color)] w-full max-w-[420px] mx-4 rounded-2xl shadow-2xl p-4 flex flex-col gap-4 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between">
              <button onClick={() => setIsCalendarOpen(false)} className="text-[var(--tg-hint-color)] hover:text-[var(--tg-text-color)] transition-colors">
                <X size={24} />
              </button>
              <h3 className="text-[var(--tg-text-color)] font-semibold text-[17px]">
                {calendarDate.toLocaleDateString([], { month: 'long', year: 'numeric' })}
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))}
                  className="text-[var(--tg-hint-color)] hover:text-[var(--tg-text-color)] transition-colors"
                >
                  <ChevronLeft size={24} />
                </button>
                <button
                  onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))}
                  className="text-[var(--tg-hint-color)] hover:text-[var(--tg-text-color)] transition-colors"
                >
                  <ChevronRight size={24} />
                </button>
              </div>
            </div>

            {/* Weekdays */}
            <div className="grid grid-cols-7 text-center text-[var(--tg-hint-color)] text-[13px] font-medium">
              <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-y-1 text-center">
              {getCalendarDays(calendarDate).map(({ date, isCurrentMonth, isToday }, idx) => {
                const isSelected = selectedDate && isSameDay(date, selectedDate);

                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const compareDate = new Date(date);
                compareDate.setHours(0, 0, 0, 0);
                const isFuture = compareDate > today;

                return (
                  <button
                    key={idx}
                    onClick={() => !isFuture && setSelectedDate(date)}
                    disabled={isFuture}
                    className={`w-10 h-10 mx-auto flex items-center justify-center rounded-full text-[15px] transition-colors ${isCurrentMonth ? 'text-[var(--tg-text-color)]' : 'text-[var(--tg-hint-color)] opacity-50'
                      } ${isSelected ? 'bg-[var(--tg-link-color)] text-white' : ''
                      } ${isToday && !isSelected ? 'border border-[var(--tg-link-color)]' : ''
                      } ${isFuture ? 'opacity-25 cursor-not-allowed' : 'hover:bg-[var(--tg-secondary-bg-color)]'
                      }`}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>

            {/* Action Button */}
            <button
              onClick={() => {
                if (selectedDate) {
                  const msg = activeMessages.find(m => isSameDay(new Date(m.timestamp), selectedDate));
                  if (msg) {
                    scrollToMessage(msg.id);
                  }
                  setIsCalendarOpen(false);
                }
              }}
              className="w-full bg-[var(--tg-button-color)] hover:opacity-90 text-[var(--tg-button-text-color)] font-medium py-3 rounded-xl transition-colors"
            >
              Jump to Date
            </button>
          </div>
        </div>
      )}

      {previewFile && (<div className="fixed inset-0 z-[100] bg-black/90 flex flex-col animate-in fade-in duration-300" onClick={() => setPreviewFile(null)}><div className="h-[60px] flex items-center justify-between px-6 bg-gradient-to-b from-black/50 to-transparent"><div className="flex flex-col text-white"><span className="font-medium truncate max-w-[300px]">{previewFile.name}</span><span className="text-gray-400 text-[12px]">{formatSize(previewFile.size)}</span></div><div className="flex gap-4"><button className="p-2 text-white hover:bg-white/10 rounded-full transition-colors"><Download size={22} /></button><button onClick={() => setPreviewFile(null)} className="p-2 text-white hover:bg-white/10 rounded-full transition-colors"><X size={24} /></button></div></div><div className="flex-grow flex items-center justify-center p-4 overflow-hidden" onClick={e => e.stopPropagation()}>{previewFile.type.startsWith('image/') ? <img src={previewFile.dataUrl || previewFile.previewUrl} className="max-w-full max-h-full object-contain shadow-2xl rounded-lg animate-in zoom-in-95 duration-300" /> : <div className="w-full max-w-4xl h-full bg-[#1e1e1e] rounded-xl shadow-2xl border border-white/10 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4"><div className="h-10 bg-white/5 border-b border-white/10 flex items-center px-4"><div className="flex items-center gap-2">{getFileIcon(previewFile)}<span className="text-gray-400 text-xs uppercase">{previewFile.name.split('.').pop()} File</span></div></div><div className="flex-grow overflow-auto p-6 custom-scrollbar">{previewFile.content ? <pre className="text-gray-300 font-mono text-[14px] leading-relaxed whitespace-pre-wrap">{previewFile.content}</pre> : <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-4"><File size={64} strokeWidth={1} /><span>No text preview available</span></div>}</div></div>}</div></div>)}

      {contextMenu && (
        <div
          className="fixed z-[1000] w-48 bg-[var(--tg-bg-color)] rounded-2xl shadow-2xl overflow-hidden py-1 flex flex-col animate-in zoom-in-95 duration-100"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 200),
            top: Math.min(contextMenu.y, window.innerHeight - 400)
          }}
          onMouseDown={e => e.stopPropagation()}
        >
          <button className="flex items-center gap-3 px-3 py-1.5 hover:bg-[var(--tg-secondary-bg-color)] text-[var(--tg-text-color)] transition-colors text-[14px] group">
            <Reply size={18} className="text-[var(--tg-hint-color)] group-hover:text-[var(--tg-link-color)] transition-colors" />
            <span className="flex-grow text-left">Reply</span>
          </button>

          <button
            onClick={() => { setEditingMessageId(contextMenu.msg.id); setEditingText(contextMenu.msg.content); setContextMenu(null); }}
            className="flex items-center gap-3 px-3 py-1.5 hover:bg-[var(--tg-secondary-bg-color)] text-[var(--tg-text-color)] transition-colors text-[14px] group"
          >
            <Edit2 size={18} className="text-[var(--tg-hint-color)] group-hover:text-[var(--tg-link-color)] transition-colors" />
            <span className="flex-grow text-left">Edit</span>
          </button>

          <button
            onClick={() => handleCopyText(contextMenu.msg.content)}
            className="flex items-center gap-3 px-3 py-1.5 hover:bg-[var(--tg-secondary-bg-color)] text-[var(--tg-text-color)] transition-colors text-[14px] group"
          >
            <Copy size={18} className="text-[var(--tg-hint-color)] group-hover:text-[var(--tg-link-color)] transition-colors" />
            <span className="flex-grow text-left">Copy</span>
          </button>

          {contextMenu.msg.sender === 'user' && contextMenu.msg.id === activeMessages[activeMessages.length - 2]?.id && (
            <button
              onClick={() => { handleRegenerate(contextMenu.msg); setContextMenu(null); }}
              className="flex items-center gap-3 px-3 py-1.5 hover:bg-[var(--tg-secondary-bg-color)] text-[var(--tg-text-color)] transition-colors text-[14px] group"
            >
              <RotateCcw size={18} className="text-[var(--tg-hint-color)] group-hover:text-[var(--tg-link-color)] transition-colors" />
              <span className="flex-grow text-left">Regenerate</span>
            </button>
          )}

          {contextMenu.msg.sender === 'bot' && (contextMenu.msg.stats?.reasoning || contextMenu.msg.stats?.monologue) && (
            <button
              onClick={() => { toggleThought(contextMenu.msg.id); setContextMenu(null); }}
              className="flex items-center gap-3 px-3 py-1.5 hover:bg-[var(--tg-secondary-bg-color)] text-[var(--tg-text-color)] transition-colors text-[14px] group"
            >
              <Smile size={18} className="text-[var(--tg-hint-color)] group-hover:text-[var(--tg-link-color)] transition-colors" />
              <span className="flex-grow text-left">
                {expandedThoughts.has(contextMenu.msg.id) ? 'Hide Thoughts' : 'View Thoughts'}
              </span>
            </button>
          )}

          <button className="flex items-center gap-3 px-3 py-1.5 hover:bg-[var(--tg-secondary-bg-color)] text-[var(--tg-text-color)] transition-colors text-[14px] group">
            <Languages size={18} className="text-[var(--tg-hint-color)] group-hover:text-[var(--tg-link-color)] transition-colors" />
            <span className="flex-grow text-left">Translate</span>
          </button>

          <button className="flex items-center gap-3 px-3 py-1.5 hover:bg-[var(--tg-secondary-bg-color)] text-[var(--tg-text-color)] transition-colors text-[14px] group">
            <CheckCircle2 size={18} className="text-[var(--tg-hint-color)] group-hover:text-[var(--tg-link-color)] transition-colors" />
            <span className="flex-grow text-left">Select</span>
          </button>

          <button
            onClick={() => { handleDeleteMessage(contextMenu.msg); setContextMenu(null); }}
            className="flex items-center gap-3 px-3 py-1.5 hover:bg-red-500/10 text-red-500 transition-colors text-[14px]"
          >
            <Trash2 size={18} />
            <span className="flex-grow text-left">Delete</span>
          </button>

          {contextMenu.msg.stats && (
            <div className="mt-0.5 px-3 py-1.5 bg-[var(--tg-secondary-bg-color)]">
              <div className="flex flex-col gap-1 text-[10px] text-[var(--tg-hint-color)]">
                {contextMenu.msg.sender === 'bot' && contextMenu.msg.stats.model && (
                  <span className="font-semibold opacity-80 border-b border-white/5 pb-1 mb-0.5">{contextMenu.msg.stats.model}</span>
                )}
                <div className="flex items-center gap-2">
                  {contextMenu.msg.sender === 'user' ? (
                    <span>{contextMenu.msg.stats.promptTokens} tkn</span>
                  ) : (
                    <>
                      <span>{contextMenu.msg.stats.completionTokens} tkn</span>
                      {contextMenu.msg.stats.speed > 0 && (
                        <>
                          <span className="opacity-30">|</span>
                          <span>{contextMenu.msg.stats.speed?.toFixed(1) + ' t/s'}</span>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ChatArea;
