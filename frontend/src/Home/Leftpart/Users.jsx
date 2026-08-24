import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import useGetAllUsers from "../../context/useGetAllUser";
import useConversation from "../../zustand/useConversation.js";
import { useAuth } from "../../context/AuthProvider.jsx";
import User from "./User";
import api from "../../api";
import { FiMessageSquare, FiX, FiInfo, FiSearch, FiTrash2, FiAlertTriangle } from "react-icons/fi";
import { BsPinAngleFill } from "react-icons/bs";
import { ImSpinner8 } from "react-icons/im";
import toast from "react-hot-toast";

function Users() {
  const [allUsers, loading] = useGetAllUsers();
  const {
    myGroups,
    setMyGroups,
    setActiveTab,
    activeFilter,
    setActiveFilter,
    pinnedIds,
    togglePinChat,
    unreadCounts,
    selectedConversation,
    setSelectedConversation,
    openChatInfo,
    removeConversationLocally,
  } = useConversation();
  const [fetchingGroups, setFetchingGroups] = useState(myGroups.length === 0);
  const [contextMenu, setContextMenu] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [removeModalUser, setRemoveModalUser] = useState(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    const fetchGroups = async () => {
      setFetchingGroups(true);
      try {
        const res = await api.get("/api/group/my-groups");
        setMyGroups(res.data);
      } catch (err) {
        console.error("Error fetching groups:", err);
      } finally {
        setFetchingGroups(false);
      }
    };
    fetchGroups();
  }, [setMyGroups]);

  // Close context menu on any global click or scroll
  useEffect(() => {
    const handleClose = () => setContextMenu(null);
    window.addEventListener("click", handleClose);
    window.addEventListener("scroll", handleClose, true);
    return () => {
      window.removeEventListener("click", handleClose);
      window.removeEventListener("scroll", handleClose, true);
    };
  }, []);

  const handleContextMenu = (e, targetUser) => {
    e.preventDefault();
    e.stopPropagation();

    const menuWidth = 180;
    const menuHeight = 200;
    const offset = 6; // subtle distance from cursor corner
    const posX = Math.min(e.clientX + offset, window.innerWidth - menuWidth - 10);
    const posY = Math.min(e.clientY + offset, window.innerHeight - menuHeight - 10);

    setContextMenu({
      x: Math.max(10, posX),
      y: Math.max(10, posY),
      user: targetUser,
    });
  };

  const handleConfirmRemoveConversation = async () => {
    if (!removeModalUser || removing) return;
    setRemoving(true);
    try {
      const partnerId = String(removeModalUser._id);
      const res = await api.post("/api/message/remove-conversation", {
        conversationId: partnerId,
        partnerId: partnerId,
      });
      if (res.data?.success) {
        removeConversationLocally(partnerId, res.data.conversationId);
        toast.success("Conversation removed");
        setRemoveModalUser(null);
      }
    } catch (err) {
      console.error("Error removing conversation:", err);
      toast.error(err?.response?.data?.error || "Failed to remove conversation");
    } finally {
      setRemoving(false);
    }
  };

  const isLoading = loading || fetchingGroups;

  const [authUser] = useAuth();
  const currentUserId = String(authUser?.user?._id || authUser?._id || "");

  // Calculate total unread count for filter badge
  const totalUnreadCount = Object.values(unreadCounts).reduce((acc, c) => acc + (c || 0), 0);

  // Combine 1-on-1 chats and Group rooms (strictly excluding the logged-in user from direct conversations)
  let filteredConversations = [
    ...allUsers.filter((u) => String(u._id) !== currentUserId),
    ...myGroups,
  ];

  // Search filter across the current friend/conversation list (by name or UID)
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    filteredConversations = filteredConversations.filter((item) => {
      const name = (item.fullname || item.groupName || "").toLowerCase();
      const uid = (item.uid || "").toLowerCase();
      return name.includes(q) || uid.includes(q);
    });
  }

  // Apply active filter pill ('all' | 'unread' | 'groups')
  if (activeFilter === "unread") {
    filteredConversations = filteredConversations.filter(
      (item) => (unreadCounts[String(item._id)] || 0) > 0
    );
  } else if (activeFilter === "groups") {
    filteredConversations = filteredConversations.filter(
      (item) => item.isGroup === true
    );
  }

  // Sort: Pinned chats first, followed by unpinned chats (both sorted by latest message time)
  filteredConversations.sort((a, b) => {
    const isPinnedA = pinnedIds.includes(String(a._id));
    const isPinnedB = pinnedIds.includes(String(b._id));

    if (isPinnedA && !isPinnedB) return -1;
    if (!isPinnedA && isPinnedB) return 1;

    const timeA = a.lastMessage?.createdAt
      ? new Date(a.lastMessage.createdAt).getTime()
      : a.updatedAt
      ? new Date(a.updatedAt).getTime()
      : 0;
    const timeB = b.lastMessage?.createdAt
      ? new Date(b.lastMessage.createdAt).getTime()
      : b.updatedAt
      ? new Date(b.updatedAt).getTime()
      : 0;
    return timeB - timeA;
  });

  return (
    <div className="flex flex-col h-full bg-slate-900/60">
      {/* Top Header & Search Section */}
      <div className="p-3 sm:p-4 pb-2.5 sm:pb-3 border-b border-slate-800/80 space-y-2.5 sm:space-y-3 flex-shrink-0 bg-slate-950/40">
        {/* Fixed-height Header Bar (Zero Layout Shift, matching Calls & other tabs) */}
        <div className="h-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent">
              Conversations
            </h1>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-800 text-indigo-400 border border-slate-700/60">
              {filteredConversations.length}
            </span>
          </div>
        </div>

        {/* Real-time Search Bar (by Name or UID) */}
        <div className="relative flex items-center w-full">
          <FiSearch className="absolute left-3 text-slate-400 text-sm" />
          <input
            type="text"
            placeholder="Search by name or UID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 sm:py-2 bg-slate-800/60 border border-slate-700/60 rounded-xl text-xs sm:text-sm text-white placeholder:text-slate-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 text-slate-400 hover:text-slate-200 p-0.5 rounded"
            >
              <FiX className="text-xs" />
            </button>
          )}
        </div>

        {/* Filter Pills Bar (All, Unread, Groups) */}
        <div className="flex items-center gap-1.5 pt-0.5">
          <button
            onClick={() => setActiveFilter("all")}
            className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all duration-200 ${
              activeFilter === "all"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
          >
            <span>All</span>
            {totalUnreadCount > 0 && (
              <span className="min-w-4 h-4 px-1 rounded-full bg-emerald-500 text-slate-950 text-[10px] flex items-center justify-center font-black shadow-sm shadow-emerald-500/40">
                {totalUnreadCount > 99 ? "99+" : totalUnreadCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveFilter("unread")}
            className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all duration-200 ${
              activeFilter === "unread"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
          >
            <span>Unread</span>
            {totalUnreadCount > 0 && (
              <span className="min-w-4 h-4 px-1 rounded-full bg-emerald-500 text-slate-950 text-[10px] flex items-center justify-center font-black shadow-sm shadow-emerald-500/40">
                {totalUnreadCount > 99 ? "99+" : totalUnreadCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveFilter("groups")}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all duration-200 ${
              activeFilter === "groups"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
          >
            Groups
          </button>
        </div>
      </div>

      {/* Unified Conversation Scroll View (Never Blank on Refresh) */}
      <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-slate-800/20">
        {isLoading && filteredConversations.length === 0 ? (
          <div className="divide-y divide-slate-800/40 animate-pulse select-none">
            {[
              { nameW: "w-24", msgW: "w-36", timeW: "w-12" },
              { nameW: "w-28", msgW: "w-44", timeW: "w-14" },
              { nameW: "w-20", msgW: "w-32", timeW: "w-10" },
              { nameW: "w-32", msgW: "w-48", timeW: "w-12" },
              { nameW: "w-24", msgW: "w-28", timeW: "w-14" },
              { nameW: "w-28", msgW: "w-40", timeW: "w-11" },
            ].map((item, idx) => (
              <div key={`conv-skel-${idx}`} className="flex items-center gap-3.5 px-4 py-3">
                {/* Avatar Skeleton */}
                <div className="relative flex-shrink-0">
                  <div className="w-11 h-11 rounded-full bg-slate-800 border border-slate-700/60" />
                  <span className="absolute bottom-0 right-0 w-3 h-3 bg-slate-700 border-2 border-slate-900 rounded-full" />
                </div>

                {/* Info Skeleton */}
                <div className="flex-1 min-w-0 space-y-2">
                  {/* Top row: Name & Time */}
                  <div className="flex items-center justify-between">
                    <div className={`h-3.5 bg-slate-700/70 rounded-md ${item.nameW}`} />
                    <div className={`h-2.5 bg-slate-800 rounded ${item.timeW}`} />
                  </div>

                  {/* Bottom row: Message preview & status */}
                  <div className="flex items-center justify-between gap-2">
                    <div className={`h-3 bg-slate-800/80 rounded-md ${item.msgW}`} />
                    <div className="w-3.5 h-3.5 rounded-full bg-slate-800/60 flex-shrink-0" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs sm:text-sm">
            {searchQuery ? (
              <p>No conversations match &ldquo;{searchQuery}&rdquo;</p>
            ) : activeFilter === "unread" ? (
              <p>No unread conversations</p>
            ) : activeFilter === "groups" ? (
              <p>You haven&apos;t joined any groups yet</p>
            ) : (
              <p>No conversations yet. Search users to start chatting!</p>
            )}
          </div>
        ) : null}

        {/* Unified Conversation List Sorted by Pinned + Latest Message Time */}
        {filteredConversations.map((item) => (
          <User key={item._id} user={item} onContextMenu={handleContextMenu} />
        ))}
      </div>

      {/* Centralized WhatsApp Web-Style Context Menu — rendered via Portal to escape sidebar clipping */}
      {contextMenu && contextMenu.user && createPortal(
        <div
          key={`ctx-user-${contextMenu.x}-${contextMenu.y}-${contextMenu.user._id}`}
          style={{ position: "fixed", top: `${contextMenu.y}px`, left: `${contextMenu.x}px`, zIndex: 9999 }}
          className="bg-slate-900/98 backdrop-blur-2xl border border-slate-700/80 rounded-2xl shadow-2xl shadow-black/70 py-1.5 min-w-[185px] text-xs font-medium text-slate-200 select-none animate-wa-context-menu ring-1 ring-white/5"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Only show "Open Chat" if this conversation is NOT already open */}
          {selectedConversation?._id !== contextMenu.user._id && (
            <button
              onClick={() => {
                setSelectedConversation(contextMenu.user);
                setContextMenu(null);
              }}
              className="w-full px-3.5 py-2.5 flex items-center gap-2.5 hover:bg-indigo-600/25 hover:text-white transition-all duration-150 text-left active:scale-[0.98]"
            >
              <FiMessageSquare className="text-indigo-400 text-sm" />
              <span>Open Chat</span>
            </button>
          )}

          <button
            onClick={() => {
              togglePinChat(contextMenu.user._id);
              setContextMenu(null);
            }}
            className="w-full px-3.5 py-2.5 flex items-center gap-2.5 hover:bg-slate-800/80 hover:text-amber-300 transition-all duration-150 text-left text-amber-400 active:scale-[0.98]"
          >
            <BsPinAngleFill className="text-amber-400 text-sm" />
            <span>
              {pinnedIds.includes(String(contextMenu.user._id)) ? "Unpin Chat" : "Pin Chat (Max 3)"}
            </span>
          </button>

          {/* Remove Conversation (1-to-1 Only) */}
          {!contextMenu.user.isGroup && (
            <button
              id="user-context-remove-conv"
              onClick={() => {
                const userToRemove = contextMenu.user;
                setContextMenu(null);
                setRemoveModalUser(userToRemove);
              }}
              className="w-full px-3.5 py-2.5 flex items-center gap-2.5 hover:bg-rose-600/20 hover:text-rose-300 transition-all duration-150 text-left text-rose-400 border-t border-slate-800/80 active:scale-[0.98]"
            >
              <FiTrash2 className="text-rose-400 text-sm" />
              <span>Remove Conversation</span>
            </button>
          )}

          {selectedConversation?._id === contextMenu.user._id && (
            <button
              onClick={() => {
                setSelectedConversation(null);
                setContextMenu(null);
              }}
              className="w-full px-3.5 py-2.5 flex items-center gap-2.5 hover:bg-rose-600/20 hover:text-rose-300 transition-all duration-150 text-left text-rose-400 border-t border-slate-800/80 active:scale-[0.98]"
            >
              <FiX className="text-sm" />
              <span>Close Chat</span>
            </button>
          )}

          <button
            onClick={() => {
              openChatInfo(contextMenu.user);
              setContextMenu(null);
            }}
            className="w-full px-3.5 py-2.5 flex items-center gap-2.5 hover:bg-slate-800/80 hover:text-white transition-all duration-150 text-left border-t border-slate-800/80 active:scale-[0.98]"
          >
            <FiInfo className="text-slate-400 text-sm" />
            <span>{contextMenu.user.isGroup ? "Group Info" : "User Info"}</span>
          </button>
        </div>,
        document.body
      )}

      {/* Remove Conversation Confirmation Modal */}
      {removeModalUser && createPortal(
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in select-none"
          onClick={() => {
            if (!removing) setRemoveModalUser(null);
          }}
        >
          <div
            className="bg-slate-900/98 backdrop-blur-2xl border border-slate-700/80 rounded-2xl p-5 max-w-sm w-full shadow-2xl shadow-black/80 space-y-4 animate-scale-up ring-1 ring-white/5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center flex-shrink-0 text-rose-400">
                <FiAlertTriangle className="text-xl" />
              </div>
              <div className="space-y-1 min-w-0">
                <h3 className="text-base font-bold text-slate-100 tracking-tight">
                  Remove Conversation?
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Removing this conversation will remove your conversation history and connection with <span className="font-semibold text-slate-200">{removeModalUser.fullname || "this user"}</span>. The other person will still be able to see their conversation history.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <button
                id="confirm-remove-conv-btn"
                type="button"
                disabled={removing}
                onClick={handleConfirmRemoveConversation}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/40 border border-rose-400/30 transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {removing ? (
                  <>
                    <ImSpinner8 className="animate-spin text-sm" />
                    <span>Removing...</span>
                  </>
                ) : (
                  <span>Remove Conversation</span>
                )}
              </button>
              <button
                id="cancel-remove-conv-btn"
                type="button"
                disabled={removing}
                onClick={() => setRemoveModalUser(null)}
                className="w-full py-2 px-4 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all duration-150 active:scale-[0.98] disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default Users;
