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
  
  const { activeChatId, chatSessions } = useAppContext();

  const handleOpenModelInfo = () => {
    if (activeChatId) {
      const activeChat = chatSessions.find(s => s.id === activeChatId);
      if (activeChat) {
        setEditingPersonaId(activeChat.persona_id);
        setShowPersonaForm(true);
      }
    }
  };

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
      
      <div className={`${activeChatId ? 'block w-full md:w-auto' : 'hidden md:block'} h-full flex-grow`}>
        <ChatArea onOpenModelInfo={handleOpenModelInfo} />
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

      {showPersonaForm && (
        <PersonaModal 
          onClose={() => {
            setShowPersonaForm(false);
            setEditingPersonaId(null);
          }} 
          editingPersonaId={editingPersonaId}
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
