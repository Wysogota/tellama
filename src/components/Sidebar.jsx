import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Search, Users, Menu, Plus, Bookmark, Archive, Moon, Settings, Pencil } from 'lucide-react';
import ContactsPanel from './ContactsPanel';
import SettingsPanel from './SettingsPanel';

const Sidebar = ({ onEditPersona }) => {
  const { 
    personas, chatSessions, activeChatId, setActiveChatId, 
    messages, userProfiles, activeUserProfileId, setActiveUserProfileId, 
    addUserProfile, settings, updateSettings 
  } = useAppContext();
  
  const [view, setView] = useState('chats'); // 'chats' | 'contacts' | 'settings'
  const [searchQuery, setSearchQuery] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const menuRef = React.useRef(null);

  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAddProfile = async () => {
    const name = window.prompt('Enter new profile name:');
    if (name) {
      const id = await addUserProfile({ name, biography: '', age: '', gender: '', avatar: null });
      setActiveUserProfileId(id);
    }
    setIsMenuOpen(false);
  };

  const filteredChats = chatSessions
    .map(session => ({
      session,
      persona: personas.find(p => p.id === session.persona_id)
    }))
    .filter(({ persona }) => persona && persona.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const createRipple = (event) => {
    const button = event.currentTarget;
    const circle = document.createElement("span");
    const diameter = Math.max(button.clientWidth, button.clientHeight);
    const radius = diameter / 2;

    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.left = `${event.clientX - button.getBoundingClientRect().left - radius}px`;
    circle.style.top = `${event.clientY - button.getBoundingClientRect().top - radius}px`;
    circle.classList.add("ripple-effect");

    const ripple = button.getElementsByClassName("ripple-effect")[0];
    if (ripple) ripple.remove();

    button.appendChild(circle);
  };

  return (
    <div className="w-full md:w-[400px] lg:w-[450px] bg-[var(--tg-sidebar-bg)] md:border-r border-[var(--tg-border-color)] flex flex-col h-full z-10 relative shadow-sm flex-shrink-0 overflow-hidden">
      
      <div className={`sidebar-view-container h-full view-${view}`}>
        
        {/* VIEW 1: CHATS */}
        <div className="sidebar-view flex flex-col">
          <div className="flex items-center px-4 h-[60px] flex-shrink-0 bg-[var(--tg-bg-color)]">
            <div className="relative" ref={menuRef}>
              <button 
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className={`p-2 mr-2 text-[var(--tg-hint-color)] hover:bg-[var(--tg-sidebar-hover)] rounded-full transition-colors ${isMenuOpen ? 'bg-[var(--tg-sidebar-hover)] text-[var(--tg-link-color)]' : ''}`}
              >
                <Menu size={24} />
              </button>

              {isMenuOpen && (
                <div className="absolute left-0 top-[100%] mt-2 w-[280px] bg-[var(--tg-bg-color)] border border-[var(--tg-border-color)] rounded-2xl shadow-2xl overflow-hidden z-[100] py-2 transition-all flex flex-col">
                  {/* Profile Selection */}
                  <div className="px-2 mb-1">
                    {userProfiles.map(profile => (
                      <button
                        key={profile.id}
                        onClick={() => {
                          setActiveUserProfileId(profile.id);
                          setIsMenuOpen(false);
                        }}
                        className={`w-full flex items-center px-3 py-2 rounded-xl transition-colors ${profile.id === activeUserProfileId ? 'bg-[var(--tg-link-color)] text-white' : 'hover:bg-[var(--tg-sidebar-hover)] text-[var(--tg-text-color)]'}`}
                      >
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-purple-500/20 flex-shrink-0 mr-3 border border-white/10">
                          {profile.avatar ? (
                            <img src={profile.avatar} className="w-full h-full object-cover" />
                          ) : (
                            <div className={`w-full h-full flex items-center justify-center font-bold text-xs ${profile.id === activeUserProfileId ? 'text-white' : 'text-purple-500'}`}>
                              {profile.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <span className="font-medium text-[15px] truncate">{profile.name}</span>
                      </button>
                    ))}
                    
                    <button
                      onClick={handleAddProfile}
                      className="w-full flex items-center px-3 py-2 rounded-xl hover:bg-[var(--tg-sidebar-hover)] text-[var(--tg-text-color)] transition-colors mt-1"
                    >
                      <div className="w-8 h-8 rounded-full bg-[var(--tg-secondary-bg-color)] flex items-center justify-center mr-3 text-[var(--tg-hint-color)]">
                        <Plus size={18} />
                      </div>
                      <span className="text-[15px]">Add Account</span>
                    </button>
                  </div>

                  <div className="h-[1px] bg-[var(--tg-border-color)] mx-3 my-1 opacity-50" />

                  <div className="px-2 space-y-0.5">
                    <button className="w-full flex items-center px-3 py-2.5 rounded-xl hover:bg-[var(--tg-sidebar-hover)] text-[var(--tg-text-color)] transition-colors opacity-50 cursor-default">
                      <Bookmark size={20} className="mr-4 text-[var(--tg-hint-color)]" />
                      <span className="text-[15px]">Saved Messages</span>
                    </button>
                    <button className="w-full flex items-center px-3 py-2.5 rounded-xl hover:bg-[var(--tg-sidebar-hover)] text-[var(--tg-text-color)] transition-colors opacity-50 cursor-default">
                      <Archive size={20} className="mr-4 text-[var(--tg-hint-color)]" />
                      <span className="text-[15px]">Archived Chats</span>
                    </button>
                    <button 
                      onClick={() => { setView('contacts'); setIsMenuOpen(false); }}
                      className="w-full flex items-center px-3 py-2.5 rounded-xl hover:bg-[var(--tg-sidebar-hover)] text-[var(--tg-text-color)] transition-colors"
                    >
                      <Users size={20} className="mr-4 text-[var(--tg-hint-color)]" />
                      <span className="text-[15px]">Contacts</span>
                    </button>
                  </div>

                  <div className="h-[1px] bg-[var(--tg-border-color)] mx-3 my-1 opacity-50" />

                  <div className="px-2 space-y-0.5">
                    <button 
                      onClick={() => { setView('settings'); setIsMenuOpen(false); }}
                      className="w-full flex items-center px-3 py-2.5 rounded-xl hover:bg-[var(--tg-sidebar-hover)] text-[var(--tg-text-color)] transition-colors"
                    >
                      <Settings size={20} className="mr-4 text-[var(--tg-hint-color)]" />
                      <span className="text-[15px]">Settings</span>
                    </button>
                    <button 
                      onClick={() => {
                        updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' });
                        setIsMenuOpen(false);
                      }}
                      className="w-full flex items-center px-3 py-2.5 rounded-xl hover:bg-[var(--tg-sidebar-hover)] text-[var(--tg-text-color)] transition-colors"
                    >
                      <Moon size={20} className="mr-4 text-[var(--tg-hint-color)]" />
                      <span className="text-[15px]">Night Mode</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="relative flex-grow">
              <div className={`flex items-center h-[40px] rounded-full px-3 transition-all duration-200 ${isSearchFocused ? 'bg-[var(--tg-search-bg-focused)] shadow-[0_2px_8px_rgba(0,0,0,0.2)]' : 'bg-[var(--tg-search-bg)]'}`}>
                <Search size={18} className="mr-2 text-[var(--tg-hint-color)] flex-shrink-0" />
                <input
                  type="text"
                  className="w-full bg-transparent text-[var(--tg-text-color)] outline-none text-sm caret-[var(--tg-link-color)]"
                  placeholder="Search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => setIsSearchFocused(false)}
                />
              </div>
            </div>
          </div>

          <div className="flex-grow overflow-y-auto px-2 py-1 custom-scrollbar">
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
                  onClick={(e) => {
                    createRipple(e);
                    setActiveChatId(session.id);
                  }}
                  className={`flex items-center px-3 py-[10px] cursor-pointer transition-all duration-200 mb-1 rounded-[10px] ripple-container select-none ${
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
            onClick={() => setView('contacts')}
            className="absolute bottom-6 right-6 w-14 h-14 bg-[var(--tg-button-color)] rounded-full flex items-center justify-center text-[var(--tg-button-text-color)] shadow-lg hover:scale-105 transition-transform active:scale-95 z-20"
          >
            <Pencil size={24} fill="currentColor" />
          </button>
        </div>

        {/* VIEW 2: CONTACTS */}
        <div className="sidebar-view">
          <ContactsPanel 
            onBack={() => setView('chats')} 
            onEditPersona={onEditPersona}
          />
        </div>

        {/* VIEW 3: SETTINGS */}
        <div className="sidebar-view">
          <SettingsPanel 
            onBack={() => setView('chats')}
          />
        </div>

      </div>
    </div>
  );
};

export default Sidebar;
