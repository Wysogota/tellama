import React, { useState } from 'react';
import { AppProvider, useAppContext } from './context/AppContext';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import SettingsModal from './components/SettingsModal';
import ContactModal from './components/ContactModal';
import UserProfileModal from './components/UserProfileModal';
import AutoInitiator from './components/AutoInitiator';

const MainApp = () => {
  const [showSettings, setShowSettings] = useState(false);
  const [showNewContact, setShowNewContact] = useState(false);
  const [showUserProfile, setShowUserProfile] = useState(false);
  const [editingContactId, setEditingContactId] = useState(null);
  
  const { activeChatId } = useAppContext();

  const handleOpenModelInfo = () => {
    if (activeChatId) {
      setEditingContactId(activeChatId);
      setShowNewContact(true);
    }
  };

  return (
    <div className="h-screen w-full flex bg-[var(--tg-bg-color)] text-[var(--tg-text-color)] overflow-hidden font-sans">
      <AutoInitiator />
      <div className={`${activeChatId ? 'hidden md:block' : 'block w-full md:w-auto'} h-full`}>
        <Sidebar 
          onOpenSettings={() => setShowSettings(true)} 
          onOpenNewContact={() => {
            setEditingContactId(null);
            setShowNewContact(true);
          }}
          onOpenUserProfile={() => setShowUserProfile(true)}
        />
      </div>
      
      <div className={`${activeChatId ? 'block w-full md:w-auto' : 'hidden md:block'} h-full flex-grow`}>
        <ChatArea onOpenModelInfo={handleOpenModelInfo} />
      </div>

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}

      {showNewContact && (
        <ContactModal 
          onClose={() => {
            setShowNewContact(false);
            setEditingContactId(null);
          }} 
          editingContactId={editingContactId}
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
