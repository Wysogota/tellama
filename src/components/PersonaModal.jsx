import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { X, Check } from 'lucide-react';
import { fetchModelInfo } from '../services/api';
import AvatarUpload from './AvatarUpload';
import TagInput from './TagInput';

const PersonaModal = ({ onClose, editingPersonaId = null, isModal = false }) => {
  const { personas, addPersona, updatePersona, settings, allTags } = useAppContext();
  
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

  useEffect(() => {
    fetchModelInfo(settings.host).then(info => {
      if (info && info.data && info.data.length > 0) {
        setModelInfo(info.data[0].id);
      }
    });
  }, [settings.host]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    if (editingPersonaId) {
      updatePersona(editingPersonaId, formData);
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
