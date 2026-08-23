import React, { useEffect, useState, useMemo } from "react";
import api from "../../api";
import { useAuth } from "../../context/AuthProvider.jsx";
import useConversation from "../../zustand/useConversation.js";
import { useSocketContext } from "../../context/SocketContext.jsx";
import {
  FiPhone,
  FiVideo,
  FiArrowUpRight,
  FiArrowDownLeft,
  FiTrash2,
  FiSearch,
  FiLoader,
  FiPhoneCall,
  FiX,
} from "react-icons/fi";
import { IoCheckmark } from "react-icons/io5";
import toast from "react-hot-toast";

const formatCallDuration = (seconds = 0) => {
  if (!seconds || seconds <= 0) return "";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
};

const getCallStatusStyle = (group) => {
  const isVideo = group.isVideo;
  const typeLabel = isVideo ? "video call" : "voice call";
  const typeCapitalized = isVideo ? "Video call" : "Voice call";
  const durationStr = group.duration > 0 ? formatCallDuration(group.duration) : "";

  // 1. Declined -> Red
  if (group.status === "declined") {
    return {
      color: "text-rose-400",
      label: `Declined ${typeLabel}`,
    };
  }

  // 2. Outgoing - No Answer -> Muted Gray
  if (group.isCaller && (group.status === "unanswered" || !group.duration || group.duration === 0)) {
    return {
      color: "text-slate-400",
      label: "No answer",
    };
  }

  // 3. Missed (Incoming - No answer/Missed) -> Amber
  if (group.isMissed || group.status === "missed" || group.status === "unanswered" || (!group.isCaller && (!group.duration || group.duration === 0))) {
    return {
      color: "text-amber-400",
      label: `Missed ${typeLabel}`,
    };
  }

  // 4. Answered / Completed -> Green
  const label = durationStr ? `${typeCapitalized} (${durationStr})` : typeCapitalized;
  return {
    color: "text-emerald-400",
    label,
  };
};

const formatCallDate = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();

  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (isToday) return `Today, ${timeStr}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();

  if (isYesterday) return `Yesterday, ${timeStr}`;

  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${timeStr}`;
};

