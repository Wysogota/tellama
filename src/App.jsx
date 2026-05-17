import React, { useState } from 'react';
import { AppProvider, useAppContext } from './context/AppContext';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import PersonaModal from './components/PersonaModal';
import UserProfileModal from './components/UserProfileModal';
import AutoInitiator from './components/AutoInitiator';

const MainApp = () => {
  const [showPersonaForm, setShowPersonaForm] = useState(false);
  const [showUserProfile, setShowUserProfile] = useState(false);
  const [editingPersonaId, setEditingPersonaId] = useState(null);
  
  const { activeChatId, setActiveChatId, chatSessions, settings } = useAppContext();

  // History API synchronization for Android back button / Browser back
  React.useEffect(() => {
    const handlePopState = (event) => {
      // If user pressed back, close any open UI elements
      if (showUserProfile) {
        setShowUserProfile(false);
      } else if (showPersonaForm) {
        setShowPersonaForm(false);
        setEditingPersonaId(null);
      } else if (activeChatId) {
        setActiveChatId(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [showUserProfile, showPersonaForm, activeChatId, setActiveChatId]);

  // Track previous states to detect "opening" actions
  const prevStates = React.useRef({ showUserProfile, showPersonaForm, activeChatId });

  // When opening a modal or chat, push to history
  React.useEffect(() => {
    const openedUserProfile = showUserProfile && !prevStates.current.showUserProfile;
    const openedPersonaForm = showPersonaForm && !prevStates.current.showPersonaForm;
    const openedChat = activeChatId && !prevStates.current.activeChatId;

    if (openedUserProfile || openedPersonaForm || openedChat) {
      window.history.pushState({ 
        isTellamaModal: true,
        type: openedUserProfile ? 'profile' : openedPersonaForm ? 'persona' : 'chat'
      }, '');
    }
    prevStates.current = { showUserProfile, showPersonaForm, activeChatId };
  }, [showUserProfile, showPersonaForm, activeChatId]);

  const handleOpenModelInfo = () => {
    if (activeChatId) {
      const activeChat = chatSessions.find(s => s.id === activeChatId);
      if (activeChat) {
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

  React.useEffect(() => {
    if (showPersonaForm && activeChatId && editingPersonaId !== null) {
      const activeChat = chatSessions.find(s => s.id === activeChatId);
      if (activeChat) {
        setEditingPersonaId(activeChat.persona_id);
      }
    }
  }, [activeChatId, showPersonaForm, chatSessions, editingPersonaId]);

  return (
    <div className="h-dvh w-full flex bg-[var(--tg-bg-color)] text-[var(--tg-text-color)] overflow-hidden font-sans">
      <AutoInitiator />
      <div className={`${activeChatId ? 'hidden md:block' : 'block w-full md:w-auto'} h-full`}>
        <Sidebar 
          onEditPersona={(id) => {
            setEditingPersonaId(id);
            setShowPersonaForm(true);
          }}
          onOpenUserProfile={() => setShowUserProfile(true)}
        />
      </div>
      
      <div className={`${activeChatId ? 'block w-full md:w-auto' : 'hidden md:block'} h-full flex-grow flex min-w-0 relative bg-[var(--tg-chat-bg)]`}>
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
          md:relative
          ${showPersonaForm && editingPersonaId ? 'md:w-[400px] lg:w-[450px]' : 'md:w-0'}`}>
          
          {showPersonaForm && editingPersonaId && (
            <div className="w-full md:w-[400px] lg:w-[450px] h-full">
              <PersonaModal 
                isModal={false}
                onClose={() => {
                  if (window.history.state?.isTellamaModal) {
                    window.history.back();
                  } else {
                    setShowPersonaForm(false);
                    setEditingPersonaId(null);
                  }
                }} 
                editingPersonaId={editingPersonaId}
              />
            </div>
          )}
        </div>
      </div>

      {showPersonaForm && !editingPersonaId && (
        <PersonaModal 
          isModal={true}
          onClose={() => {
            if (window.history.state?.isTellamaModal) {
              window.history.back();
            } else {
              setShowPersonaForm(false);
              setEditingPersonaId(null);
            }
          }} 
          editingPersonaId={null}
        />
      )}

      {showUserProfile && (
        <UserProfileModal onClose={() => {
          if (window.history.state?.isTellamaModal) {
            window.history.back();
          } else {
            setShowUserProfile(false);
          }
        }} />
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
