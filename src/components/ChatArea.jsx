import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { Paperclip, SendHorizontal, MoreVertical, Loader2, Edit2, Trash2, RotateCcw, ChevronLeft, ChevronRight, ArrowLeft, CheckCheck, Smile, Mic } from 'lucide-react';
import { generateChatResponse } from '../services/api';

const ChatArea = ({ onOpenModelInfo }) => {
  const { contacts, activeChatId, setActiveChatId, messages, addMessage, updateMessage, setFullMessageContent, deleteMessageNode, switchBranch, settings, userProfiles, activeUserProfileId, deleteChat, getNewAbortSignal, clearGeneration, streamingMessages, updateMessageMetadata } = useAppContext();
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [statusOverride, setStatusOverride] = useState(null);
  const messagesEndRef = useRef(null);

  const activeContact = contacts.find(c => c.id === activeChatId);
  const activeUser = userProfiles.find(p => p.id === activeUserProfileId) || userProfiles[0];
  const chatData = messages[activeChatId];

  // Compute linear path
  const activeMessages = React.useMemo(() => {
    if (!chatData || !chatData.rootId) return [];
    if (Array.isArray(chatData)) return chatData; // Fallback for safety

    const path = [];
    let curr = chatData.rootId;
    while (curr && chatData.nodes[curr]) {
      const node = chatData.nodes[curr];
      path.push(node);
      const activeIdx = chatData.activeChildIndex[curr] || 0;
      curr = node.childrenIds[activeIdx];
    }
    return path;
  }, [chatData]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeMessages.length, isGenerating]);

  const [streamingText, setStreamingText] = useState('');
  const [streamingParentId, setStreamingParentId] = useState(null);

  // Merge local streaming text (manual) with global (spontaneous) for display
  const displayStreamingText = streamingText || streamingMessages[activeChatId] || '';
  const displayIsGenerating = isGenerating || !!streamingMessages[activeChatId];

  // Compute last seen status from the last bot message timestamp
  const lastSeenStatus = React.useMemo(() => {
    const botMessages = activeMessages.filter(m => m.sender === 'bot');
    if (botMessages.length === 0) return 'last seen a long time ago';
    const lastTs = botMessages[botMessages.length - 1].timestamp;
    const diff = Date.now() - lastTs;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
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

  const startGeneration = async (historyToPass, parentNodeId) => {
    setIsGenerating(true);
    setStreamingText('');
    setStreamingParentId(parentNodeId);
    
    // Cancel any in-flight generation for THIS chat only (including spontaneous)
    const signal = getNewAbortSignal(activeChatId, true);
    
    let botResponseText = '';
    let stats = null;
    let aborted = false;
    try {
      const result = await generateChatResponse(settings, activeContact, activeUser, historyToPass, (chunk) => {
        botResponseText += chunk;
        setStreamingText(botResponseText);
        scrollToBottom();
      }, false, signal);
      stats = result.stats;

      // Update the user message's prompt tokens with the actual value from the server
      if (stats && stats.promptTokens) {
        updateMessageMetadata(activeChatId, parentNodeId, { 
          promptTokens: stats.promptTokens,
          isExact: true 
        });
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
          stats: stats
        }, parentNodeId);
      }
      setStreamingText('');
      setStreamingParentId(null);

      // Transition to 'online' status for a few seconds
      if (!aborted && botResponseText) {
        setStatusOverride('online');
        setTimeout(() => {
          setStatusOverride(null);
        }, 4000);
      }
    }
  };

  const handleSendRobust = async () => {
    if (!inputText.trim() || !activeContact || isGenerating) return;
    const userText = inputText.trim();
    setInputText('');
    
    // Add user message to current leaf
    const historyToPass = [...activeMessages, { sender: 'user', content: userText }];
    
    const lastMsgId = activeMessages.length > 0 ? activeMessages[activeMessages.length - 1].id : null;
    const userMsgId = await addMessage(activeChatId, { 
      sender: 'user', 
      content: userText
    }, lastMsgId);
    
    await startGeneration(historyToPass, userMsgId);
  };

  const handleRegenerate = async (msg) => {
    if (isGenerating) return;
    // msg is the bot message we want to regenerate. Its parent is the user message.
    const parentNodeId = msg.parentId;
    
    // Determine history up to parent
    const historyToPass = [];
    let curr = chatData.rootId;
    while (curr && chatData.nodes[curr]) {
      const node = chatData.nodes[curr];
      historyToPass.push(node);
      if (curr === parentNodeId) break;
      const activeIdx = chatData.activeChildIndex[curr] || 0;
      curr = node.childrenIds[activeIdx];
    }

    await startGeneration(historyToPass, parentNodeId);
  };

  const handleEditSubmit = async (msg) => {
    if (!editingText.trim() || isGenerating) return;
    
    if (editingText === msg.content) {
      setEditingMessageId(null);
      return;
    }

    // Branching: Create a new message as a child of msg.parentId
    const newMsgId = addMessage(activeChatId, { sender: msg.sender, content: editingText }, msg.parentId);
    setEditingMessageId(null);

    // If it's a user message, we need to generate a new bot response
    if (msg.sender === 'user') {
      const historyToPass = [];
      let curr = chatData.rootId;
      while (curr && chatData.nodes[curr]) {
        const node = chatData.nodes[curr];
        historyToPass.push(node);
        if (curr === newMsgId) break; // This should be in the path since we just added it and it became active
        const activeIdx = chatData.activeChildIndex[curr] || 0;
        curr = node.childrenIds[activeIdx];
      }
      
      // In case the loop didn't catch it (since newMsgId might not be in the memoized activeMessages yet)
      if (historyToPass.length === 0 || historyToPass[historyToPass.length - 1].id !== newMsgId) {
        historyToPass.push({ sender: 'user', content: editingText });
      }

      await startGeneration(historyToPass, newMsgId);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendRobust();
    }
  };

  if (!activeChatId || !activeContact) {
    return (
      <div className="flex-grow flex flex-col h-full bg-[var(--tg-chat-bg)] relative overflow-hidden">
        <div className="h-[60px] w-full bg-[var(--tg-bg-color)] border-b border-[var(--tg-border-color)] flex-shrink-0 z-10"></div>
        <div className="flex-grow flex items-center justify-center relative">
          <div className="absolute inset-0 bg-cover bg-center bg-no-repeat" style={{ backgroundImage: 'var(--tg-chat-bg-image)' }}></div>
          <div className="absolute inset-0 opacity-[0.05] pointer-events-none" style={{ backgroundSize: '400px' }}></div>
          <div className="bg-[var(--tg-bg-color)] px-4 py-1.5 rounded-full text-sm text-[var(--tg-hint-color)] shadow-sm z-10">
            Select a chat to start messaging
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-grow flex flex-col h-full bg-[var(--tg-chat-bg)] relative overflow-hidden">
      <div className="absolute inset-0 bg-cover bg-center bg-no-repeat" style={{ backgroundImage: 'var(--tg-chat-bg-image)' }}></div>
      <div className="absolute inset-0 opacity-[0.05] pointer-events-none" style={{ backgroundSize: '400px' }}></div>
      
      {/* Header */}
      <div className="h-[60px] flex-shrink-0 bg-[var(--tg-bg-color)] border-b border-[var(--tg-border-color)] flex items-center px-2 md:px-4 z-10 transition-colors shadow-sm">
        <button 
          onClick={() => setActiveChatId(null)}
          className="md:hidden p-2 mr-1 text-[var(--tg-hint-color)] hover:bg-[var(--tg-secondary-bg-color)] rounded-full transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
        <div className="flex-grow flex items-center cursor-pointer overflow-hidden p-1 rounded-lg" onClick={onOpenModelInfo}>
          <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-blue-400 to-blue-600 flex-shrink-0 flex items-center justify-center text-white font-semibold text-lg mr-3 shadow-sm">
            {activeContact.avatar ? (
              <img src={activeContact.avatar} className="w-full h-full object-cover" />
            ) : (
              activeContact.name.charAt(0).toUpperCase()
            )}
          </div>
          <div className="flex flex-col flex-grow">
            <h2 className="font-semibold text-[var(--tg-text-color)] text-[16px] leading-tight">{activeContact.name}</h2>
            <span 
              className="text-[13px] font-medium transition-colors duration-300" 
              style={{ color: (displayIsGenerating || statusOverride === 'online') ? 'var(--tg-link-color)' : 'var(--tg-status-color)' }}
            >
              {displayIsGenerating ? 'typing...' : (statusOverride === 'online' ? 'online' : lastSeenStatus)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button 
            className="p-2 text-red-500/70 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm(`Are you sure you want to delete the chat with ${activeContact.name}?`)) {
                deleteChat(activeContact.id);
              }
            }}
            title="Delete Chat"
          >
            <Trash2 size={20} />
          </button>
          <button className="p-2 text-[var(--tg-hint-color)] hover:bg-[var(--tg-secondary-bg-color)] rounded-full transition-colors">
            <MoreVertical size={20} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-grow overflow-y-auto z-10 custom-scrollbar">
        <div className="max-w-[720px] mx-auto w-full p-4 flex flex-col space-y-2">
        {activeMessages.map((msg) => {
          const isUser = msg.sender === 'user';
          const isEditing = editingMessageId === msg.id;
          
          // Compute sibling info for branching UI
          let siblings = [];
          let currentVariantIndex = 0;
          if (msg.parentId && chatData.nodes[msg.parentId]) {
            siblings = chatData.nodes[msg.parentId].childrenIds;
            currentVariantIndex = chatData.activeChildIndex[msg.parentId] || 0;
          } else if (msg.parentId === null && chatData.rootId) {
            // Root variations logic if we ever support multiple roots, currently single root assumption 
            // but let's keep it simple: no branch UI for root.
          }

          const hasVariants = siblings.length > 1;

          return (
            <div key={msg.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} group`}>

              {isEditing ? (
                <div className={`max-w-[75%] rounded-2xl p-3 shadow-sm bg-[var(--tg-secondary-bg-color)] border border-[var(--tg-link-color)] w-full`}>
                  <textarea 
                    className="w-full bg-transparent text-[var(--tg-text-color)] outline-none resize-y min-h-[60px]"
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    autoFocus
                  />
                  <div className="flex justify-end gap-2 mt-2">
                    <button onClick={() => setEditingMessageId(null)} className="text-xs text-[var(--tg-hint-color)] px-2 py-1">Cancel</button>
                    <button onClick={() => handleEditSubmit(msg)} className="text-xs bg-[var(--tg-button-color)] text-[var(--tg-button-text-color)] px-3 py-1 rounded">Save & Send</button>
                  </div>
                </div>
              ) : (
                <div className={`flex flex-col gap-1 w-full max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
                  {msg.content.split(/\n\s*\n/).filter(p => p.trim() !== '').map((paragraph, pIdx, arr) => {
                    const isFirst = pIdx === 0;
                    const isLast = pIdx === arr.length - 1;
                    
                    let borderRadius = '';
                    if (isUser) {
                      // Outgoing: Top-left and Bottom-left are always 18px
                      // Top-right is 18px ONLY if it's the first paragraph
                      // Bottom-right is ALWAYS 6px (last one gets tail overlay)
                      borderRadius = `18px ${isFirst ? '18px' : '6px'} 6px 18px`;
                    } else {
                      // Incoming: Top-right and Bottom-right are always 18px
                      // Top-left is 18px ONLY if it's the first paragraph
                      // Bottom-left is ALWAYS 6px
                      borderRadius = `${isFirst ? '18px' : '6px'} 18px 18px 6px`;
                    }

                    return (
                      <div 
                        key={pIdx}
                        style={{ borderRadius }}
                        className={`px-3 py-1.5 shadow-sm text-[15px] relative whitespace-pre-wrap break-words ${
                          isUser 
                            ? 'bg-[var(--tg-chat-bubble-out)] text-[var(--tg-chat-bubble-out-text)] tg-bubble-out ' + (isLast ? 'tg-bubble-out-tail' : '')
                            : 'bg-[var(--tg-chat-bubble-in)] text-[var(--tg-chat-bubble-in-text)] tg-bubble-in ' + (isLast ? 'tg-bubble-in-tail' : '')
                        }`}
                      >
                        {paragraph}
                        {isLast && (
                          <div className="text-[11px] text-right mt-1 opacity-70 flex justify-end items-center">
                            {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                             {isUser && <CheckCheck size={16} className="ml-1 opacity-80" />}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className={`flex items-center gap-3 mt-1 opacity-0 group-hover:opacity-100 transition-opacity ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                {!isEditing && (
                  <>
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setEditingMessageId(msg.id); setEditingText(msg.content); }} className="p-1 text-[var(--tg-hint-color)] hover:bg-[var(--tg-secondary-bg-color)] rounded" title="Edit">
                        <Edit2 size={14} />
                      </button>
                      {!isUser && (
                        <button onClick={() => handleRegenerate(msg)} className="p-1 text-[var(--tg-hint-color)] hover:bg-[var(--tg-secondary-bg-color)] rounded" title="Regenerate">
                          <RotateCcw size={14} />
                        </button>
                      )}
                      <button onClick={() => deleteMessageNode(activeChatId, msg.id)} className="p-1 text-red-500 hover:bg-red-500/10 rounded" title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    
                    {msg.stats && (msg.stats.isExact || msg.stats.promptTokens > 0 || msg.stats.completionTokens > 0) && (
                      <div className="text-[10px] text-[var(--tg-hint-color)] flex items-center gap-2 px-1">
                        {isUser ? (
                          msg.stats.promptTokens > 0 && <span>Prompt: {msg.stats.promptTokens} tkn</span>
                        ) : (
                          <>
                            {msg.stats.completionTokens > 0 && <span>{msg.stats.completionTokens} tkn</span>}
                            {msg.stats.speed > 0 && (
                              <>
                                <span className="opacity-30">|</span>
                                <span>{msg.stats.speed?.toFixed(1)} t/s</span>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {hasVariants && !isEditing && (
                <div className={`flex items-center gap-2 mt-1 text-xs text-[var(--tg-hint-color)] ${isUser ? 'mr-2' : 'ml-2'}`}>
                  <button 
                    onClick={() => switchBranch(activeChatId, msg.parentId, Math.max(0, currentVariantIndex - 1))}
                    disabled={currentVariantIndex === 0}
                    className="hover:text-[var(--tg-text-color)] disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span>{currentVariantIndex + 1} / {siblings.length}</span>
                  <button 
                    onClick={() => switchBranch(activeChatId, msg.parentId, Math.min(siblings.length - 1, currentVariantIndex + 1))}
                    disabled={currentVariantIndex === siblings.length - 1}
                    className="hover:text-[var(--tg-text-color)] disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
        
        {displayIsGenerating && displayStreamingText && (
          <div className="flex flex-col gap-1 w-full max-w-[85%] items-start self-start group">
            {displayStreamingText.split(/\n\s*\n/).map((paragraph, pIdx, arr) => (
              <div 
                key={pIdx}
                className={`rounded-[12px] px-3 py-1.5 shadow-sm text-[15px] bg-[var(--tg-chat-bubble-in)] text-[var(--tg-chat-bubble-in-text)] relative whitespace-pre-wrap break-words ${
                  pIdx === arr.length - 1 ? 'rounded-bl-[4px]' : ''
                }`}
              >
                {paragraph}
                {pIdx === arr.length - 1 && (
                  <span className="inline-block w-1 h-4 bg-[var(--tg-link-color)] ml-1 animate-pulse align-middle"></span>
                )}
              </div>
            ))}
          </div>
        )}
        
        {displayIsGenerating && !displayStreamingText && (
           <div className="flex justify-start">
            <div className="max-w-[85%] rounded-[12px] px-4 py-2.5 shadow-sm bg-[var(--tg-chat-bubble-in)] text-[var(--tg-chat-bubble-in-text)] rounded-bl-[4px] flex items-center">
              <Loader2 size={16} className="animate-spin text-[var(--tg-link-color)] mr-2" />
              <span className="text-[14px] text-[var(--tg-hint-color)]">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="p-2 md:p-4 md:pb-6 z-10 flex justify-center bg-transparent">
        <div className="flex items-end w-full max-w-[720px] gap-2">
          {/* Main Input Capsule */}
          <div className="flex-grow flex items-end bg-[var(--tg-secondary-bg-color)] rounded-[24px] shadow-md px-2 py-1 min-h-[50px]">
            <button className="p-3 text-[var(--tg-hint-color)] hover:text-[var(--tg-link-color)] transition-colors">
              <Smile size={24} />
            </button>
            <div className="flex-grow relative">
              <textarea
                className="w-full bg-transparent text-[var(--tg-text-color)] py-3 px-1 outline-none resize-none transition-shadow max-h-32 text-[16px] leading-tight"
                placeholder="Message"
                rows={1}
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
                }}
                onKeyDown={handleKeyDown}
              />
            </div>
            <button className="p-3 text-[var(--tg-hint-color)] hover:text-[var(--tg-link-color)] transition-colors">
              <Paperclip size={24} />
            </button>
          </div>

          {/* Action Button (Mic/Send) */}
          <div className="flex-shrink-0 mb-0.5">
            {inputText.trim() ? (
              <button 
                onClick={handleSendRobust}
                className="w-[50px] h-[50px] bg-gradient-to-br from-[var(--tg-link-color)] to-purple-600 text-white rounded-full flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all"
              >
                <SendHorizontal size={22} fill="currentColor" className="ml-0.5" />
              </button>
            ) : (
              <button className="w-[50px] h-[50px] bg-gradient-to-br from-[var(--tg-link-color)] to-purple-600 text-white rounded-full flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all">
                <Mic size={22} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatArea;
