import React, { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { IoCheckmark, IoCheckmarkDone } from "react-icons/io5";
import {
  MdBlock,
  MdCallMade,
  MdCallReceived,
  MdCallMissed,
  MdVideocam,
} from "react-icons/md";
import {
  FiSmile,
  FiPlus,
  FiX,
  FiPhone,
  FiVideo,
} from "react-icons/fi";
import api from "../../api";
import toast from "react-hot-toast";
import useConversation from "../../zustand/useConversation";
import { useAuth } from "../../context/AuthProvider";
import EmojiPicker from "./EmojiPicker.jsx";
import { DEFAULT_USER_AVATAR_URL } from "../../config/systemAvatars.js";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

const MEMBER_COLORS = [
  { text: "text-emerald-400", ring: "ring-emerald-500/50" },
  { text: "text-amber-400", ring: "ring-amber-500/50" },
  { text: "text-violet-400", ring: "ring-violet-500/50" },
  { text: "text-sky-400", ring: "ring-sky-500/50" },
  { text: "text-pink-400", ring: "ring-pink-500/50" },
  { text: "text-teal-400", ring: "ring-teal-500/50" },
  { text: "text-indigo-400", ring: "ring-indigo-500/50" },
  { text: "text-rose-400", ring: "ring-rose-500/50" },
];

const getMemberColor = (idOrName) => {
  if (!idOrName) return MEMBER_COLORS[0];
  const str = String(idOrName);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % MEMBER_COLORS.length;
  return MEMBER_COLORS[index];
};

function Message({
  message,
  isFirstInSequence = true,
  isLastInSequence = true,
  // ── Selection props (Phase 3) ──────────────────────────────────────────────
  isSelected = false,
  isSelectionMode = false,
  onSelect,           // (messageId: string) => void
  // ── Mobile long-press (Phase 4) ───────────────────────────────────────────
  onLongPress,        // (messageId: string) => void
  onContextMenu,      // (e: Event, messageId: string) => void
  onAvatarClick,      // (user: Object) => void
}) {
  const {
    selectedConversation,
    setLightboxMessageId,
    updateMessageInStore,
    activeReactMessageId,
    setActiveReactMessageId,
    setActiveCall,
  } = useConversation();
  const [authUser] = useAuth();
  const myId = String(authUser?.user?._id || authUser?._id || "");

  const senderObj = typeof message.senderId === "object" ? message.senderId : null;
  const senderId = senderObj ? senderObj._id : message.senderId;
  const senderName = senderObj?.fullname || "";
  const senderAvatar = senderObj?.avatar || DEFAULT_USER_AVATAR_URL;

  const itsMe = String(senderId) === myId;
  const isGroup = Boolean(selectedConversation?.isGroup);

  const memberStyle = getMemberColor(senderId || senderName);
  const nameColor = memberStyle.text;
  const avatarRing = memberStyle.ring;

  const [isZoomed, setIsZoomed] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showCallConfirm, setShowCallConfirm] = useState(false);
  const [showReactionMenu, setShowReactionMenu] = useState(false);
  const [showFullPicker, setShowFullPicker] = useState(false);
  const [showReactionDetails, setShowReactionDetails] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState("all");
  const reactionBarRef = useRef(null);
  const reactionButtonRef = useRef(null);
  const reactionDetailsRef = useRef(null);
  const reactionBadgeRef = useRef(null);
  const plusButtonRef = useRef(null);

  // Call message attributes
  const callType = message.callDetails?.callType || "voice";
  const callDurationSec = message.callDetails?.duration || 0;
  const isCallMissed =
    !itsMe &&
    (message.callDetails?.status === "missed" ||
      message.callDetails?.status === "declined" ||
      message.callDetails?.status === "unanswered" ||
      callDurationSec === 0);

  const partnerUser = itsMe
    ? typeof message.receiverId === "object"
      ? message.receiverId
      : selectedConversation
    : typeof message.senderId === "object"
    ? message.senderId
    : selectedConversation;
  const partnerDisplayName = partnerUser?.fullname || selectedConversation?.fullname || "User";

  // Open reaction bar if triggered from context menu "React" option
  useEffect(() => {
    if (activeReactMessageId && String(activeReactMessageId) === String(message._id)) {
      setShowReactionMenu(true);
      setActiveReactMessageId(null);
    }
  }, [activeReactMessageId, message._id, setActiveReactMessageId]);

  // Close reaction menu on outside click (ignoring trigger button)
  useEffect(() => {
    if (!showReactionMenu && !showFullPicker) return;
    const handleClickOutside = (e) => {
      if (
        (reactionBarRef.current && reactionBarRef.current.contains(e.target)) ||
        (reactionButtonRef.current && reactionButtonRef.current.contains(e.target))
      ) {
        return;
      }
      setShowReactionMenu(false);
      setShowFullPicker(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showReactionMenu, showFullPicker]);

  // Close reaction details popover on outside click (ignoring reaction badge trigger)
  useEffect(() => {
    if (!showReactionDetails) return;
    const handleClickOutside = (e) => {
      if (
        (reactionDetailsRef.current && reactionDetailsRef.current.contains(e.target)) ||
        (reactionBadgeRef.current && reactionBadgeRef.current.contains(e.target))
      ) {
        return;
      }
      setShowReactionDetails(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showReactionDetails]);

  const createdAt = new Date(message.createdAt);
  const formattedTime = createdAt.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const isSeen = message.status === "seen" || message.seen === true;
  const isDelivered = message.status === "delivered" || isSeen;
  const isUploading = message.status === "uploading" || Boolean(message.isUploading);

  const attachments = Array.isArray(message.attachments) && message.attachments.length > 0
    ? message.attachments
    : message.attachmentUrl
    ? [
        {
          url: message.attachmentUrl,
          width: message.attachmentWidth,
          height: message.attachmentHeight,
          size: message.attachmentSize,
        },
      ]
    : [];
  //
  // Priority rule:
  // Once deletedForAll === true, it takes visual precedence over isDeletedForMe.
  // The user sees the tombstone ("This message was deleted") in place of the message.
  //
  const isDeletedForAll = Boolean(message.deletedForAll);

  // ── Reactions aggregation ────────────────────────────────────────────────
  const reactionGroups = useMemo(() => {
    if (!message.reactions || !Array.isArray(message.reactions) || message.reactions.length === 0) return [];
    const map = new Map();
    for (const r of message.reactions) {
      if (!r?.emoji) continue;
      const list = map.get(r.emoji) || [];
      list.push(r);
      map.set(r.emoji, list);
    }
    return Array.from(map.entries()).map(([emoji, userList]) => ({
      emoji,
      count: userList.length,
      users: userList,
      hasMyReaction: userList.some((u) => {
        const uId = typeof u.userId === "object" ? String(u.userId?._id) : String(u.userId);
        return uId === myId;
      }),
    }));
  }, [message.reactions, myId]);

  const totalReactionsCount = (message.reactions || []).length;
  const myCurrentReaction = useMemo(() => {
    const found = (message.reactions || []).find((r) => {
      const uId = typeof r.userId === "object" ? String(r.userId?._id) : String(r.userId);
      return uId === myId;
    });
    return found?.emoji || null;
  }, [message.reactions, myId]);

  // Filter reactors by active tab (Hook executed unconditionally on every render)
  const filteredReactors = useMemo(() => {
    if (!message.reactions || !Array.isArray(message.reactions)) return [];
    if (activeDetailTab === "all") return message.reactions;
    return message.reactions.filter((r) => r.emoji === activeDetailTab);
  }, [message.reactions, activeDetailTab]);

  // Handle Toggle Reaction
  const handleReact = async (emoji) => {
    setShowReactionMenu(false);
    setShowFullPicker(false);
    if (!message?._id) return;

    const currentReactions = Array.isArray(message.reactions) ? [...message.reactions] : [];
    const existingMatch = currentReactions.find((r) => {
      const uId = typeof r.userId === "object" ? String(r.userId?._id) : String(r.userId);
      return uId === myId && r.emoji === emoji;
    });

    let updatedReactions;
    if (existingMatch) {
      // Toggle off (remove)
      updatedReactions = currentReactions.filter((r) => {
        const uId = typeof r.userId === "object" ? String(r.userId?._id) : String(r.userId);
        return !(uId === myId && r.emoji === emoji);
      });
    } else {
      // Replace existing reaction or add new
      const filtered = currentReactions.filter((r) => {
        const uId = typeof r.userId === "object" ? String(r.userId?._id) : String(r.userId);
        return uId !== myId;
      });
      updatedReactions = [
        ...filtered,
        {
          emoji,
          userId: authUser?.user || { _id: myId, fullname: "You" },
          createdAt: new Date(),
        },
      ];
    }

    // 1. Optimistic Update
    updateMessageInStore(message._id, { reactions: updatedReactions });

    // 2. Server API call
    try {
      await api.post(`/api/message/react/${message._id}`, { emoji });
    } catch (err) {
      updateMessageInStore(message._id, { reactions: currentReactions });
      toast.error("Failed to update reaction");
    }
  };

  // ── Selection & Context Menu event handlers ──────────────────────────────
  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isSelectionMode) {
      if (onSelect) onSelect(String(message._id));
    } else {
      if (onContextMenu) {
        onContextMenu(e, message);
      } else if (onSelect) {
        onSelect(String(message._id));
      }
    }
  };

  const handleClick = (e) => {
    // Only intercept clicks while selection mode is active.
    // Normal clicks (no selection mode) pass through to child handlers.
    if (!isSelectionMode) return;
    e.stopPropagation();
    if (onSelect) onSelect(String(message._id));
  };

  // ── Mobile long-press handlers (Phase 4) ─────────────────────────────────
  //
  // Strategy: track touchstart time with a 500ms timer. Cancel on touchmove
  // (scroll) or touchend (tap).  Fires onLongPress only when the timer expires
  // without movement, so scrolling never triggers selection.
  //
  const longPressTimerRef = { current: null }; // plain object, not useState
  const touchStartPosRef = { current: null };

  const handleTouchStart = (e) => {
    // Don't trigger on multi-touch (pinch-to-zoom etc.)
    if (e.touches.length > 1) return;
    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      if (onLongPress) onLongPress(String(message._id));
    }, 500);
  };

  const handleTouchMove = (e) => {
    if (!longPressTimerRef.current) return;
    const touch = e.touches[0];
    const start = touchStartPosRef.current;
    if (!start) return;
    const dx = Math.abs(touch.clientX - start.x);
    const dy = Math.abs(touch.clientY - start.y);
    // Cancel if the finger moved more than 8px — user is scrolling.
    if (dx > 8 || dy > 8) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // ── Deleted for me: Hide message completely from this user's view ─────────
  // isDeletedForMe has absolute visual precedence over all other message states.
  if (message.isDeletedForMe) {
    return null;
  }

  return (
    <div
      className={`group relative flex items-start ${itsMe ? "justify-end" : "justify-start"
        } ${isFirstInSequence ? "mt-3.5" : "mt-2"} ${reactionGroups.length > 0 ? "mb-6" : "mb-1"
        } select-text ${isSelected ? "bg-indigo-500/10 rounded-lg -mx-2 px-2" : ""
        } transition-all duration-150`}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* ── Selection checkbox (left gutter) ──────────────────────────────── */}
      <div
        className={`flex-shrink-0 self-center flex items-center justify-center transition-all duration-200 ${isSelectionMode ? "w-7 opacity-100" : "w-0 opacity-0 overflow-hidden"
          }`}
        style={{ minWidth: isSelectionMode ? "28px" : "0px" }}
      >
        <div
          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-150 cursor-pointer ${isSelected
              ? "bg-indigo-500 border-indigo-400 scale-110"
              : "bg-transparent border-slate-500 hover:border-indigo-400 scale-100"
            }`}
        >
          {isSelected && (
            <IoCheckmark className="text-white text-[10px] font-black" />
          )}
        </div>
      </div>

      {/* ── Spacer: gap-2 equivalent between checkbox and message row ──────── */}
      {isSelectionMode && <div className="w-2 flex-shrink-0" />}

      {/* WhatsApp-style Sender Avatar on TOP-LEFT for Group Incoming Messages (First message in sequence) */}
      {!itsMe && isGroup && (
        <div className="w-8 h-8 flex-shrink-0 mr-3 self-start">
          {isFirstInSequence ? (
            <img
              src={senderAvatar}
              alt={senderName || "User"}
              onError={(e) => {
                if (e.currentTarget.src !== DEFAULT_USER_AVATAR_URL) {
                  e.currentTarget.src = DEFAULT_USER_AVATAR_URL;
                }
              }}
              onClick={(e) => {
                e.stopPropagation();
                onAvatarClick?.(senderObj || {
                  _id: senderId,
                  fullname: senderName || "User",
                  avatar: senderAvatar,
                });
              }}
              className="w-8 h-8 rounded-full object-cover ring-[1.5px] ring-white/85 shadow-sm cursor-pointer hover:opacity-90 active:scale-95 transition"
              title={`Click to view ${senderName || "Group Member"}'s profile`}
            />
          ) : (
            <div className="w-8 h-8" />
          )}
        </div>
      )}

      {/* WhatsApp Message Bubble */}
      <div
        onContextMenu={handleContextMenu}
        className={`relative max-w-[75%] sm:max-w-[60%] w-fit px-3.5 py-2 text-xs sm:text-sm shadow-sm space-y-1 ${isDeletedForAll
            ? "bg-[#202c33]/70 text-slate-400 italic rounded-2xl border border-slate-700/40"
            : itsMe
              ? `bg-[#005c4b] text-slate-100 ${isFirstInSequence ? "rounded-2xl rounded-tr-none" : "rounded-2xl"}`
              : `bg-[#202c33] text-slate-100 ${isFirstInSequence ? "rounded-2xl rounded-tl-none" : "rounded-2xl"}`
          }`}
      >
        {/* ── WhatsApp Floating Reaction Bar (Quick Emojis) ──────────────── */}
        {showReactionMenu && !isDeletedForAll && (
          <div
            ref={reactionBarRef}
            className={`absolute -top-13 ${itsMe ? "right-0" : "left-0"
              } z-40 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#202c33]/98 border border-[#2e3b43] shadow-[0_10px_35px_rgba(0,0,0,0.8)] backdrop-blur-2xl animate-in zoom-in-90 fade-in duration-150 ring-1 ring-white/10 whitespace-nowrap`}
            onClick={(e) => e.stopPropagation()}
          >
            {QUICK_REACTIONS.map((emoji) => {
              const isSelected = myCurrentReaction === emoji;
              return (
                <button
                  key={emoji}
                  onClick={() => handleReact(emoji)}
                  className={`w-8 h-8 flex items-center justify-center text-lg rounded-full hover:scale-130 hover:-translate-y-1 active:scale-105 transition-all duration-150 select-none ${isSelected
                      ? "bg-emerald-500/25 ring-2 ring-emerald-400 scale-115 shadow-[0_0_8px_rgba(52,211,153,0.4)]"
                      : "hover:bg-white/10"
                    }`}
                  title={isSelected ? `Remove ${emoji}` : `React with ${emoji}`}
                >
                  {emoji}
                </button>
              );
            })}
            <div className="w-px h-5 bg-slate-700/80 mx-0.5" />
            <button
              ref={plusButtonRef}
              onClick={() => setShowFullPicker((prev) => !prev)}
              className="w-7 h-7 flex items-center justify-center rounded-full text-slate-300 hover:text-white hover:bg-white/10 text-sm transition-all hover:scale-110 active:scale-95"
              title="More emojis"
            >
              <FiPlus />
            </button>

            {/* Full Emoji Picker Popover (Opens upwards above reaction bar) */}
            {showFullPicker && (
              <EmojiPicker
                className={`absolute bottom-full mb-2 ${itsMe ? "-right-4" : "-left-4"}`}
                triggerRef={plusButtonRef}
                onSelect={(emoji) => {
                  handleReact(emoji);
                  setShowFullPicker(false);
                  setShowReactionMenu(false);
                }}
                onClose={() => setShowFullPicker(false)}
              />
            )}
          </div>
        )}

        {/* WhatsApp SVG Tail for Incoming Message */}
        {!itsMe && isFirstInSequence && !isDeletedForAll && (
          <svg
            viewBox="0 0 8 13"
            width="8"
            height="13"
            shapeRendering="geometricPrecision"
            className="absolute -left-[7px] top-0 text-[#202c33] fill-current pointer-events-none"
          >
            <g transform="scale(-1, 1) translate(-8, 0)">
              <path d="M6.467 2.568L0 11.193V0h5.188c1.77 0 2.338 1.156 1.279 2.568z" />
            </g>
          </svg>
        )}

        {/* WhatsApp SVG Tail for Outgoing Message */}
        {itsMe && isFirstInSequence && !isDeletedForAll && (
          <svg
            viewBox="0 0 8 13"
            width="8"
            height="13"
            shapeRendering="geometricPrecision"
            className="absolute -right-[7px] top-0 text-[#005c4b] fill-current pointer-events-none"
          >
            <path d="M6.467 2.568L0 11.193V0h5.188c1.77 0 2.338 1.156 1.279 2.568z" />
          </svg>
        )}
        {/* Group Chat Only: Render Sender Name at top of FIRST message in consecutive sequence */}
        {!itsMe && isGroup && isFirstInSequence && !isDeletedForAll && (
          <p className={`text-[11px] font-bold ${nameColor} mb-1 leading-none tracking-wide`}>
            {senderName || "Group Member"}
          </p>
        )}

        {/* Deleted for Everyone Tombstone */}
        {isDeletedForAll ? (
          <div className="flex items-center gap-1.5 py-0.5 select-none text-slate-400">
            <MdBlock className="text-sm flex-shrink-0 opacity-80" />
            <span className="italic text-xs leading-relaxed text-slate-300/80">
              This message was deleted
            </span>
          </div>
        ) : (
          <>
            {/* ── Image / Multi-Image Album Rendering ── */}
            {attachments.length > 0 && (
              <div className="relative rounded-xl overflow-hidden mb-1 border border-slate-700/50 bg-slate-950/40">
                {/* 1 Image */}
                {attachments.length === 1 && (
                  <div
                    className="relative cursor-pointer max-h-64 bg-slate-900/60 overflow-hidden"
                    style={
                      attachments[0].width && attachments[0].height
                        ? { aspectRatio: `${attachments[0].width} / ${attachments[0].height}` }
                        : undefined
                    }
                    onClick={(e) => {
                      if (isSelectionMode || isUploading) return;
                      e.stopPropagation();
                      setLightboxMessageId(`${message._id}_0`, "chat");
                    }}
                  >
                    <img
                      src={attachments[0].url}
                      alt="Attachment"
                      loading="lazy"
                      className="max-h-64 w-full object-cover hover:opacity-90 transition"
                    />
                  </div>
                )}

                {/* 2 Images — Side-by-Side Grid */}
                {attachments.length === 2 && (
                  <div className="grid grid-cols-2 gap-1 w-[260px] sm:w-[320px] aspect-[4/3]">
                    {attachments.map((att, idx) => (
                      <div
                        key={idx}
                        className="relative h-full cursor-pointer overflow-hidden group/img bg-slate-900"
                        onClick={(e) => {
                          if (isSelectionMode || isUploading) return;
                          e.stopPropagation();
                          setLightboxMessageId(`${message._id}_${idx}`, "chat");
                        }}
                      >
                        <img
                          src={att.url}
                          alt={`Photo ${idx + 1}`}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover/img:scale-105 transition duration-150"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* 3 Images — 1 Left Large, 2 Right Stacked */}
                {attachments.length === 3 && (
                  <div className="grid grid-cols-2 grid-rows-2 gap-1 w-[260px] sm:w-[320px] aspect-[4/3]">
                    <div
                      className="row-span-2 relative h-full cursor-pointer overflow-hidden group/img bg-slate-900"
                      onClick={(e) => {
                        if (isSelectionMode || isUploading) return;
                        e.stopPropagation();
                        setLightboxMessageId(`${message._id}_0`, "chat");
                      }}
                    >
                      <img
                        src={attachments[0].url}
                        alt="Photo 1"
                        loading="lazy"
                        className="w-full h-full object-cover group-hover/img:scale-105 transition duration-150"
                      />
                    </div>
                    {attachments.slice(1, 3).map((att, idx) => (
                      <div
                        key={idx}
                        className="relative h-full cursor-pointer overflow-hidden group/img bg-slate-900"
                        onClick={(e) => {
                          if (isSelectionMode || isUploading) return;
                          e.stopPropagation();
                          setLightboxMessageId(`${message._id}_${idx + 1}`, "chat");
                        }}
                      >
                        <img
                          src={att.url}
                          alt={`Photo ${idx + 2}`}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover/img:scale-105 transition duration-150"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* 4 Images — 2x2 Grid */}
                {attachments.length === 4 && (
                  <div className="grid grid-cols-2 grid-rows-2 gap-1 w-[260px] sm:w-[320px] aspect-square">
                    {attachments.map((att, idx) => (
                      <div
                        key={idx}
                        className="relative h-full cursor-pointer overflow-hidden group/img bg-slate-900"
                        onClick={(e) => {
                          if (isSelectionMode || isUploading) return;
                          e.stopPropagation();
                          setLightboxMessageId(`${message._id}_${idx}`, "chat");
                        }}
                      >
                        <img
                          src={att.url}
                          alt={`Photo ${idx + 1}`}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover/img:scale-105 transition duration-150"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* 5 Images — 2 Top, 3 Bottom */}
                {attachments.length >= 5 && (
                  <div className="grid grid-cols-6 grid-rows-2 gap-1 w-[260px] sm:w-[320px] aspect-[4/3]">
                    <div
                      className="col-span-3 relative h-full cursor-pointer overflow-hidden group/img bg-slate-900"
                      onClick={(e) => {
                        if (isSelectionMode || isUploading) return;
                        e.stopPropagation();
                        setLightboxMessageId(`${message._id}_0`, "chat");
                      }}
                    >
                      <img
                        src={attachments[0].url}
                        alt="Photo 1"
                        loading="lazy"
                        className="w-full h-full object-cover group-hover/img:scale-105 transition duration-150"
                      />
                    </div>
                    <div
                      className="col-span-3 relative h-full cursor-pointer overflow-hidden group/img bg-slate-900"
                      onClick={(e) => {
                        if (isSelectionMode || isUploading) return;
                        e.stopPropagation();
                        setLightboxMessageId(`${message._id}_1`, "chat");
                      }}
                    >
                      <img
                        src={attachments[1].url}
                        alt="Photo 2"
                        loading="lazy"
                        className="w-full h-full object-cover group-hover/img:scale-105 transition duration-150"
                      />
                    </div>
                    {attachments.slice(2, 5).map((att, idx) => (
                      <div
                        key={idx}
                        className="col-span-2 relative h-full cursor-pointer overflow-hidden group/img bg-slate-900"
                        onClick={(e) => {
                          if (isSelectionMode || isUploading) return;
                          e.stopPropagation();
                          setLightboxMessageId(`${message._id}_${idx + 2}`, "chat");
                        }}
                      >
                        <img
                          src={att.url}
                          alt={`Photo ${idx + 3}`}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover/img:scale-105 transition duration-150"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* WhatsApp / Telegram-Style Premium Frosted Circular Upload Progress Loader */}
                {isUploading && (
                  <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-[3px] flex flex-col items-center justify-center pointer-events-none z-20 transition-all duration-300">
                    <div className="relative flex items-center justify-center w-14 h-14">
                      {/* Outer ambient glow */}
                      <div className="absolute inset-0 rounded-full bg-indigo-500/25 blur-md animate-pulse" />

                      {/* Frosted Glass Disc */}
                      <div className="absolute inset-0 rounded-full bg-slate-950/85 backdrop-blur-md border border-white/15 shadow-[0_8px_32px_rgba(0,0,0,0.8)]" />

                      {/* Smooth SVG Dual Progress Ring */}
                      <svg className="w-12 h-12 -rotate-90 animate-spin text-indigo-400" viewBox="0 0 48 48">
                        <circle
                          cx="24"
                          cy="24"
                          r="18"
                          fill="none"
                          stroke="rgba(255, 255, 255, 0.12)"
                          strokeWidth="3.5"
                        />
                        <circle
                          cx="24"
                          cy="24"
                          r="18"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3.5"
                          strokeDasharray="113.1"
                          strokeDashoffset="35"
                          strokeLinecap="round"
                          className="text-indigo-400 drop-shadow-[0_0_6px_rgba(129,140,248,0.8)]"
                        />
                      </svg>

                      {/* Center Animated Upward Arrow Symbol */}
                      <div className="absolute inset-0 flex items-center justify-center text-white">
                        <svg
                          className="w-5 h-5 animate-pulse text-white drop-shadow-md"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2.2"
                            d="M5 10l7-7m0 0l7 7m-7-7v18"
                          />
                        </svg>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── WhatsApp-Style Call Card Message ─────────────────── */}
            {message.messageType === "call" ? (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isSelectionMode) {
                    setShowCallConfirm(true);
                  }
                }}
                className="flex items-center gap-2.5 py-0.5 px-0.5 min-w-[145px] sm:min-w-[165px] cursor-pointer group/call select-none"
                title="Voice Call"
              >
                {/* WhatsApp Exact Call Icon: White Circle with Integrated Arrow Phone Logo */}
                <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center flex-shrink-0 shadow-sm transition group-hover/call:scale-105">
                  {isCallMissed ? (
                    callType === "video" ? (
                      <MdVideocam className="text-rose-500 text-xl" />
                    ) : (
                      <MdCallMissed className="text-rose-500 text-xl" />
                    )
                  ) : itsMe ? (
                    callType === "video" ? (
                      <MdVideocam className="text-slate-900 text-xl" />
                    ) : (
                      <MdCallMade className="text-slate-900 text-xl" />
                    )
                  ) : (
                    callType === "video" ? (
                      <MdVideocam className="text-emerald-600 text-xl" />
                    ) : (
                      <MdCallReceived className="text-emerald-600 text-xl" />
                    )
                  )}
                </div>

                {/* Call Details */}
                <div className="flex-1 min-w-0 pr-1">
                  <h4 className="text-xs sm:text-[13px] font-semibold text-slate-100 truncate">
                    {isCallMissed
                      ? `Missed ${callType === "video" ? "video" : "voice"} call`
                      : `${callType === "video" ? "Video" : "Voice"} call`}
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 font-normal">
                    {callDurationSec > 0
                      ? `${Math.floor(callDurationSec / 60)}m ${callDurationSec % 60}s`
                      : isCallMissed
                      ? "Tap to call back"
                      : "No answer"}
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Text Message */}
                {message.message && (() => {
                  const textContent = message.message;
                  const isLongText = textContent.length > 600 || textContent.split("\n").length > 10;

                  if (isLongText) {
                    return (
                      <div className="relative">
                        <div className={!isExpanded ? "max-h-48 sm:max-h-56 overflow-hidden relative" : "relative"}>
                          <p className="leading-relaxed whitespace-pre-wrap break-words text-slate-100 font-normal">
                            {textContent}
                          </p>
                          {/* Subtle Bottom Fade Gradient when collapsed */}
                          {!isExpanded && (
                            <div
                              className={`absolute inset-x-0 bottom-0 h-14 pointer-events-none bg-gradient-to-t ${
                                itsMe
                                  ? "from-[#005c4b] via-[#005c4b]/80 to-transparent"
                                  : "from-[#202c33] via-[#202c33]/80 to-transparent"
                              }`}
                            />
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setIsExpanded((prev) => !prev);
                          }}
                          className={`float-left text-xs font-semibold cursor-pointer select-none hover:underline transition-colors mt-1 ${
                            itsMe
                              ? "text-sky-400 hover:text-sky-300"
                              : "text-indigo-400 hover:text-indigo-300"
                          }`}
                        >
                          {isExpanded ? "Show less" : "Read more"}
                        </button>
                      </div>
                    );
                  }

                  return (
                    <p className="leading-relaxed whitespace-pre-wrap break-words text-slate-100 font-normal">
                      {textContent}
                    </p>
                  );
                })()}
              </>
            )}
          </>
        )}

        {/* Message Footer (Timestamp & Checkmark) */}
        <div className="flex items-center justify-end gap-1 text-[10px] text-slate-400 opacity-90 pt-1 ml-4 float-right select-none">
          <span>{formattedTime}</span>
          {isUploading ? (
            <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
              <span className="w-2 h-2 rounded-full border border-slate-400 border-t-transparent animate-spin" />
            </span>
          ) : !isDeletedForAll && itsMe && (
            isSeen ? (
              <IoCheckmarkDone
                className="text-sm text-sky-400 font-black drop-shadow-[0_0_4px_rgba(56,189,248,0.6)] transition-colors duration-300"
                title="Seen"
              />
            ) : isDelivered ? (
              <IoCheckmarkDone
                className="text-sm text-slate-400 font-normal transition-colors duration-300"
                title="Delivered"
              />
            ) : (
              <IoCheckmark
                className="text-sm text-slate-400 font-normal transition-colors duration-300"
                title="Sent"
              />
            )
          )}
        </div>

        {/* ── WhatsApp-Style Hanging Reactions Badge (15% overlap at bottom edge) ── */}
        {reactionGroups.length > 0 && !isDeletedForAll && (
          <div
            ref={reactionBadgeRef}
            onClick={(e) => {
              e.stopPropagation();
              setShowReactionDetails((prev) => !prev);
            }}
            className={`absolute -bottom-4 ${itsMe ? "right-2" : "left-2"
              } z-20 inline-flex items-center gap-1.5 px-2 py-0.5 h-[26px] rounded-full text-xs font-medium shadow-md shadow-black/70 border cursor-pointer select-none transition-all duration-200 hover:scale-110 active:scale-95 group/pill whitespace-nowrap ${myCurrentReaction
                ? "bg-[#0b3328] border-emerald-500/60 text-emerald-300 ring-1 ring-emerald-500/30"
                : "bg-[#182229] border-[#2a3942] text-slate-200 hover:border-slate-500/60 hover:bg-[#202c33]"
              }`}
            title={
              reactionGroups
                .map((g) => {
                  const names = g.users
                    .map((u) => {
                      const uObj = typeof u.userId === "object" ? u.userId : null;
                      const uIdStr = uObj ? String(uObj._id) : String(u.userId);
                      return uIdStr === myId ? "You" : uObj?.fullname || "User";
                    })
                    .join(", ");
                  return `${g.emoji} ${names}`;
                })
                .join("\n") || "Reactions"
            }
          >
            <div className="flex items-center -space-x-0.5">
              {reactionGroups.slice(0, 3).map((g) => (
                <span
                  key={g.emoji}
                  className="text-[15px] leading-none transition-transform group-hover/pill:scale-110 duration-150 inline-block drop-shadow-sm"
                >
                  {g.emoji}
                </span>
              ))}
            </div>
            {totalReactionsCount > 1 && (
              <span className={`text-[11px] font-bold tabular-nums ml-0.5 leading-none ${myCurrentReaction ? "text-emerald-300" : "text-slate-300"
                }`}>
                {totalReactionsCount}
              </span>
            )}
          </div>
        )}

        {/* ── WhatsApp-Style Reaction Info Popover (No Screen Dimming / Anchored Corner Popout) ── */}
        {showReactionDetails && (
          <div
            ref={reactionDetailsRef}
            className={`absolute bottom-6 ${itsMe
                ? "right-0 animate-wa-corner-pop-right"
                : "left-0 animate-wa-corner-pop-left"
              } z-50 w-72 max-w-[85vw] rounded-2xl bg-[#1f2c34]/98 border border-[#2a3942] shadow-[0_12px_40px_rgba(0,0,0,0.85)] backdrop-blur-2xl ring-1 ring-white/10 overflow-hidden select-none`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header: Total Reactions Text */}
            <div className="px-3.5 py-2.5 border-b border-[#2a3942]/80 bg-[#182229]/95 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200 tracking-tight">
                {totalReactionsCount} {totalReactionsCount === 1 ? "reaction" : "reactions"}
              </span>
            </div>

            {/* Reaction Emoji Filter Chips Bar (Shows individual reacted emojis and their counts) */}
            {reactionGroups.length > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[#2a3942]/50 bg-[#182229]/50 overflow-x-auto minimal-scrollbar">
                <button
                  onClick={() => setActiveDetailTab("all")}
                  className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all flex-shrink-0 ${activeDetailTab === "all"
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                    }`}
                >
                  All <span className="tabular-nums opacity-90">{totalReactionsCount}</span>
                </button>
                {reactionGroups.map((g) => (
                  <button
                    key={g.emoji}
                    onClick={() => setActiveDetailTab(g.emoji)}
                    className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all flex-shrink-0 ${activeDetailTab === g.emoji
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                      }`}
                  >
                    <span className="text-sm leading-none">{g.emoji}</span>
                    <span className="tabular-nums opacity-90">{g.count}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Reactors list (Strictly fixed height for 3 users, scrolls cleanly when 4+ users) */}
            <div className="p-2 h-[185px] overflow-y-auto space-y-1.5 minimal-scrollbar divide-y divide-slate-800/30">
              {filteredReactors.map((r, idx) => {
                const uObj = typeof r.userId === "object" ? r.userId : null;
                const uId = uObj ? String(uObj._id) : String(r.userId);
                const isMe = uId === myId;
                const name = isMe ? "You" : uObj?.fullname || "User";
                const avatar = uObj?.avatar || DEFAULT_USER_AVATAR_URL;

                return isMe ? (
                  /* Current User: Entire row is clickable to remove reaction with subtle normal hover */
                  <div
                    key={`${uId}-${r.emoji}-${idx}`}
                    onClick={() => {
                      handleReact(r.emoji);
                      setShowReactionDetails(false);
                    }}
                    className="w-full flex items-center justify-between gap-3 p-2.5 rounded-xl bg-emerald-500/10 hover:bg-slate-800/80 border border-emerald-500/25 hover:border-slate-700/80 transition-all duration-150 cursor-pointer group/row select-none shadow-sm active:scale-[0.99]"
                    title="Click anywhere to remove your reaction"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={avatar}
                        alt={name}
                        onError={(e) => {
                          if (e.currentTarget.src !== DEFAULT_USER_AVATAR_URL) {
                            e.currentTarget.src = DEFAULT_USER_AVATAR_URL;
                          }
                        }}
                        className="w-8 h-8 rounded-full object-cover ring-[1.5px] ring-white/85 shadow-sm flex-shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-emerald-300 truncate">
                          {name}
                        </p>
                        <p className="text-[10px] font-medium text-slate-400 group-hover/row:text-slate-300 transition-colors leading-tight">
                          Click to remove
                        </p>
                      </div>
                    </div>
                    <span className="text-lg select-none flex-shrink-0 drop-shadow-sm group-hover/row:scale-110 transition-transform">
                      {r.emoji}
                    </span>
                  </div>
                ) : (
                  /* Other User */
                  <div
                    key={`${uId}-${r.emoji}-${idx}`}
                    className="w-full flex items-center justify-between gap-3 p-2.5 rounded-xl hover:bg-slate-800/40 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={avatar}
                        alt={name}
                        onError={(e) => {
                          if (e.currentTarget.src !== DEFAULT_USER_AVATAR_URL) {
                            e.currentTarget.src = DEFAULT_USER_AVATAR_URL;
                          }
                        }}
                        className="w-8 h-8 rounded-full object-cover ring-[1.5px] ring-white/85 shadow-sm flex-shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-100 truncate">
                          {name}
                        </p>
                        <p className="text-[10px] text-slate-400 leading-tight">
                          {r.createdAt ? new Date(r.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                        </p>
                      </div>
                    </div>
                    <span className="text-lg select-none flex-shrink-0 drop-shadow-sm">{r.emoji}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Desktop Hover Reaction Trigger Icon ───────────────────────────── */}
      {!isDeletedForAll && !isSelectionMode && (
        <div
          className={`self-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center ${itsMe ? "order-first mr-1.5" : "order-last ml-1.5"
            }`}
        >
          <button
            ref={reactionButtonRef}
            onClick={(e) => {
              e.stopPropagation();
              setShowReactionMenu((prev) => !prev);
            }}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 transition-all active:scale-95 shadow-sm"
            title="React"
          >
            <FiSmile className="text-sm" />
          </button>
        </div>
      )}

      {/* Image Lightbox / Zoom Modal */}
      {isZoomed && message.attachmentUrl && (
        <div
          onClick={() => setIsZoomed(false)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out"
        >
          <img
            src={message.attachmentUrl}
            alt="Zoomed Attachment"
            className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl"
          />
        </div>
      )}

      {/* ── Call Confirmation Modal ─────────────────────────────────────── */}
      {showCallConfirm && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setShowCallConfirm(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in text-left"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-5 animate-scale-up"
          >
            <div className="flex items-center gap-3.5">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 ${
                  callType === "video"
                    ? "bg-violet-600/20 text-violet-400 border border-violet-500/30"
                    : "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30"
                }`}
              >
                {callType === "video" ? <FiVideo /> : <FiPhone />}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-white truncate">
                  Call {partnerDisplayName}?
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 capitalize">
                  Start a {callType} call with this user
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowCallConfirm(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowCallConfirm(false);
                  setActiveCall({
                    isInitiator: true,
                    userToCall: partnerUser || selectedConversation,
                    callType,
                  });
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold text-white shadow-lg transition active:scale-95 flex items-center gap-1.5 ${
                  callType === "video"
                    ? "bg-violet-600 hover:bg-violet-500 shadow-violet-600/30"
                    : "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30"
                }`}
              >
                {callType === "video" ? <FiVideo className="text-sm" /> : <FiPhone className="text-sm" />}
                Call
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Message;
