import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import {
  Download, Save, Server, Globe, Cpu,
  Key, XCircle, Loader2, Check, ArrowLeft
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
  const [saveStatus, setSaveStatus] = useState(null);
  const [showKey, setShowKey] = useState({ openrouter: false, nvidia: false, memory_openrouter: false, memory_nvidia: false });

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

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      updateSettings(localSettings);

      for (const provider of ['openrouter', 'nvidia', 'memory_openrouter', 'memory_nvidia']) {
        const key = keyInputs[provider].trim();
        if (!key) continue;
        const res = await fetch(`${SERVER_URL}/llm/keys`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, key }),
        });
        if (res.ok) {
          setKeyStatus(prev => ({ ...prev, [provider]: true }));
          setKeyInputs(prev => ({ ...prev, [provider]: '' }));
        }
      }

      setSaveStatus('saved');
      setTimeout(() => { setSaveStatus(null); }, 1500);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(null), 2000);
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

      <div className="flex-grow overflow-y-auto p-5 space-y-6 custom-scrollbar">
        {/* Color Theme */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--tg-hint-color)] mb-3">
            Color Theme
          </label>
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
        </div>

        {/* Background Intensity */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--tg-hint-color)]">
              Background Intensity
            </label>
            <span className="text-xs font-medium text-[var(--tg-hint-color)] tabular-nums">
              {localSettings.bgIntensity}%
            </span>
          </div>
          <input
            type="range" min="0" max="100"
            value={localSettings.bgIntensity}
            onChange={(e) => setLocalSettings({ ...localSettings, bgIntensity: parseInt(e.target.value) })}
            className="w-full h-1.5 bg-[var(--tg-secondary-bg-color)] rounded-lg appearance-none cursor-pointer accent-[var(--tg-link-color)]"
          />
        </div>

        {/* LLM Provider */}
        <div className="space-y-4">
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--tg-hint-color)]">
            LLM Provider
          </label>
          
          <div className="grid grid-cols-3 gap-2">
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
                  <span>API Key</span>
                  {keyStatus[currentProvider] && (
                    <button onClick={() => handleClearKey(currentProvider)} className="text-red-400 hover:text-red-500 text-[10px]">Remove</button>
                  )}
                </label>
                <div className="relative">
                  <input
                    type={showKey[currentProvider] ? 'text' : 'password'}
                    value={keyInputs[currentProvider]}
                    onChange={(e) => setKeyInputs(prev => ({ ...prev, [currentProvider]: e.target.value }))}
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

        {/* Memory System */}
        <div className="pt-4 border-t border-[var(--tg-border-color)] space-y-4">
          <div className="flex justify-between items-center">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--tg-hint-color)]">
              Memory System
            </label>
            <label className="flex items-center cursor-pointer">
              <div className="relative">
                <input 
                  type="checkbox" 
                  className="sr-only" 
                  checked={localSettings.memoryEnabled ?? true}
                  onChange={(e) => setLocalSettings({ ...localSettings, memoryEnabled: e.target.checked })}
                />
                <div className={`block w-10 h-6 rounded-full transition-colors ${localSettings.memoryEnabled !== false ? 'bg-[var(--tg-link-color)]' : 'bg-[var(--tg-secondary-bg-color)]'}`}></div>
                <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${localSettings.memoryEnabled !== false ? 'transform translate-x-4' : ''}`}></div>
              </div>
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
                      <span>Memory API Key</span>
                      {keyStatus[memKeyName] && (
                        <button onClick={() => handleClearKey(memKeyName)} className="text-red-400 hover:text-red-500 text-[10px]">Remove</button>
                      )}
                    </label>
                    <div className="relative">
                      <input
                        type={showKey[memKeyName] ? 'text' : 'password'}
                        value={keyInputs[memKeyName]}
                        onChange={(e) => setKeyInputs(prev => ({ ...prev, [memKeyName]: e.target.value }))}
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

        <div className="pt-4 border-t border-[var(--tg-border-color)]">
          <button
            onClick={handleExport}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-[var(--tg-border-color)] hover:bg-[var(--tg-secondary-bg-color)] transition-colors text-[var(--tg-text-color)] text-sm"
          >
            <Download size={16} /> Export Data
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-[var(--tg-border-color)] bg-[var(--tg-bg-color)] flex-shrink-0">
        <button
          onClick={handleSave}
          disabled={saveStatus === 'saving'}
          className="w-full flex items-center justify-center gap-2 bg-[var(--tg-button-color)] text-[var(--tg-button-text-color)] py-2.5 rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {saveStatus === 'saving' ? (
            <><Loader2 size={18} className="animate-spin" /> Saving…</>
          ) : saveStatus === 'saved' ? (
            <><Check size={18} /> Saved!</>
          ) : (
            <><Save size={18} /> Save Settings</>
          )}
        </button>
      </div>
    </div>
  );
};

export default SettingsPanel;
