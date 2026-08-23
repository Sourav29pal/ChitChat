import React, { useRef, useState, useEffect, useCallback } from "react";
import { IoSend } from "react-icons/io5";
import {
  FiX,
  FiImage,
  FiSmile,
  FiPaperclip,
  FiFileText,
  FiMapPin,
  FiMaximize2,
  FiCrop,
} from "react-icons/fi";
import useSendMessage from "../../context/useSendMessage.js";
import toast from "react-hot-toast";
import EmojiPicker from "./EmojiPicker.jsx";
import { useSocketContext } from "../../context/SocketContext";
import useConversation from "../../zustand/useConversation.js";
import { useAuth } from "../../context/AuthProvider.jsx";
import ChatAttachmentPreviewModal from "../../components/ChatAttachmentPreviewModal.jsx";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB limit
const MAX_SOURCE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB source size guard
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Client-side compression pipeline for chat images.
 * Downscales oversized images (5MB–25MB) and exports optimized JPEG blobs <= 5MB.
 */
const compressImageFile = async (file) => {
  if (!file) throw new Error("No file provided");

  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error("Only JPG, PNG, and WebP images are allowed.");
  }

  if (file.size > MAX_SOURCE_SIZE_BYTES) {
    throw new Error("Image exceeds the 25 MB maximum source size limit.");
  }

  // If already <= 5 MB, return original file
  if (file.size <= MAX_FILE_SIZE_BYTES) {
    return file;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = async () => {
      URL.revokeObjectURL(objectUrl);
      try {
        const MAX_DIM = 1920;
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return reject(new Error("Failed to initialize compression canvas"));
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        const getBlob = (quality) =>
          new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));

        const qualities = [0.85, 0.75, 0.65, 0.5];
        let finalBlob = null;

        for (const q of qualities) {
          finalBlob = await getBlob(q);
          if (finalBlob && finalBlob.size <= MAX_FILE_SIZE_BYTES) {
            break;
          }
        }

        if (!finalBlob || finalBlob.size > MAX_FILE_SIZE_BYTES) {
          return reject(
            new Error("Image could not be compressed below 5 MB. Please choose a smaller image.")
          );
        }

        const compressedFile = new File(
          [finalBlob],
          file.name.replace(/\.[^.]+$/, ".jpg"),
          { type: "image/jpeg" }
        );
        resolve(compressedFile);
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load image for compression"));
    };

    img.src = objectUrl;
  });
};

