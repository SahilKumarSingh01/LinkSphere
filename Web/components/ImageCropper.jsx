"use client";

import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";

export default function ImageCropper({
  onCancel = () => {},
  onUpload = () => {},
}) {
  const [imageSrc, setImageSrc] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [file,setFile]=useState(null);
  const onFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFile(file);
    const reader = new FileReader();
    reader.onload = () => setImageSrc(reader.result);
    reader.readAsDataURL(file);
  };

  const onCropComplete = useCallback((_, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.7)]">
      <div className="relative w-full max-w-[600px] h-[600px] bg-bg-primary rounded-lg shadow-lg p-4 flex flex-col">
        {/* Crop area */}
        {imageSrc ? (
          <div className="relative flex-1">
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              cropShape="rect"
              showGrid={false}
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center border-2 border-bg-tertiary rounded-lg">
            <span className="text-text-tertiary">No image selected</span>
          </div>
        )}

        {/* Controls */}
        <div className="mt-4 flex flex-col gap-3">
          {/* Zoom slider */}

          {/* File chooser */}
          <label className="cursor-pointer bg-btn-primary hover:bg-btn-primary-hover active:bg-btn-primary-active text-btn-primary-text py-2 px-4 rounded text-center">
            Choose File
            <input type="file" accept="image/*" onChange={onFileChange} className="hidden" />
          </label>

          {/* Action buttons */}
          <div className="flex justify-between gap-2">
            <button
              onClick={onCancel}
              className="flex-1 bg-btn-secondary hover:bg-btn-secondary-hover active:bg-btn-secondary-active text-btn-secondary-text py-2 rounded"
            >
              Cancel
            </button>
            <button
              onClick={() => onUpload(file,croppedAreaPixels)}
              disabled={!imageSrc}
              className={
                imageSrc? "flex-1 py-2 rounded text-text-primary transition bg-btn-primary hover:bg-btn-primary-hover active:bg-btn-primary-active cursor-pointer"
                        : "flex-1 py-2 rounded text-text-primary transition bg-btn-disabled text-btn-disabled-text cursor-not-allowed"
              }
            >
              Upload
            </button>

          </div>
        </div>
      </div>
    </div>
  );
}