function CallHistory() {
  const [authUser] = useAuth();
  const myId = String(authUser?.user?._id || "");
  const { setSelectedConversation, setActiveCall, setActiveTab, callHistory: calls, setCallHistory: setCalls } = useConversation();
  const { socket, onlineUsers } = useSocketContext();

  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // 'all' | 'missed'
  const [searchQuery, setSearchQuery] = useState("");

  // Selection mode & selected call IDs
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedCallIds, setSelectedCallIds] = useState(new Set());
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchCallHistory = async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/call/history");
      if (res.data && Array.isArray(res.data.calls)) {
        setCalls(res.data.calls);
      }
    } catch (err) {
      console.error("Error fetching call history:", err);
      toast.error("Failed to load call history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCallHistory();
  }, []);

  // Real-time listener for incoming call logs via existing Socket.IO connection
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (newMsg) => {
      if (newMsg && newMsg.messageType === "call") {
        setCalls((prevCalls) => {
          const list = Array.isArray(prevCalls) ? prevCalls : [];
          const newIdStr = String(newMsg._id);
          // Prevent duplicate records
          if (list.some((c) => String(c._id) === newIdStr)) {
            return list;
          }
          // Add call record and position by createdAt timestamp descending
          const updated = [newMsg, ...list];
          updated.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
          return updated;
        });
      }
    };

    socket.on("newMessage", handleNewMessage);

    return () => {
      socket.off("newMessage", handleNewMessage);
    };
  }, [socket]);

  // Filter & Search raw calls
  const filteredCalls = useMemo(() => {
    return calls.filter((call) => {
      const isCaller = String(call.senderId?._id || call.senderId) === myId;
      const partner = isCaller ? call.receiverId : call.senderId;
      const partnerName = partner?.fullname || "";
      const partnerUid = partner?.uid || "";

      const isMissed =
        !isCaller &&
        (call.callDetails?.status === "missed" ||
          call.callDetails?.status === "declined" ||
          call.callDetails?.status === "unanswered" ||
          !call.callDetails?.duration ||
          call.callDetails?.duration === 0);

      if (filter === "missed" && !isMissed) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          partnerName.toLowerCase().includes(q) ||
          partnerUid.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [calls, filter, searchQuery, myId]);

  // Group consecutive calls with the same user (WhatsApp style: name (count), latest arrow + time)
  const groupedCalls = useMemo(() => {
    const groups = [];
    filteredCalls.forEach((call) => {
      const isCaller = String(call.senderId?._id || call.senderId) === myId;
      const partner = isCaller ? call.receiverId : call.senderId;
      const partnerId = partner?._id ? String(partner._id) : String(isCaller ? call.receiverId : call.senderId);
      const isVideo = call.callDetails?.callType === "video";
      const status = call.callDetails?.status || (call.callDetails?.duration > 0 ? "completed" : "unanswered");
      const duration = Number(call.callDetails?.duration) || 0;

      const isMissed =
        !isCaller &&
        (status === "missed" ||
          status === "declined" ||
          status === "unanswered" ||
          duration === 0);

      const prevGroup = groups[groups.length - 1];

      // Group only consecutive calls that match:
      // 1. Same partner
      // 2. Same call type (voice vs video - NEVER merge voice with video)
      // 3. Same call direction (outgoing vs incoming)
      // 4. Same call outcome (missed vs answered)
      const canMerge =
        prevGroup &&
        String(prevGroup.partnerId) === String(partnerId) &&
        prevGroup.isVideo === isVideo &&
        prevGroup.isCaller === isCaller &&
        prevGroup.isMissed === isMissed &&
        prevGroup.status === status;

      if (canMerge) {
        prevGroup.count += 1;
        prevGroup.callIds.push(call._id);
      } else {
        groups.push({
          _id: call._id,
          latestCall: call,
          partner,
          partnerId,
          partnerName: partner?.fullname || "User",
          partnerAvatar:
            partner?.avatar ||
            `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(
              partner?.fullname || partnerId
            )}`,
          isVideo,
          isCaller,
          isMissed,
          status,
          duration,
          createdAt: call.createdAt,
          count: 1,
          callIds: [call._id],
        });
      }
    });
    return groups;
  }, [filteredCalls, myId]);

  // Toggle selection for a group of calls - stays in selection mode even when 0 selected
  const toggleSelectGroup = (callIds) => {
    const next = new Set(selectedCallIds);
    const allSelected = callIds.every((id) => next.has(id));
    if (allSelected) {
      callIds.forEach((id) => next.delete(id));
    } else {
      callIds.forEach((id) => next.add(id));
    }
    setSelectedCallIds(next);
  };

  // Select all / deselect all
  const toggleSelectAll = () => {
    const isAllSelected = filteredCalls.length > 0 && selectedCallIds.size === filteredCalls.length;
    if (isAllSelected) {
      setSelectedCallIds(new Set());
    } else {
      const allIds = new Set(filteredCalls.map((c) => c._id));
      setSelectedCallIds(allIds);
    }
  };

  // Exit selection mode
  const exitSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedCallIds(new Set());
  };

  // Handle right click / context menu to trigger selection mode
  const handleContextMenu = (e, callIds) => {
    e.preventDefault();
    setIsSelectionMode(true);
    const next = new Set(selectedCallIds);
    callIds.forEach((id) => next.add(id));
    setSelectedCallIds(next);
  };

  // Execute deletion of selected call logs
  const handleDeleteSelected = async () => {
    if (selectedCallIds.size === 0) return;
    setDeleting(true);
    try {
      const idsToDelete = Array.from(selectedCallIds);
      await api.post("/api/call/delete", { callIds: idsToDelete });
      setCalls((prev) => prev.filter((c) => !selectedCallIds.has(c._id)));
      toast.success(
        idsToDelete.length === 1 ? "Call log deleted" : `${idsToDelete.length} call logs deleted`
      );
      exitSelectionMode();
      setShowConfirmModal(false);
    } catch (err) {
      console.error("Failed to delete call logs:", err);
      toast.error("Failed to delete call logs");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-900 text-slate-100 select-none overflow-hidden relative">
      {/* Top Header */}
      <div className="p-3 sm:p-4 pb-2.5 sm:pb-3 border-b border-slate-800/80 space-y-2.5 sm:space-y-3 flex-shrink-0 bg-slate-950/40">
        {/* Fixed-height Header Bar (Zero Layout Shift) */}
        <div className="h-8 flex items-center justify-between">
          {isSelectionMode ? (
            /* Selection Action Bar */
            <div className="w-full flex items-center justify-between animate-fade-in">
              <div className="flex items-center gap-2">
                <button
                  onClick={exitSelectionMode}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                  title="Cancel selection"
                >
                  <FiX className="text-base" />
                </button>
                <span className="text-xs font-bold text-slate-200">
                  {selectedCallIds.size} selected
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={toggleSelectAll}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 transition"
                >
                  {selectedCallIds.size === filteredCalls.length && filteredCalls.length > 0
                    ? "Deselect"
                    : "Select all"}
                </button>

                <button
                  onClick={() => {
                    if (selectedCallIds.size > 0) setShowConfirmModal(true);
                  }}
                  disabled={selectedCallIds.size === 0}
                  className="p-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/30 transition shadow-sm disabled:opacity-40 disabled:pointer-events-none"
                  title="Delete Selected"
                >
                  <FiTrash2 className="text-sm" />
                </button>
              </div>
            </div>
          ) : (
            /* Normal Header */
            <div className="w-full flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent">
                  Calls
                </h1>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-800 text-indigo-400 border border-slate-700/60">
                  {calls.length}
                </span>
              </div>

              {calls.length > 0 && (
                <button
                  onClick={() => setIsSelectionMode(true)}
                  className="px-2.5 py-1 text-xs font-semibold text-slate-400 hover:text-indigo-300 hover:bg-slate-800/80 rounded-lg transition border border-transparent hover:border-slate-700/60"
                  title="Select call logs to delete"
                >
                  Select
                </button>
              )}
            </div>
          )}
        </div>

        {/* Search Input */}
        <div className="relative">
          <FiSearch className="absolute left-3 top-2.5 sm:top-3 text-slate-500 text-sm" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or UID..."
            className="w-full pl-8 sm:pl-9 pr-3 sm:pr-4 py-1.5 sm:py-2 bg-slate-800/60 border border-slate-700/60 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 pt-0.5">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
              filter === "all"
                ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30"
                : "bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            All Calls
          </button>
          <button
            onClick={() => setFilter("missed")}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
              filter === "missed"
                ? "bg-rose-600 text-white shadow-sm shadow-rose-600/30"
                : "bg-slate-800/80 text-slate-400 hover:text-rose-300 hover:bg-slate-800"
            }`}
          >
            Missed
          </button>
        </div>
      </div>

      {/* Call List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40 custom-scrollbar">
        {loading ? (
          <div className="divide-y divide-slate-800/40 animate-pulse select-none">
            {[
              { nameW: "w-24", durW: "w-20", timeW: "w-12" },
              { nameW: "w-28", durW: "w-24", timeW: "w-14" },
              { nameW: "w-20", durW: "w-16", timeW: "w-10" },
              { nameW: "w-32", durW: "w-28", timeW: "w-12" },
              { nameW: "w-24", durW: "w-20", timeW: "w-14" },
            ].map((item, idx) => (
              <div key={`call-skel-${idx}`} className="flex items-center gap-3.5 px-4 py-3">
                <div className="w-11 h-11 rounded-full bg-slate-800 border border-slate-700/60 flex-shrink-0" />
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className={`h-3.5 bg-slate-700/70 rounded-md ${item.nameW}`} />
                    <div className={`h-2.5 bg-slate-800 rounded ${item.timeW}`} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3.5 h-3.5 rounded bg-slate-800" />
                    <div className={`h-3 bg-slate-800/80 rounded-md ${item.durW}`} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : groupedCalls.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-56 text-center px-4 space-y-3">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-500 text-xl sm:text-2xl">
              <FiPhoneCall />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-300">
                {filter === "missed" ? "No missed calls" : "No call logs yet"}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {filter === "missed"
                  ? "You don't have any missed calls."
                  : "Voice & Video calls with your contacts will appear here."}
              </p>
            </div>
          </div>
        ) : (
          groupedCalls.map((group) => {
            const isPartnerOnline = onlineUsers?.includes(group.partnerId);
            const isGroupSelected = group.callIds.some((id) => selectedCallIds.has(id));
            const statusMeta = getCallStatusStyle(group);

            return (
              <div
                key={group._id}
                onClick={() => {
                  if (isSelectionMode) {
                    toggleSelectGroup(group.callIds);
                  } else if (group.partner && typeof group.partner === "object") {
                    setSelectedConversation(group.partner);
                    setActiveTab("chats");
                  }
                }}
                onContextMenu={(e) => handleContextMenu(e, group.callIds)}
                className={`flex items-center justify-between p-2.5 sm:p-3 hover:bg-slate-800/50 cursor-pointer transition group gap-2.5 sm:gap-3 ${
                  isGroupSelected ? "bg-indigo-600/15 border-l-2 border-indigo-500" : ""
                }`}
              >
                {/* Checkbox in selection mode */}
                {isSelectionMode && (
                  <div className="mr-1 sm:mr-2 flex-shrink-0">
                    <div
                      className={`w-4 h-4 sm:w-5 sm:h-5 rounded-md sm:rounded-lg border-2 flex items-center justify-center transition-all ${
                        isGroupSelected
                          ? "bg-indigo-600 border-indigo-500"
                          : "border-slate-600 bg-slate-800 hover:border-slate-500"
                      }`}
                    >
                      {isGroupSelected && <IoCheckmark className="text-white text-[10px] sm:text-xs font-black" />}
                    </div>
                  </div>
                )}

                {/* Left: Avatar */}
                <div className="relative flex-shrink-0">
                  <img
                    src={group.partnerAvatar}
                    alt={group.partnerName}
                    className="w-10 h-10 sm:w-11 sm:h-11 rounded-full object-cover ring-[1.5px] ring-white/85 shadow-md group-hover:scale-105 transition"
                  />
                  {isPartnerOnline && (
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 sm:w-3 sm:h-3 bg-emerald-500 border-2 border-slate-900 rounded-full shadow-sm" />
                  )}
                </div>

                {/* Middle: User Name + Compact metadata line */}
                <div className="min-w-0 flex-1 overflow-hidden">
                  {/* Line 1: User Name + Count on Left, Date/Time on Right */}
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <h3 className="text-xs sm:text-sm font-bold truncate text-slate-100">
                        {group.partnerName}
                      </h3>
                      {group.count > 1 && (
                        <span className="text-[10px] sm:text-xs font-semibold text-slate-400 flex-shrink-0">
                          ({group.count})
                        </span>
                      )}
                    </div>

                    {/* Timestamp right-aligned on Line 1 (Always neutral muted color) */}
                    <span className="text-[10px] sm:text-xs text-slate-400 flex-shrink-0 whitespace-nowrap">
                      {formatCallDate(group.createdAt)}
                    </span>
                  </div>

                  {/* Line 2: Direction arrow + Call Type Icon + Call Status/Duration (Status colored) */}
                  <div className="flex items-center gap-1.5 mt-0.5 min-w-0 text-[11px] sm:text-xs">
                    {/* Direction arrow */}
                    {group.isCaller ? (
                      <FiArrowUpRight className={`${statusMeta.color} text-[11px] sm:text-xs flex-shrink-0`} />
                    ) : (
                      <FiArrowDownLeft className={`${statusMeta.color} text-[11px] sm:text-xs flex-shrink-0`} />
                    )}

                    {/* Call Type Icon (Phone for voice, Video for video) */}
                    {group.isVideo ? (
                      <FiVideo className={`${statusMeta.color} text-[11px] sm:text-xs flex-shrink-0`} />
                    ) : (
                      <FiPhone className={`${statusMeta.color} text-[11px] sm:text-xs flex-shrink-0`} />
                    )}

                    {/* Call description & duration */}
                    <span className={`truncate min-w-0 ${statusMeta.color} font-medium`}>
                      {statusMeta.label}
                    </span>
                  </div>
                </div>

                {/* Right: Quick Call Action Button */}
                {!isSelectionMode && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (group.partner) {
                        setActiveCall({
                          isInitiator: true,
                          userToCall: group.partner,
                          callType: group.isVideo ? "video" : "voice",
                        });
                      }
                    }}
                    className="p-2 sm:p-2.5 rounded-xl border border-slate-700/60 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white shadow-sm transition active:scale-95 flex-shrink-0"
                    title={`Call Back (${group.isVideo ? "Video" : "Voice"})`}
                  >
                    {group.isVideo ? <FiVideo className="text-xs sm:text-sm" /> : <FiPhone className="text-xs sm:text-sm" />}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── Delete Confirmation Modal ─────────────────────────────────────── */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-5 animate-scale-up">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 text-xl flex-shrink-0">
                <FiTrash2 />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  Delete {selectedCallIds.size === 1 ? "Call Log" : `${selectedCallIds.size} Call Logs`}?
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  These records will be removed from your call history.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowConfirmModal(false)}
                disabled={deleting}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSelected}
                disabled={deleting}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 transition active:scale-95 disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CallHistory;
