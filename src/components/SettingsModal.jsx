import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { X, Download, Save, Trash2 } from 'lucide-react';

const SettingsModal = ({ onClose }) => {
  const { settings, updateSettings, personas, messages, deleteChat } = useAppContext();
  const [localSettings, setLocalSettings] = useState(settings);

  const handleSave = () => {
    updateSettings(localSettings);
    onClose();
  };

  const handleExport = () => {
    const exportData = {
      personas,
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
      // In this app, chatSessions are derived from messages or sessions table. 
      // The context has deleteChat which deletes a session.
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
            <label className="block text-sm font-medium text-[var(--tg-hint-color)] mb-3">Color Theme</label>
            <div className="flex flex-wrap gap-3">
              {[
                { id: 'blue', color: '#5288c1' },
                { id: 'green', color: '#5fb389' },
                { id: 'orange', color: '#d48b52' },
                { id: 'red', color: '#c46b6b' },
                { id: 'pink', color: '#c8759d' },
                { id: 'indigo', color: '#7d70b3' },
              ].map((c) => (
                <button
                  key={c.id}
                  onClick={() => setLocalSettings({...localSettings, accentColor: c.id})}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${localSettings.accentColor === c.id ? 'ring-4 ring-[var(--tg-link-color)] ring-offset-2 ring-offset-[var(--tg-bg-color)] scale-110' : 'hover:scale-105'}`}
                  style={{ backgroundColor: c.color }}
                >
                  {localSettings.accentColor === c.id && <div className="w-2 h-2 bg-white rounded-full"></div>}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-sm font-medium text-[var(--tg-hint-color)]">Background Intensity</label>
              <span className="text-xs font-medium text-[var(--tg-hint-color)]">{localSettings.bgIntensity}%</span>
            </div>
            <input 
              type="range" 
              min="0" 
              max="100" 
              value={localSettings.bgIntensity}
              onChange={(e) => setLocalSettings({...localSettings, bgIntensity: parseInt(e.target.value)})}
              className="w-full h-1.5 bg-[var(--tg-secondary-bg-color)] rounded-lg appearance-none cursor-pointer accent-[var(--tg-link-color)]"
            />
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
