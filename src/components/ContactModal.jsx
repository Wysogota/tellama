import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { X, Check } from 'lucide-react';
import { fetchModelInfo } from '../services/api';
import AvatarUpload from './AvatarUpload';
import TagInput from './TagInput';

const ContactModal = ({ onClose, editingContactId = null }) => {
  const { contacts, addContact, updateContact, settings, allTags } = useAppContext();
  
  const existingContact = editingContactId ? contacts.find(c => c.id === editingContactId) : null;
  
  const [formData, setFormData] = useState(
    existingContact || {
      name: '',
      biography: '',
      age: '',
      gender: '',
      traits: [],
      style: [],
      temperature: 0.7,
      initiativeFrequency: 'never',
      avatar: null
    }
  );

  // Initialize form from existing contact — runs ONCE when modal opens (not on every contacts update).
  // Depending on [existingContact] would reset the form whenever a background pull updates contacts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (existingContact) {
      setFormData({
        ...existingContact,
        age: existingContact.age || '',
        gender: existingContact.gender || '',
        traits: Array.isArray(existingContact.traits) ? existingContact.traits : (existingContact.traits ? [existingContact.traits] : []),
        style: Array.isArray(existingContact.style) ? existingContact.style : (existingContact.style ? [existingContact.style] : [])
      });
    }
  }, [editingContactId]); // intentionally NOT [existingContact]

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

    if (editingContactId) {
      updateContact(editingContactId, formData);
    } else {
      addContact(formData);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--tg-bg-color)] w-full max-w-lg rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 border-b border-[var(--tg-border-color)] flex justify-between items-center bg-[var(--tg-secondary-bg-color)] rounded-t-xl">
          <h2 className="text-lg font-semibold">{editingContactId ? 'Edit Personality' : 'New Contact / Personality'}</h2>
          <button onClick={onClose} className="p-1 hover:bg-[var(--tg-border-color)] rounded-full transition-colors">
            <X size={20} className="text-[var(--tg-hint-color)]" />
          </button>
        </div>
        
        <div className="p-5 overflow-y-auto custom-scrollbar flex-grow">
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

          <form id="contact-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--tg-hint-color)] mb-1">Name / Title *</label>
              <input 
                type="text" 
                required
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder="e.g. John, Assistant, Pirate Captain"
                className="w-full bg-[var(--tg-secondary-bg-color)] text-[var(--tg-text-color)] border border-[var(--tg-border-color)] rounded-lg px-3 py-2 outline-none focus:border-[var(--tg-link-color)]"
              />
            </div>

            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-[var(--tg-hint-color)] mb-1">Age</label>
                <select 
                  value={formData.age}
                  onChange={(e) => setFormData({...formData, age: e.target.value})}
                  className="w-full bg-[var(--tg-secondary-bg-color)] text-[var(--tg-text-color)] border border-[var(--tg-border-color)] rounded-lg px-3 py-2 outline-none focus:border-[var(--tg-link-color)] appearance-none"
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
                  className="w-full bg-[var(--tg-secondary-bg-color)] text-[var(--tg-text-color)] border border-[var(--tg-border-color)] rounded-lg px-3 py-2 outline-none focus:border-[var(--tg-link-color)] appearance-none"
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
                className="w-full bg-[var(--tg-secondary-bg-color)] text-[var(--tg-text-color)] border border-[var(--tg-border-color)] rounded-lg px-3 py-2 outline-none focus:border-[var(--tg-link-color)] resize-y"
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
              <div className="flex justify-between items-center mb-1">
                 <label className="block text-sm font-medium text-[var(--tg-hint-color)]">Temperature (Creativity)</label>
                 <span className="text-sm font-medium">{formData.temperature}</span>
              </div>
              <input 
                type="range" 
                min="0" max="2" step="0.1"
                value={formData.temperature}
                onChange={(e) => setFormData({...formData, temperature: parseFloat(e.target.value)})}
                className="w-full accent-[var(--tg-link-color)]"
              />
              <div className="flex justify-between text-xs text-[var(--tg-hint-color)] mt-1">
                <span>Precise</span>
                <span>Creative</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--tg-hint-color)] mb-1">Spontaneous Messages Frequency</label>
              <select 
                value={formData.initiativeFrequency || 'never'}
                onChange={(e) => setFormData({...formData, initiativeFrequency: e.target.value})}
                className="w-full bg-[var(--tg-secondary-bg-color)] text-[var(--tg-text-color)] border border-[var(--tg-border-color)] rounded-lg px-3 py-2 outline-none focus:border-[var(--tg-link-color)] appearance-none"
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

        <div className="p-4 border-t border-[var(--tg-border-color)] flex justify-end">
          <button 
            type="submit" 
            form="contact-form"
            className="flex items-center gap-2 bg-[var(--tg-button-color)] text-[var(--tg-button-text-color)] px-6 py-2 rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            <Check size={18} /> {editingContactId ? 'Save Changes' : 'Create Contact'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ContactModal;
