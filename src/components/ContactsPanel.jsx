import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Search, Plus, Edit2, Trash2, ArrowLeft, MessageSquarePlus } from 'lucide-react';

const ContactsPanel = ({ onBack, onEditPersona }) => {
  const { personas, startChat, deletePersona } = useAppContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const filteredPersonas = personas.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleStartChat = async (personaId, forceNew = false) => {
    await startChat(personaId, { forceNew });
    onBack(); 
  };

  return (
    <div className="flex flex-col h-full bg-[var(--tg-bg-color)] relative">
      {/* Header with Integrated Search (Synchronized with Sidebar style) */}
      <div className="flex items-center px-2 h-[60px] bg-[var(--tg-bg-color)] flex-shrink-0 gap-1">
        <button 
          onClick={() => {
            if (window.history.state?.isSidebarInternal) {
              window.history.back();
            } else {
              onBack();
            }
          }}
          className="p-2 text-[var(--tg-hint-color)] hover:bg-[var(--tg-sidebar-hover)] rounded-full transition-colors flex-shrink-0"
        >
          <ArrowLeft size={24} />
        </button>
        
        <div className="relative flex-grow mr-2">
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

      {/* List */}
      <div className="flex-grow overflow-y-auto p-2 custom-scrollbar">
        {filteredPersonas.length === 0 ? (
          <div className="text-center py-10 text-[var(--tg-hint-color)] text-sm">
            No contacts found.
          </div>
        ) : (
          filteredPersonas.map(persona => (
            <div key={persona.id} className="flex items-center justify-between p-3 hover:bg-[var(--tg-secondary-bg-color)] rounded-xl transition-colors group">
              <div 
                className="flex items-center cursor-pointer flex-grow min-w-0 mr-4"
                onClick={() => handleStartChat(persona.id)}
              >
                <div className="w-12 h-12 rounded-full overflow-hidden bg-gradient-to-br from-blue-400 to-blue-600 flex-shrink-0 flex items-center justify-center text-white font-semibold text-lg mr-4 shadow-sm">
                  {persona.avatar ? (
                    <img src={persona.avatar} className="w-full h-full object-cover" />
                  ) : (
                    persona.name.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-semibold text-[var(--tg-text-color)] text-[15px] truncate">{persona.name}</span>
                  {persona.traits && persona.traits.length > 0 && (
                    <span className="text-[12px] text-[var(--tg-hint-color)] truncate">
                      {persona.traits.slice(0, 2).join(', ')}
                    </span>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-0.5">
                <button 
                  onClick={() => handleStartChat(persona.id, true)}
                  className="p-2 text-[var(--tg-link-color)] hover:bg-[var(--tg-sidebar-hover)] rounded-full transition-colors"
                  title="New Chat"
                >
                  <MessageSquarePlus size={20} />
                </button>
                <button 
                  onClick={() => onEditPersona(persona.id)}
                  className="p-2 text-[var(--tg-hint-color)] hover:bg-[var(--tg-sidebar-hover)] rounded-full transition-colors"
                  title="Edit"
                >
                  <Edit2 size={16} />
                </button>
                <button 
                  onClick={() => {
                    if (window.confirm(`Delete ${persona.name}?`)) {
                      deletePersona(persona.id);
                    }
                  }}
                  className="p-2 text-red-500/70 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-colors"
                  title="Delete"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Floating Action Button */}
      <button
        onClick={() => onEditPersona(null)}
        className="absolute bottom-6 right-6 w-14 h-14 bg-[var(--tg-button-color)] rounded-full flex items-center justify-center text-[var(--tg-button-text-color)] shadow-lg hover:scale-105 transition-transform active:scale-95 z-20"
      >
        <Plus size={28} />
      </button>
    </div>
  );
};

export default ContactsPanel;
