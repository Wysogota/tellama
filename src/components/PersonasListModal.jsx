import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Search, X, Plus, MessageSquare, Edit2, Trash2 } from 'lucide-react';

const PersonasListModal = ({ onClose, onEditPersona }) => {
  const { personas, startChat, deletePersona } = useAppContext();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPersonas = personas.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleStartChat = async (personaId) => {
    await startChat(personaId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-[var(--tg-bg-color)] w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--tg-border-color)] bg-[var(--tg-secondary-bg-color)]">
          <h2 className="text-xl font-bold text-[var(--tg-text-color)]">Contacts</h2>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-black/5 text-[var(--tg-hint-color)] transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search & Actions */}
        <div className="p-4 border-b border-[var(--tg-border-color)] flex gap-2">
          <div className="relative flex-grow">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search size={18} className="text-[var(--tg-hint-color)]" />
            </div>
            <input
              type="text"
              className="w-full bg-[var(--tg-secondary-bg-color)] text-[var(--tg-text-color)] rounded-xl py-2 pl-10 pr-4 outline-none focus:ring-2 focus:ring-[var(--tg-link-color)] transition-all"
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button
            onClick={() => onEditPersona(null)}
            className="p-2 bg-[var(--tg-button-color)] text-[var(--tg-button-text-color)] rounded-xl hover:scale-105 transition-transform flex-shrink-0 shadow-sm"
            title="New Contact"
          >
            <Plus size={24} />
          </button>
        </div>

        {/* List */}
        <div className="flex-grow overflow-y-auto p-2">
          {filteredPersonas.length === 0 ? (
            <div className="text-center py-10 text-[var(--tg-hint-color)]">
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
                    <span className="font-semibold text-[var(--tg-text-color)] text-[16px] truncate">{persona.name}</span>
                    {persona.traits && persona.traits.length > 0 && (
                      <span className="text-[13px] text-[var(--tg-hint-color)] truncate">
                        {persona.traits.slice(0, 2).join(', ')}...
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => handleStartChat(persona.id)}
                    className="p-2 text-[var(--tg-link-color)] hover:bg-[var(--tg-link-color)]/10 rounded-full transition-colors"
                    title="Message"
                  >
                    <MessageSquare size={18} />
                  </button>
                  <button 
                    onClick={() => onEditPersona(persona.id)}
                    className="p-2 text-[var(--tg-hint-color)] hover:bg-[var(--tg-secondary-bg-color)] rounded-full transition-colors"
                    title="Edit"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button 
                    onClick={() => {
                      if (window.confirm(`Delete ${persona.name} from contacts?`)) {
                        deletePersona(persona.id);
                      }
                    }}
                    className="p-2 text-red-500/80 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default PersonasListModal;
