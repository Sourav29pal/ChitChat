import React, { useState } from "react";
import useConversation from "../../zustand/useConversation";
import { useSocketContext } from "../../context/SocketContext";
import { FiPhone, FiVideo, FiUsers, FiX, FiArrowLeft } from "react-icons/fi";
import ProfileActionPopup from "../../components/ProfileActionPopup";

function Chatuser() {
  const {
    selectedConversation,
    setSelectedConversation,
    setActiveCall,
    toggleChatInfoOpen,
    typingUsers,
  } = useConversation();
  const { onlineUsers } = useSocketContext();
  const [showProfilePopup, setShowProfilePopup] = useState(false);

  if (!selectedConversation) return null;

  const isGroup = selectedConversation.isGroup || false;
  const isOnline = !isGroup && onlineUsers?.includes(selectedConversation._id);

  // Synchronized global typing state check (supports both DMs and Groups with multi-typers)
  const typersMap = typingUsers?.[String(selectedConversation._id)] || {};
  const activeTyperNames = typeof typersMap === "object" ? Object.values(typersMap).filter(Boolean) : [];
  const isTyping = activeTyperNames.length > 0;

  let typingText = "";
  if (isTyping) {
    if (!isGroup) {
      const name = activeTyperNames[0] || selectedConversation.fullname || "Someone";
      typingText = `${name} is typing...`;
    } else {
      if (activeTyperNames.length === 1) {
        typingText = `${activeTyperNames[0]} is typing...`;
      } else if (activeTyperNames.length === 2) {
        typingText = `${activeTyperNames[0]} and ${activeTyperNames[1]} are typing...`;
      } else {
        typingText = `${activeTyperNames[0]} and ${activeTyperNames.length - 1} others are typing...`;
      }
    }
  }

  const avatarUrl = isGroup
    ? selectedConversation.groupAvatar ||
      `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(
        selectedConversation.groupName || "Group"
      )}`
    : selectedConversation.avatar ||
      `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(
        selectedConversation.uid || selectedConversation._id || "User"
      )}`;

  const displayName = isGroup
    ? selectedConversation.groupName || "Group"
    : selectedConversation.fullname || "User";
  const subtitle = isGroup
    ? `${selectedConversation.members?.length || 0} group members`
    : isOnline
    ? "Online"
    : "Offline";

  const handleStartVoiceCall = () => {
    setActiveCall({
      isInitiator: true,
      userToCall: selectedConversation,
      callType: "voice",
    });
  };

  const handleStartVideoCall = () => {
    setActiveCall({
      isInitiator: true,
      userToCall: selectedConversation,
      callType: "video",
    });
  };

  return (
    <div className="h-full px-3 sm:px-6 flex items-center justify-between bg-slate-900/95 border-b border-slate-800/80 backdrop-blur-xl">
      {/* Mobile Back Button (Visible when narrow/split screen) */}
      <button
        onClick={() => setSelectedConversation(null)}
        className="md:hidden p-2 -ml-1 mr-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition active:scale-95 border border-slate-700/60 flex-shrink-0"
        title="Back to Chats"
      >
        <FiArrowLeft className="text-base" />
      </button>

      {/* Left: User / Group Avatar & Info */}
      <div className="flex items-center gap-2.5 sm:gap-3.5 select-none p-1 rounded-2xl min-w-0 max-w-fit">
        {/* Avatar (Click opens Profile Action Popup) */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            setShowProfilePopup(true);
          }}
          className="relative flex-shrink-0 cursor-pointer group/avatar"
          title="Click to view Profile Actions"
        >
          <img
            src={avatarUrl}
            alt={displayName}
            className="w-10 h-10 rounded-full object-cover ring-[1.5px] ring-white/80 shadow-sm group-hover/avatar:scale-105 active:scale-95 transition duration-200"
          />
          {isOnline && (
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-slate-900 rounded-full shadow-sm shadow-emerald-500/50" />
          )}
          {isGroup && (
            <span className="absolute -bottom-1 -right-1 p-0.5 bg-violet-600 border border-slate-900 rounded-full text-white text-[9px]">
              <FiUsers />
            </span>
          )}
        </div>

        {/* Text Details (Click opens Chat Info Drawer) */}
        <div
          onClick={toggleChatInfoOpen}
          className="flex flex-col justify-center min-w-0 max-w-fit cursor-pointer group/info"
          title="Click to view Contact / Group Info"
        >
          <h2 className="text-slate-100 font-bold text-sm tracking-wide leading-snug truncate max-w-[200px] sm:max-w-[300px] group-hover/info:text-indigo-300 transition">
            {displayName}
          </h2>
          <div className="flex items-center gap-1.5 min-w-0">
            {/* ── Typing indicator overrides normal status ── */}
            {isTyping ? (
              <>
                {/* Animated 3-dot bounce */}
                <span className="flex items-end gap-[3px] h-3 flex-shrink-0">
                  <span className="w-1 h-1 rounded-full bg-indigo-400 animate-typing-dot" style={{ animationDelay: "0ms" }} />
                  <span className="w-1 h-1 rounded-full bg-indigo-400 animate-typing-dot" style={{ animationDelay: "160ms" }} />
                  <span className="w-1 h-1 rounded-full bg-indigo-400 animate-typing-dot" style={{ animationDelay: "320ms" }} />
                </span>
                <span className="text-xs font-medium text-indigo-400 italic truncate max-w-[200px] sm:max-w-[320px]">{typingText}</span>
              </>
            ) : (
              <>
                {isOnline && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                <span className={`text-xs font-medium ${isOnline ? "text-emerald-400" : "text-slate-400"}`}>
                  {subtitle}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right: Grouped Call Actions | Vertical Line Separator | Close Button */}
      <div className="flex items-center gap-3">
        {!isGroup && (
          <>
            {/* Grouped Call Buttons Container */}
            <div className="flex items-center p-1 rounded-2xl bg-slate-800/80 border border-slate-700/60 shadow-inner gap-0.5">
              <button
                onClick={handleStartVoiceCall}
                className="px-3.5 py-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-700/70 transition-all flex items-center gap-2 text-xs font-semibold cursor-pointer"
                title="Start Voice Call"
              >
                <FiPhone className="text-sm text-indigo-400" />
                <span className="hidden sm:inline">Voice</span>
              </button>

              <div className="w-[1px] h-4 bg-slate-700/60 my-auto" />

              <button
                onClick={handleStartVideoCall}
                className="px-3.5 py-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-700/70 transition-all flex items-center gap-2 text-xs font-semibold cursor-pointer"
                title="Start Video Call"
              >
                <FiVideo className="text-sm text-indigo-400" />
                <span className="hidden sm:inline">Video</span>
              </button>
            </div>

            {/* Vertical Line Separator */}
            <div className="w-[1px] h-6 bg-slate-800 border-r border-slate-700/80" />
          </>
        )}

        {/* Close Chat Button */}
        <button
          onClick={() => setSelectedConversation(null)}
          className="p-2 rounded-xl bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white transition cursor-pointer shadow-md border border-slate-700/60 hover:border-rose-600 flex items-center justify-center"
          title="Close Chat (Esc)"
        >
          <FiX className="text-sm sm:text-base" />
        </button>
      </div>

      {/* ── Profile Action Popup ── */}
      {showProfilePopup && (
        <ProfileActionPopup
          user={selectedConversation}
          onClose={() => setShowProfilePopup(false)}
        />
      )}
    </div>
  );
}

export default Chatuser;
