import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { X, Moon, Sun, Download, Save, Trash2 } from 'lucide-react';

const SettingsModal = ({ onClose }) => {
  const { settings, updateSettings, contacts, messages, deleteChat } = useAppContext();
  const [localSettings, setLocalSettings] = useState(settings);

  const handleSave = () => {
    updateSettings(localSettings);
    onClose();
  };

  const handleExport = () => {
    const exportData = {
      contacts,
      messages,
      exportDate: new Date().toISOString()
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "tellama_export.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleDeleteAll = () => {
    if(window.confirm('Are you sure you want to delete all chats? This cannot be undone.')) {
      contacts.forEach(c => deleteChat(c.id));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-[var(--tg-bg-color)] w-full max-w-md rounded-xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-[var(--tg-border-color)] flex justify-between items-center bg-[var(--tg-secondary-bg-color)]">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button onClick={onClose} className="p-1 hover:bg-[var(--tg-border-color)] rounded-full transition-colors">
            <X size={20} className="text-[var(--tg-hint-color)]" />
          </button>
        </div>
        
        <div className="p-5 overflow-y-auto space-y-6">
          <div>
            <label className="block text-sm font-medium text-[var(--tg-hint-color)] mb-1">Theme</label>
            <div className="flex gap-2">
              <button 
                onClick={() => setLocalSettings({...localSettings, theme: 'light'})}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border ${localSettings.theme === 'light' ? 'border-[var(--tg-link-color)] bg-[var(--tg-link-color)]/10 text-[var(--tg-link-color)]' : 'border-[var(--tg-border-color)]'}`}
              >
                <Sun size={18} /> Light
              </button>
              <button 
                onClick={() => setLocalSettings({...localSettings, theme: 'dark'})}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border ${localSettings.theme === 'dark' ? 'border-[var(--tg-link-color)] bg-[var(--tg-link-color)]/10 text-[var(--tg-link-color)]' : 'border-[var(--tg-border-color)]'}`}
              >
                <Moon size={18} /> Dark
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--tg-hint-color)] mb-1">llama.cpp API Host & Port</label>
            <input 
              type="text" 
              value={localSettings.host}
              onChange={(e) => setLocalSettings({...localSettings, host: e.target.value})}
              placeholder="http://localhost:8080"
              className="w-full bg-[var(--tg-secondary-bg-color)] text-[var(--tg-text-color)] border border-[var(--tg-border-color)] rounded-lg px-3 py-2 outline-none focus:border-[var(--tg-link-color)]"
            />
            <p className="text-xs text-[var(--tg-hint-color)] mt-1">Make sure the server is started with --host 0.0.0.0 and CORS enabled.</p>
          </div>

          <div className="pt-4 border-t border-[var(--tg-border-color)] space-y-3">
            <button onClick={handleExport} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-[var(--tg-border-color)] hover:bg-[var(--tg-secondary-bg-color)] transition-colors text-[var(--tg-text-color)]">
              <Download size={18} /> Export Chat History
            </button>
            <button onClick={handleDeleteAll} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500/10 transition-colors">
              <Trash2 size={18} /> Delete All Chats
            </button>
          </div>
        </div>

        <div className="p-4 border-t border-[var(--tg-border-color)] flex justify-end">
          <button onClick={handleSave} className="flex items-center gap-2 bg-[var(--tg-button-color)] text-[var(--tg-button-text-color)] px-6 py-2 rounded-lg font-medium hover:opacity-90 transition-opacity">
            <Save size={18} /> Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
