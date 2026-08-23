import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import useConversation from "../zustand/useConversation.js";
import {
  FiX,
  FiChevronLeft,
  FiChevronRight,
  FiDownload,
  FiZoomIn,
  FiZoomOut,
  FiRotateCcw,
} from "react-icons/fi";

function ImageLightbox() {
  const {
    messages,
    realtimeMessages,
    sharedMedia,
    lightboxMessageId,
    lightboxSource,
    setLightboxMessageId,
  } = useConversation();
  const [zoomScale, setZoomScale] = useState(1);
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imageContainerRef = useRef(null);
  const activeThumbnailRef = useRef(null);

  // Extract and order photo items depending on whether opened from Chat timeline or Shared Media
  const galleryItems = useMemo(() => {
    const hist = Array.isArray(messages) ? messages : [];
    const rt = Array.isArray(realtimeMessages) ? realtimeMessages : [];
    const sm = Array.isArray(sharedMedia) ? sharedMedia : [];

    // Deduplicate by message ID
    const map = new Map();
    [...sm, ...hist, ...rt].forEach((m) => {
      if (m && m._id) map.set(String(m._id), m);
    });

    // Sort:
    // - "chat" mode: Oldest to Newest (Chronological Timeline, Left Arrow navigates to previous/earlier messages)
    // - "media" mode: Newest to Oldest (Gallery Grid, Right Arrow navigates to next photos in grid)
    const sortedMsgs = Array.from(map.values()).sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return lightboxSource === "media" ? timeB - timeA : timeA - timeB;
    });

    const items = [];
    sortedMsgs.forEach((m) => {
      if (!m || m.isDeletedForMe || m.deletedForAll) return;
      if (Array.isArray(m.attachments) && m.attachments.length > 0) {
        m.attachments.forEach((att, attIdx) => {
          items.push({
            id: `${m._id}_${attIdx}`,
            messageId: m._id,
            url: att.url,
            width: att.width,
            height: att.height,
            size: att.size,
            senderId: m.senderId,
            createdAt: m.createdAt,
            totalInAlbum: m.attachments.length,
            albumIndex: attIdx + 1,
          });
        });
      } else if (m.attachmentUrl) {
        items.push({
          id: `${m._id}_0`,
          messageId: m._id,
          url: m.attachmentUrl,
          width: m.attachmentWidth,
          height: m.attachmentHeight,
          size: m.attachmentSize,
          senderId: m.senderId,
          createdAt: m.createdAt,
          totalInAlbum: 1,
          albumIndex: 1,
        });
      }
    });
    return items;
  }, [messages, realtimeMessages, sharedMedia, lightboxSource]);

  const currentIndex = galleryItems.findIndex(
    (item) =>
      item.id === lightboxMessageId ||
      String(item.id) === String(lightboxMessageId) ||
      (lightboxMessageId && !String(lightboxMessageId).includes("_") && String(item.messageId) === String(lightboxMessageId))
  );

  const currentItem = currentIndex !== -1 ? galleryItems[currentIndex] : null;

  // Previous photo (Left Arrow)
  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setLightboxMessageId(galleryItems[currentIndex - 1].id);
    }
  }, [currentIndex, galleryItems, setLightboxMessageId]);

  // Next photo (Right Arrow)
  const handleNext = useCallback(() => {
    if (currentIndex < galleryItems.length - 1) {
      setLightboxMessageId(galleryItems[currentIndex + 1].id);
    }
  }, [currentIndex, galleryItems, setLightboxMessageId]);

  // Zoom Limit Controls (Min: 0.5x, Max: 3.5x)
  const handleZoomIn = useCallback(() => {
    setZoomScale((prev) => Math.min(3.5, Math.round((prev + 0.1) * 100) / 100));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomScale((prev) => {
      const nextScale = Math.max(0.5, Math.round((prev - 0.1) * 100) / 100);
      if (nextScale <= 1) setPanPosition({ x: 0, y: 0 });
      return nextScale;
    });
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoomScale(1);
    setPanPosition({ x: 0, y: 0 });
  }, []);

  // Reset zoom & pan when active image changes
  useEffect(() => {
    setZoomScale(1);
    setPanPosition({ x: 0, y: 0 });
  }, [currentItem?.id]);

  // Scroll active thumbnail into center of thumbnail strip
  useEffect(() => {
    if (activeThumbnailRef.current) {
      activeThumbnailRef.current.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    }
  }, [currentIndex]);

  // Non-passive wheel & gesture listener to completely stop browser page zoom
  useEffect(() => {
    if (!currentItem) return;

    // Intercept Ctrl+Wheel or Meta+Wheel window zoom gestures
    const preventBrowserWindowZoom = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };

    // Non-passive wheel handler on photo viewport for smooth photo-only scaling
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

  // Keyboard navigation & zoom shortcuts
  useEffect(() => {
    if (!currentItem) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setLightboxMessageId(null);
      } else if (e.key === "ArrowLeft") {
        handlePrev();
      } else if (e.key === "ArrowRight") {
        handleNext();
      } else if (e.key === "+" || e.key === "=") {
        handleZoomIn();
      } else if (e.key === "-") {
        handleZoomOut();
      } else if (e.key === "0") {
        handleResetZoom();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentItem, handlePrev, handleNext, handleZoomIn, handleZoomOut, handleResetZoom, setLightboxMessageId]);

  if (!currentItem) return null;

  const senderObj = typeof currentItem.senderId === "object" ? currentItem.senderId : null;
  const senderName = senderObj?.fullname || "Attachment";
  const senderAvatar = senderObj?.avatar;

  const createdAt = new Date(currentItem.createdAt);
  const formattedTime = createdAt.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const formattedDate = createdAt.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = currentItem.url;
    link.download = `photo_${currentItem.id}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Mouse drag panning when zoomed in
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

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-2xl flex flex-col justify-between p-4 sm:p-6 select-none animate-fade-in touch-none"
      onClick={() => setLightboxMessageId(null)}
    >
      {/* Top Header Bar */}
      <div
        className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-slate-900/80 border border-slate-800/80 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left: Sender Info & Counter */}
        <div className="flex items-center gap-3">
          {senderAvatar && (
            <img
              src={senderAvatar}
              alt={senderName}
              className="w-9 h-9 rounded-full object-cover border border-slate-700"
            />
          )}
          <div>
            <h4 className="text-sm font-bold text-white leading-tight">
              {senderName}
            </h4>
            <p className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5 flex-wrap">
              <span>{formattedDate} at {formattedTime}</span>
              {currentItem.width && currentItem.height && (
                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                  {currentItem.width}×{currentItem.height}
                </span>
              )}
              {currentItem.size && (
                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                  {currentItem.size > 1024 * 1024
                    ? `${(currentItem.size / (1024 * 1024)).toFixed(1)} MB`
                    : `${(currentItem.size / 1024).toFixed(0)} KB`}
                </span>
              )}
              {galleryItems.length > 1 && (
                <span className="px-2 py-0.5 rounded-full bg-slate-800 text-indigo-400 font-semibold">
                  {currentIndex + 1} of {galleryItems.length}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Center/Right: Zoom Controls, Download & Close */}
        <div className="flex items-center gap-2">
          {/* Zoom Control Group */}
          <div className="flex items-center gap-1 bg-slate-800/90 border border-slate-700/70 rounded-xl p-1 text-slate-200">
            <button
              onClick={handleZoomOut}
              disabled={zoomScale <= 0.5}
              className={`p-1.5 rounded-lg transition ${
                zoomScale <= 0.5
                  ? "opacity-30 cursor-not-allowed"
                  : "hover:bg-slate-700 hover:text-white cursor-pointer"
              }`}
              title="Zoom Out (Limit: 50%)"
            >
              <FiZoomOut className="text-base" />
            </button>

            <button
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
              onClick={handleZoomIn}
              disabled={zoomScale >= 3.5}
              className={`p-1.5 rounded-lg transition ${
                zoomScale >= 3.5
                  ? "opacity-30 cursor-not-allowed"
                  : "hover:bg-slate-700 hover:text-white cursor-pointer"
              }`}
              title="Zoom In (Limit: 350%)"
            >
              <FiZoomIn className="text-base" />
            </button>
          </div>

          {/* Download Button */}
          <button
            onClick={handleDownload}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white transition cursor-pointer"
            title="Download Photo"
          >
            <FiDownload className="text-lg" />
          </button>

          {/* Close Button */}
          <button
            onClick={() => setLightboxMessageId(null)}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white transition cursor-pointer"
            title="Close Viewer (Esc)"
          >
            <FiX className="text-lg" />
          </button>
        </div>
      </div>

      {/* Main Image View & Navigation Controls */}
      <div
        className="flex-1 flex items-center justify-between my-4 relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Previous Image Button (Left Arrow) */}
        {galleryItems.length > 1 && (
          <button
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className={`z-20 p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 text-white transition shadow-2xl ${
              currentIndex === 0
                ? "opacity-20 cursor-not-allowed"
                : "hover:bg-indigo-600 hover:scale-105 active:scale-95 cursor-pointer"
            }`}
            title="Previous Photo (Left Arrow)"
          >
            <FiChevronLeft className="text-2xl" />
          </button>
        )}

        {/* Main Centered High-Res Image Viewport */}
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
            key={currentItem.id}
            src={currentItem.url}
            alt="Full view"
            style={{
              transform: `scale(${zoomScale}) translate(${panPosition.x / zoomScale}px, ${panPosition.y / zoomScale}px)`,
              transition: isDragging ? "none" : "transform 0.2s ease-out",
            }}
            className="max-h-[80vh] max-w-[85vw] object-contain rounded-none shadow-2xl border border-slate-800/80 select-none pointer-events-auto"
            draggable={false}
          />
        </div>

        {/* Next Image Button (Right Arrow) */}
        {galleryItems.length > 1 && (
          <button
            onClick={handleNext}
            disabled={currentIndex === galleryItems.length - 1}
            className={`z-20 p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 text-white transition shadow-2xl ${
              currentIndex === galleryItems.length - 1
                ? "opacity-20 cursor-not-allowed"
                : "hover:bg-indigo-600 hover:scale-105 active:scale-95 cursor-pointer"
            }`}
            title="Next Photo (Right Arrow)"
          >
            <FiChevronRight className="text-2xl" />
          </button>
        )}
      </div>

      {/* Bottom Thumbnail Strip (if multiple photos in gallery) */}
      {galleryItems.length > 1 && (
        <div
          className="w-full flex items-center justify-center gap-2 overflow-x-auto py-2 px-4 rounded-2xl bg-slate-900/60 border border-slate-800/60 z-10 custom-scrollbar"
          onClick={(e) => e.stopPropagation()}
        >
          {galleryItems.map((item, idx) => {
            const isActive = idx === currentIndex;
            return (
              <img
                key={item.id}
                ref={isActive ? activeThumbnailRef : null}
                src={item.url}
                alt={`Thumb ${idx + 1}`}
                onClick={() => setLightboxMessageId(item.id)}
                className={`w-12 h-12 rounded-xl object-cover cursor-pointer border-2 transition ${
                  isActive
                    ? "border-indigo-500 scale-105 shadow-lg shadow-indigo-500/30 ring-1 ring-indigo-400"
                    : "border-transparent opacity-50 hover:opacity-100 hover:scale-100"
                }`}
                title={`Photo ${idx + 1} of ${galleryItems.length}`}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ImageLightbox;
