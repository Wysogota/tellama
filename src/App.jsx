import React, { useState } from 'react';
import { AppProvider, useAppContext } from './context/AppContext';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import SettingsModal from './components/SettingsModal';
import PersonaModal from './components/PersonaModal';
import PersonasListModal from './components/PersonasListModal';
import UserProfileModal from './components/UserProfileModal';
import AutoInitiator from './components/AutoInitiator';

const MainApp = () => {
  const [showSettings, setShowSettings] = useState(false);
  const [showPersonasList, setShowPersonasList] = useState(false);
  const [showPersonaForm, setShowPersonaForm] = useState(false);
  const [showUserProfile, setShowUserProfile] = useState(false);
  const [editingPersonaId, setEditingPersonaId] = useState(null);
  
  const { activeChatId, chatSessions, settings } = useAppContext();

  const handleOpenModelInfo = () => {
    if (activeChatId) {
      const activeChat = chatSessions.find(s => s.id === activeChatId);
      if (activeChat) {
        // Toggle behavior: if already open, close it
        if (showPersonaForm) {
          setShowPersonaForm(false);
          setEditingPersonaId(null);
        } else {
          setEditingPersonaId(activeChat.persona_id);
          setShowPersonaForm(true);
        }
      }
    }
  };

  // Automatically update persona panel when switching chats
  React.useEffect(() => {
    if (showPersonaForm && activeChatId && editingPersonaId !== null) {
      const activeChat = chatSessions.find(s => s.id === activeChatId);
      if (activeChat) {
        setEditingPersonaId(activeChat.persona_id);
      }
    }
  }, [activeChatId, showPersonaForm, chatSessions, editingPersonaId]);

  return (
    <div className="h-screen w-full flex bg-[var(--tg-bg-color)] text-[var(--tg-text-color)] overflow-hidden font-sans">
      <AutoInitiator />
      <div className={`${activeChatId ? 'hidden md:block' : 'block w-full md:w-auto'} h-full`}>
        <Sidebar 
          onOpenSettings={() => setShowSettings(true)} 
          onOpenPersonasList={() => setShowPersonasList(true)}
          onOpenUserProfile={() => setShowUserProfile(true)}
        />
      </div>
      
      <div className={`${activeChatId ? 'block w-full md:w-auto' : 'hidden md:block'} h-full flex-grow flex min-w-0 relative bg-[var(--tg-chat-bg)]`}>
        {/* Static Background Layer */}
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat pointer-events-none transition-all duration-500" 
          style={{ 
            backgroundImage: 'var(--tg-chat-bg-image)', 
            backgroundColor: 'var(--tg-chat-bg)',
            backgroundBlendMode: settings.theme === 'dark' ? 'soft-light' : 'overlay',
            opacity: 'var(--tg-bg-intensity)' 
          }}
        ></div>
        
        <div className="flex-grow h-full min-w-0 overflow-hidden relative z-10">
          <ChatArea onOpenModelInfo={handleOpenModelInfo} />
        </div>
        
        <div className={`h-full flex-shrink-0 bg-[var(--tg-bg-color)] transition-all duration-300 ease-in-out overflow-hidden
          max-md:fixed max-md:inset-0 max-md:z-[60] max-md:w-full
          ${showPersonaForm && editingPersonaId ? 'max-md:translate-y-0' : 'max-md:-translate-y-full'}
          md:relative md:border-l md:border-[var(--tg-border-color)]
          ${showPersonaForm && editingPersonaId ? 'md:w-[400px] lg:w-[450px]' : 'md:w-0 md:border-none'}`}>
          
          {showPersonaForm && editingPersonaId && (
            <div className="w-full md:w-[400px] lg:w-[450px] h-full">
              <PersonaModal 
                isModal={false}
                onClose={() => {
                  setShowPersonaForm(false);
                  setEditingPersonaId(null);
                }} 
                editingPersonaId={editingPersonaId}
              />
            </div>
          )}
        </div>
      </div>

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}

      {showPersonasList && (
        <PersonasListModal 
          onClose={() => setShowPersonasList(false)}
          onEditPersona={(id) => {
            setEditingPersonaId(id);
            setShowPersonaForm(true);
          }}
        />
      )}

      {showPersonaForm && !editingPersonaId && (
        <PersonaModal 
          isModal={true}
          onClose={() => {
            setShowPersonaForm(false);
            setEditingPersonaId(null);
          }} 
          editingPersonaId={null}
        />
      )}

      {showUserProfile && (
        <UserProfileModal onClose={() => setShowUserProfile(false)} />
      )}
    </div>
  );
};

function App() {
  return (
    <AppProvider>
      <MainApp />
    </AppProvider>
  );
}

export default App;
