import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { FiX, FiZoomIn, FiZoomOut, FiRotateCcw, FiCheck, FiCrop, FiLoader } from "react-icons/fi";
import toast from "react-hot-toast";

const VIEWPORT_SIZE = 260; // 260x260 px square crop box
const OUTPUT_SIZE = 400; // 400x400 px high-res square output
const MIN_ZOOM = 1.0;
const MAX_ZOOM = 3.0;

function PhotoCropModal({ imageSrc, onApply, onClose }) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [uploading, setUploading] = useState(false);

  const viewportRef = useRef(null);
  const imgRef = useRef(null);

  // State refs for multi-touch and drag gesture management without stale closures
  const zoomRef = useRef(1.0);
  zoomRef.current = zoom;

  const panRef = useRef({ x: 0, y: 0 });
  panRef.current = pan;

  const naturalSizeRef = useRef({ width: 0, height: 0 });
  naturalSizeRef.current = naturalSize;

  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const isPinchingRef = useRef(false);
  const pinchStartRef = useRef({ distance: 0, startZoom: 1.0 });

  // Calculate base dimensions to cover the crop square
  const getBaseCoverDimensions = useCallback((w, h) => {
    const natW = w || naturalSizeRef.current.width;
    const natH = h || naturalSizeRef.current.height;
    if (!natW || !natH) {
      return { width: VIEWPORT_SIZE, height: VIEWPORT_SIZE, baseScale: 1 };
    }
    const scale = Math.max(VIEWPORT_SIZE / natW, VIEWPORT_SIZE / natH);
    return {
      width: natW * scale,
      height: natH * scale,
      baseScale: scale,
    };
  }, []);

  // Clamp pan so the image always covers the viewport without revealing black edges
  const clampPan = useCallback(
    (newPanX, newPanY, currentZoom) => {
      const { width: baseW, height: baseH } = getBaseCoverDimensions();
      const currentW = baseW * currentZoom;
      const currentH = baseH * currentZoom;

      const minX = VIEWPORT_SIZE - currentW;
      const maxX = 0;
      const minY = VIEWPORT_SIZE - currentH;
      const maxY = 0;

      const clampedX = Math.min(maxX, Math.max(minX, newPanX));
      const clampedY = Math.min(maxY, Math.max(minY, newPanY));

      return { x: clampedX, y: clampedY };
    },
    [getBaseCoverDimensions]
  );

  // Initialize and center image on load
  const handleImageLoad = (e) => {
    const { naturalWidth, naturalHeight } = e.target;
    setNaturalSize({ width: naturalWidth, height: naturalHeight });
    setImageLoaded(true);

    const scale = Math.max(
      VIEWPORT_SIZE / naturalWidth,
      VIEWPORT_SIZE / naturalHeight
    );
    const baseW = naturalWidth * scale;
    const baseH = naturalHeight * scale;

    const initialX = (VIEWPORT_SIZE - baseW) / 2;
    const initialY = (VIEWPORT_SIZE - baseH) / 2;

    setZoom(1.0);
    setPan({ x: initialX, y: initialY });
  };

  // Reset to initial centered state
  const handleReset = () => {
    if (!naturalSize.width) return;
    const scale = Math.max(
      VIEWPORT_SIZE / naturalSize.width,
      VIEWPORT_SIZE / naturalSize.height
    );
    const baseW = naturalSize.width * scale;
    const baseH = naturalSize.height * scale;

    setZoom(1.0);
    setPan({
      x: (VIEWPORT_SIZE - baseW) / 2,
      y: (VIEWPORT_SIZE - baseH) / 2,
    });
  };

  // Safe zoom update with automatic pan re-clamping
  const handleZoomChange = (newZoom) => {
    const clampedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom));
    setZoom(clampedZoom);
    setPan((prevPan) => clampPan(prevPan.x, prevPan.y, clampedZoom));
  };

  // Helper for touch distance
  const getTouchDistance = (touch1, touch2) => {
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Attach non-passive touch & wheel listeners to completely prevent page zoom/scroll
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    // Touch handlers
    const onTouchStart = (e) => {
      // Prevent browser default gesture zoom or page scroll
      if (e.touches.length === 1) {
        isDraggingRef.current = true;
        isPinchingRef.current = false;
        dragStartRef.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          panX: panRef.current.x,
          panY: panRef.current.y,
        };
      } else if (e.touches.length === 2) {
        isDraggingRef.current = false;
        isPinchingRef.current = true;
        pinchStartRef.current = {
          distance: getTouchDistance(e.touches[0], e.touches[1]),
          startZoom: zoomRef.current,
        };
      }
      e.preventDefault();
    };

    const onTouchMove = (e) => {
      e.preventDefault();
      if (e.touches.length === 1 && isDraggingRef.current) {
        const deltaX = e.touches[0].clientX - dragStartRef.current.x;
        const deltaY = e.touches[0].clientY - dragStartRef.current.y;
        const targetX = dragStartRef.current.panX + deltaX;
        const targetY = dragStartRef.current.panY + deltaY;
        const clamped = clampPan(targetX, targetY, zoomRef.current);
        setPan(clamped);
      } else if (e.touches.length === 2 && isPinchingRef.current) {
        const currentDistance = getTouchDistance(e.touches[0], e.touches[1]);
        const deltaDistance = currentDistance - pinchStartRef.current.distance;

        // Low-sensitivity zoom factor (0.0035 provides precise, slow, controlled zoom)
        const zoomDelta = deltaDistance * 0.0035;
        const targetZoom = Math.min(
          MAX_ZOOM,
          Math.max(MIN_ZOOM, pinchStartRef.current.startZoom + zoomDelta)
        );

        setZoom(targetZoom);
        setPan((prevPan) => clampPan(prevPan.x, prevPan.y, targetZoom));
      }
    };

    const onTouchEnd = (e) => {
      if (e.touches.length === 0) {
        isDraggingRef.current = false;
        isPinchingRef.current = false;
      } else if (e.touches.length === 1) {
        isPinchingRef.current = false;
        isDraggingRef.current = true;
        dragStartRef.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          panX: panRef.current.x,
          panY: panRef.current.y,
        };
      }
    };

    // Wheel handler for smooth low-sensitivity trackpad / mouse zoom
    const onWheel = (e) => {
      e.preventDefault();
      // Low-sensitivity factor: 0.0008 per deltaY unit
      const zoomStep = -e.deltaY * 0.0008;
      const targetZoom = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, zoomRef.current + zoomStep)
      );
      setZoom(targetZoom);
      setPan((prevPan) => clampPan(prevPan.x, prevPan.y, targetZoom));
    };

    element.addEventListener("touchstart", onTouchStart, { passive: false });
    element.addEventListener("touchmove", onTouchMove, { passive: false });
    element.addEventListener("touchend", onTouchEnd, { passive: false });
    element.addEventListener("touchcancel", onTouchEnd, { passive: false });
    element.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      element.removeEventListener("touchstart", onTouchStart);
      element.removeEventListener("touchmove", onTouchMove);
      element.removeEventListener("touchend", onTouchEnd);
      element.removeEventListener("touchcancel", onTouchEnd);
      element.removeEventListener("wheel", onWheel);
    };
  }, [clampPan]);

  // Mouse drag handlers
  const handlePointerDown = (e) => {
    if (e.pointerType === "touch") return; // Touch is handled by native non-passive touch listeners
    e.preventDefault();
    isDraggingRef.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {}
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const handlePointerMove = (e) => {
    if (e.pointerType === "touch" || !isDraggingRef.current) return;
    e.preventDefault();
    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;
    const targetX = dragStartRef.current.panX + deltaX;
    const targetY = dragStartRef.current.panY + deltaY;
    setPan(clampPan(targetX, targetY, zoom));
  };

  const handlePointerUp = (e) => {
    if (e.pointerType === "touch") return;
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (err) {}
    }
  };

  // Helper to get Blob from Canvas at specified quality
  const getCanvasBlob = (canvas, quality) => {
    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => {
          resolve(blob);
        },
        "image/jpeg",
        quality
      );
    });
  };

  // Render crop to Canvas and export Blob
  const handleApply = async () => {
    if (!imgRef.current || !naturalSize.width || uploading) return;

    const img = imgRef.current;
    const { baseScale } = getBaseCoverDimensions();
    const totalScale = baseScale * zoom;

    // Calculate source crop rectangle on original unscaled image
    const srcX = Math.max(0, -pan.x / totalScale);
    const srcY = Math.max(0, -pan.y / totalScale);
    const srcW = Math.min(naturalSize.width, VIEWPORT_SIZE / totalScale);
    const srcH = Math.min(naturalSize.height, VIEWPORT_SIZE / totalScale);

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");

    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

      const MAX_BLOB_SIZE = 5 * 1024 * 1024; // 5 MB
      let quality = 0.92;
      let blob = await getCanvasBlob(canvas, quality);

      // Compression loop if image exceeds 5 MB
      const qualities = [0.85, 0.75, 0.65, 0.5];
      for (const q of qualities) {
        if (blob && blob.size <= MAX_BLOB_SIZE) break;
        quality = q;
        blob = await getCanvasBlob(canvas, quality);
      }

      if (!blob || blob.size > MAX_BLOB_SIZE) {
        toast.error("Cropped image exceeds the 5 MB limit. Please select a smaller photo.");
        return;
      }

      setUploading(true);
      try {
        await onApply(blob);
      } catch (err) {
        // Error toast handled in caller
      } finally {
        setUploading(false);
      }
    }
  };

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && !uploading) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, uploading]);

  const { width: baseW, height: baseH } = getBaseCoverDimensions();

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden max-w-sm w-full select-none">
        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <FiCrop className="text-indigo-400 text-base" />
            <span>Adjust Profile Photo</span>
          </div>
          <button
            onClick={onClose}
            disabled={uploading}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-rose-600 disabled:opacity-50 transition cursor-pointer"
            title="Cancel (Esc)"
          >
            <FiX className="text-base" />
          </button>
        </div>

        {/* Viewport / Crop Area */}
        <div className="p-5 flex flex-col items-center">
          <div
            ref={viewportRef}
            className="relative rounded-2xl overflow-hidden bg-slate-950 shadow-inner cursor-grab active:cursor-grabbing border border-slate-800 touch-none select-none"
            style={{ width: VIEWPORT_SIZE, height: VIEWPORT_SIZE }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {/* The Image */}
            <img
              ref={imgRef}
              src={imageSrc}
              alt="Crop target"
              onLoad={handleImageLoad}
              draggable={false}
              className="absolute pointer-events-none origin-top-left transition-transform duration-75"
              style={{
                width: `${baseW}px`,
                height: `${baseH}px`,
                transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
                opacity: imageLoaded ? 1 : 0,
              }}
            />

            {/* Circular Mask & 3x3 Alignment Grid */}
            <div className="absolute inset-0 pointer-events-none">
              {/* Circular guide outline with darkened vignette around circle */}
              <div className="w-full h-full rounded-full border-2 border-indigo-400/90 shadow-[0_0_0_9999px_rgba(10,15,29,0.72)] flex flex-col">
                {/* 3x3 Grid Overlay inside circle */}
                <div className="w-full h-full grid grid-cols-3 grid-rows-3 opacity-30">
                  <div className="border-r border-b border-white/60" />
                  <div className="border-r border-b border-white/60" />
                  <div className="border-b border-white/60" />
                  <div className="border-r border-b border-white/60" />
                  <div className="border-r border-b border-white/60" />
                  <div className="border-b border-white/60" />
                  <div className="border-r border-b border-white/60" />
                  <div className="border-r border-b border-white/60" />
                  <div />
                </div>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 mt-2 font-medium">
            Drag to reposition • Pinch or scroll to zoom
          </p>

          {/* Zoom Slider Control */}
          <div className="w-full px-2 mt-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
              <span className="flex items-center gap-1">
                <FiZoomOut className="text-slate-500" /> Zoom
              </span>
              <span className="font-mono text-indigo-400">{zoom.toFixed(2)}x</span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleZoomChange(zoom - 0.15)}
                disabled={zoom <= MIN_ZOOM || uploading}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 transition cursor-pointer"
                title="Zoom Out"
              >
                <FiZoomOut className="text-sm" />
              </button>

              <input
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step="0.02"
                value={zoom}
                disabled={uploading}
                onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                className="flex-1 accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer disabled:opacity-50"
              />

              <button
                type="button"
                onClick={() => handleZoomChange(zoom + 0.15)}
                disabled={zoom >= MAX_ZOOM || uploading}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 transition cursor-pointer"
                title="Zoom In"
              >
                <FiZoomIn className="text-sm" />
              </button>
            </div>
          </div>

          {/* Reset Button */}
          <div className="mt-2.5">
            <button
              type="button"
              onClick={handleReset}
              disabled={uploading}
              className="text-[11px] font-semibold text-slate-400 hover:text-slate-200 disabled:opacity-50 transition flex items-center gap-1 cursor-pointer"
            >
              <FiRotateCcw className="text-xs" /> Reset Position
            </button>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-slate-950/60 border-t border-slate-800/80 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-50 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={uploading || !imageLoaded}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            {uploading ? (
              <>
                <FiLoader className="animate-spin text-sm" />
                <span>Saving Photo...</span>
              </>
            ) : (
              <>
                <FiCheck className="text-sm" />
                <span>Save Photo</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default PhotoCropModal;
