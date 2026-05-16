import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import {
  Download, Save, Server, Globe, Cpu,
  Key, XCircle, Loader2, Check, ArrowLeft,
  Moon, Sun, ChevronDown, ChevronUp, Palette, Brain, Layout, ExternalLink, Star,
  Search, X, Eye, EyeOff
} from 'lucide-react';

const SERVER_URL = 'http://localhost:3001';

const PROVIDERS = [
  {
    id: 'llamacpp',
    label: 'llama.cpp',
    desc: 'Local',
    Icon: Server,
    iconUrl: `https://raw.githubusercontent.com/ggerganov/llama.cpp/master/media/llama1-logo.png`
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    desc: 'Cloud',
    Icon: Globe,
    iconUrl: `${SERVER_URL}/llm/icon?domain=openrouter.ai&sz=128`
  },
  {
    id: 'nvidia',
    label: 'NVIDIA NIM',
    desc: 'Cloud',
    Icon: Cpu,
    iconUrl: `${SERVER_URL}/llm/icon?domain=nvidia.com&sz=128`
  },
];

const MODEL_PLACEHOLDERS = {
  llamacpp: 'e.g. mistral-7b',
  openrouter: 'e.g. openai/gpt-4o',
  nvidia: 'e.g. meta/llama-3.1',
};

const getModelBrandIcon = (modelId) => {
  const id = modelId.toLowerCase();
  const getUrl = (domain) => `${SERVER_URL}/llm/icon?domain=${domain}`;

  if (id.includes('openai')) return getUrl('openai.com');
  if (id.includes('google')) return getUrl('google.com');
  if (id.includes('meta') || id.includes('llama')) return getUrl('meta.com');
  if (id.includes('anthropic')) return getUrl('anthropic.com');
  if (id.includes('mistral')) return getUrl('mistral.ai');
  if (id.includes('cohere')) return getUrl('cohere.com');
  if (id.includes('microsoft')) return getUrl('microsoft.com');
  if (id.includes('nvidia')) return getUrl('nvidia.com');
  if (id.includes('perplexity')) return getUrl('perplexity.ai');
  return null;
};

