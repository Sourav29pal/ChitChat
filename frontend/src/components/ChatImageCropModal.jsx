import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  FiX,
  FiZoomIn,
  FiZoomOut,
  FiRotateCcw,
  FiCheck,
  FiCrop,
  FiLoader,
  FiGrid,
} from "react-icons/fi";
import toast from "react-hot-toast";

const ASPECT_RATIOS = [
  { id: "free", label: "Free" },
  { id: "1:1", label: "1:1 Square", ratio: 1 },
  { id: "16:9", label: "16:9 Wide", ratio: 16 / 9 },
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
];

const MAX_VIEW_SIZE = 340; // Spacious, clear viewport size for comfortable cropping
const MIN_ZOOM = 1.0;
const MAX_ZOOM = 3.0;

function ChatImageCropModal({ imageSrc, onApply, onClose }) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [aspectMode, setAspectMode] = useState("free");
  const [showGrid, setShowGrid] = useState(true);
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [cropping, setCropping] = useState(false);

  const viewportRef = useRef(null);
  const imgRef = useRef(null);

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

  // Pre-load natural dimensions immediately on mount so viewport appears at final size with 0 delay
  useEffect(() => {
    if (!imageSrc) return;
    const img = new Image();
    img.src = imageSrc;
    const applySize = (w, h) => {
      if (!w || !h) return;
      setNaturalSize({ width: w, height: h });
      setImageLoaded(true);

      const natRatio = w / h;
      let viewW = MAX_VIEW_SIZE;
      let viewH = Math.round(viewW / natRatio);
      if (viewH > MAX_VIEW_SIZE) {
        viewH = MAX_VIEW_SIZE;
        viewW = Math.round(viewH * natRatio);
      }
      viewW = Math.max(140, Math.min(MAX_VIEW_SIZE, viewW));
      viewH = Math.max(120, Math.min(MAX_VIEW_SIZE, viewH));

      const scale = Math.max(viewW / w, viewH / h);
      const baseW = w * scale;
      const baseH = h * scale;

      setZoom(1.0);
      setPan({
        x: (viewW - baseW) / 2,
        y: (viewH - baseH) / 2,
      });
    };

    if (img.complete && img.naturalWidth) {
      applySize(img.naturalWidth, img.naturalHeight);
    } else {
      img.onload = () => applySize(img.naturalWidth, img.naturalHeight);
    }
  }, [imageSrc]);

  // Calculate crop viewport dimensions based on aspect ratio
  const getViewportDimensions = useCallback(() => {
    const natW = naturalSizeRef.current.width || 1;
    const natH = naturalSizeRef.current.height || 1;
    const natRatio = natW / natH;

    let targetRatio = natRatio;
    if (aspectMode === "1:1") targetRatio = 1;
    else if (aspectMode === "16:9") targetRatio = 16 / 9;
    else if (aspectMode === "4:3") targetRatio = 4 / 3;

    let viewW = MAX_VIEW_SIZE;
    let viewH = Math.round(viewW / targetRatio);

    if (viewH > MAX_VIEW_SIZE) {
      viewH = MAX_VIEW_SIZE;
      viewW = Math.round(viewH * targetRatio);
    }

    viewW = Math.max(140, Math.min(MAX_VIEW_SIZE, viewW));
    viewH = Math.max(120, Math.min(MAX_VIEW_SIZE, viewH));

    return { viewW, viewH, ratio: targetRatio };
  }, [aspectMode]);

  // Base image scale to completely fill the active viewport box
  const getBaseCoverDimensions = useCallback(() => {
    const natW = naturalSizeRef.current.width || MAX_VIEW_SIZE;
    const natH = naturalSizeRef.current.height || MAX_VIEW_SIZE;
    const { viewW, viewH } = getViewportDimensions();

    const scale = Math.max(viewW / natW, viewH / natH);
    return {
      width: natW * scale,
      height: natH * scale,
      baseScale: scale,
      viewW,
      viewH,
    };
  }, [getViewportDimensions]);

  // Clamp pan relative to viewport box boundaries
  const clampPan = useCallback(
    (newPanX, newPanY, currentZoom) => {
      const { width: baseW, height: baseH, viewW, viewH } = getBaseCoverDimensions();
      const currentW = baseW * currentZoom;
      const currentH = baseH * currentZoom;

      const minX = viewW - currentW;
      const maxX = 0;
      const minY = viewH - currentH;
      const maxY = 0;

      const clampedX = Math.min(maxX, Math.max(minX, newPanX));
      const clampedY = Math.min(maxY, Math.max(minY, newPanY));

      return { x: clampedX, y: clampedY };
    },
    [getBaseCoverDimensions]
  );

  const centerImage = useCallback(() => {
    const { width: baseW, height: baseH, viewW, viewH } = getBaseCoverDimensions();
    const initialX = (viewW - baseW) / 2;
    const initialY = (viewH - baseH) / 2;
    setZoom(1.0);
    setPan({ x: initialX, y: initialY });
  }, [getBaseCoverDimensions]);

  // Handle initial image load
  const handleImageLoad = (e) => {
    const { naturalWidth, naturalHeight } = e.target;
    if (naturalSize.width === naturalWidth && naturalSize.height === naturalHeight) return;
    setNaturalSize({ width: naturalWidth, height: naturalHeight });
    setImageLoaded(true);

    const natRatio = naturalWidth / naturalHeight;
    let viewW = MAX_VIEW_SIZE;
    let viewH = Math.round(viewW / natRatio);
    if (viewH > MAX_VIEW_SIZE) {
      viewH = MAX_VIEW_SIZE;
      viewW = Math.round(viewH * natRatio);
    }
    viewW = Math.max(140, Math.min(MAX_VIEW_SIZE, viewW));
    viewH = Math.max(120, Math.min(MAX_VIEW_SIZE, viewH));

    const scale = Math.max(viewW / naturalWidth, viewH / naturalHeight);
    const baseW = naturalWidth * scale;
    const baseH = naturalHeight * scale;

    setZoom(1.0);
    setPan({
      x: (viewW - baseW) / 2,
      y: (viewH - baseH) / 2,
    });
  };

  // Re-center when aspect ratio changes without resizing modal dialog
  useEffect(() => {
    if (imageLoaded) {
      centerImage();
    }
  }, [aspectMode, imageLoaded, centerImage]);

  const handleZoomChange = (newZoom) => {
    const clampedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom));
    setZoom(clampedZoom);
    setPan((prevPan) => clampPan(prevPan.x, prevPan.y, clampedZoom));
  };

  const getTouchDistance = (touch1, touch2) => {
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Non-passive touch and wheel listeners for smooth zooming/panning
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    const onTouchStart = (e) => {
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
      e.stopPropagation();
    };

    const onTouchMove = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.touches.length === 1 && isDraggingRef.current) {
        const deltaX = e.touches[0].clientX - dragStartRef.current.x;
        const deltaY = e.touches[0].clientY - dragStartRef.current.y;
        const targetX = dragStartRef.current.panX + deltaX;
        const targetY = dragStartRef.current.panY + deltaY;
        setPan(clampPan(targetX, targetY, zoomRef.current));
      } else if (e.touches.length === 2 && isPinchingRef.current) {
        const currentDistance = getTouchDistance(e.touches[0], e.touches[1]);
        const deltaDistance = currentDistance - pinchStartRef.current.distance;
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
      }
    };

    const onWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();
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
    element.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      element.removeEventListener("touchstart", onTouchStart);
      element.removeEventListener("touchmove", onTouchMove);
      element.removeEventListener("touchend", onTouchEnd);
      element.removeEventListener("wheel", onWheel);
    };
  }, [clampPan]);

  const handlePointerDown = (e) => {
    if (e.pointerType === "touch") return;
    e.preventDefault();
    e.stopPropagation();
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
    e.stopPropagation();
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

  const getCanvasBlob = (canvas, quality) => {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
    });
  };

  const handleApplyCrop = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!imgRef.current || !naturalSize.width || cropping) return;

    setCropping(true);
    try {
      const img = imgRef.current;
      const { baseScale, viewW, viewH } = getBaseCoverDimensions();
      const totalScale = baseScale * zoom;

      // Source rectangle in natural image pixels
      const srcX = Math.max(0, -pan.x / totalScale);
      const srcY = Math.max(0, -pan.y / totalScale);
      const srcW = Math.min(naturalSize.width, viewW / totalScale);
      const srcH = Math.min(naturalSize.height, viewH / totalScale);

      // High-res output dimensions
      const MAX_OUT_DIM = 1920;
      let outW = Math.round(srcW);
      let outH = Math.round(srcH);

      if (outW > MAX_OUT_DIM || outH > MAX_OUT_DIM) {
        if (outW > outH) {
          outH = Math.round((outH * MAX_OUT_DIM) / outW);
          outW = MAX_OUT_DIM;
        } else {
          outW = Math.round((outW * MAX_OUT_DIM) / outH);
          outH = MAX_OUT_DIM;
        }
      }

      outW = Math.max(100, outW);
      outH = Math.max(100, outH);

      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");

      if (!ctx) throw new Error("Could not initialize canvas");

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outW, outH);

      const MAX_BLOB_SIZE = 5 * 1024 * 1024; // 5 MB
      let quality = 0.92;
      let blob = await getCanvasBlob(canvas, quality);

      const qualities = [0.85, 0.75, 0.65, 0.5];
      for (const q of qualities) {
        if (blob && blob.size <= MAX_BLOB_SIZE) break;
        quality = q;
        blob = await getCanvasBlob(canvas, quality);
      }

      if (!blob || blob.size > MAX_BLOB_SIZE) {
        toast.error("Cropped image exceeds 5 MB limit. Please adjust.");
        setCropping(false);
        return;
      }

      const previewUrl = URL.createObjectURL(blob);
      await onApply(blob, previewUrl);
    } catch (err) {
      console.error("Crop error:", err);
      toast.error("Failed to crop image");
    } finally {
      setCropping(false);
    }
  };

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && !cropping) {
        e.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, cropping]);

  const { width: baseW, height: baseH, viewW, viewH } = getBaseCoverDimensions();

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md select-none"
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget && !cropping) onClose?.();
      }}
    >
      {/* Spacious, Fixed Dimension Modal Card — 100% Stable Size */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden w-[440px] max-w-[95vw] select-none flex flex-col"
      >
        {/* Header */}
        <div className="h-12 px-4 flex items-center justify-between border-b border-slate-800 bg-slate-950/50 flex-shrink-0">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <FiCrop className="text-indigo-400 text-base" />
            <span>Crop Photo</span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Grid View Toggle Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowGrid((prev) => !prev);
              }}
              disabled={cropping}
              className={`p-1.5 rounded-xl border transition cursor-pointer flex items-center justify-center ${
                showGrid
                  ? "bg-indigo-600/20 text-indigo-400 border-indigo-500/40 shadow-sm"
                  : "bg-slate-800/80 text-slate-400 border-slate-700/60 hover:text-slate-200"
              }`}
              title={showGrid ? "Hide Grid Lines" : "Show Grid Lines"}
            >
              <FiGrid className="text-sm" />
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose?.();
              }}
              disabled={cropping}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-rose-600 disabled:opacity-50 transition cursor-pointer"
              title="Cancel (Esc)"
            >
              <FiX className="text-base" />
            </button>
          </div>
        </div>

        {/* Aspect Ratio Selector — Fixed Height */}
        <div className="h-11 px-4 flex items-center justify-center border-b border-slate-800/40 bg-slate-950/20 flex-shrink-0">
          <div className="inline-flex p-1 bg-slate-950/70 border border-slate-800 rounded-xl gap-1">
            {ASPECT_RATIOS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setAspectMode(item.id);
                }}
                disabled={cropping}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  aspectMode === item.id
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Viewport Container — Spacious Fixed Height Container (350px) */}
        <div className="h-[350px] w-full flex items-center justify-center p-2 flex-shrink-0 bg-slate-950/20">
          {/* Active Crop Viewport Box — Instant mounting with zero shifting */}
          <div
            ref={viewportRef}
            className="relative rounded-none overflow-hidden bg-slate-950 shadow-2xl border-2 border-indigo-500/90 cursor-grab active:cursor-grabbing touch-none select-none"
            style={{ width: `${viewW}px`, height: `${viewH}px` }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {/* The Image (scaled to cover viewport 100%) */}
            <img
              ref={imgRef}
              src={imageSrc}
              alt="Crop target"
              onLoad={handleImageLoad}
              draggable={false}
              className="absolute pointer-events-none origin-top-left"
              style={{
                width: `${baseW}px`,
                height: `${baseH}px`,
                transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
                opacity: imageLoaded ? 1 : 0,
              }}
            />

            {/* 3x3 Rule-of-Thirds Crop Grid Overlay (Togglable via Grid Button) */}
            {showGrid && (
              <div className="absolute inset-0 pointer-events-none z-20 select-none">
                {/* 2 Vertical Rule-of-Thirds Lines (Soft Light Blue/Indigo) */}
                <div
                  className="absolute top-0 bottom-0 w-0 border-r border-indigo-400/75 shadow-[0_0_1.5px_rgba(0,0,0,0.6)]"
                  style={{ left: "33.333%" }}
                />
                <div
                  className="absolute top-0 bottom-0 w-0 border-r border-indigo-400/75 shadow-[0_0_1.5px_rgba(0,0,0,0.6)]"
                  style={{ left: "66.666%" }}
                />

                {/* 2 Horizontal Rule-of-Thirds Lines (Soft Light Blue/Indigo) */}
                <div
                  className="absolute left-0 right-0 h-0 border-b border-indigo-400/75 shadow-[0_0_1.5px_rgba(0,0,0,0.6)]"
                  style={{ top: "33.333%" }}
                />
                <div
                  className="absolute left-0 right-0 h-0 border-b border-indigo-400/75 shadow-[0_0_1.5px_rgba(0,0,0,0.6)]"
                  style={{ top: "66.666%" }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Minimal Instruction */}
        <p className="text-[11px] text-slate-400 text-center font-medium -mt-1 flex-shrink-0">
          Drag to reposition • Pinch or scroll to zoom
        </p>

        {/* Zoom Controls Area */}
        <div className="px-6 py-2 space-y-1 flex-shrink-0">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
            <span className="flex items-center gap-1">
              <FiZoomOut className="text-slate-500" /> Zoom
            </span>
            <span className="font-mono text-indigo-400">{zoom.toFixed(2)}x</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleZoomChange(zoom - 0.15);
              }}
              disabled={zoom <= MIN_ZOOM || cropping}
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
              disabled={cropping}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
              className="flex-1 accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer disabled:opacity-50"
            />

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleZoomChange(zoom + 0.15);
              }}
              disabled={zoom >= MAX_ZOOM || cropping}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 transition cursor-pointer"
              title="Zoom In"
            >
              <FiZoomIn className="text-sm" />
            </button>
          </div>
        </div>

        {/* Reset Position Button */}
        <div className="flex justify-center pb-2 flex-shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              centerImage();
            }}
            disabled={cropping}
            className="text-[11px] font-semibold text-slate-400 hover:text-slate-200 disabled:opacity-50 transition flex items-center gap-1 cursor-pointer"
          >
            <FiRotateCcw className="text-xs" /> Reset Position
          </button>
        </div>

        {/* Footer Actions */}
        <div className="h-14 px-4 py-3 bg-slate-950/60 border-t border-slate-800/80 flex items-center justify-end gap-2.5 flex-shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose?.();
            }}
            disabled={cropping}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-50 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApplyCrop}
            disabled={cropping || !imageLoaded}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            {cropping ? (
              <>
                <FiLoader className="animate-spin text-sm" />
                <span>Applying...</span>
              </>
            ) : (
              <>
                <FiCheck className="text-sm" />
                <span>Apply Crop</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ChatImageCropModal;
