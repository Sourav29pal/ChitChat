import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  FiX,
  FiChevronLeft,
  FiChevronRight,
  FiCrop,
  FiTrash2,
  FiZoomIn,
  FiZoomOut,
  FiRotateCcw,
} from "react-icons/fi";
import toast from "react-hot-toast";
import ChatImageCropModal from "./ChatImageCropModal";

function ChatAttachmentPreviewModal({
  images = [],
  initialIndex = 0,
  onClose,
  onRemoveImage,
  onUpdateImage,
  onRevertToOriginal,
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoomScale, setZoomScale] = useState(1);
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isCropping, setIsCropping] = useState(false);

  const imageContainerRef = useRef(null);

  const currentItem = images[currentIndex] || images[0];

  // Keep index within bounds if items are removed
  useEffect(() => {
    if (images.length === 0) {
      onClose?.();
    } else if (currentIndex >= images.length) {
      setCurrentIndex(Math.max(0, images.length - 1));
    }
  }, [images.length, currentIndex, onClose]);

  // Reset zoom & pan when active image changes
  useEffect(() => {
    setZoomScale(1);
    setPanPosition({ x: 0, y: 0 });
  }, [currentIndex, currentItem?.id]);

  // Non-passive wheel zoom
  useEffect(() => {
    if (!currentItem) return;

    const preventBrowserWindowZoom = (e) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };

    const handleNativeWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const zoomStep = -e.deltaY * 0.001;
      setZoomScale((prev) => {
        const nextScale = Math.min(3.5, Math.max(0.5, Math.round((prev + zoomStep) * 100) / 100));
        if (nextScale <= 1) setPanPosition({ x: 0, y: 0 });
        return nextScale;
      });
    };

    const container = imageContainerRef.current;
    if (container) {
      container.addEventListener("wheel", handleNativeWheel, { passive: false });
    }
    window.addEventListener("wheel", preventBrowserWindowZoom, { passive: false });

    return () => {
      if (container) {
        container.removeEventListener("wheel", handleNativeWheel);
      }
      window.removeEventListener("wheel", preventBrowserWindowZoom);
    };
  }, [currentItem]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isCropping) return;
      if (e.key === "Escape") {
        onClose?.();
      } else if (e.key === "ArrowLeft" && currentIndex > 0) {
        setCurrentIndex((prev) => prev - 1);
      } else if (e.key === "ArrowRight" && currentIndex < images.length - 1) {
        setCurrentIndex((prev) => prev + 1);
      } else if (e.key === "+" || e.key === "=") {
        setZoomScale((prev) => Math.min(3.5, Math.round((prev + 0.1) * 100) / 100));
      } else if (e.key === "-") {
        setZoomScale((prev) => {
          const next = Math.max(0.5, Math.round((prev - 0.1) * 100) / 100);
          if (next <= 1) setPanPosition({ x: 0, y: 0 });
          return next;
        });
      } else if (e.key === "0") {
        setZoomScale(1);
        setPanPosition({ x: 0, y: 0 });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, images.length, isCropping, onClose]);

  if (!currentItem || images.length === 0) return null;

  const handlePrev = () => {
    if (currentIndex > 0) setCurrentIndex((prev) => prev - 1);
  };

  const handleNext = () => {
    if (currentIndex < images.length - 1) setCurrentIndex((prev) => prev + 1);
  };

  const handleZoomIn = () => {
    setZoomScale((prev) => Math.min(3.5, Math.round((prev + 0.1) * 100) / 100));
  };

  const handleZoomOut = () => {
    setZoomScale((prev) => {
      const next = Math.max(0.5, Math.round((prev - 0.1) * 100) / 100);
      if (next <= 1) setPanPosition({ x: 0, y: 0 });
      return next;
    });
  };

  const handleResetZoom = () => {
    setZoomScale(1);
    setPanPosition({ x: 0, y: 0 });
  };

  const handleMouseDown = (e) => {
    if (zoomScale <= 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - panPosition.x, y: e.clientY - panPosition.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging || zoomScale <= 1) return;
    setPanPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleApplyCropResult = async (croppedBlob, newPreviewUrl) => {
    const originalFileName = currentItem.file?.name || "cropped_photo.jpg";
    const cleanFileName = originalFileName.replace(/\.[^.]+$/, ".jpg");
    const updatedFile = new File([croppedBlob], cleanFileName, { type: "image/jpeg" });

    onUpdateImage?.(currentIndex, updatedFile, newPreviewUrl);
    setIsCropping(false);
    toast.success("Photo cropped! ✂️");
  };

  const fileSizeStr =
    currentItem.file?.size
      ? currentItem.file.size > 1024 * 1024
        ? `${(currentItem.file.size / (1024 * 1024)).toFixed(1)} MB`
        : `${(currentItem.file.size / 1024).toFixed(0)} KB`
      : "";

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-2xl flex flex-col justify-between p-3 sm:p-5 select-none animate-in fade-in duration-150 touch-none"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isCropping) onClose?.();
      }}
    >
      {/* Top Header Bar */}
      <div
        className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-2xl z-20"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left: Info */}
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="px-2.5 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-bold text-xs flex-shrink-0">
            Photo {currentIndex + 1} of {images.length}
          </span>
          <div className="hidden sm:flex items-center gap-2 max-w-[280px] md:max-w-[400px] text-xs text-slate-300 font-medium min-w-0">
            <span className="truncate" title={currentItem.file?.name || "Image attachment"}>
              {currentItem.file?.name || "Image attachment"}
            </span>
            {fileSizeStr && (
              <span className="text-slate-400 font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700/70 flex-shrink-0">
                {fileSizeStr}
              </span>
            )}
          </div>
        </div>

        {/* Center / Right: Original (if cropped), Zoom, Crop, Delete, Close */}
        <div className="flex items-center gap-2">
          {/* Revert to Original Button (Placed at left side of Zoom button, standard sleek styling) */}
          {(currentItem.isCropped || (currentItem.originalFile && currentItem.file !== currentItem.originalFile)) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRevertToOriginal?.(currentIndex);
              }}
              className="py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700/80 text-xs font-semibold shadow-sm transition flex items-center gap-1.5 cursor-pointer active:scale-95 animate-in fade-in duration-150"
              title="Revert to original uncropped photo"
            >
              <FiRotateCcw className="text-xs text-slate-400" />
              <span>Original</span>
            </button>
          )}

          {/* Zoom Control Pill */}
          <div className="flex items-center gap-1 bg-slate-800/90 border border-slate-700/80 rounded-xl p-1 text-slate-200">
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={zoomScale <= 0.5}
              className="p-1.5 rounded-lg hover:bg-slate-700 disabled:opacity-30 transition cursor-pointer"
              title="Zoom Out"
            >
              <FiZoomOut className="text-sm" />
            </button>

            <button
              type="button"
              onClick={handleResetZoom}
              className="w-16 h-7 rounded-md hover:bg-slate-700 font-mono text-xs font-bold text-indigo-300 tabular-nums transition flex items-center justify-center gap-0.5 cursor-pointer flex-shrink-0"
              title="Reset Zoom (100%)"
            >
              <span className="w-8 text-right">{Math.round(zoomScale * 100)}%</span>
              <span className="w-3.5 flex items-center justify-center text-indigo-400">
                {zoomScale !== 1 && <FiRotateCcw className="text-[10px]" />}
              </span>
            </button>

            <button
              type="button"
              onClick={handleZoomIn}
              disabled={zoomScale >= 3.5}
              className="p-1.5 rounded-lg hover:bg-slate-700 disabled:opacity-30 transition cursor-pointer"
              title="Zoom In"
            >
              <FiZoomIn className="text-sm" />
            </button>
          </div>

          {/* Crop Action Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsCropping(true);
            }}
            className="py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition flex items-center gap-1.5 cursor-pointer active:scale-95"
            title="Crop & Adjust Photo"
          >
            <FiCrop className="text-sm" />
            <span>Crop</span>
          </button>

          {/* Delete Action Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveImage?.(currentItem.id);
            }}
            className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400 border border-slate-700/60 transition cursor-pointer"
            title="Remove Photo"
          >
            <FiTrash2 className="text-sm" />
          </button>

          {/* Close Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose?.();
            }}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white border border-slate-700/60 hover:border-rose-600 transition cursor-pointer shadow-md"
            title="Close Preview (Esc)"
          >
            <FiX className="text-lg" />
          </button>
        </div>
      </div>

      {/* Main Centered High-Res Image Viewport */}
      <div
        className="flex-1 flex items-center justify-between my-3 relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Previous Button */}
        {images.length > 1 && (
          <button
            type="button"
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className={`z-20 p-3 rounded-2xl bg-slate-900/90 border border-slate-800 text-white transition shadow-xl ${
              currentIndex === 0
                ? "opacity-20 cursor-not-allowed"
                : "hover:bg-indigo-600 hover:scale-105 active:scale-95 cursor-pointer"
            }`}
            title="Previous (Left Arrow)"
          >
            <FiChevronLeft className="text-2xl" />
          </button>
        )}

        {/* Viewport Image */}
        <div
          ref={imageContainerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className={`flex-1 flex items-center justify-center p-2 h-full overflow-hidden touch-none ${
            zoomScale > 1
              ? isDragging
                ? "cursor-grabbing"
                : "cursor-grab"
              : "cursor-default"
          }`}
        >
          <img
            key={currentItem.id + "_" + currentItem.previewUrl}
            src={currentItem.previewUrl}
            alt="Preview"
            style={{
              transform: `scale(${zoomScale}) translate(${panPosition.x / zoomScale}px, ${panPosition.y / zoomScale}px)`,
              transition: isDragging ? "none" : "transform 0.15s ease-out",
            }}
            className="max-h-[75vh] max-w-[85vw] object-contain rounded-none shadow-2xl border border-slate-800 select-none pointer-events-auto"
            draggable={false}
          />
        </div>

        {/* Next Button */}
        {images.length > 1 && (
          <button
            type="button"
            onClick={handleNext}
            disabled={currentIndex === images.length - 1}
            className={`z-20 p-3 rounded-2xl bg-slate-900/90 border border-slate-800 text-white transition shadow-xl ${
              currentIndex === images.length - 1
                ? "opacity-20 cursor-not-allowed"
                : "hover:bg-indigo-600 hover:scale-105 active:scale-95 cursor-pointer"
            }`}
            title="Next (Right Arrow)"
          >
            <FiChevronRight className="text-2xl" />
          </button>
        )}
      </div>

      {/* Bottom Thumbnail Strip */}
      {images.length > 1 && (
        <div
          className="w-full flex items-center justify-center gap-2 overflow-x-auto py-2 px-4 rounded-2xl bg-slate-900/70 border border-slate-800/80 z-20 custom-scrollbar"
          onClick={(e) => e.stopPropagation()}
        >
          {images.map((img, idx) => (
            <div
              key={img.id}
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIndex(idx);
              }}
              className={`relative rounded-xl overflow-hidden cursor-pointer border-2 transition flex-shrink-0 ${
                idx === currentIndex
                  ? "border-indigo-500 scale-105 shadow-md shadow-indigo-500/30"
                  : "border-transparent opacity-50 hover:opacity-100"
              }`}
            >
              <img
                src={img.previewUrl}
                alt={`Thumb ${idx}`}
                className="w-12 h-12 object-cover"
              />
            </div>
          ))}
        </div>
      )}

      {/* Crop Modal when Crop action is clicked */}
      {isCropping && (
        <ChatImageCropModal
          imageSrc={currentItem.originalPreviewUrl || currentItem.previewUrl}
          onApply={handleApplyCropResult}
          onClose={() => setIsCropping(false)}
        />
      )}
    </div>,
    document.body
  );
}

export default ChatAttachmentPreviewModal;
