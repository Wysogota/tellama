import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import {
  Download, Save, Server, Globe, Cpu,
  Key, XCircle, Loader2, Check, ArrowLeft,
  Moon, Sun, ChevronDown, ChevronUp, Palette, Brain, Layout
} from 'lucide-react';

const SERVER_URL = 'http://localhost:3001';

const PROVIDERS = [
  {
    id: 'llamacpp',
    label: 'llama.cpp',
    desc: 'Local',
    Icon: Server,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    desc: 'Cloud',
    Icon: Globe,
  },
  {
    id: 'nvidia',
    label: 'NVIDIA NIM',
    desc: 'Cloud',
    Icon: Cpu,
  },
];

const MODEL_PLACEHOLDERS = {
  llamacpp: 'e.g. mistral-7b',
  openrouter: 'e.g. openai/gpt-4o',
  nvidia: 'e.g. meta/llama-3.1',
};

const SettingsPanel = ({ onBack }) => {
  const { settings, updateSettings, personas, messages } = useAppContext();
  const [localSettings, setLocalSettings] = useState({ ...settings });

  const [keyInputs, setKeyInputs] = useState({ openrouter: '', nvidia: '', memory_openrouter: '', memory_nvidia: '' });
  const [keyStatus, setKeyStatus] = useState({ openrouter: false, nvidia: false, memory_openrouter: false, memory_nvidia: false });
  const [keyLoading, setKeyLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState({}); // provider -> status
  const [showKey, setShowKey] = useState({ openrouter: false, nvidia: false, memory_openrouter: false, memory_nvidia: false });
  const [expandedSection, setExpandedSection] = useState('appearance');
  
  useEffect(() => {
    setLocalSettings(prev => ({ ...prev, theme: settings.theme }));
  }, [settings.theme]);

  useEffect(() => {
    Promise.all([
      fetch(`${SERVER_URL}/llm/key-status?provider=openrouter`).then(r => r.json()).catch(() => ({ configured: false })),
      fetch(`${SERVER_URL}/llm/key-status?provider=nvidia`).then(r => r.json()).catch(() => ({ configured: false })),
      fetch(`${SERVER_URL}/llm/key-status?provider=memory_openrouter`).then(r => r.json()).catch(() => ({ configured: false })),
      fetch(`${SERVER_URL}/llm/key-status?provider=memory_nvidia`).then(r => r.json()).catch(() => ({ configured: false })),
    ]).then(([or, nv, mor, mnv]) => {
      setKeyStatus({ openrouter: or.configured, nvidia: nv.configured, memory_openrouter: mor.configured, memory_nvidia: mnv.configured });
      setKeyLoading(false);
    });
  }, []);

  // Debounce effect for text settings
  useEffect(() => {
    const timer = setTimeout(() => {
      const changed = {};
      const keysToSync = ['modelName', 'host', 'memoryModelName', 'memoryHost', 'memoryInterval', 'bgIntensity', 'accentColor', 'memoryEnabled', 'provider', 'memoryProvider'];
      
      keysToSync.forEach(key => {
        if (localSettings[key] !== settings[key]) {
          changed[key] = localSettings[key];
        }
      });

      if (Object.keys(changed).length > 0) {
        updateSettings(changed);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [localSettings, settings, updateSettings]);

  const handleSaveKey = async (provider) => {
    const key = keyInputs[provider].trim();
    if (!key) return;

    setSaveStatus(prev => ({ ...prev, [provider]: 'saving' }));
    try {
      const res = await fetch(`${SERVER_URL}/llm/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, key }),
      });
      if (res.ok) {
        setKeyStatus(prev => ({ ...prev, [provider]: true }));
        setKeyInputs(prev => ({ ...prev, [provider]: '' }));
        setSaveStatus(prev => ({ ...prev, [provider]: 'saved' }));
        setTimeout(() => setSaveStatus(prev => ({ ...prev, [provider]: null })), 1500);
      } else {
        setSaveStatus(prev => ({ ...prev, [provider]: 'error' }));
      }
    } catch {
      setSaveStatus(prev => ({ ...prev, [provider]: 'error' }));
    }
  };

  const handleClearKey = async (provider) => {
    await fetch(`${SERVER_URL}/llm/keys/${provider}`, { method: 'DELETE' }).catch(() => {});
    setKeyStatus(prev => ({ ...prev, [provider]: false }));
    setKeyInputs(prev => ({ ...prev, [provider]: '' }));
  };

  const handleExport = () => {
    const exportData = { personas, messages, exportDate: new Date().toISOString() };
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const a = document.createElement('a');
    a.setAttribute('href', dataStr);
    a.setAttribute('download', 'tellama_export.json');
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const currentProvider = localSettings.provider || 'llamacpp';
  const needsApiKey = currentProvider === 'openrouter' || currentProvider === 'nvidia';

  const memProvider = localSettings.memoryProvider || 'llamacpp';
  const memNeedsApiKey = memProvider === 'openrouter' || memProvider === 'nvidia';
  const memKeyName = 'memory_' + memProvider;

  return (
    <div className="flex flex-col h-full bg-[var(--tg-bg-color)]">
      {/* Header */}
      <div className="flex items-center px-4 h-[60px] bg-[var(--tg-bg-color)] flex-shrink-0">
        <button 
          onClick={onBack}
          className="p-2 mr-4 text-[var(--tg-hint-color)] hover:bg-[var(--tg-sidebar-hover)] rounded-full transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
        <h2 className="text-xl font-semibold text-[var(--tg-text-color)]">Settings</h2>
      </div>

      <div className="flex-grow overflow-y-auto custom-scrollbar">
        {/* Appearance Section */}
        <div className="mt-1">
          <button 
            onClick={() => setExpandedSection(expandedSection === 'appearance' ? null : 'appearance')}
            className="mx-2 w-[calc(100%-16px)] flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--tg-sidebar-hover)] transition-all text-left rounded-xl group"
          >
            <div className="w-10 h-10 rounded-full bg-[var(--tg-secondary-bg-color)] flex items-center justify-center text-[var(--tg-hint-color)] group-hover:text-[var(--tg-link-color)] transition-colors">
              <Palette size={20} />
            </div>
            <div className="flex-grow">
              <div className="text-[15px] font-semibold text-[var(--tg-text-color)]">Appearance</div>
              <div className="text-[12px] text-[var(--tg-hint-color)]">Theme, accent colors, and background</div>
            </div>
            {expandedSection === 'appearance' ? <ChevronUp size={20} className="text-[var(--tg-hint-color)]" /> : <ChevronDown size={20} className="text-[var(--tg-hint-color)]" />}
          </button>

          {expandedSection === 'appearance' && (
            <div className="px-5 pb-6 pt-2 space-y-6 animate-in slide-in-from-top-2 duration-200">
              {/* Night Mode Button */}
              <button 
                onClick={() => {
                  const newTheme = localSettings.theme === 'dark' ? 'light' : 'dark';
                  updateSettings({ theme: newTheme });
                }}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-[var(--tg-secondary-bg-color)] border border-[var(--tg-border-color)] hover:border-[var(--tg-link-color)]/40 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[var(--tg-link-color)]/10 flex items-center justify-center text-[var(--tg-link-color)] group-hover:scale-110 transition-transform duration-200">
                    {localSettings.theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="text-[15px] font-medium text-[var(--tg-text-color)]">Night Mode</span>
                    <span className="text-[12px] text-[var(--tg-hint-color)]">
                      {localSettings.theme === 'dark' ? 'Dark theme is active' : 'Light theme is active'}
                    </span>
                  </div>
                </div>
                <div className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors ${
                  localSettings.theme === 'dark' 
                    ? 'bg-[var(--tg-link-color)] text-white' 
                    : 'bg-[var(--tg-sidebar-hover)] text-[var(--tg-hint-color)]'
                }`}>
                  {localSettings.theme === 'dark' ? 'Enabled' : 'Disabled'}
                </div>
              </button>

              <div className="flex flex-wrap gap-3">
                {[
                  { id: 'blue',   color: '#5288c1' },
                  { id: 'green',  color: '#5fb389' },
                  { id: 'orange', color: '#d48b52' },
                  { id: 'red',    color: '#c46b6b' },
                  { id: 'pink',   color: '#c8759d' },
                  { id: 'indigo', color: '#7d70b3' },
                ].map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setLocalSettings({ ...localSettings, accentColor: c.id })}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all
                      ${localSettings.accentColor === c.id
                        ? 'ring-4 ring-[var(--tg-link-color)] ring-offset-2 ring-offset-[var(--tg-bg-color)] scale-110'
                        : 'hover:scale-105'}`}
                    style={{ backgroundColor: c.color }}
                  >
                    {localSettings.accentColor === c.id && (
                      <div className="w-2 h-2 bg-white rounded-full" />
                    )}
                  </button>
                ))}
              </div>

              {/* Background Intensity */}
              <div>
                <label className="block text-[11px] text-[var(--tg-hint-color)] mb-1 flex items-center justify-between">
                  <span>Background Intensity</span>
                  <span className="tabular-nums">{localSettings.bgIntensity}%</span>
                </label>
                <input
                  type="range" min="0" max="100"
                  value={localSettings.bgIntensity}
                  onChange={(e) => setLocalSettings({ ...localSettings, bgIntensity: parseInt(e.target.value) })}
                  className="w-full h-1.5 bg-[var(--tg-secondary-bg-color)] rounded-lg appearance-none cursor-pointer accent-[var(--tg-link-color)]"
                />
              </div>
            </div>
          )}
        </div>

        {/* LLM Provider Section */}
        <div className="mt-1">
          <button 
            onClick={() => setExpandedSection(expandedSection === 'provider' ? null : 'provider')}
            className="mx-2 w-[calc(100%-16px)] flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--tg-sidebar-hover)] transition-all text-left rounded-xl group"
          >
            <div className="w-10 h-10 rounded-full bg-[var(--tg-secondary-bg-color)] flex items-center justify-center text-[var(--tg-hint-color)] group-hover:text-[var(--tg-link-color)] transition-colors">
              <Layout size={20} />
            </div>
            <div className="flex-grow">
              <div className="text-[15px] font-semibold text-[var(--tg-text-color)]">LLM Provider</div>
              <div className="text-[12px] text-[var(--tg-hint-color)]">API host, model, and keys</div>
            </div>
            {expandedSection === 'provider' ? <ChevronUp size={20} className="text-[var(--tg-hint-color)]" /> : <ChevronDown size={20} className="text-[var(--tg-hint-color)]" />}
          </button>

          {expandedSection === 'provider' && (
            <div className="px-5 pb-6 pt-2 space-y-4 animate-in slide-in-from-top-2 duration-200">
              <div className="grid grid-cols-3 gap-2 mt-2">
                {PROVIDERS.map(({ id, label, desc, Icon }) => {
                  const selected = currentProvider === id;
                  return (
                    <button
                      key={id}
                      onClick={() => setLocalSettings({ ...localSettings, provider: id })}
                      className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all text-center
                        ${selected
                          ? 'border-[var(--tg-link-color)] bg-[var(--tg-link-color)]/10'
                          : 'border-[var(--tg-border-color)] hover:border-[var(--tg-link-color)]/40 bg-[var(--tg-secondary-bg-color)]'
                        }`}
                    >
                      <Icon
                        size={20}
                        className={selected ? 'text-[var(--tg-link-color)]' : 'text-[var(--tg-hint-color)]'}
                      />
                      <span className={`text-[11px] font-semibold leading-tight ${selected ? 'text-[var(--tg-link-color)]' : 'text-[var(--tg-text-color)]'}`}>
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] text-[var(--tg-hint-color)] mb-1">Model Name</label>
                  <input
                    type="text"
                    value={localSettings.modelName || ''}
                    onChange={(e) => setLocalSettings({ ...localSettings, modelName: e.target.value })}
                    placeholder={MODEL_PLACEHOLDERS[currentProvider]}
                    className="w-full bg-[var(--tg-secondary-bg-color)] text-[var(--tg-text-color)] border border-[var(--tg-border-color)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--tg-link-color)] transition-colors"
                  />
                </div>

                {currentProvider === 'llamacpp' && (
                  <div>
                    <label className="block text-[11px] text-[var(--tg-hint-color)] mb-1">API Host</label>
                    <input
                      type="text"
                      value={localSettings.host || ''}
                      onChange={(e) => setLocalSettings({ ...localSettings, host: e.target.value })}
                      placeholder="http://localhost:8080"
                      className="w-full bg-[var(--tg-secondary-bg-color)] text-[var(--tg-text-color)] border border-[var(--tg-border-color)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--tg-link-color)] transition-colors"
                    />
                  </div>
                )}

                {needsApiKey && (
                  <div>
                    <label className="block text-[11px] text-[var(--tg-hint-color)] mb-1 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span>API Key</span>
                        {saveStatus[currentProvider] === 'saving' && <Loader2 size={10} className="animate-spin" />}
                        {saveStatus[currentProvider] === 'saved' && <Check size={10} className="text-green-500" />}
                        {saveStatus[currentProvider] === 'error' && <span className="text-red-500 text-[9px]">Error</span>}
                      </div>
                      {keyStatus[currentProvider] && (
                        <button onClick={() => handleClearKey(currentProvider)} className="text-red-400 hover:text-red-500 text-[10px]">Remove</button>
                      )}
                    </label>
                    <div className="relative">
                      <input
                        type={showKey[currentProvider] ? 'text' : 'password'}
                        value={keyInputs[currentProvider]}
                        onChange={(e) => setKeyInputs(prev => ({ ...prev, [currentProvider]: e.target.value }))}
                        onBlur={() => handleSaveKey(currentProvider)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveKey(currentProvider)}
                        placeholder={keyStatus[currentProvider] ? '••••••••' : 'Enter key...'}
                        className="w-full bg-[var(--tg-secondary-bg-color)] text-[var(--tg-text-color)] border border-[var(--tg-border-color)] rounded-lg pl-3 pr-10 py-2 text-sm outline-none focus:border-[var(--tg-link-color)] transition-colors font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(prev => ({ ...prev, [currentProvider]: !prev[currentProvider] }))}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--tg-hint-color)]"
                      >
                        {showKey[currentProvider] ? <XCircle size={14} /> : <Key size={14} />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Memory System Section */}
        <div className="mt-1">
          <button 
            onClick={() => setExpandedSection(expandedSection === 'memory' ? null : 'memory')}
            className="mx-2 w-[calc(100%-16px)] flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--tg-sidebar-hover)] transition-all text-left rounded-xl group"
          >
            <div className="w-10 h-10 rounded-full bg-[var(--tg-secondary-bg-color)] flex items-center justify-center text-[var(--tg-hint-color)] group-hover:text-[var(--tg-link-color)] transition-colors">
              <Brain size={20} />
            </div>
            <div className="flex-grow">
              <div className="text-[15px] font-semibold text-[var(--tg-text-color)]">Memory System</div>
              <div className="text-[12px] text-[var(--tg-hint-color)]">Long-term context and extraction</div>
            </div>
            {expandedSection === 'memory' ? <ChevronUp size={20} className="text-[var(--tg-hint-color)]" /> : <ChevronDown size={20} className="text-[var(--tg-hint-color)]" />}
          </button>

          {expandedSection === 'memory' && (
            <div className="px-5 pb-6 pt-2 space-y-4 animate-in slide-in-from-top-2 duration-200">
              <div className="flex justify-between items-center mt-2">
                <span className="text-[14px] text-[var(--tg-text-color)] font-medium">
                  Enable Memory
                </span>
                <label className="flex items-center cursor-pointer relative">
                  <input 
                    type="checkbox" 
                    className="sr-only" 
                    checked={localSettings.memoryEnabled ?? true}
                    onChange={(e) => setLocalSettings({ ...localSettings, memoryEnabled: e.target.checked })}
                  />
                  <div className={`block w-11 h-6 rounded-full transition-colors ${localSettings.memoryEnabled !== false ? 'bg-[var(--tg-link-color)]' : 'bg-[var(--tg-sidebar-hover)]'}`}></div>
                  <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform duration-200 ${localSettings.memoryEnabled !== false ? 'transform translate-x-5' : ''}`}></div>
                </label>
              </div>

              {(localSettings.memoryEnabled !== false) && (
                <>
                  <div>
                    <label className="block text-[11px] text-[var(--tg-hint-color)] mb-1">
                      Extraction Interval (messages)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={localSettings.memoryInterval ?? 10}
                      onChange={(e) => setLocalSettings({ ...localSettings, memoryInterval: parseInt(e.target.value) || 10 })}
                      className="w-full bg-[var(--tg-secondary-bg-color)] text-[var(--tg-text-color)] border border-[var(--tg-border-color)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--tg-link-color)] transition-colors"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {PROVIDERS.map(({ id, label, desc, Icon }) => {
                      const selected = memProvider === id;
                      return (
                        <button
                          key={'mem-' + id}
                          onClick={() => setLocalSettings({ ...localSettings, memoryProvider: id })}
                          className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all text-center
                            ${selected
                              ? 'border-[var(--tg-link-color)] bg-[var(--tg-link-color)]/10'
                              : 'border-[var(--tg-border-color)] hover:border-[var(--tg-link-color)]/40 bg-[var(--tg-secondary-bg-color)]'
                            }`}
                        >
                          <Icon
                            size={20}
                            className={selected ? 'text-[var(--tg-link-color)]' : 'text-[var(--tg-hint-color)]'}
                          />
                          <span className={`text-[11px] font-semibold leading-tight ${selected ? 'text-[var(--tg-link-color)]' : 'text-[var(--tg-text-color)]'}`}>
                            {label}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] text-[var(--tg-hint-color)] mb-1">Memory Model Name</label>
                      <input
                        type="text"
                        value={localSettings.memoryModelName || ''}
                        onChange={(e) => setLocalSettings({ ...localSettings, memoryModelName: e.target.value })}
                        placeholder={MODEL_PLACEHOLDERS[memProvider]}
                        className="w-full bg-[var(--tg-secondary-bg-color)] text-[var(--tg-text-color)] border border-[var(--tg-border-color)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--tg-link-color)] transition-colors"
                      />
                    </div>

                    {memProvider === 'llamacpp' && (
                      <div>
                        <label className="block text-[11px] text-[var(--tg-hint-color)] mb-1">Memory API Host</label>
                        <input
                          type="text"
                          value={localSettings.memoryHost || ''}
                          onChange={(e) => setLocalSettings({ ...localSettings, memoryHost: e.target.value })}
                          placeholder="http://localhost:8080"
                          className="w-full bg-[var(--tg-secondary-bg-color)] text-[var(--tg-text-color)] border border-[var(--tg-border-color)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--tg-link-color)] transition-colors"
                        />
                      </div>
                    )}

                    {memNeedsApiKey && (
                      <div>
                        <label className="block text-[11px] text-[var(--tg-hint-color)] mb-1 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span>Memory API Key</span>
                            {saveStatus[memKeyName] === 'saving' && <Loader2 size={10} className="animate-spin" />}
                            {saveStatus[memKeyName] === 'saved' && <Check size={10} className="text-green-500" />}
                            {saveStatus[memKeyName] === 'error' && <span className="text-red-500 text-[9px]">Error</span>}
                          </div>
                          {keyStatus[memKeyName] && (
                            <button onClick={() => handleClearKey(memKeyName)} className="text-red-400 hover:text-red-500 text-[10px]">Remove</button>
                          )}
                        </label>
                        <div className="relative">
                          <input
                            type={showKey[memKeyName] ? 'text' : 'password'}
                            value={keyInputs[memKeyName]}
                            onChange={(e) => setKeyInputs(prev => ({ ...prev, [memKeyName]: e.target.value }))}
                            onBlur={() => handleSaveKey(memKeyName)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveKey(memKeyName)}
                            placeholder={keyStatus[memKeyName] ? '••••••••' : 'Enter key...'}
                            className="w-full bg-[var(--tg-secondary-bg-color)] text-[var(--tg-text-color)] border border-[var(--tg-border-color)] rounded-lg pl-3 pr-10 py-2 text-sm outline-none focus:border-[var(--tg-link-color)] transition-colors font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => setShowKey(prev => ({ ...prev, [memKeyName]: !prev[memKeyName] }))}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--tg-hint-color)]"
                          >
                            {showKey[memKeyName] ? <XCircle size={14} /> : <Key size={14} />}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="p-4 bg-[var(--tg-bg-color)] flex-shrink-0">
        <button
          onClick={handleExport}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[var(--tg-border-color)] hover:bg-[var(--tg-secondary-bg-color)] transition-all text-[var(--tg-text-color)] text-[14px] font-medium"
        >
          <Download size={18} /> Export Data
        </button>
      </div>
    </div>
  );
};

export default SettingsPanel;