const SettingsPanel = ({ onBack }) => {
  const { settings, updateSettings, personas, messages } = useAppContext();
  const [localSettings, setLocalSettings] = useState({ ...settings });

  const [keyInputs, setKeyInputs] = useState({ openrouter: '', nvidia: '' });
  const [keyStatus, setKeyStatus] = useState({ openrouter: false, nvidia: false });
  const [keyLoading, setKeyLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState({}); // provider -> status
  const [showKey, setShowKey] = useState({ openrouter: false, nvidia: false });
  const [expandedSection, setExpandedSection] = useState('appearance');
  
  const [modelsList, setModelsList] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  
  const modelDropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target)) {
        setIsModelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  useEffect(() => {
    setLocalSettings(prev => ({ ...prev, theme: settings.theme }));
  }, [settings.theme]);

  useEffect(() => {
    Promise.all([
      fetch(`${SERVER_URL}/llm/key-status?provider=openrouter`).then(r => r.json()).catch(() => ({ configured: false })),
      fetch(`${SERVER_URL}/llm/key-status?provider=nvidia`).then(r => r.json()).catch(() => ({ configured: false })),
    ]).then(([or, nv]) => {
      setKeyStatus({ openrouter: or.configured, nvidia: nv.configured });
      setKeyLoading(false);
    });
  }, []);

  useEffect(() => {
    const provider = localSettings.provider || 'llamacpp';
    
    // Restore the model for this provider if it exists
    const providerModel = localSettings[`model_${provider}`];
    if (providerModel !== undefined && providerModel !== localSettings.modelName) {
      setLocalSettings(prev => ({ ...prev, modelName: providerModel }));
    }

    if (provider === 'openrouter' || provider === 'nvidia') {
      setModelsLoading(true);
      fetch(`${SERVER_URL}/llm/models/${provider}`)
        .then(res => res.json())
        .then(data => {
          setModelsList(Array.isArray(data) ? data : []);
          setModelsLoading(false);
        })
        .catch(err => {
          console.error('Failed to fetch models', err);
          setModelsList([]);
          setModelsLoading(false);
        });
    } else {
      setModelsList([]);
    }
  }, [localSettings.provider]);

  // Debounce effect for text settings
  useEffect(() => {
    const timer = setTimeout(() => {
      const changed = {};
      const keysToSync = ['modelName', 'host', 'bgIntensity', 'accentColor', 'provider', 'freeModelsOnly', 'model_llamacpp', 'model_openrouter', 'model_nvidia'];
      
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

  const toggleFavorite = async (e, modelId, isFavorite) => {
    e.stopPropagation();
    try {
      if (isFavorite) {
        await fetch(`${SERVER_URL}/llm/favorites/${encodeURIComponent(modelId)}`, { method: 'DELETE' });
      } else {
        await fetch(`${SERVER_URL}/llm/favorites`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modelId }),
        });
      }
      
      // Update local state
      setModelsList(prev => prev.map(m => 
        m.id === modelId ? { ...m, isFavorite: !isFavorite } : m
      ).sort((a, b) => {
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
        return a.name.localeCompare(b.name);
      }));
    } catch (err) {
      console.error('Failed to toggle favorite', err);
    }
  };

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
                {PROVIDERS.map(({ id, label, Icon, iconUrl }) => {
                  const selected = currentProvider === id;
                  return (
                    <button
                      key={id}
                      onClick={() => setLocalSettings({ ...localSettings, provider: id })}
                      className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 transition-all text-center
                        ${selected
                          ? 'border-[var(--tg-link-color)] bg-[var(--tg-link-color)]/10'
                          : 'border-[var(--tg-border-color)] hover:border-[var(--tg-link-color)]/60 bg-[var(--tg-secondary-bg-color)]'
                        }`}
                    >
                      <div className="w-12 h-7 flex items-center justify-center overflow-hidden mb-0.5">
                        {iconUrl ? (
                          <img src={iconUrl} className={`w-full h-full object-contain ${selected ? '' : 'opacity-70 grayscale-[0.5]'}`} alt="" />
                        ) : (
                          <Icon
                            size={20}
                            className={selected ? 'text-[var(--tg-link-color)]' : 'text-[var(--tg-hint-color)]'}
                          />
                        )}
                      </div>
                      <span className={`text-[11px] font-semibold leading-tight ${selected ? 'text-[var(--tg-link-color)]' : 'text-[var(--tg-text-color)]'}`}>
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-3">
                {needsApiKey ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] text-[var(--tg-hint-color)]">Model Name</label>
                      {currentProvider === 'openrouter' && (
                        <button
                          onClick={() => setLocalSettings(prev => ({ ...prev, freeModelsOnly: !prev.freeModelsOnly }))}
                          className={`text-[10px] px-2 py-0.5 rounded-full transition-colors border ${
                            localSettings.freeModelsOnly 
                              ? 'bg-[var(--tg-link-color)] text-white border-[var(--tg-link-color)]' 
                              : 'bg-transparent text-[var(--tg-hint-color)] border-[var(--tg-border-color)] hover:border-[var(--tg-link-color)]/40'
                          }`}
                        >
                          Free Models Only
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2 items-center">
                      <div className="relative flex-grow" ref={modelDropdownRef}>
                        <button
                          onClick={() => !modelsLoading && setIsModelDropdownOpen(!isModelDropdownOpen)}
                          className={`w-full flex items-center justify-between bg-[var(--tg-secondary-bg-color)] text-[var(--tg-text-color)] border border-[var(--tg-border-color)] rounded-lg px-3 py-2 text-sm outline-none hover:border-[var(--tg-link-color)]/40 transition-all ${isModelDropdownOpen ? 'border-[var(--tg-link-color)] ring-1 ring-[var(--tg-link-color)]/20' : ''}`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            {localSettings.modelName ? (
                              getModelBrandIcon(localSettings.modelName) ? (
                                <div className="w-4 h-4 rounded-full overflow-hidden flex-shrink-0">
                                  <img src={getModelBrandIcon(localSettings.modelName)} className="w-full h-full object-contain" alt="" />
                                </div>
                              ) : (
                                <Brain size={16} className="text-[var(--tg-link-color)] flex-shrink-0" />
                              )
                            ) : (
                              <Brain size={16} className="text-[var(--tg-link-color)] flex-shrink-0" />
                            )}
                            <span className="truncate">
                              {modelsLoading ? 'Loading models...' : (localSettings.modelName || 'Select a model')}
                            </span>
                          </div>
                          <ChevronDown size={14} className={`text-[var(--tg-hint-color)] transition-transform duration-200 ${isModelDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isModelDropdownOpen && (
                          <div className="absolute top-[calc(100%+4px)] left-0 right-0 max-h-[300px] overflow-y-auto bg-[var(--tg-search-bg)] border border-[var(--tg-border-color)] rounded-xl shadow-2xl z-[60] custom-scrollbar animate-in fade-in zoom-in-95 duration-200 origin-top">
                            <div className="mx-1 w-[calc(100%-8px)] px-2 py-3 border-b border-[var(--tg-border-color)] sticky top-0 bg-[var(--tg-search-bg)] z-[70]">
                              <div className="relative">
                                <Search size={20} className="absolute left-[6px] top-1/2 -translate-y-1/2 text-[var(--tg-hint-color)]" />
                                <input 
                                  type="text" 
                                  value={modelSearchQuery}
                                  onChange={(e) => setModelSearchQuery(e.target.value)}
                                  placeholder="Search models..."
                                  className="w-full bg-transparent text-[var(--tg-text-color)] text-[15px] pl-[44px] pr-8 py-1 outline-none border-none transition-colors"
                                  autoFocus
                                  onClick={(e) => e.stopPropagation()}
                                />
                                {modelSearchQuery && (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); setModelSearchQuery(''); }}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--tg-hint-color)] hover:text-[var(--tg-text-color)]"
                                  >
                                    <X size={14} />
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="py-2">
                              {modelsList
                                .filter(m => (!localSettings.freeModelsOnly || m.isFree) && (m.name.toLowerCase().includes(modelSearchQuery.toLowerCase()) || m.id.toLowerCase().includes(modelSearchQuery.toLowerCase())))
                                .map(m => (
                                <div
                                  key={m.id}
                                  onClick={() => {
                                    const provider = localSettings.provider || 'llamacpp';
                                    setLocalSettings({ 
                                      ...localSettings, 
                                      modelName: m.id,
                                      [`model_${provider}`]: m.id
                                    });
                                    setIsModelDropdownOpen(false);
                                  }}
                                  className={`w-[calc(100%-8px)] mx-1 flex items-center gap-3 px-2 py-2 hover:bg-[var(--tg-border-color)] transition-colors rounded-xl text-left cursor-pointer group ${localSettings.modelName === m.id ? 'bg-[var(--tg-border-color)]' : ''}`}
                                >
                                  <div className="w-8 h-8 rounded-full bg-[var(--tg-secondary-bg-color)] flex items-center justify-center text-[var(--tg-link-color)] flex-shrink-0 overflow-hidden">
                                    {getModelBrandIcon(m.id) ? (
                                      <img src={getModelBrandIcon(m.id)} className="w-full h-full rounded-full object-contain" alt="" />
                                    ) : (
                                      <Brain size={18} />
                                    )}
                                  </div>
                                  <div className="flex-grow min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className={`text-[15px] font-semibold truncate ${localSettings.modelName === m.id ? 'text-[var(--tg-link-color)]' : 'text-[var(--tg-text-color)]'}`}>
                                        {m.name}
                                      </span>
                                      <div className="flex items-center gap-0.5 flex-shrink-0">
                                        {m.isFree && (
                                          <div className="flex items-center gap-1 bg-green-500/10 text-green-500 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border border-green-500/20 mr-1">
                                            Free
                                          </div>
                                        )}
                                        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                          <a 
                                            href={m.link} 
                                            target="_blank" 
                                            rel="noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            className="p-1.5 rounded-lg text-[var(--tg-hint-color)] hover:bg-[var(--tg-link-color)]/10 hover:text-[var(--tg-link-color)] transition-colors"
                                            title="View Model Info"
                                          >
                                            <ExternalLink size={14} />
                                          </a>
                                        </div>
                                        <button
                                          onClick={(e) => toggleFavorite(e, m.id, m.isFavorite)}
                                          className={`p-1.5 rounded-lg transition-colors ${m.isFavorite ? 'text-yellow-500 hover:bg-yellow-500/10' : 'text-[var(--tg-hint-color)] hover:bg-[var(--tg-hint-color)]/10'}`}
                                          title={m.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                                        >
                                          <Star size={14} fill={m.isFavorite ? "currentColor" : "none"} />
                                        </button>
                                      </div>
                                    </div>
                                    <p className="text-[12px] text-[var(--tg-hint-color)] truncate opacity-70">
                                      {m.id}
                                    </p>
                                  </div>
                                </div>
                              ))
                            }
                            {modelsList.filter(m => (!localSettings.freeModelsOnly || m.isFree) && (m.name.toLowerCase().includes(modelSearchQuery.toLowerCase()) || m.id.toLowerCase().includes(modelSearchQuery.toLowerCase()))).length === 0 && !modelsLoading && (
                              <div className="px-4 py-8 text-center text-[var(--tg-hint-color)] text-sm italic">
                                No models found
                              </div>
                            )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-[11px] text-[var(--tg-hint-color)] mb-1">Model Name</label>
                    <input
                      type="text"
                      value={localSettings.modelName || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        const provider = localSettings.provider || 'llamacpp';
                        setLocalSettings({ 
                          ...localSettings, 
                          modelName: val,
                          [`model_${provider}`]: val 
                        });
                      }}
                      placeholder={MODEL_PLACEHOLDERS[currentProvider]}
                      className="w-full bg-[var(--tg-secondary-bg-color)] text-[var(--tg-text-color)] border border-[var(--tg-border-color)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--tg-link-color)] transition-colors"
                    />
                  </div>
                )}

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
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] font-medium text-[var(--tg-hint-color)] tracking-wider">API Key</label>
                        {saveStatus[currentProvider] === 'saving' && <Loader2 size={10} className="animate-spin text-[var(--tg-link-color)]" />}
                        {saveStatus[currentProvider] === 'saved' && (
                          <div className="flex items-center gap-1 text-green-500 text-[10px] animate-in fade-in zoom-in duration-300">
                            <Check size={10} /> <span>Saved</span>
                          </div>
                        )}
                        {saveStatus[currentProvider] === 'error' && <span className="text-red-500 text-[10px]">Failed to save</span>}
                      </div>
                      {keyStatus[currentProvider] && (
                        <button 
                          onClick={() => handleClearKey(currentProvider)} 
                          className="text-red-400 hover:text-red-500 text-[10px] hover:underline transition-all"
                        >
                          Reset Key
                        </button>
                      )}
                    </div>
                    
                    <div className="relative group">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tg-hint-color)] group-focus-within:text-[var(--tg-link-color)] transition-colors pointer-events-none">
                        <Key size={14} />
                      </div>
                      <input
                        type={showKey[currentProvider] ? 'text' : 'password'}
                        value={keyInputs[currentProvider]}
                        onChange={(e) => setKeyInputs(prev => ({ ...prev, [currentProvider]: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveKey(currentProvider)}
                        placeholder={keyStatus[currentProvider] ? 'Key is configured ••••••••' : 'Enter your API key...'}
                        disabled={keyStatus[currentProvider] && !keyInputs[currentProvider].trim()}
                        className={`w-full bg-[var(--tg-secondary-bg-color)] text-[var(--tg-text-color)] border border-[var(--tg-border-color)] rounded-xl pl-10 pr-10 py-2.5 text-sm outline-none focus:border-[var(--tg-link-color)] focus:ring-1 focus:ring-[var(--tg-link-color)]/20 transition-all font-mono ${keyStatus[currentProvider] && !keyInputs[currentProvider].trim() ? 'opacity-50 pointer-events-none' : ''}`}
                      />
                      <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {(!keyStatus[currentProvider] || keyInputs[currentProvider].trim()) && (
                          <>
                            <button
                              type="button"
                              onClick={() => setShowKey(prev => ({ ...prev, [currentProvider]: !prev[currentProvider] }))}
                              className="p-1.5 text-[var(--tg-hint-color)] hover:text-[var(--tg-text-color)] hover:bg-[var(--tg-sidebar-hover)] rounded-lg transition-colors"
                              title={showKey[currentProvider] ? "Hide Key" : "Show Key"}
                            >
                              {showKey[currentProvider] ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                            {keyInputs[currentProvider].trim() && (
                              <button
                                onClick={() => handleSaveKey(currentProvider)}
                                disabled={saveStatus[currentProvider] === 'saving'}
                                className="bg-[var(--tg-link-color)] text-white px-3 py-1 rounded-lg text-[11px] font-semibold hover:opacity-90 active:scale-95 transition-all shadow-sm"
                              >
                                {saveStatus[currentProvider] === 'saving' ? '...' : 'Save'}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    {!keyStatus[currentProvider] && !keyInputs[currentProvider] && (
                      <p className="text-[10px] text-[var(--tg-hint-color)] mt-1 opacity-60">
                        {currentProvider === 'openrouter' 
                          ? 'Your key is stored locally and never leaves your browser/server.' 
                          : 'Get your API key from the NVIDIA NIM dashboard.'}
                      </p>
                    )}
                  </div>
                )}
              </div>
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
