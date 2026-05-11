import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Search, Users, Menu } from 'lucide-react';

const Sidebar = ({ onOpenSettings, onOpenPersonasList, onOpenUserProfile }) => {
  const { personas, chatSessions, activeChatId, setActiveChatId, messages, userProfiles, activeUserProfileId } = useAppContext();
  const [searchQuery, setSearchQuery] = useState('');

  const activeUser = userProfiles.find(p => p.id === activeUserProfileId) || userProfiles[0];

  const filteredChats = chatSessions
    .map(session => ({
      session,
      persona: personas.find(p => p.id === session.persona_id)
    }))
    .filter(({ persona }) => persona && persona.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="w-full md:w-[320px] lg:w-[380px] bg-[var(--tg-sidebar-bg)] md:border-r border-[var(--tg-border-color)] flex flex-col h-full z-10 relative shadow-sm flex-shrink-0">
      <div className="flex items-center px-2 md:px-4 border-b border-[var(--tg-border-color)] h-[60px] flex-shrink-0 bg-[var(--tg-bg-color)]">
        <button 
          onClick={onOpenSettings}
          className="p-2 mr-2 text-[var(--tg-hint-color)] hover:bg-[var(--tg-sidebar-hover)] rounded-full transition-colors"
        >
          <Menu size={24} />
        </button>
        <div className="relative flex-grow">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search size={18} className="text-[var(--tg-hint-color)]" />
          </div>
          <input
            type="text"
            className="w-full bg-[var(--tg-secondary-bg-color)] text-[var(--tg-text-color)] rounded-full py-1.5 pl-10 pr-4 outline-none focus:ring-1 focus:ring-[var(--tg-link-color)] transition-shadow text-sm"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* User Profile Header */}
      {activeUser && (
        <div 
          onClick={onOpenUserProfile}
          className="flex items-center px-4 py-3 border-b border-[var(--tg-border-color)] bg-[var(--tg-secondary-bg-color)] cursor-pointer hover:bg-[var(--tg-sidebar-hover)] transition-all duration-200"
        >
          <div className="w-[42px] h-[42px] rounded-full overflow-hidden bg-gradient-to-br from-purple-400 to-purple-600 flex-shrink-0 flex items-center justify-center text-white font-semibold text-lg mr-3 shadow-sm border border-white/10">
            {activeUser.avatar ? (
              <img src={activeUser.avatar} className="w-full h-full object-cover" />
            ) : (
              activeUser.name.charAt(0).toUpperCase()
            )}
          </div>
          <div className="flex-grow min-w-0">
            <h3 className="font-semibold truncate text-[15px]">{activeUser.name}</h3>
            <p className="text-[13px] text-[var(--tg-link-color)] font-medium">My Persona</p>
          </div>
        </div>
      )}

      <div className="flex-grow overflow-y-auto px-2 py-1">
        {filteredChats.map(({ session, persona }) => {
          const chatData = messages[session.id];
          let lastMessage = null;
          
          if (chatData && chatData.rootId) {
            let curr = chatData.rootId;
            while (curr && chatData.nodes[curr]) {
              lastMessage = chatData.nodes[curr];
              const activeIdx = chatData.activeChildIndex[curr] || 0;
              curr = lastMessage.childrenIds[activeIdx];
            }
          }

          const isActive = activeChatId === session.id;

          return (
            <div
              key={session.id}
              onClick={() => setActiveChatId(session.id)}
              className={`flex items-center px-3 py-[10px] cursor-pointer transition-all duration-200 mb-1 rounded-[10px] ${
                isActive 
                  ? 'bg-[var(--tg-sidebar-active)] text-[var(--tg-sidebar-active-text)]' 
                  : 'hover:bg-[var(--tg-sidebar-hover)] text-[var(--tg-text-color)]'
              }`}
            >
              <div className="w-[54px] h-[54px] rounded-full overflow-hidden bg-gradient-to-br from-blue-400 to-blue-600 flex-shrink-0 flex items-center justify-center text-white font-semibold text-xl mr-3 shadow-sm">
                {persona.avatar ? (
                  <img src={persona.avatar} className="w-full h-full object-cover" />
                ) : (
                  persona.name.charAt(0).toUpperCase()
                )}
              </div>
              <div className="flex-grow min-w-0 flex flex-col justify-center h-full">
                <div className="flex justify-between items-baseline mb-0.5">
                  <h3 className="font-semibold truncate text-[16px]">{persona.name}</h3>
                  {lastMessage && (
                    <span className={`text-[12px] ml-2 flex-shrink-0 ${isActive ? 'text-white/80' : 'text-[var(--tg-hint-color)]'}`}>
                      {new Date(lastMessage.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </span>
                  )}
                </div>
                <p className={`text-[15px] truncate ${isActive ? 'text-white/90' : 'text-[var(--tg-hint-color)]'}`}>
                  {lastMessage ? lastMessage.content : 'No messages yet'}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={onOpenPersonasList}
        className="absolute bottom-6 right-6 w-14 h-14 bg-[var(--tg-button-color)] rounded-full flex items-center justify-center text-[var(--tg-button-text-color)] shadow-lg hover:scale-105 transition-transform active:scale-95"
      >
        <Users size={24} />
      </button>
    </div>
  );
};

export default Sidebar;