function Typesend() {
  const [message, setMessage] = useState("");
  const [selectedImages, setSelectedImages] = useState([]); // [{ file: File/Blob, previewUrl: string, id: string }]
  const [previewIndex, setPreviewIndex] = useState(null); // null or number for full preview & crop modal
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);

  const fileInputRef = useRef(null);
  const docInputRef = useRef(null);
  const textareaRef = useRef(null);
  const attachMenuRef = useRef(null);
  const emojiButtonRef = useRef(null);
  const { loading, sendMessages } = useSendMessage();

  // ── Typing indicator timing calibration ──────────────────────────────────
  const TYPING_HEARTBEAT_MS = 900;
  const TYPING_STOP_DEBOUNCE_MS = 1200;

  const { socket } = useSocketContext();
  const { selectedConversation } = useConversation();
  const [authUser] = useAuth();
  const typingInProgressRef = useRef(false);
  const lastTypingEmitRef = useRef(0);
  const typingTimerRef = useRef(null);

  const stopTyping = useCallback(() => {
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    if (typingInProgressRef.current && socket && selectedConversation?._id) {
      socket.emit("typing-stop", {
        receiverId: selectedConversation._id,
        conversationId: selectedConversation._id,
        isGroup: Boolean(selectedConversation.isGroup),
      });
    }
    typingInProgressRef.current = false;
    lastTypingEmitRef.current = 0;
  }, [socket, selectedConversation]);

  const handleTypingStart = useCallback(() => {
    if (!socket || !selectedConversation?._id) return;

    const now = Date.now();
    if (!typingInProgressRef.current || now - lastTypingEmitRef.current > TYPING_HEARTBEAT_MS) {
      typingInProgressRef.current = true;
      lastTypingEmitRef.current = now;
      socket.emit("typing", {
        receiverId: selectedConversation._id,
        conversationId: selectedConversation._id,
        isGroup: Boolean(selectedConversation.isGroup),
        senderName: authUser?.user?.fullname || "Someone",
      });
    }

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      stopTyping();
    }, TYPING_STOP_DEBOUNCE_MS);
  }, [socket, selectedConversation, authUser, stopTyping]);

  useEffect(() => {
    return () => {
      stopTyping();
    };
  }, [selectedConversation?._id, stopTyping]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const scrollH = textareaRef.current.scrollHeight;
      const targetH = Math.min(Math.max(scrollH, 36), 130);
      textareaRef.current.style.height = `${targetH}px`;
    }
  }, [message]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        attachMenuRef.current &&
        !attachMenuRef.current.contains(e.target) &&
        !e.target.closest(".attach-toggle-btn")
      ) {
        setShowAttachMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleImageSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    e.target.value = "";

    if (selectedImages.length + files.length > 5) {
      toast.error("Maximum 5 images allowed per upload");
      return;
    }

    const toastId = toast.loading("Processing image(s)...");
    const newItems = [];

    for (const file of files) {
      try {
        const processedFile = await compressImageFile(file);
        const previewUrl = URL.createObjectURL(processedFile);
        newItems.push({
          file: processedFile,
          previewUrl,
          originalFile: processedFile,
          originalPreviewUrl: previewUrl,
          isCropped: false,
          id: Math.random().toString(36).substring(2, 9),
        });
      } catch (err) {
        toast.error(err.message || "Failed to process image");
      }
    }

    toast.dismiss(toastId);

    if (newItems.length > 0) {
      setSelectedImages((prev) => [...prev, ...newItems]);
      setShowAttachMenu(false);
    }
  };

  const handleUpdateImage = (index, newFile, newPreviewUrl) => {
    setSelectedImages((prev) => {
      const updated = [...prev];
      if (updated[index]) {
        if (updated[index].previewUrl !== updated[index].originalPreviewUrl) {
          URL.revokeObjectURL(updated[index].previewUrl);
        }
        updated[index] = {
          ...updated[index],
          file: newFile,
          previewUrl: newPreviewUrl,
          isCropped: true,
        };
      }
      return updated;
    });
  };

  const handleRevertToOriginal = (index) => {
    setSelectedImages((prev) => {
      const updated = [...prev];
      if (updated[index] && updated[index].originalFile) {
        if (updated[index].previewUrl !== updated[index].originalPreviewUrl) {
          URL.revokeObjectURL(updated[index].previewUrl);
        }
        updated[index] = {
          ...updated[index],
          file: updated[index].originalFile,
          previewUrl: updated[index].originalPreviewUrl,
          isCropped: false,
        };
        toast.success("Reverted to original photo");
      }
      return updated;
    });
  };

  const handleRemoveImage = (id) => {
    setSelectedImages((prev) => {
      const item = prev.find((img) => img.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      const remaining = prev.filter((img) => img.id !== id);
      if (remaining.length === 0) {
        setPreviewIndex(null);
      }
      return remaining;
    });
  };

  const handleEmojiSelect = (emoji) => {
    setMessage((prev) => {
      if (prev.length + emoji.length > 4000) {
        toast("Message limited to 4,000 characters", { icon: "⚠️", duration: 3000 });
        return (prev + emoji).slice(0, 4000);
      }
      return prev + emoji;
    });
  };

  const handlePaste = async (e) => {
    // 1. Check for image in clipboard items
    const items = e.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            if (selectedImages.length >= 5) {
              toast.error("Maximum 5 images allowed per upload");
              return;
            }
            try {
              const processedFile = await compressImageFile(file);
              const previewUrl = URL.createObjectURL(processedFile);
              setSelectedImages((prev) => [
                ...prev,
                {
                  file: processedFile,
                  previewUrl,
                  originalFile: processedFile,
                  originalPreviewUrl: previewUrl,
                  isCropped: false,
                  id: Math.random().toString(36).substring(2, 9),
                },
              ]);
              setShowAttachMenu(false);
            } catch (err) {
              toast.error(err.message || "Failed to process clipboard image");
            }
            return;
          }
        }
      }
    }

    // 2. Text paste handling
    const pastedText = e.clipboardData?.getData("text") || "";
    if (!pastedText) return;

    const textarea = textareaRef.current;
    const start = textarea ? textarea.selectionStart || 0 : message.length;
    const end = textarea ? textarea.selectionEnd || 0 : message.length;
    const currentVal = message;
    const availableLength = 4000 - (currentVal.length - (end - start));

    if (pastedText.length > availableLength) {
      e.preventDefault();
      const allowedPastedText = pastedText.slice(0, Math.max(0, availableLength));
      const nextValue = (currentVal.slice(0, start) + allowedPastedText + currentVal.slice(end)).slice(0, 4000);
      setMessage(nextValue);
      handleTypingStart();
      toast("Message limited to 4,000 characters", {
        icon: "⚠️",
        duration: 3000,
      });

      requestAnimationFrame(() => {
        if (textareaRef.current) {
          const newPos = start + allowedPastedText.length;
          textareaRef.current.selectionStart = newPos;
          textareaRef.current.selectionEnd = newPos;
        }
      });
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleSubmit = async (e) => {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    if ((!message.trim() && selectedImages.length === 0) || loading) return;

    stopTyping();

    const cleanText = message.trim();
    const imagesToSend = [...selectedImages];

    // Immediately clear input fields to prevent double submission
    setMessage("");
    setSelectedImages([]);
    setShowEmojiPicker(false);
    setShowAttachMenu(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (textareaRef.current) textareaRef.current.style.height = "36px";

    if (imagesToSend.length > 0) {
      const myId = String(authUser?.user?._id || authUser?._id || "");
      const optId = `opt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const optMessage = {
        _id: optId,
        senderId: authUser?.user || { _id: myId, fullname: "You" },
        receiverId: selectedConversation._id,
        conversationId: selectedConversation._id,
        message: cleanText,
        messageType: "image",
        attachmentUrl: imagesToSend[0].previewUrl,
        attachments: imagesToSend.map((item) => ({
          url: item.previewUrl,
          size: item.file.size,
        })),
        status: "uploading",
        isUploading: true,
        createdAt: new Date().toISOString(),
      };

      // Optimistically show the uploading photo album immediately in the chat
      useConversation.getState().setMessage((prev) => [
        ...(Array.isArray(prev) ? prev : []),
        optMessage,
      ]);

      const formData = new FormData();
      if (cleanText) {
        formData.append("message", cleanText);
      }
      formData.append("messageType", "image");
      imagesToSend.forEach((item) => {
        formData.append("images", item.file, item.file.name || "image.jpg");
      });

      try {
        await sendMessages(formData, optMessage);
      } catch (err) {
        toast.error("Failed to send photo(s)");
      } finally {
        imagesToSend.forEach((img) => URL.revokeObjectURL(img.previewUrl));
      }
    } else {
      try {
        await sendMessages({
          message: cleanText,
          messageType: "text",
        });
      } catch (err) {
        toast.error("Failed to send message");
      }
    }
  };

  return (
    <div className="w-full space-y-2 relative z-40">
      {/* Emoji Picker Popover */}
      {showEmojiPicker && (
        <EmojiPicker
          className="absolute bottom-full mb-3 left-2 sm:left-4 z-50"
          triggerRef={emojiButtonRef}
          onSelect={handleEmojiSelect}
          onClose={() => setShowEmojiPicker(false)}
        />
      )}

      {/* Attachment Menu Popover */}
      {showAttachMenu && (
        <div
          ref={attachMenuRef}
          className="absolute bottom-full mb-3 left-2 sm:left-3 z-50 w-52 rounded-2xl bg-[#1e2a30]/95 border border-[#2a3942] shadow-2xl backdrop-blur-xl p-2.5 space-y-1 animate-wa-popup-bottom"
        >
          <div className="flex items-center justify-between px-2 py-1 mb-1 border-b border-[#2a3942]/60">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Attach
            </span>
            <button
              type="button"
              onClick={() => setShowAttachMenu(false)}
              className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 rounded-lg transition"
            >
              <FiX className="text-sm" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              fileInputRef.current?.click();
              setShowAttachMenu(false);
            }}
            className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-slate-700/50 text-slate-200 text-xs font-medium transition group text-left"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-violet-600 to-fuchsia-500 flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform">
              <FiImage className="text-base" />
            </div>
            <div>
              <p className="font-semibold text-slate-100">Photos (Max 5)</p>
              <p className="text-[10px] text-slate-400">JPEG, PNG, WebP (up to 5MB)</p>
            </div>
          </button>
        </div>
      )}

      {/* Image Preview Thumbnails List — Matched precisely to message input capsule width */}
      {selectedImages.length > 0 && (
        <div className="flex items-center gap-2.5">
          <div className="flex-1 min-w-0 flex items-center gap-2.5 p-2 bg-slate-800/90 rounded-2xl border border-slate-700/80 shadow-md overflow-x-auto custom-scrollbar">
            {selectedImages.map((img, idx) => (
              <div
                key={img.id}
                onClick={() => setPreviewIndex(idx)}
                className="relative flex-shrink-0 group/preview cursor-pointer rounded-xl overflow-hidden ring-1 ring-white/10 hover:ring-indigo-500 hover:shadow-lg transition-all duration-200"
                title="Click to preview or crop photo"
              >
                <img
                  src={img.previewUrl}
                  alt="Preview"
                  className="w-16 h-16 sm:w-20 sm:h-20 object-cover group-hover/preview:scale-105 transition-transform duration-200"
                />
                {/* Hover overlay with Maximize & Crop icon */}
                <div className="absolute inset-0 bg-black/45 opacity-0 group-hover/preview:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white pointer-events-none">
                  <span className="p-1.5 rounded-lg bg-black/60 backdrop-blur-sm shadow-md" title="Preview / Crop">
                    <FiMaximize2 className="text-xs text-white" />
                  </span>
                </div>
                {/* Remove button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveImage(img.id);
                  }}
                  className="absolute top-1 right-1 p-1 bg-rose-600/90 hover:bg-rose-500 text-white rounded-full shadow-md transition hover:scale-110 active:scale-95 z-10 cursor-pointer"
                  title="Remove image"
                >
                  <FiX className="text-[10px]" />
                </button>
              </div>
            ))}
            {selectedImages.length < 5 && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-16 h-16 sm:w-20 sm:h-20 flex flex-col items-center justify-center border-2 border-dashed border-slate-600/80 hover:border-indigo-400 hover:bg-slate-700/40 rounded-xl text-slate-400 hover:text-indigo-300 transition flex-shrink-0 cursor-pointer"
                title="Add more photos"
              >
                <FiImage className="text-xl mb-0.5" />
                <span className="text-[10px] font-semibold">+ Add</span>
              </button>
            )}
          </div>
          {/* Spacer matching Send button width (w-11) for pixel-perfect alignment */}
          <div className="w-11 flex-shrink-0" />
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-2.5">
        {/* Unified Input Box Capsule with Smooth Anti-Aliased Edges */}
        <div className="flex-1 flex flex-col rounded-2xl bg-slate-800/85 border border-slate-700/70 focus-within:border-indigo-500/80 focus-within:ring-1 focus-within:ring-indigo-500/40 transition-all shadow-sm overflow-hidden bg-clip-padding [transform:translateZ(0)] [backface-visibility:hidden]">
          {/* Top Section: Clip Button + Emoji Button + Scrollable Textarea */}
          <div className="flex items-end px-2 pt-1.5 pb-0.5 gap-1">
            {/* Hidden File Input (supports multiple images up to 5) */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageSelect}
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
            />

            {/* 1. Attachment Paperclip Button on Left */}
            <button
              type="button"
              onClick={() => {
                setShowAttachMenu((prev) => !prev);
                setShowEmojiPicker(false);
              }}
              className={`attach-toggle-btn w-9 h-9 mb-0.5 rounded-xl flex items-center justify-center transition-all duration-300 flex-shrink-0 ${
                showAttachMenu
                  ? "bg-indigo-600/30 text-indigo-400 rotate-45 shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 rotate-0"
              }`}
              title="Attach file"
            >
              {showAttachMenu ? (
                <FiX className="text-xl -rotate-45 transition-transform duration-300" />
              ) : (
                <FiPaperclip className="text-xl rotate-0 transition-transform duration-300" />
              )}
            </button>

            {/* 2. Emoji Button beside Clip */}
            <button
              ref={emojiButtonRef}
              type="button"
              onClick={() => {
                setShowEmojiPicker((prev) => !prev);
                setShowAttachMenu(false);
              }}
              className={`w-9 h-9 mb-0.5 rounded-xl flex items-center justify-center transition flex-shrink-0 ${
                showEmojiPicker
                  ? "bg-indigo-600/30 text-indigo-400"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
              }`}
              title="Add emoji"
            >
              <FiSmile className="text-xl" />
            </button>

            {/* 3. Scrollable Textarea */}
            <textarea
              ref={textareaRef}
              rows={1}
              maxLength={4000}
              placeholder="Type a message..."
              value={message}
              onChange={(e) => {
                const val = e.target.value;
                if (val.length > 4000) {
                  setMessage(val.slice(0, 4000));
                } else {
                  setMessage(val);
                }
                if (val) {
                  handleTypingStart();
                } else {
                  // Input became empty — stop immediately
                  stopTyping();
                }
              }}
              onPaste={handlePaste}
              onKeyDown={handleKeyDown}
              className="flex-1 px-2.5 py-1.5 bg-transparent text-white placeholder:text-slate-500 outline-none text-sm resize-none custom-scrollbar leading-relaxed"
              style={{ maxHeight: "120px", minHeight: "36px" }}
            />
          </div>

          {/* Fixed Footer Area (Counter aligned right, layout separation without visible line) */}
          <div className="flex items-center justify-end px-3 pb-1.5 pt-0.5 min-h-[20px]">
            {message.length > 0 && (
              <span
                className={`text-[11px] leading-none select-none transition-colors duration-150 ${
                  message.length >= 4000
                    ? "text-rose-500 font-semibold"
                    : "text-slate-400 font-normal"
                }`}
              >
                {message.length >= 4000 ? "Max limit reached" : message.length}
              </span>
            )}
          </div>
        </div>

        {/* Send Button */}
        <button
          type="submit"
          disabled={loading || (!message.trim() && selectedImages.length === 0)}
          className="w-11 h-11 flex items-center justify-center rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
          title="Send message"
        >
          <IoSend className="text-white text-lg" />
        </button>
      </form>

      {/* Full-Screen Attachment Preview & Crop Lightbox */}
      {previewIndex !== null && selectedImages.length > 0 && (
        <ChatAttachmentPreviewModal
          images={selectedImages}
          initialIndex={previewIndex}
          onClose={() => setPreviewIndex(null)}
          onRemoveImage={handleRemoveImage}
          onUpdateImage={handleUpdateImage}
          onRevertToOriginal={handleRevertToOriginal}
        />
      )}
    </div>
  );
}

export default Typesend;
