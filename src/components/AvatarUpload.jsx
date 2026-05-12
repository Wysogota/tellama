import React, { useRef, useState, useEffect } from 'react';
import { Camera, X, ImagePlus, Trash2 } from 'lucide-react';
import ImageCropperModal from './ImageCropperModal';

const AvatarUpload = ({ avatarBase64, onAvatarChange, nameFallback }) => {
  const fileInputRef = useRef(null);
  const menuRef = useRef(null);
  const [tempImageSrc, setTempImageSrc] = useState(null);
  const [showMenu, setShowMenu] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

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
    setShowMenu(false);
  };

  const handleCropComplete = (base64Image) => {
    onAvatarChange(base64Image);
    setTempImageSrc(null);
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`flex flex-col items-center transition-all duration-300 ease-in-out ${isExpanded ? '-mx-5 -mt-5 mb-4' : 'mb-6'}`}>
      <div className={`relative transition-all duration-300 ease-in-out ${isExpanded ? 'w-full' : 'w-40'}`}>
        <div 
          onClick={() => avatarBase64 && setIsExpanded(!isExpanded)}
          className={`
            transition-all duration-300 ease-in-out cursor-pointer
            bg-gradient-to-br from-blue-400 to-blue-600 
            flex items-center justify-center text-white font-semibold 
            relative overflow-hidden shadow-lg border-[var(--tg-border-color)]
            ${isExpanded 
              ? 'w-full aspect-square rounded-none border-b' 
              : 'w-40 h-40 rounded-full border-2 mx-auto text-5xl'
            }
          `}
        >
          {avatarBase64 ? (
            <img src={avatarBase64} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <span>{nameFallback ? nameFallback.charAt(0).toUpperCase() : '?'}</span>
          )}
          
        </div>

        {/* Action Button */}
        <div className={`absolute z-20 transition-all duration-300 ${isExpanded ? 'bottom-4 right-4' : '-bottom-1 -right-1'}`} ref={menuRef}>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="w-14 h-14 bg-[var(--tg-link-color)] text-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-all border-2 border-[var(--tg-bg-color)]"
            title="Edit Photo"
          >
            <Camera size={24} />
          </button>

          {showMenu && (
            <div className={`absolute ${isExpanded ? 'right-0 origin-top-right' : 'left-0 origin-top-left'} top-full mt-2 w-48 bg-[var(--tg-search-bg)] border border-[var(--tg-border-color)] rounded-xl shadow-2xl overflow-hidden py-2 z-50 animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-1`}>
              <button 
                onClick={() => {
                  fileInputRef.current?.click();
                  setShowMenu(false);
                }}
                className="mx-1 flex items-center gap-3 px-2 py-2 text-[var(--tg-text-color)] hover:bg-white/10 transition-colors rounded-xl text-sm"
              >
                <ImagePlus size={18} className="text-[var(--tg-link-color)]" />
                <span>Set New Photo</span>
              </button>
              
              {avatarBase64 && (
                <button 
                  onClick={() => {
                    onAvatarChange(null);
                    setShowMenu(false);
                    setIsExpanded(false);
                  }}
                  className="mx-1 flex items-center gap-3 px-2 py-2 text-red-500 hover:bg-red-500/10 transition-colors rounded-xl text-sm"
                >
                  <Trash2 size={18} />
                  <span>Remove Photo</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Close expansion button */}

      </div>

      <input 
        type="file" 
        accept="image/*" 
        className="hidden" 
        ref={fileInputRef}
        onChange={handleFileChange}
      />

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
