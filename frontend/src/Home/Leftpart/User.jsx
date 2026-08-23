import React, { useState } from "react";
import useConversation from "../../zustand/useConversation.js";
import { useSocketContext } from "../../context/SocketContext.jsx";
import { useAuth } from "../../context/AuthProvider.jsx";
import {
  FiUsers,
  FiArrowUpRight,
  FiArrowDownLeft,
  FiPhone,
  FiVideo,
} from "react-icons/fi";
import { BsPinAngleFill } from "react-icons/bs";
import { IoCheckmark, IoCheckmarkDone } from "react-icons/io5";
import ProfileActionPopup from "../../components/ProfileActionPopup";

function User({ user, onContextMenu }) {
  const [authUser] = useAuth();
  const [showProfilePopup, setShowProfilePopup] = useState(false);
  const {
    selectedConversation,
    setSelectedConversation,
    setActiveTab,
    unreadCounts,
    lastMessages,
    pinnedIds,
    typingUsers,
  } = useConversation();

  const currentUserId = authUser?.user?._id ? String(authUser.user._id) : "";
  const userIdStr = String(user._id);

  const isSelected = selectedConversation?._id === user._id;
  const isPinned = pinnedIds.includes(userIdStr);
  const isGroup = user.isGroup || false;

  const { onlineUsers } = useSocketContext();
  const isOnline = !isGroup && onlineUsers?.includes(user._id);

  const typersMap = typingUsers?.[userIdStr] || {};
  const activeTyperNames = typeof typersMap === "object" ? Object.values(typersMap).filter(Boolean) : [];
  const isTyping = activeTyperNames.length > 0;

  let typingLabel = "";
  if (isTyping) {
    if (!isGroup) {
      const name = activeTyperNames[0] || user.fullname || "Someone";
      typingLabel = `${name} is typing...`;
    } else {
      if (activeTyperNames.length === 1) {
        typingLabel = `${activeTyperNames[0]} is typing...`;
      } else if (activeTyperNames.length === 2) {
        typingLabel = `${activeTyperNames[0]} and ${activeTyperNames[1]} are typing...`;
      } else {
        typingLabel = `${activeTyperNames[0]} and ${activeTyperNames.length - 1} others are typing...`;
      }
    }
  }

  const unreadCount = unreadCounts[userIdStr] || 0;
  const dynamicLastMsg = lastMessages[userIdStr];

  // Derive last message text, sender, status, call details & time snippet
  let lastMsgRaw = "";
  let lastMsgTime = "";
  let isSentByMe = false;
  let lastMsgStatus = "sent"; // 'sent' | 'delivered' | 'seen'
  let isCallMsg = false;
  let isMissedCall = false;
  let callType = "voice";
  const hasLastMsg = Boolean(
    (dynamicLastMsg && !dynamicLastMsg.isEmpty) ||
    (!dynamicLastMsg && user.lastMessage)
  );

  const activeMsg = dynamicLastMsg?.isEmpty ? null : (dynamicLastMsg || user.lastMessage);
  if (activeMsg) {
    const msgSenderId = activeMsg.senderId?._id || activeMsg.senderId;
    isSentByMe = String(msgSenderId) === currentUserId;
    lastMsgStatus = activeMsg.status || "sent";

    if (activeMsg.messageType === "call") {
      isCallMsg = true;
      callType = activeMsg.callDetails?.callType || "voice";
      const callStatus = activeMsg.callDetails?.status;
      const duration = Number(activeMsg.callDetails?.duration) || 0;
      isMissedCall =
        !isSentByMe &&
        (callStatus === "missed" ||
          callStatus === "declined" ||
          callStatus === "unanswered" ||
          duration === 0);
      
      if (isMissedCall) {
        lastMsgRaw = `Missed ${callType === "video" ? "video" : "voice"} call`;
      } else {
        lastMsgRaw = `${callType === "video" ? "Video" : "Voice"} call`;
      }
    } else if (activeMsg.messageType === "image") {
      lastMsgRaw = "📷 Photo";
    } else {
      lastMsgRaw = activeMsg.text || activeMsg.message || "";
    }

    if (activeMsg.createdAt) {
      lastMsgTime = new Date(activeMsg.createdAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  } else {
    lastMsgRaw = isGroup
      ? `${user.members?.length || 0} members`
      : "No messages yet";
  }

  const avatarUrl = isGroup
    ? user.groupAvatar ||
      `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(
        user.groupName
      )}`
    : user.avatar ||
      `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(
        user.uid || user._id
      )}`;

  const displayName = isGroup ? user.groupName : user.fullname;

  return (
    <div
      onContextMenu={(e) => onContextMenu && onContextMenu(e, user)}
      className={`flex items-center gap-3.5 px-4 py-3 border-b border-slate-800/40 transition duration-200 select-none ${
        isSelected
          ? "bg-indigo-600/20 border-l-4 border-l-indigo-500"
          : "hover:bg-slate-800/60"
      }`}
    >
      {/* ── TARGET 1: DEDICATED AVATAR BUTTON (Profile Action Popup) ── */}
      <button
        type="button"
        aria-label={`View profile actions for ${displayName}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShowProfilePopup(true);
        }}
        className="relative flex-shrink-0 cursor-pointer group/avatar p-0 bg-transparent border-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        title={`Click to view ${displayName}'s profile actions`}
      >
        <img
          src={avatarUrl}
          alt={displayName}
          className="w-11 h-11 rounded-full object-cover ring-[1.5px] ring-white/80 shadow-sm group-hover/avatar:scale-105 active:scale-95 transition duration-200"
        />
        {isOnline && (
          <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-slate-900 rounded-full shadow-sm shadow-emerald-500/50 pointer-events-none" />
        )}
        {isGroup && (
          <span className="absolute -bottom-1 -right-1 p-1 bg-violet-600 border border-slate-900 rounded-full text-white text-[10px] pointer-events-none">
            <FiUsers />
          </span>
        )}
      </button>

      {/* ── TARGET 2: DEDICATED CONVERSATION CONTENT (Open/Select Chat) ── */}
      <div
        role="button"
        tabIndex={0}
        aria-label={`Open chat with ${displayName}`}
        onClick={() => {
          setSelectedConversation(user);
          setActiveTab("chats");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setSelectedConversation(user);
            setActiveTab("chats");
          }
        }}
        className="flex-1 min-w-0 cursor-pointer focus:outline-none py-0.5"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="font-bold text-sm text-slate-100 truncate">{displayName}</p>
            {isPinned && (
              <BsPinAngleFill
                className="text-amber-400 text-xs flex-shrink-0 drop-shadow-[0_0_6px_rgba(251,191,36,0.5)]"
                title="Pinned Chat"
              />
            )}
          </div>
          {lastMsgTime && (
            <span
              className={`text-[10px] ${
                unreadCount > 0
                  ? "text-emerald-400 font-bold"
                  : "text-slate-500 font-medium"
              }`}
            >
              {lastMsgTime}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between mt-0.5 gap-2">
          {/* Left: tick (if sent) + message text OR typing indicator */}
          <div className="flex items-center gap-1 min-w-0 flex-1">
            {isTyping ? (
              <div className="flex items-center gap-1.5 min-w-0 text-emerald-400">
                <span className="flex items-end gap-[2px] h-2.5 flex-shrink-0">
                  <span className="w-1 h-1 rounded-full bg-emerald-400 animate-typing-dot" style={{ animationDelay: "0ms" }} />
                  <span className="w-1 h-1 rounded-full bg-emerald-400 animate-typing-dot" style={{ animationDelay: "160ms" }} />
                  <span className="w-1 h-1 rounded-full bg-emerald-400 animate-typing-dot" style={{ animationDelay: "320ms" }} />
                </span>
                <p className="text-xs font-semibold italic text-emerald-400 truncate">
                  {typingLabel}
                </p>
              </div>
            ) : (
              <>
                {isCallMsg ? (
                  <div className="flex items-center gap-1 min-w-0 flex-1">
                    {isMissedCall ? (
                      <FiArrowDownLeft className="text-rose-400 text-xs flex-shrink-0" />
                    ) : isSentByMe ? (
                      <FiArrowUpRight className="text-emerald-400 text-xs flex-shrink-0" />
                    ) : (
                      <FiArrowDownLeft className="text-emerald-400 text-xs flex-shrink-0" />
                    )}
                    {callType === "video" ? (
                      <FiVideo className={`text-xs flex-shrink-0 ${isMissedCall ? "text-rose-400" : "text-slate-400"}`} />
                    ) : (
                      <FiPhone className={`text-xs flex-shrink-0 ${isMissedCall ? "text-rose-400" : "text-slate-400"}`} />
                    )}
                    <p
                      className={`text-xs truncate flex-1 min-w-0 ${
                        isMissedCall
                          ? "text-rose-400 font-semibold"
                          : unreadCount > 0
                          ? "text-slate-100 font-semibold"
                          : "text-slate-400 font-normal"
                      }`}
                    >
                      {lastMsgRaw}
                    </p>
                  </div>
                ) : (
                  <>
                    {hasLastMsg && isSentByMe && (
                      lastMsgStatus === "seen" ? (
                        <IoCheckmarkDone className="flex-shrink-0 text-sky-400" style={{ fontSize: "14px" }} title="Seen" />
                      ) : lastMsgStatus === "delivered" ? (
                        <IoCheckmarkDone className="flex-shrink-0 text-slate-400" style={{ fontSize: "14px" }} title="Delivered" />
                      ) : (
                        <IoCheckmark className="flex-shrink-0 text-slate-400" style={{ fontSize: "13px" }} title="Sent" />
                      )
                    )}
                    <p
                      className={`text-xs truncate flex-1 min-w-0 ${
                        unreadCount > 0
                          ? "text-slate-100 font-semibold"
                          : "text-slate-400 font-normal"
                      }`}
                    >
                      {lastMsgRaw}
                    </p>
                  </>
                )}
              </>
            )}
          </div>

          {/* Right: unread badge (left of arrow) + direction arrow */}
          <div className="flex flex-row items-center gap-1 flex-shrink-0">
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/40 animate-pulse">
                {unreadCount}
              </span>
            )}
            {hasLastMsg && (
              isSentByMe ? (
                <FiArrowUpRight className="text-indigo-400" style={{ fontSize: "14px" }} title="You sent" />
              ) : (
                <FiArrowDownLeft className="text-emerald-400" style={{ fontSize: "14px" }} title="You received" />
              )
            )}
          </div>
        </div>
      </div>

      {/* ── Profile Action Popup ── */}
      {showProfilePopup && (
        <ProfileActionPopup
          user={user}
          onClose={() => setShowProfilePopup(false)}
        />
      )}
    </div>
  );
}

export default User;
