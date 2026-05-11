import React, { useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import ImageCropperModal from './ImageCropperModal';

const AvatarUpload = ({ avatarBase64, onAvatarChange, nameFallback }) => {
  const fileInputRef = useRef(null);
  const [tempImageSrc, setTempImageSrc] = useState(null);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setTempImageSrc(event.target.result);
    };
    reader.readAsDataURL(file);
    
    // Reset input value so same file can be uploaded again if needed
    e.target.value = null;
  };

  const handleCropComplete = (base64Image) => {
    onAvatarChange(base64Image);
    setTempImageSrc(null);
  };

  return (
    <div className="flex flex-col items-center mb-6">
      <div 
        className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-3xl font-semibold cursor-pointer relative overflow-hidden group shadow-md"
        onClick={() => fileInputRef.current?.click()}
      >
        {avatarBase64 ? (
          <img src={avatarBase64} alt="Avatar" className="w-full h-full object-cover" />
        ) : (
          <span>{nameFallback ? nameFallback.charAt(0).toUpperCase() : '?'}</span>
        )}
        
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <Camera size={32} className="text-white opacity-90" />
        </div>
      </div>
      <input 
        type="file" 
        accept="image/*" 
        className="hidden" 
        ref={fileInputRef}
        onChange={handleFileChange}
      />
      <span className="text-xs text-[var(--tg-hint-color)] mt-2 cursor-pointer hover:underline" onClick={() => fileInputRef.current?.click()}>
        {avatarBase64 ? 'Change Avatar' : 'Set Avatar'}
      </span>

      {tempImageSrc && (
        <ImageCropperModal
          imageSrc={tempImageSrc}
          onCropComplete={handleCropComplete}
          onClose={() => setTempImageSrc(null)}
        />
      )}
    </div>
  );
};

export default AvatarUpload;
