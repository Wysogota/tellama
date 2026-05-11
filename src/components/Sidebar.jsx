import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Search, Edit, Menu } from 'lucide-react';

const Sidebar = ({ onOpenSettings, onOpenNewContact, onOpenUserProfile }) => {
  const { contacts, activeChatId, setActiveChatId, messages, userProfiles, activeUserProfileId } = useAppContext();
  const [searchQuery, setSearchQuery] = useState('');

  const activeUser = userProfiles.find(p => p.id === activeUserProfileId) || userProfiles[0];

  const filteredContacts = contacts.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-full md:w-[320px] lg:w-[380px] bg-[var(--tg-sidebar-bg)] md:border-r border-[var(--tg-border-color)] flex flex-col h-full z-10 relative shadow-sm flex-shrink-0">
      <div className="flex items-center px-4 py-2 border-b border-[var(--tg-border-color)] h-[56px]">
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
          className="flex items-center px-4 py-3 border-b border-[var(--tg-border-color)] bg-[var(--tg-secondary-bg-color)] cursor-pointer hover:bg-[var(--tg-sidebar-hover)] transition-colors"
        >
          <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-purple-400 to-purple-600 flex-shrink-0 flex items-center justify-center text-white font-semibold text-lg mr-3 shadow-sm">
            {activeUser.avatar ? (
              <img src={activeUser.avatar} className="w-full h-full object-cover" />
            ) : (
              activeUser.name.charAt(0).toUpperCase()
            )}
          </div>
          <div className="flex-grow min-w-0">
            <h3 className="font-medium truncate text-[14px]">{activeUser.name}</h3>
            <p className="text-[12px] text-[var(--tg-link-color)] truncate">My Persona</p>
          </div>
        </div>
      )}

      <div className="flex-grow overflow-y-auto">
        {filteredContacts.map(contact => {
          const chatData = messages[contact.id];
          let lastMessage = null;
          
          if (chatData && chatData.rootId) {
            let curr = chatData.rootId;
            while (curr && chatData.nodes[curr]) {
              lastMessage = chatData.nodes[curr];
              const activeIdx = chatData.activeChildIndex[curr] || 0;
              curr = lastMessage.childrenIds[activeIdx];
            }
          }

          const isActive = activeChatId === contact.id;

          return (
            <div
              key={contact.id}
              onClick={() => setActiveChatId(contact.id)}
              className={`flex items-center px-3 py-2 cursor-pointer transition-colors m-1 rounded-lg ${
                isActive 
                  ? 'bg-[var(--tg-sidebar-active)] text-[var(--tg-sidebar-active-text)]' 
                  : 'hover:bg-[var(--tg-sidebar-hover)] text-[var(--tg-text-color)]'
              }`}
            >
              <div className="w-12 h-12 rounded-full overflow-hidden bg-gradient-to-br from-blue-400 to-blue-600 flex-shrink-0 flex items-center justify-center text-white font-semibold text-lg mr-3">
                {contact.avatar ? (
                  <img src={contact.avatar} className="w-full h-full object-cover" />
                ) : (
                  contact.name.charAt(0).toUpperCase()
                )}
              </div>
              <div className="flex-grow min-w-0 flex flex-col justify-center h-full">
                <div className="flex justify-between items-baseline mb-0.5">
                  <h3 className="font-medium truncate text-[15px]">{contact.name}</h3>
                  {lastMessage && (
                    <span className={`text-xs ml-2 flex-shrink-0 ${isActive ? 'text-white/80' : 'text-[var(--tg-hint-color)]'}`}>
                      {new Date(lastMessage.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </span>
                  )}
                </div>
                <p className={`text-[14px] truncate ${isActive ? 'text-white/90' : 'text-[var(--tg-hint-color)]'}`}>
                  {lastMessage ? lastMessage.content : 'No messages yet'}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={onOpenNewContact}
        className="absolute bottom-6 right-6 w-14 h-14 bg-[var(--tg-button-color)] rounded-full flex items-center justify-center text-[var(--tg-button-text-color)] shadow-lg hover:shadow-xl transition-shadow"
      >
        <Edit size={24} fill="currentColor" />
      </button>
    </div>
  );
};

export default Sidebar;
