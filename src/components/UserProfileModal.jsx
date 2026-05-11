import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { X, Check, Plus, Trash2 } from 'lucide-react';
import AvatarUpload from './AvatarUpload';

const UserProfileModal = ({ onClose }) => {
  const { 
    userProfiles, 
    activeUserProfileId, 
    setActiveUserProfileId,
    addUserProfile, 
    updateUserProfile, 
    deleteUserProfile 
  } = useAppContext();
  
  const [editingProfileId, setEditingProfileId] = useState(activeUserProfileId);
  const activeProfile = userProfiles.find(p => p.id === editingProfileId) || userProfiles[0];
  
  const [formData, setFormData] = useState({ ...activeProfile });

  const handleSelectProfile = (id) => {
    setEditingProfileId(id);
    setFormData({ ...userProfiles.find(p => p.id === id) });
  };

  const handleCreateNew = () => {
    const newId = addUserProfile({
      name: 'New Persona',
      biography: '',
      avatar: null
    });
    setEditingProfileId(newId);
    setFormData({
      id: newId,
      name: 'New Persona',
      biography: '',
      avatar: null
    });
  };

  const handleSave = () => {
    if (!formData.name.trim()) return;
    updateUserProfile(editingProfileId, formData);
  };

  const handleActivate = () => {
    handleSave();
    setActiveUserProfileId(editingProfileId);
    onClose();
  };

  const handleDelete = () => {
    if (userProfiles.length > 1) {
      if(window.confirm('Delete this persona?')) {
        deleteUserProfile(editingProfileId);
        const nextId = userProfiles.find(p => p.id !== editingProfileId).id;
        handleSelectProfile(nextId);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--tg-bg-color)] w-full max-w-2xl rounded-xl shadow-2xl flex flex-col max-h-[90vh] md:flex-row">
        
        {/* Left Side: List of Profiles */}
        <div className="w-full md:w-1/3 border-b md:border-b-0 md:border-r border-[var(--tg-border-color)] flex flex-col bg-[var(--tg-secondary-bg-color)] rounded-l-xl">
          <div className="p-4 border-b border-[var(--tg-border-color)] flex justify-between items-center">
            <h2 className="font-semibold text-[var(--tg-text-color)]">My Personas</h2>
            <button onClick={handleCreateNew} className="p-1 hover:bg-[var(--tg-border-color)] rounded-full text-[var(--tg-link-color)] transition-colors">
              <Plus size={20} />
            </button>
          </div>
          <div className="flex-grow overflow-y-auto p-2">
            {userProfiles.map(profile => (
              <div 
                key={profile.id}
                onClick={() => handleSelectProfile(profile.id)}
                className={`p-2 mb-1 flex items-center rounded-lg cursor-pointer transition-colors ${editingProfileId === profile.id ? 'bg-[var(--tg-link-color)]/10 border border-[var(--tg-link-color)]' : 'hover:bg-[var(--tg-border-color)] border border-transparent'}`}
              >
                <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold text-sm overflow-hidden flex-shrink-0">
                  {profile.avatar ? <img src={profile.avatar} className="w-full h-full object-cover" /> : profile.name.charAt(0).toUpperCase()}
                </div>
                <div className="ml-3 truncate">
                  <p className="text-sm font-medium truncate text-[var(--tg-text-color)]">{profile.name}</p>
                  {activeUserProfileId === profile.id && (
                    <p className="text-xs text-[var(--tg-link-color)]">Active</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: Edit Form */}
        <div className="w-full md:w-2/3 flex flex-col">
          <div className="px-5 py-4 border-b border-[var(--tg-border-color)] flex justify-between items-center bg-[var(--tg-secondary-bg-color)] rounded-tr-xl">
            <h2 className="text-lg font-semibold">Edit Persona</h2>
            <button onClick={onClose} className="p-1 hover:bg-[var(--tg-border-color)] rounded-full transition-colors">
              <X size={20} className="text-[var(--tg-hint-color)]" />
            </button>
          </div>
          
          <div className="p-5 overflow-y-auto custom-scrollbar flex-grow">
            <AvatarUpload 
              avatarBase64={formData.avatar} 
              onAvatarChange={(avatar) => setFormData({...formData, avatar})} 
              nameFallback={formData.name}
            />

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--tg-hint-color)] mb-1">Your Name</label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="How you want to be called"
                  className="w-full bg-[var(--tg-secondary-bg-color)] text-[var(--tg-text-color)] border border-[var(--tg-border-color)] rounded-lg px-3 py-2 outline-none focus:border-[var(--tg-link-color)]"
                />
              </div>

              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-[var(--tg-hint-color)] mb-1">Your Age</label>
                  <select 
                    value={formData.age || ''}
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
                  <label className="block text-sm font-medium text-[var(--tg-hint-color)] mb-1">Your Gender</label>
                  <select 
                    value={formData.gender || ''}
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
                <label className="block text-sm font-medium text-[var(--tg-hint-color)] mb-1">Your Biography / Role</label>
                <textarea 
                  value={formData.biography}
                  onChange={(e) => setFormData({...formData, biography: e.target.value})}
                  placeholder="Tell the AI who you are. This context will be added to the system prompt."
                  rows={4}
                  className="w-full bg-[var(--tg-secondary-bg-color)] text-[var(--tg-text-color)] border border-[var(--tg-border-color)] rounded-lg px-3 py-2 outline-none focus:border-[var(--tg-link-color)] resize-y"
                />
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-[var(--tg-border-color)] flex justify-between items-center bg-[var(--tg-bg-color)] rounded-br-xl">
            {userProfiles.length > 1 ? (
              <button 
                onClick={handleDelete}
                className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                title="Delete this persona"
              >
                <Trash2 size={20} />
              </button>
            ) : <div></div>}
            
            <div className="flex gap-2">
              <button 
                onClick={handleSave}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--tg-border-color)] hover:bg-[var(--tg-secondary-bg-color)] transition-colors"
              >
                Save
              </button>
              <button 
                onClick={handleActivate}
                className="flex items-center gap-2 bg-[var(--tg-button-color)] text-[var(--tg-button-text-color)] px-6 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <Check size={18} /> Make Active
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserProfileModal;
