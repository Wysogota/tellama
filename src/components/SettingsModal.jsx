import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import {
  X, Download, Save, Trash2, Server, Globe, Cpu,
  Key, CheckCircle2, XCircle, Loader2, Check
} from 'lucide-react';

const SERVER_URL = 'http://localhost:3001';

const PROVIDERS = [
  {
    id: 'llamacpp',
    label: 'llama.cpp',
    desc: 'Local inference server',
    Icon: Server,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    desc: '200+ models · Cloud',
    Icon: Globe,
  },
  {
    id: 'nvidia',
    label: 'NVIDIA NIM',
    desc: 'NVIDIA GPUs · Cloud',
    Icon: Cpu,
  },
];

const MODEL_PLACEHOLDERS = {
  llamacpp: 'e.g. mistral-7b (optional)',
  openrouter: 'e.g. openai/gpt-4o',
  nvidia: 'e.g. meta/llama-3.1-70b-instruct',
};

const SettingsModal = ({ onClose }) => {
  const { settings, updateSettings, personas, messages } = useAppContext();
  const [localSettings, setLocalSettings] = useState({ ...settings });

  // Per-provider key inputs — only populated when user types a new key
  const [keyInputs, setKeyInputs] = useState({ openrouter: '', nvidia: '' });
  // Whether a key is already stored server-side (boolean, not the value)
  const [keyStatus, setKeyStatus] = useState({ openrouter: false, nvidia: false });
  const [keyLoading, setKeyLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState(null); // null | 'saving' | 'saved' | 'error'
  const [showKey, setShowKey] = useState({ openrouter: false, nvidia: false });

  useEffect(() => {
    Promise.all([
      fetch(`${SERVER_URL}/llm/key-status?provider=openrouter`).then(r => r.json()).catch(() => ({ configured: false })),
      fetch(`${SERVER_URL}/llm/key-status?provider=nvidia`).then(r => r.json()).catch(() => ({ configured: false })),
    ]).then(([or, nv]) => {
      setKeyStatus({ openrouter: or.configured, nvidia: nv.configured });
      setKeyLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      updateSettings(localSettings);

      // Push new API keys to server — they never come back to the browser
      for (const provider of ['openrouter', 'nvidia']) {
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
      setTimeout(() => { setSaveStatus(null); onClose(); }, 700);
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

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--tg-bg-color)] w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--tg-border-color)] flex justify-between items-center bg-[var(--tg-secondary-bg-color)] flex-shrink-0">
          <h2 className="text-lg font-semibold text-[var(--tg-text-color)]">Settings</h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-[var(--tg-border-color)] rounded-full transition-colors"
          >
            <X size={18} className="text-[var(--tg-hint-color)]" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-6 flex-grow custom-scrollbar">

          {/* ── Color Theme ───────────────────────────────────────── */}
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

          {/* ── Background Intensity ──────────────────────────────── */}
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

          {/* ── LLM Provider ─────────────────────────────────────── */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--tg-hint-color)] mb-3">
              LLM Provider
            </label>

            {/* Provider selector */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {PROVIDERS.map(({ id, label, desc, Icon }) => {
                const selected = currentProvider === id;
                return (
                  <button
                    key={id}
                    onClick={() => setLocalSettings({ ...localSettings, provider: id })}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center
                      ${selected
                        ? 'border-[var(--tg-link-color)] bg-[var(--tg-link-color)]/10'
                        : 'border-[var(--tg-border-color)] hover:border-[var(--tg-link-color)]/40 bg-[var(--tg-secondary-bg-color)]'
                      }`}
                  >
                    <Icon
                      size={22}
                      className={selected ? 'text-[var(--tg-link-color)]' : 'text-[var(--tg-hint-color)]'}
                    />
                    <span className={`text-[12px] font-semibold leading-tight ${selected ? 'text-[var(--tg-link-color)]' : 'text-[var(--tg-text-color)]'}`}>
                      {label}
                    </span>
                    <span className="text-[10px] text-[var(--tg-hint-color)] leading-tight">{desc}</span>
                  </button>
                );
              })}
            </div>

            {/* Model name — unified for all providers */}
            <div className="mb-3">
              <label className="block text-xs text-[var(--tg-hint-color)] mb-1.5">
                Model Name {currentProvider === 'llamacpp' && <span className="opacity-60">(optional)</span>}
              </label>
              <input
                type="text"
                value={localSettings.modelName || ''}
                onChange={(e) => setLocalSettings({ ...localSettings, modelName: e.target.value })}
                placeholder={MODEL_PLACEHOLDERS[currentProvider]}
                className="w-full bg-[var(--tg-secondary-bg-color)] text-[var(--tg-text-color)] border border-[var(--tg-border-color)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--tg-link-color)] transition-colors"
              />
            </div>

            {/* Host — llama.cpp only */}
            {currentProvider === 'llamacpp' && (
              <div>
                <label className="block text-xs text-[var(--tg-hint-color)] mb-1.5">
                  API Host &amp; Port
                </label>
                <input
                  type="text"
                  value={localSettings.host || ''}
                  onChange={(e) => setLocalSettings({ ...localSettings, host: e.target.value })}
                  placeholder="http://localhost:8080"
                  className="w-full bg-[var(--tg-secondary-bg-color)] text-[var(--tg-text-color)] border border-[var(--tg-border-color)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--tg-link-color)] transition-colors"
                />
                <p className="text-[11px] text-[var(--tg-hint-color)] mt-1">
                  Start with <code className="bg-[var(--tg-secondary-bg-color)] px-1 rounded">--host 0.0.0.0</code> and CORS enabled.
                </p>
              </div>
            )}

            {/* API Key — OpenRouter / NVIDIA only */}
            {needsApiKey && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-[var(--tg-hint-color)] flex items-center gap-1.5">
                    <Key size={12} /> API Key
                  </label>
                  {keyLoading ? (
                    <Loader2 size={12} className="animate-spin text-[var(--tg-hint-color)]" />
                  ) : keyStatus[currentProvider] && !keyInputs[currentProvider] ? (
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 text-[11px] text-green-500 font-medium">
                        <CheckCircle2 size={12} /> Configured
                      </span>
                      <button
                        onClick={() => handleClearKey(currentProvider)}
                        className="text-[11px] text-red-400 hover:text-red-500 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="relative">
                  <input
                    type={showKey[currentProvider] ? 'text' : 'password'}
                    value={keyInputs[currentProvider]}
                    onChange={(e) => setKeyInputs(prev => ({ ...prev, [currentProvider]: e.target.value }))}
                    placeholder={
                      keyStatus[currentProvider]
                        ? '••••••••  (leave blank to keep current)'
                        : currentProvider === 'openrouter' ? 'sk-or-...' : 'nvapi-...'
                    }
                    className="w-full bg-[var(--tg-secondary-bg-color)] text-[var(--tg-text-color)] border border-[var(--tg-border-color)] rounded-lg pl-3 pr-10 py-2 text-sm outline-none focus:border-[var(--tg-link-color)] transition-colors font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(prev => ({ ...prev, [currentProvider]: !prev[currentProvider] }))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--tg-hint-color)] hover:text-[var(--tg-text-color)] transition-colors p-1"
                    title={showKey[currentProvider] ? 'Hide' : 'Show'}
                  >
                    {showKey[currentProvider] ? <XCircle size={15} /> : <Key size={15} />}
                  </button>
                </div>

                <p className="text-[11px] text-[var(--tg-hint-color)] mt-1.5">
                  {currentProvider === 'openrouter'
                    ? <>Get your key at <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="text-[var(--tg-link-color)] hover:underline">openrouter.ai/keys</a>. Stored securely on the local server only.</>
                    : <>Get your key at <a href="https://build.nvidia.com" target="_blank" rel="noreferrer" className="text-[var(--tg-link-color)] hover:underline">build.nvidia.com</a>. Stored securely on the local server only.</>
                  }
                </p>
              </div>
            )}
          </div>

          {/* ── Data ─────────────────────────────────────────────── */}
          <div className="pt-4 border-t border-[var(--tg-border-color)] space-y-2">
            <button
              onClick={handleExport}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-[var(--tg-border-color)] hover:bg-[var(--tg-secondary-bg-color)] transition-colors text-[var(--tg-text-color)] text-sm"
            >
              <Download size={16} /> Export Chat History
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--tg-border-color)] flex justify-end flex-shrink-0 bg-[var(--tg-secondary-bg-color)]">
          <button
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            className="flex items-center gap-2 bg-[var(--tg-button-color)] text-[var(--tg-button-text-color)] px-6 py-2 rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-60 min-w-[130px] justify-center"
          >
            {saveStatus === 'saving' ? (
              <><Loader2 size={16} className="animate-spin" /> Saving…</>
            ) : saveStatus === 'saved' ? (
              <><Check size={16} /> Saved!</>
            ) : saveStatus === 'error' ? (
              <><XCircle size={16} /> Error</>
            ) : (
              <><Save size={16} /> Save Settings</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
