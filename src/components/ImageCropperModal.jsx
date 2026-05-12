import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { X, Check } from 'lucide-react';

const ImageCropperModal = ({ imageSrc, onCropComplete, onClose }) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const handleCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const getCroppedImg = async () => {
    try {
      const image = new Image();
      image.src = imageSrc;
      await new Promise((resolve) => (image.onload = resolve));

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Set target size for the avatar (balanced for quality and DB size)
      const TARGET_SIZE = 400;
      canvas.width = TARGET_SIZE;
      canvas.height = TARGET_SIZE;

      // Use high quality smoothing for the resize operation
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      ctx.drawImage(
        image,
        croppedAreaPixels.x,
        croppedAreaPixels.y,
        croppedAreaPixels.width,
        croppedAreaPixels.height,
        0,
        0,
        TARGET_SIZE,
        TARGET_SIZE
      );

      // Use WEBP with 0.7 quality for aggressive but visually acceptable compression
      const base64Image = canvas.toDataURL('image/webp', 0.7);
      onCropComplete(base64Image);
    } catch (e) {
      console.error(e);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
      <div className="bg-[var(--tg-bg-color)] w-full max-w-md rounded-xl shadow-2xl flex flex-col h-[500px]">
        <div className="px-4 py-3 border-b border-[var(--tg-border-color)] flex justify-between items-center bg-[var(--tg-secondary-bg-color)] rounded-t-xl">
          <h2 className="font-semibold">Crop Avatar</h2>
          <button onClick={onClose} className="p-1 hover:bg-[var(--tg-border-color)] rounded-full">
            <X size={20} className="text-[var(--tg-hint-color)]" />
          </button>
        </div>
        
        <div className="relative flex-grow bg-black">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={handleCropComplete}
          />
        </div>
        
        <div className="p-4 bg-[var(--tg-secondary-bg-color)] rounded-b-xl flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <span className="text-sm text-[var(--tg-hint-color)]">Zoom</span>
            <input
              type="range"
              value={zoom}
              min={1}
              max={3}
              step={0.1}
              aria-labelledby="Zoom"
              onChange={(e) => setZoom(e.target.value)}
              className="w-full accent-[var(--tg-link-color)]"
            />
          </div>
          <button
            onClick={getCroppedImg}
            className="w-full flex justify-center items-center gap-2 bg-[var(--tg-button-color)] text-[var(--tg-button-text-color)] py-2 rounded-lg font-medium"
          >
            <Check size={18} /> Apply
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImageCropperModal;
