import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { X, Check } from 'lucide-react';
import { fetchModelInfo } from '../services/api';
import { findAgentsForPersona, updateLettaAgent, getArchivalMemory } from '../services/lettaService';
import AvatarUpload from './AvatarUpload';
import TagInput from './TagInput';

const PersonaModal = ({ onClose, editingPersonaId = null, isModal = false }) => {
  const { personas, addPersona, updatePersona, settings, allTags, userProfiles, activeUserProfileId } = useAppContext();
  const activeUser = userProfiles?.find(p => p.id === activeUserProfileId) || userProfiles?.[0];
  
  const existingPersona = editingPersonaId ? personas.find(c => c.id === editingPersonaId) : null;
  
  const [formData, setFormData] = useState(
    existingPersona || {
      name: '',
      biography: '',
      age: '',
      gender: '',
      traits: [],
      style: [],
      initiativeFrequency: 'never',
      avatar: null
    }
  );

  // Initialize or reset form
  useEffect(() => {
    if (existingPersona) {
      setFormData({
        ...existingPersona,
        age: existingPersona.age || '',
        gender: existingPersona.gender || '',
        traits: Array.isArray(existingPersona.traits) ? existingPersona.traits : (existingPersona.traits ? [existingPersona.traits] : []),
        style: Array.isArray(existingPersona.style) ? existingPersona.style : (existingPersona.style ? [existingPersona.style] : [])
      });
    } else {
      setFormData({
        name: '',
        biography: '',
        age: '',
        gender: '',
        traits: [],
        style: [],
        initiativeFrequency: 'never',
        avatar: null
      });
    }
  }, [editingPersonaId]);

  const [modelInfo, setModelInfo] = useState(null);
  const [techInfo, setTechInfo] = useState(null);
  const [isTechOpen, setIsTechOpen] = useState(false);
  const [archivalMemory, setArchivalMemory] = useState(null);
  const [isArchivalLoading, setIsArchivalLoading] = useState(false);
  
  useEffect(() => {
    fetchModelInfo(settings.host).then(info => {
      if (info && info.data && info.data.length > 0) {
        setModelInfo(info.data[0].id);
      }
    });
  }, [settings.host]);

  useEffect(() => {
    if (editingPersonaId && activeUser) {
      findAgentsForPersona(editingPersonaId, activeUser).then(agents => {
        if (agents && agents.length > 0) {
          setTechInfo(agents[0]);
        }
      });
    }
  }, [editingPersonaId, activeUser]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    if (editingPersonaId) {
      updatePersona(editingPersonaId, formData);
      if (techInfo) {
        try {
          await updateLettaAgent(techInfo.id, formData, activeUser);
        } catch (err) {
          console.error("Failed to sync Letta agent", err);
        }
      }
    } else {
      addPersona(formData);
    }
    onClose();
  };

  const content = (
    <div className={`w-full h-full bg-[var(--tg-bg-color)] flex flex-col ${isModal ? 'md:max-h-[90vh] md:rounded-xl shadow-2xl overflow-hidden' : ''}`}>
      <div className="px-5 py-4 flex items-center bg-[var(--tg-bg-color)] h-[60px] flex-shrink-0">
        <button onClick={onClose} className="p-2 -ml-2 mr-2 hover:bg-[var(--tg-secondary-bg-color)] rounded-full transition-colors">
          <X size={24} className="text-[var(--tg-hint-color)]" />
        </button>
        <h2 className="text-lg font-semibold truncate">{editingPersonaId ? 'Edit Persona' : 'New Persona'}</h2>
      </div>
      
      <div className="p-5 overflow-y-auto custom-scrollbar flex-grow bg-[var(--tg-bg-color)]">
        {modelInfo && (
          <div className="mb-6 p-3 bg-[var(--tg-secondary-bg-color)] rounded-lg text-sm border border-[var(--tg-border-color)]">
            <span className="text-[var(--tg-hint-color)]">Active Model:</span> 
            <span className="font-medium ml-2">{modelInfo}</span>
          </div>
        )}

        <AvatarUpload 
          avatarBase64={formData.avatar} 
          onAvatarChange={(avatar) => setFormData({...formData, avatar})} 
          nameFallback={formData.name}
        />

        <form id="persona-form" onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div>
            <label className="block text-sm font-medium text-[var(--tg-hint-color)] mb-1">Name</label>
            <input 
              type="text" 
              required
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              placeholder="e.g. John, Assistant, Pirate Captain"
              className="w-full bg-[var(--tg-search-bg)] text-[var(--tg-text-color)] rounded-xl px-4 py-2.5 outline-none transition-all duration-200 focus:bg-[var(--tg-search-bg-focused)] focus:shadow-sm border-none"
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-[var(--tg-hint-color)] mb-1">Age</label>
              <select 
                value={formData.age}
                onChange={(e) => setFormData({...formData, age: e.target.value})}
                className="w-full bg-[var(--tg-search-bg)] text-[var(--tg-text-color)] rounded-xl px-4 py-2.5 outline-none transition-all duration-200 focus:bg-[var(--tg-search-bg-focused)] focus:shadow-sm border-none appearance-none"
              >
                <option value="">Unknown</option>
                {Array.from({ length: 86 }, (_, i) => i + 5).map(age => (
                  <option key={age} value={age}>{age}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-[var(--tg-hint-color)] mb-1">Gender</label>
              <select 
                value={formData.gender}
                onChange={(e) => setFormData({...formData, gender: e.target.value})}
                className="w-full bg-[var(--tg-search-bg)] text-[var(--tg-text-color)] rounded-xl px-4 py-2.5 outline-none transition-all duration-200 focus:bg-[var(--tg-search-bg-focused)] focus:shadow-sm border-none appearance-none"
              >
                <option value="">Not specified</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--tg-hint-color)] mb-1">Biography</label>
            <textarea 
              value={formData.biography}
              onChange={(e) => setFormData({...formData, biography: e.target.value})}
              placeholder="Who is this character? What is their background?"
              rows={3}
              className="w-full bg-[var(--tg-search-bg)] text-[var(--tg-text-color)] rounded-xl px-4 py-2.5 outline-none transition-all duration-200 focus:bg-[var(--tg-search-bg-focused)] focus:shadow-sm border-none resize-y"
            />
          </div>

          <TagInput 
            label="Character Traits"
            tags={formData.traits}
            availableTags={allTags}
            onTagsChange={(newTags) => setFormData({...formData, traits: newTags})}
            placeholder="Add trait (e.g. Sarcastic, Logical)"
          />

          <TagInput 
            label="Communication Style"
            tags={formData.style}
            availableTags={allTags}
            onTagsChange={(newTags) => setFormData({...formData, style: newTags})}
            placeholder="Add style (e.g. Formal, Slang)"
          />
          <div>
            <label className="block text-sm font-medium text-[var(--tg-hint-color)] mb-1">Spontaneous Messages Frequency</label>
            <select 
              value={formData.initiativeFrequency || 'never'}
              onChange={(e) => setFormData({...formData, initiativeFrequency: e.target.value})}
              className="w-full bg-[var(--tg-search-bg)] text-[var(--tg-text-color)] rounded-xl px-4 py-2.5 outline-none transition-all duration-200 focus:bg-[var(--tg-search-bg-focused)] focus:shadow-sm border-none appearance-none"
            >
              <option value="never">Never</option>
              <option value="rare">Rarely</option>
              <option value="normal">Normal</option>
              <option value="often">Often</option>
            </select>
            <p className="text-xs text-[var(--tg-hint-color)] mt-1">Allows the AI to start conversations or send messages without a prompt.</p>
          </div>
        </form>

        {editingPersonaId && (
          <div className="mt-6 border-t border-[var(--tg-border-color)] pt-4">
            <button
              type="button"
              onClick={() => setIsTechOpen(!isTechOpen)}
              className="flex items-center justify-between w-full text-sm font-medium text-[var(--tg-hint-color)] hover:text-[var(--tg-text-color)] transition-colors"
            >
              <span>Technical Information</span>
              <span>{isTechOpen ? 'Hide' : 'Show'}</span>
            </button>
            
            {isTechOpen && (
              <div className="mt-2 p-3 bg-[var(--tg-secondary-bg-color)] rounded-lg text-sm border border-[var(--tg-border-color)] space-y-2">
                {techInfo ? (
                  <>
                    <div className="flex justify-between py-1 border-b border-[var(--tg-border-color)]">
                      <span className="text-[var(--tg-hint-color)]">ID:</span>
                      <span className="font-mono text-xs">{techInfo.id}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[var(--tg-border-color)]">
                      <span className="text-[var(--tg-hint-color)]">Name:</span>
                      <span>{techInfo.name}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[var(--tg-border-color)]">
                      <span className="text-[var(--tg-hint-color)]">Model:</span>
                      <span>{techInfo.model || techInfo.llm_config?.model}</span>
                    </div>
                    
                    {(techInfo.memory?.blocks || techInfo.memory_blocks) && (
                      <div className="pt-2">
                        <span className="text-[var(--tg-hint-color)] text-xs block mb-1">Memory Blocks:</span>
                        {(techInfo.memory?.blocks || techInfo.memory_blocks).map(block => (
                          <div key={block.label} className="mb-2 p-2 bg-[var(--tg-search-bg)] rounded-md text-xs">
                            <span className="font-bold block mb-1">{block.label}</span>
                            <div className="text-[var(--tg-hint-color)] whitespace-pre-wrap">{block.value}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    <div className="pt-2">
                      <span className="text-[var(--tg-hint-color)] text-xs block mb-1">System Prompt:</span>
                      <div className="p-2 bg-[var(--tg-search-bg)] rounded-md text-xs text-[var(--tg-hint-color)] whitespace-pre-wrap max-h-40 overflow-y-auto">
                        {techInfo.system}
                      </div>
                    </div>
                    <div className="pt-2 mt-2 border-t border-[var(--tg-border-color)]">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[var(--tg-hint-color)] text-xs font-bold">Archival Memory</span>
                        <button 
                          type="button"
                          disabled={isArchivalLoading}
                          onClick={async () => {
                            try {
                              setIsArchivalLoading(true);
                              const data = await getArchivalMemory(techInfo.id, activeUser);
                              // Typically the array is inside data.passages, data.memory, or just data
                              const memories = Array.isArray(data) ? data : (data.passages || data.results || []);
                              setArchivalMemory(memories);
                            } catch (e) {
                              alert('Failed to load archival memory: ' + e.message);
                            } finally {
                              setIsArchivalLoading(false);
                            }
                          }}
                          className="px-3 py-1 bg-[var(--tg-button-color)]/10 text-[var(--tg-button-color)] hover:bg-[var(--tg-button-color)]/20 rounded text-xs font-medium transition-colors disabled:opacity-50"
                        >
                          {isArchivalLoading ? 'Loading...' : 'Load Archival Memory'}
                        </button>
                      </div>
                      
                      {archivalMemory !== null && (
                        <div className="space-y-2 mt-2 max-h-40 overflow-y-auto custom-scrollbar">
                          {archivalMemory.length === 0 ? (
                            <div className="text-xs text-[var(--tg-hint-color)] italic">Archival memory is empty.</div>
                          ) : (
                            archivalMemory.map((mem, i) => (
                              <div key={mem.id || i} className="p-2 bg-[var(--tg-search-bg)] rounded-md text-xs">
                                <div className="text-[var(--tg-hint-color)] whitespace-pre-wrap">{mem.text || mem.content || JSON.stringify(mem)}</div>
                                {mem.created_at && (
                                  <div className="text-[10px] text-[var(--tg-hint-color)]/70 mt-1 text-right">
                                    {new Date(mem.created_at).toLocaleString()}
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    <div className="pt-2 mt-2 border-t border-[var(--tg-border-color)] flex justify-between items-center">
                      <span className="text-[var(--tg-hint-color)] text-xs">Force Sync:</span>
                      <button 
                        type="button"
                        onClick={async () => {
                          try {
                            await updateLettaAgent(techInfo.id, formData, activeUser);
                            const agents = await findAgentsForPersona(editingPersonaId, activeUser);
                            if (agents && agents.length > 0) setTechInfo(agents[0]);
                            alert('Agent successfully synchronized!');
                          } catch (e) {
                            alert('Sync failed: ' + e.message);
                          }
                        }}
                        className="px-3 py-1 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded text-xs font-medium transition-colors"
                      >
                        Update Letta Agent
                      </button>
                    </div>
                  </>
                ) : (
                  <span className="text-[var(--tg-hint-color)]">No agent found or loading...</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="p-4 border-t border-[var(--tg-border-color)] flex justify-end bg-[var(--tg-bg-color)]">
        <button 
          type="submit" 
          form="persona-form"
          className="flex items-center justify-center gap-2 bg-[var(--tg-button-color)] text-[var(--tg-button-text-color)] px-6 py-2.5 rounded-lg font-medium hover:opacity-90 transition-opacity w-full shadow-md"
        >
          <Check size={18} /> {editingPersonaId ? 'Save Changes' : 'Create Persona'}
        </button>
      </div>
    </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm">
        <div className="w-full max-w-lg">
          {content}
        </div>
      </div>
    );
  }

  return content;
};

export default PersonaModal;
