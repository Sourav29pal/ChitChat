import React, { useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import useConversation from "../../zustand/useConversation";
import { useSocketContext } from "../../context/SocketContext";
import { useAuth } from "../../context/AuthProvider";
import useGetAllUsers from "../../context/useGetAllUser";
import api from "../../api";
import {
  FiX,
  FiMessageSquare,
  FiPhone,
  FiVideo,
  FiImage,
  FiUsers,
  FiInfo,
  FiMail,
  FiHash,
  FiShield,
  FiCopy,
  FiCheck,
  FiUserMinus,
  FiUserPlus,
  FiSearch,
  FiEdit2,
  FiSave,
  FiLoader,
  FiCamera,
  FiRotateCcw,
  FiMaximize2,
  FiSmile,
} from "react-icons/fi";
import { BsPinAngleFill } from "react-icons/bs";
import toast from "react-hot-toast";
import ProfilePhotoPreview from "../../components/ProfilePhotoPreview";
import PhotoCropModal from "../../components/PhotoCropModal";
import ProfileActionPopup from "../../components/ProfileActionPopup";
import {
  DEFAULT_GROUP_AVATAR_URL,
  GROUP_AVATAR_URLS,
  GROUP_AVATAR_ITEMS,
} from "../../config/systemAvatars";

function ChatInfoDrawer() {
  const {
    selectedConversation,
    setSelectedConversation,
    setActiveTab,
    infoDrawerUser,
    isChatInfoOpen,
    closeChatInfo,
    messages,
    realtimeMessages,
    setActiveCall,
    pinnedIds,
    togglePinChat,
    setLightboxMessageId,
    updateConversationInStore,
    sharedMedia,
    setSharedMedia,
  } = useConversation();
  const { onlineUsers } = useSocketContext();
  const [authUser] = useAuth();
  const [allUsers] = useGetAllUsers();

  const [loadingMedia, setLoadingMedia] = useState(false);
  const [copiedUid, setCopiedUid] = useState(false);

  // Group Member Profile Action Popup State
  const [selectedMemberForPopup, setSelectedMemberForPopup] = useState(null);

  // Add Member Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addSearchQuery, setAddSearchQuery] = useState("");
  const [selectedToAdd, setSelectedToAdd] = useState([]);
  const [addingLoading, setAddingLoading] = useState(false);

  // Remove Member Modal Confirmation State
  const [memberToRemove, setMemberToRemove] = useState(null);
  const [removeLoading, setRemoveLoading] = useState(false);

  // Edit Group About / Description State (Admin Power)
  const [isEditingAbout, setIsEditingAbout] = useState(false);
  const [editedAbout, setEditedAbout] = useState("");
  const [savingAbout, setSavingAbout] = useState(false);

  // Edit Group Name State (Admin Power)
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedGroupName, setEditedGroupName] = useState("");
  const [savingName, setSavingName] = useState(false);

  // Group Avatar Upload State (Admin Power)
  const groupAvatarInputRef = React.useRef(null);
  const [uploadingGroupAvatar, setUploadingGroupAvatar] = useState(false);
  const [showPhotoOptionsModal, setShowPhotoOptionsModal] = useState(false);
  const [showGroupAvatarPickerModal, setShowGroupAvatarPickerModal] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState(null);
  const [showCropModal, setShowCropModal] = useState(false);

  // Photo Preview State (Hero Avatar Click)
  const [showHeroPhotoPreview, setShowHeroPhotoPreview] = useState(false);

  const targetUser = infoDrawerUser || selectedConversation;

  useEffect(() => {
    if (!targetUser?._id || !isChatInfoOpen) return;

    let isMounted = true;
    const fetchSharedMedia = async () => {
      setLoadingMedia(true);
      try {
        const res = await api.get(`/api/message/media/${targetUser._id}`);
        if (isMounted) {
          setSharedMedia(Array.isArray(res.data) ? res.data : []);
        }
      } catch (err) {
        console.error("Error fetching shared media:", err);
      } finally {
        if (isMounted) setLoadingMedia(false);
      }
    };

    fetchSharedMedia();

    // Reset edit state when target changes
    setIsEditingAbout(false);
    setEditedAbout(targetUser?.groupDescription || "");
    setIsEditingName(false);
    setEditedGroupName(targetUser?.groupName || "");

    return () => {
      isMounted = false;
    };
  }, [targetUser?._id, isChatInfoOpen, messages]);

  // Extract all individual photo items (including multi-photo album attachments), sorted newest first
  const allMediaItems = useMemo(() => {
    const map = new Map();
    const sourceMessages = [
      ...(Array.isArray(sharedMedia) ? sharedMedia : []),
      ...(Array.isArray(messages) ? messages : []),
      ...(Array.isArray(realtimeMessages) ? realtimeMessages : []),
    ];

    sourceMessages.forEach((m) => {
      if (!m || !m._id || m.isDeletedForMe || m.deletedForAll) return;
      map.set(String(m._id), m);
    });

    const sorted = Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );

    const items = [];
    sorted.forEach((m) => {
      if (Array.isArray(m.attachments) && m.attachments.length > 0) {
        m.attachments.forEach((att, attIdx) => {
          items.push({
            id: `${m._id}_${attIdx}`,
            messageId: m._id,
            url: att.url,
            createdAt: m.createdAt,
          });
        });
      } else if (m.attachmentUrl) {
        items.push({
          id: `${m._id}_0`,
          messageId: m._id,
          url: m.attachmentUrl,
          createdAt: m.createdAt,
        });
      }
    });

    return items;
  }, [sharedMedia, messages, realtimeMessages]);

  if (!targetUser) return null;

  const safePinnedIds = Array.isArray(pinnedIds) ? pinnedIds : [];
  const isGroup = targetUser.isGroup || false;
  const isOnline = !isGroup && Array.isArray(onlineUsers) && onlineUsers.map(String).includes(String(targetUser._id || ""));
  const isPinned = safePinnedIds.includes(String(targetUser._id));

  // Admin Check (Supports multiple co-admins)
  const loggedInUserId = String(authUser?.user?._id || authUser?._id || "");
  const adminIdStr = String(
    targetUser.groupAdmin?._id || targetUser.groupAdmin || ""
  );
  const isUserAdmin =
    isGroup &&
    loggedInUserId &&
    (loggedInUserId === adminIdStr ||
      (Array.isArray(targetUser.members) &&
        targetUser.members.some(
          (m) => String(m._id || m) === loggedInUserId && m.role === "admin"
        )) ||
      (Array.isArray(targetUser.admins) &&
        targetUser.admins.some(
          (a) => String(a._id || a) === loggedInUserId
        )));

  const avatarUrl = isGroup
    ? targetUser.groupAvatar ||
      `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(
        targetUser.groupName || "Group"
      )}`
    : targetUser.avatar ||
      `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(
        targetUser.uid || targetUser._id || "User"
      )}`;

  const displayName = isGroup
    ? targetUser.groupName
    : targetUser.fullname || "User";

  const subtitle = isGroup
    ? `${targetUser.members?.length || 0} members`
    : isOnline
    ? "Online"
    : "Offline";

  const aboutText = isGroup
    ? targetUser.groupDescription || "Group conversation room."
    : targetUser.about || "Hey there! I am using ChitChat.";

  const handleStartVoiceCall = () => {
    setActiveCall({
      isInitiator: true,
      userToCall: targetUser,
      callType: "voice",
    });
  };

  const handleStartVideoCall = () => {
    setActiveCall({
      isInitiator: true,
      userToCall: targetUser,
      callType: "video",
    });
  };

  const handleCopyUid = (uid) => {
    if (!uid) return;
    navigator.clipboard.writeText(uid);
    setCopiedUid(true);
    toast.success("UID copied to clipboard!");
    setTimeout(() => setCopiedUid(false), 2000);
  };

  // Confirm Remove Member from Group
  const handleConfirmRemoveMember = async (memberId) => {
    setRemoveLoading(true);
    try {
      const res = await api.post("/api/group/remove-member", {
        groupId: targetUser._id,
        memberId,
      });
      toast.success("Member removed from group");
      updateConversationInStore(res.data);
      setMemberToRemove(null);
    } catch (err) {
      console.error("Error removing member:", err);
      toast.error(err.response?.data?.error || "Failed to remove member");
    } finally {
      setRemoveLoading(false);
    }
  };

  // Handle Edit Group About / Description
  const handleSaveAbout = async () => {
    setSavingAbout(true);
    try {
      const res = await api.post("/api/group/update-details", {
        groupId: targetUser._id,
        groupDescription: editedAbout.trim(),
      });
      toast.success("Group info updated! 🎉");
      updateConversationInStore(res.data);
      setIsEditingAbout(false);
    } catch (err) {
      console.error("Error updating group description:", err);
      toast.error(err.response?.data?.error || "Failed to update group about");
    } finally {
      setSavingAbout(false);
    }
  };

  // Handle Edit Group Name
  const handleSaveGroupName = async () => {
    const trimmed = editedGroupName.trim();
    if (!trimmed) {
      toast.error("Group name cannot be empty");
      return;
    }
    if (trimmed === targetUser.groupName) {
      setIsEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      const res = await api.post("/api/group/update-details", {
        groupId: targetUser._id,
        groupName: trimmed,
      });
      toast.success("Group name updated! 🎉");
      updateConversationInStore(res.data);
      setIsEditingName(false);
    } catch (err) {
      console.error("Error updating group name:", err);
      toast.error(err.response?.data?.error || "Failed to update group name");
    } finally {
      setSavingName(false);
    }
  };

  // Handle Edit Group Avatar Selection (Admin Power)
  const handleGroupAvatarFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    if (!file.type.startsWith("image/")) {
      toast.error("Please select a valid image file");
      return;
    }

    const MAX_SIZE_BYTES = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE_BYTES) {
      toast.error("Image size exceeds the 10 MB limit.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCropImageSrc(reader.result);
      setShowCropModal(true);
    };
    reader.readAsDataURL(file);
  };

  // Handle Apply Cropped Blob for Group Avatar
  const handleApplyGroupAvatarCrop = async (croppedBlob) => {
    if (!croppedBlob || !targetUser?._id) return;
    setUploadingGroupAvatar(true);
    const toastId = toast.loading("Updating group photo...");

    try {
      const formData = new FormData();
      formData.append("groupId", targetUser._id);
      formData.append("groupAvatar", croppedBlob, "groupAvatar.jpg");

      const res = await api.put("/api/group/update-details", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      toast.success("Group photo updated! 🎉", { id: toastId });
      updateConversationInStore(res.data);
      setShowCropModal(false);
      setCropImageSrc(null);
    } catch (err) {
      console.error("Failed to update group avatar:", err);
      toast.error(err.response?.data?.error || "Failed to update group photo", { id: toastId });
      throw err;
    } finally {
      setUploadingGroupAvatar(false);
    }
  };

  // Handle Select System Group Avatar (Admin Power)
  const handleSelectSystemGroupAvatar = async (systemAvatarUrl) => {
    if (!targetUser?._id) return;
    setUploadingGroupAvatar(true);
    const toastId = toast.loading("Updating group avatar...");
    try {
      const res = await api.put("/api/group/update-details", {
        groupId: targetUser._id,
        groupAvatar: systemAvatarUrl,
      });

      toast.success("Group avatar updated! 🎉", { id: toastId });
      updateConversationInStore(res.data);
      setShowGroupAvatarPickerModal(false);
      setShowPhotoOptionsModal(false);
    } catch (err) {
      console.error("Failed to update group avatar:", err);
      toast.error(err.response?.data?.error || "Failed to update group avatar", { id: toastId });
    } finally {
      setUploadingGroupAvatar(false);
    }
  };

  // Handle Reset Group Avatar to Default (Admin Power)
  const handleResetGroupAvatarToDefault = async () => {
    if (!targetUser?._id) return;
    setUploadingGroupAvatar(true);
    const toastId = toast.loading("Resetting group photo...");
    try {
      const res = await api.put("/api/group/update-details", {
        groupId: targetUser._id,
        groupAvatar: DEFAULT_GROUP_AVATAR_URL,
      });

      toast.success("Group photo reset to default! 🎉", { id: toastId });
      updateConversationInStore(res.data);
      setShowPhotoOptionsModal(false);
    } catch (err) {
      console.error("Failed to reset group avatar:", err);
      toast.error(err.response?.data?.error || "Failed to reset group photo", { id: toastId });
    } finally {
      setUploadingGroupAvatar(false);
    }
  };

  // Toggle selection for adding members in modal
  const toggleSelectToAdd = (userId) => {
    if (selectedToAdd.includes(userId)) {
      setSelectedToAdd(selectedToAdd.filter((id) => id !== userId));
    } else {
      setSelectedToAdd([...selectedToAdd, userId]);
    }
  };

  // Handle Add Members Submit
  const handleAddMembersSubmit = async (e) => {
    e.preventDefault();
    if (selectedToAdd.length === 0) {
      toast.error("Please select at least 1 contact to add");
      return;
    }
    setAddingLoading(true);
    try {
      const res = await api.post("/api/group/add-member", {
        groupId: targetUser._id,
        members: selectedToAdd,
      });
      toast.success("Members added to group successfully! 🎉");
      updateConversationInStore(res.data);
      setIsAddModalOpen(false);
      setSelectedToAdd([]);
      setAddSearchQuery("");
    } catch (err) {
      console.error("Error adding members:", err);
      toast.error(err.response?.data?.error || "Failed to add members");
    } finally {
      setAddingLoading(false);
    }
  };

  // Handle Promote Member to Admin
  const handlePromoteAdmin = async (memberId) => {
    try {
      const res = await api.post("/api/group/promote-admin", {
        groupId: targetUser._id,
        memberId,
      });
      toast.success("Member promoted to Admin! 🛡️");
      updateConversationInStore(res.data);
    } catch (err) {
      console.error("Error promoting member:", err);
      toast.error(err.response?.data?.error || "Failed to promote member to admin");
    }
  };

  // Handle Demote Admin to Member
  const handleDemoteAdmin = async (memberId) => {
    try {
      const res = await api.post("/api/group/demote-admin", {
        groupId: targetUser._id,
        memberId,
      });
      toast.success("Admin demoted to Member");
      updateConversationInStore(res.data);
    } catch (err) {
      console.error("Error demoting admin:", err);
      toast.error(err.response?.data?.error || "Failed to demote admin");
    }
  };

  // Filter eligible connected contacts who are NOT yet in the group
  const existingMemberIds = Array.isArray(targetUser.members)
    ? targetUser.members.map((m) => String(typeof m === "object" ? m._id : m))
    : [];

  const safeAllUsers = Array.isArray(allUsers) ? allUsers : [];
  const eligibleContacts = safeAllUsers.filter((u) => {
    if (!u) return false;
    if (existingMemberIds.includes(String(u._id))) return false;
    const q = addSearchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      u.fullname?.toLowerCase().includes(q) || u.uid?.toLowerCase().includes(q)
    );
  });

  // Sort Members so Admins are ALWAYS at the top
  const sortedMembers = Array.isArray(targetUser.members)
    ? [...targetUser.members].sort((a, b) => {
        if (!a || !b) return 0;
        const aId = String(typeof a === "object" ? a._id || "" : a);
        const bId = String(typeof b === "object" ? b._id || "" : b);
        const aIsAdmin =
          aId === adminIdStr ||
          (typeof a === "object" && a.role === "admin") ||
          (Array.isArray(targetUser.admins) &&
            targetUser.admins.some(
              (adm) => String(typeof adm === "object" ? adm._id || "" : adm) === aId
            ));
        const bIsAdmin =
          bId === adminIdStr ||
          (typeof b === "object" && b.role === "admin") ||
          (Array.isArray(targetUser.admins) &&
            targetUser.admins.some(
              (adm) => String(typeof adm === "object" ? adm._id || "" : adm) === bId
            ));

        if (aIsAdmin && !bIsAdmin) return -1;
        if (!aIsAdmin && bIsAdmin) return 1;
        const aName = typeof a === "object" ? a.fullname || "" : "";
        const bName = typeof b === "object" ? b.fullname || "" : "";
        return aName.localeCompare(bName);
      })
    : [];

  return (
    <div
      className={`absolute top-1.5 right-1.5 bottom-1.5 w-full sm:w-[380px] bg-slate-900/98 backdrop-blur-2xl border border-slate-700/90 ring-1 ring-white/10 shadow-[-12px_0_35px_rgba(0,0,0,0.65)] z-40 flex flex-col transition-transform duration-300 ease-in-out select-none rounded-2xl overflow-hidden ${
        isChatInfoOpen ? "translate-x-0" : "translate-x-[110%]"
      }`}
    >
      {/* Drawer Header */}
      <div className="h-[72px] px-6 flex items-center justify-between border-b border-slate-800/80 flex-shrink-0 bg-slate-950/60">
        <div className="flex items-center gap-2 text-white font-bold text-base">
          {isGroup ? (
            <FiUsers className="text-indigo-400 text-lg" />
          ) : (
            <FiInfo className="text-indigo-400 text-lg" />
          )}
          <span>{isGroup ? "Group Info" : "Contact Info"}</span>
        </div>
        <button
          onClick={closeChatInfo}
          className="p-2.5 rounded-xl bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white transition cursor-pointer border border-slate-700/60 hover:border-rose-600 shadow-md"
          title="Close Info (Esc)"
        >
          <FiX className="text-lg" />
        </button>
      </div>

      {/* Drawer Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 custom-scrollbar">
        {/* Profile Hero Card */}
        <div className="flex flex-col items-center text-center space-y-3 pb-6 border-b border-slate-800/60">
          <div className="relative">
            <div
              onClick={() => setShowHeroPhotoPreview(true)}
              className="group/photo relative w-28 h-28 rounded-full overflow-hidden ring-[1.5px] ring-white/90 shadow-2xl bg-slate-800 cursor-pointer hover:scale-105 active:scale-95 transition duration-200"
              title="Click to view full photo"
            >
              <img
                src={avatarUrl}
                alt={displayName}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/photo:opacity-100 transition-opacity flex items-center justify-center text-white">
                <FiMaximize2 className="text-base drop-shadow-md" />
              </div>
              {uploadingGroupAvatar && (
                <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center text-white">
                  <FiLoader className="text-2xl animate-spin text-indigo-400" />
                  <span className="text-[9px] font-bold mt-1 text-slate-200">Saving...</span>
                </div>
              )}
            </div>
            {isOnline && (
              <span
                className="absolute bottom-1 right-1 w-4 h-4 bg-emerald-500 border-2 border-slate-900 rounded-full shadow-md shadow-emerald-500/60 pointer-events-none"
                title="Online"
              />
            )}
            {isGroup && isUserAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => setShowPhotoOptionsModal(true)}
                  disabled={uploadingGroupAvatar}
                  className="absolute bottom-0 right-0 p-2 bg-gradient-to-tr from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 active:scale-95 text-white rounded-full shadow-lg border-2 border-slate-900 transition-all duration-200 transform hover:scale-110 hover:-translate-y-0.5 hover:shadow-indigo-500/50 cursor-pointer disabled:opacity-50"
                  title="Change Group Icon"
                >
                  <FiCamera className="text-xs" />
                </button>
                <input
                  ref={groupAvatarInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                  onChange={handleGroupAvatarFileSelect}
                  className="hidden"
                />
              </>
            )}
          </div>

          <div className="w-full flex flex-col items-center">
            {isEditingName ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSaveGroupName();
                }}
                className="flex items-center justify-center gap-1.5 w-full max-w-xs mt-0.5"
              >
                <input
                  type="text"
                  value={editedGroupName}
                  onChange={(e) => setEditedGroupName(e.target.value)}
                  placeholder="Group name..."
                  maxLength={50}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setIsEditingName(false);
                      setEditedGroupName(targetUser?.groupName || "");
                    }
                  }}
                  className="w-full px-3 py-1.5 bg-slate-800/90 border border-indigo-500 rounded-xl text-sm font-bold text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-inner transition"
                />
                <button
                  type="submit"
                  disabled={savingName || !editedGroupName.trim()}
                  className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition shadow-md shadow-indigo-600/30 flex-shrink-0"
                  title="Save Group Name"
                >
                  {savingName ? <FiLoader className="animate-spin text-sm" /> : <FiCheck className="text-sm" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingName(false);
                    setEditedGroupName(targetUser?.groupName || "");
                  }}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex-shrink-0"
                  title="Cancel"
                >
                  <FiX className="text-sm" />
                </button>
              </form>
            ) : (
              <div className="relative inline-flex items-center justify-center max-w-full group/editName">
                <h3 className="text-xl font-extrabold text-white tracking-wide truncate max-w-[220px] text-center">
                  {displayName}
                </h3>
                {isGroup && isUserAdmin && (
                  <button
                    onClick={() => {
                      setEditedGroupName(targetUser.groupName || "");
                      setIsEditingName(true);
                    }}
                    className="absolute -right-7 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-slate-800/80 transition-all hover:scale-110 active:scale-95 cursor-pointer"
                    title="Edit Group Name"
                  >
                    <FiEdit2 className="text-sm" />
                  </button>
                )}
              </div>
            )}

            {!isGroup && targetUser.uid && (
              <div className="flex items-center justify-center gap-1.5 mt-0.5">
                <p className="font-mono text-xs text-indigo-400 font-semibold">
                  UID: {targetUser.uid}
                </p>
                <button
                  onClick={() => handleCopyUid(targetUser.uid)}
                  className="p-1 text-slate-400 hover:text-indigo-300 transition"
                  title="Copy UID"
                >
                  {copiedUid ? (
                    <FiCheck className="text-xs text-emerald-400" />
                  ) : (
                    <FiCopy className="text-xs" />
                  )}
                </button>
              </div>
            )}
            <p
              className={`text-xs font-medium mt-1 flex items-center justify-center gap-1.5 ${
                isOnline ? "text-emerald-400" : "text-slate-400"
              }`}
            >
              {isOnline && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              )}
              <span>{subtitle}</span>
            </p>
          </div>

          {/* Quick Actions Row */}
          <div className="w-full pt-2">
            {!isGroup ? (
              <div className="grid grid-cols-4 gap-2 w-full">
                {/* 1. Chat / Message Button */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedConversation(targetUser);
                    setActiveTab("chats");
                    closeChatInfo();
                  }}
                  className="py-2.5 px-1.5 rounded-2xl bg-slate-800/90 hover:bg-slate-800 border border-slate-700/70 text-slate-200 hover:text-indigo-400 transition flex flex-col items-center justify-center gap-1 text-xs font-semibold shadow-md w-full active:scale-95 cursor-pointer group"
                  title="Message Now"
                >
                  <FiMessageSquare className="text-sm flex-shrink-0 text-indigo-400 group-hover:scale-110 transition-transform" />
                  <span className="truncate text-[11px] group-hover:text-indigo-400 transition-colors">Chat</span>
                </button>

                {/* 2. Voice Call */}
                <button
                  type="button"
                  onClick={handleStartVoiceCall}
                  className="py-2.5 px-1.5 rounded-2xl bg-slate-800/90 hover:bg-slate-800 border border-slate-700/70 text-slate-200 hover:text-indigo-400 transition flex flex-col items-center justify-center gap-1 text-xs font-semibold shadow-md w-full active:scale-95 cursor-pointer group"
                  title="Voice Call"
                >
                  <FiPhone className="text-indigo-400 text-sm flex-shrink-0 group-hover:scale-110 transition-transform" />
                  <span className="truncate text-[11px] group-hover:text-indigo-400 transition-colors">Voice</span>
                </button>

                {/* 3. Video Call */}
                <button
                  type="button"
                  onClick={handleStartVideoCall}
                  className="py-2.5 px-1.5 rounded-2xl bg-slate-800/90 hover:bg-slate-800 border border-slate-700/70 text-slate-200 hover:text-indigo-400 transition flex flex-col items-center justify-center gap-1 text-xs font-semibold shadow-md w-full active:scale-95 cursor-pointer group"
                  title="Video Call"
                >
                  <FiVideo className="text-sm flex-shrink-0 text-indigo-400 group-hover:scale-110 transition-transform" />
                  <span className="truncate text-[11px] group-hover:text-indigo-400 transition-colors">Video</span>
                </button>

                {/* 4. Pin / Unpin */}
                <button
                  type="button"
                  onClick={() => togglePinChat(targetUser._id)}
                  className={`py-2.5 px-1.5 rounded-2xl border transition flex flex-col items-center justify-center gap-1 text-xs font-semibold shadow-md w-full active:scale-95 cursor-pointer group ${
                    isPinned
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                      : "bg-slate-800/90 text-slate-300 hover:text-amber-300 border-slate-700/70"
                  }`}
                  title={isPinned ? "Unpin Chat" : "Pin Chat"}
                >
                  <BsPinAngleFill className="text-amber-400 text-sm flex-shrink-0 group-hover:scale-110 transition-transform" />
                  <span className="truncate text-[11px] group-hover:text-amber-300 transition-colors">
                    {isPinned ? "Pinned" : "Pin"}
                  </span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 w-full">
                {/* 1. Group Chat Button */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedConversation(targetUser);
                    setActiveTab("chats");
                    closeChatInfo();
                  }}
                  className="py-2.5 px-3 rounded-2xl bg-slate-800/90 hover:bg-slate-800 border border-slate-700/70 text-slate-200 hover:text-indigo-400 transition flex items-center justify-center gap-2 text-xs font-semibold shadow-md active:scale-95 cursor-pointer group"
                  title="Group Chat"
                >
                  <FiMessageSquare className="text-sm flex-shrink-0 text-indigo-400 group-hover:scale-110 transition-transform" />
                  <span className="group-hover:text-indigo-400 transition-colors">Group Chat</span>
                </button>

                {/* 2. Pin / Unpin Group */}
                <button
                  type="button"
                  onClick={() => togglePinChat(targetUser._id)}
                  className={`py-2.5 px-3 rounded-2xl border transition flex items-center justify-center gap-2 text-xs font-semibold shadow-md active:scale-95 cursor-pointer group ${
                    isPinned
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                      : "bg-slate-800/90 text-slate-300 hover:text-amber-300 border-slate-700/70"
                  }`}
                  title={isPinned ? "Unpin Chat" : "Pin Chat"}
                >
                  <BsPinAngleFill className="text-amber-400 text-sm flex-shrink-0 group-hover:scale-110 transition-transform" />
                  <span className="group-hover:text-amber-300 transition-colors">{isPinned ? "Pinned" : "Pin Chat"}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* About / Bio Section (Editable for Admin) */}
        <div className="space-y-2 pb-6 border-b border-slate-800/60">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <FiInfo className="text-indigo-400" />
              <span>About</span>
            </h4>
            {isGroup && isUserAdmin && !isEditingAbout && (
              <button
                onClick={() => {
                  setEditedAbout(targetUser.groupDescription || "");
                  setIsEditingAbout(true);
                }}
                className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 transition flex items-center gap-1"
                title="Edit Group Description"
              >
                <FiEdit2 className="text-xs" />
                <span>Edit</span>
              </button>
            )}
          </div>

          {isGroup && isUserAdmin && isEditingAbout ? (
            <div className="space-y-2.5">
              <textarea
                value={editedAbout}
                onChange={(e) => setEditedAbout(e.target.value)}
                placeholder="Write group description / about..."
                rows={3}
                className="w-full p-3 rounded-2xl bg-slate-950/80 border border-indigo-500/60 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition resize-none"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditingAbout(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingAbout}
                  onClick={handleSaveAbout}
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/30 transition flex items-center gap-1"
                >
                  <FiSave className="text-xs" />
                  <span>{savingAbout ? "Saving..." : "Save"}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80">
              <p className="text-xs text-slate-200 leading-relaxed font-normal">
                {aboutText}
              </p>
            </div>
          )}
        </div>

        {/* User Details (1-on-1 Contact) */}
        {!isGroup && (
          <div className="space-y-2 pb-6 border-b border-slate-800/60">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <FiShield className="text-indigo-400" />
              <span>Contact Details</span>
            </h4>
            <div className="space-y-2 text-xs">
              {targetUser.email && (
                <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 flex items-center gap-3">
                  <FiMail className="text-slate-400 text-sm flex-shrink-0" />
                  <div className="truncate">
                    <span className="text-[10px] text-slate-500 uppercase block">
                      Email Address
                    </span>
                    <span className="text-slate-200 font-medium">
                      {targetUser.email}
                    </span>
                  </div>
                </div>
              )}

              {targetUser.uid && (
                <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FiHash className="text-slate-400 text-sm flex-shrink-0" />
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block">
                        Unique ID (UID)
                      </span>
                      <span className="font-mono text-indigo-300 font-bold">
                        {targetUser.uid}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleCopyUid(targetUser.uid)}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60 transition flex items-center gap-1.5 text-[11px] font-semibold"
                    title="Copy UID to clipboard"
                  >
                    {copiedUid ? (
                      <>
                        <FiCheck className="text-xs text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <FiCopy className="text-xs text-indigo-400" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Shared Media Gallery Section */}
        <div className="space-y-3 pb-6 border-b border-slate-800/60">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <FiImage className="text-indigo-400" />
              <span>Shared Media</span>
            </h4>
            <span className="text-xs font-semibold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
              {allMediaItems.length}
            </span>
          </div>

          {allMediaItems.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {allMediaItems.slice(0, 9).map((item) => (
                <div
                  key={item.id}
                  onClick={() => setLightboxMessageId(item.id, "media")}
                  className="aspect-square rounded-xl overflow-hidden border border-slate-800 cursor-pointer group relative shadow-md"
                >
                  <img
                    src={item.url}
                    alt="Shared media"
                    className="w-full h-full object-cover group-hover:scale-110 transition duration-300"
                  />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                    <FiImage className="text-white text-base" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-slate-950/40 border border-slate-800/60 text-center">
              <p className="text-xs text-slate-500">No shared photos in this chat yet</p>
            </div>
          )}
        </div>

        {/* Group Members Section (Sorted so Admin is FIRST at top) */}
        {isGroup && Array.isArray(sortedMembers) && (
          <div className="space-y-3 pb-6">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <FiUsers className="text-indigo-400" />
                <span>Group Members ({sortedMembers.length})</span>
              </h4>

              {/* Admin "+ Add Members" Button */}
              {isUserAdmin && (
                <button
                  onClick={() => setIsAddModalOpen(true)}
                  className="px-2.5 py-1 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-[11px] font-semibold flex items-center gap-1 shadow-md shadow-indigo-600/20 transition"
                  title="Add new members to group"
                >
                  <FiUserPlus className="text-xs" />
                  <span>Add</span>
                </button>
              )}
            </div>

            <div className="space-y-2">
              {sortedMembers.map((member) => {
                const mObj = typeof member === "object" ? member : { _id: member };
                const mIdStr = String(mObj._id);
                const mOnline = Array.isArray(onlineUsers) && onlineUsers.includes(mIdStr);
                const mAvatar =
                  mObj.avatar ||
                  `https://api.dicebear.com/7.x/bottts/svg?seed=${mObj.uid || mIdStr}`;
                const mName = mObj.fullname || "Group Member";
                const isThisMemberAdmin =
                  adminIdStr === mIdStr ||
                  mObj.role === "admin" ||
                  (Array.isArray(targetUser.admins) &&
                    targetUser.admins.some(
                      (adm) => String(adm._id || adm) === mIdStr
                    ));

                return (
                  <div
                    key={mIdStr}
                    className="p-2.5 rounded-2xl bg-slate-950/60 hover:bg-slate-900/80 border border-slate-800/80 flex items-center justify-between gap-2 transition"
                  >
                    <div
                      onClick={() => setSelectedMemberForPopup(mObj)}
                      className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer group/member"
                      title={`Click to view ${mName}'s profile`}
                    >
                      <div className="relative flex-shrink-0">
                        <img
                          src={mAvatar}
                          alt={mName}
                          className="w-8 h-8 rounded-full object-cover ring-[1.5px] ring-white/85 shadow-sm group-hover/member:scale-105 active:scale-95 transition duration-150"
                        />
                        {mOnline && (
                          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border border-slate-900 rounded-full" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-100 group-hover/member:text-indigo-300 leading-tight truncate transition-colors">
                          {mName}
                        </p>
                        {mObj.uid && (
                          <p className="font-mono text-[10px] text-slate-400">
                            UID: {mObj.uid}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {/* Admin Badge Tag */}
                      {isThisMemberAdmin && (
                        <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold uppercase flex items-center gap-1 shadow-sm">
                          <FiShield className="text-[10px] text-indigo-400" /> Admin
                        </span>
                      )}

                      {/* Admin Controls for other members */}
                      {isUserAdmin && mIdStr !== loggedInUserId && (
                        <>
                          {/* If Admin: Option to Demote */}
                          {isThisMemberAdmin ? (
                            <button
                              onClick={() => handleDemoteAdmin(mIdStr)}
                              className="px-2 py-1 rounded-xl bg-slate-800 hover:bg-amber-500/20 text-slate-400 hover:text-amber-300 border border-slate-700/60 hover:border-amber-500/30 text-[10px] font-medium transition shadow-sm"
                              title={`Demote ${mName} to Member`}
                            >
                              Demote
                            </button>
                          ) : (
                            /* If Member: Option to Promote */
                            <button
                              onClick={() => handlePromoteAdmin(mIdStr)}
                              className="w-7 h-7 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 transition flex items-center justify-center shadow-sm"
                              title={`Promote ${mName} to Admin`}
                            >
                              <FiShield className="text-xs" />
                            </button>
                          )}

                          {/* Remove Member Button */}
                          <button
                            onClick={() => setMemberToRemove(mObj)}
                            className="w-7 h-7 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition flex items-center justify-center shadow-sm"
                            title={`Remove ${mName} from group`}
                          >
                            <FiUserMinus className="text-xs" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ADMIN ADD MEMBERS MODAL (FULL-SCREEN PORTAL) */}
      {isAddModalOpen &&
        typeof document !== "undefined" &&
        document.body &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200 text-slate-100 select-none">
            <div className="bg-slate-900 border border-slate-800/90 rounded-3xl w-full max-w-md p-5 shadow-2xl space-y-4 relative overflow-hidden flex flex-col max-h-[85vh]">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 flex-shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
                    <FiUserPlus className="text-base" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white leading-tight">Add Group Members</h3>
                    <p className="text-[11px] text-slate-400">
                      Select contacts from your list to add to {displayName}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="w-7 h-7 rounded-full bg-slate-800/80 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition"
                >
                  <FiX className="text-xs" />
                </button>
              </div>

              {/* Form Content */}
              <form onSubmit={handleAddMembersSubmit} className="flex-1 overflow-hidden flex flex-col space-y-3">
                {/* Search Field */}
                <div className="relative flex items-center flex-shrink-0">
                  <FiSearch className="absolute left-3.5 text-slate-400 text-xs pointer-events-none" />
                  <input
                    type="text"
                    value={addSearchQuery}
                    onChange={(e) => setAddSearchQuery(e.target.value)}
                    placeholder="Search contacts by name or UID..."
                    className="w-full pl-9 pr-8 py-2 bg-slate-800/50 border border-slate-700/70 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition"
                  />
                  {addSearchQuery && (
                    <button
                      onClick={() => setAddSearchQuery("")}
                      className="absolute right-3 text-slate-400 hover:text-white transition text-xs"
                    >
                      <FiX />
                    </button>
                  )}
                </div>

                {/* Eligible Contacts List */}
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar min-h-[160px]">
                  {eligibleContacts.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400">
                      No new eligible contacts available to add.
                    </div>
                  ) : (
                    eligibleContacts.map((user) => {
                      const isSelected = selectedToAdd.includes(user._id);
                      return (
                        <div
                          key={user._id}
                          onClick={() => toggleSelectToAdd(user._id)}
                          className={`p-2.5 px-3 rounded-xl flex items-center justify-between cursor-pointer transition ${
                            isSelected
                              ? "bg-indigo-600/20 text-white border border-indigo-500/60"
                              : "bg-slate-950/40 hover:bg-slate-800/50 border border-slate-800/60 text-slate-300"
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <img
                              src={
                                user.avatar ||
                                `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}`
                              }
                              alt={user.fullname}
                              className="w-8 h-8 rounded-full object-cover ring-[1.5px] ring-white/85 shadow-sm"
                            />
                            <div className="min-w-0">
                              <h4 className="text-xs font-semibold truncate">
                                {user.fullname}
                              </h4>
                              <p className="text-[10px] text-slate-400 font-mono">
                                UID: {user.uid}
                              </p>
                            </div>
                          </div>

                          <div
                            className={`w-4 h-4 rounded-md flex items-center justify-center border transition ${
                              isSelected
                                ? "bg-indigo-600 border-indigo-500 text-white"
                                : "border-slate-600"
                            }`}
                          >
                            {isSelected && <FiCheck className="text-[10px]" />}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Footer Buttons */}
                <div className="flex items-center gap-2.5 pt-2 border-t border-slate-800/80 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="flex-1 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addingLoading || selectedToAdd.length === 0}
                    className={`flex-1 py-2 px-3 font-semibold text-xs rounded-xl shadow-lg transition transform active:scale-95 flex items-center justify-center gap-1.5 ${
                      selectedToAdd.length > 0
                        ? "bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-indigo-600/25"
                        : "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50"
                    }`}
                  >
                    {addingLoading ? "Adding..." : "Add to Group"}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* CONFIRMATION MODAL FOR REMOVING MEMBER (FULL-SCREEN PORTAL) */}
      {memberToRemove &&
        typeof document !== "undefined" &&
        document.body &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200 select-none">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-4 text-center relative overflow-hidden">
              <div className="w-12 h-12 rounded-2xl bg-red-500/20 border border-red-500/40 text-red-400 flex items-center justify-center mx-auto text-xl shadow-lg shadow-red-500/10">
                <FiUserMinus />
              </div>

              <div className="space-y-1">
                <h3 className="text-base font-extrabold text-white">Remove Member</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Are you sure you want to remove{" "}
                  <span className="text-slate-100 font-bold">
                    {memberToRemove.fullname || "this member"}
                  </span>{" "}
                  from <span className="text-indigo-400 font-bold">{displayName}</span>?
                </p>
              </div>

              <div className="flex items-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setMemberToRemove(null)}
                  className="flex-1 py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={removeLoading}
                  onClick={() => handleConfirmRemoveMember(memberToRemove._id)}
                  className="flex-1 py-2.5 px-3 bg-red-600 hover:bg-red-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-red-600/30 transition transform active:scale-95 flex items-center justify-center gap-1.5"
                >
                  {removeLoading ? "Removing..." : "Remove Member"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ── Dedicated Hero Photo Preview Lightbox ── */}
      {showHeroPhotoPreview && (
        <ProfilePhotoPreview
          user={targetUser}
          onClose={() => setShowHeroPhotoPreview(false)}
        />
      )}

      {/* ── Group Photo Options Modal (Change / Reset) ── */}
      {showPhotoOptionsModal &&
        createPortal(
          <div
            onClick={() => setShowPhotoOptionsModal(false)}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150 select-none"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900/98 border border-slate-700/80 rounded-3xl shadow-2xl p-6 max-w-[320px] sm:max-w-[340px] w-full flex flex-col items-center text-center space-y-4 relative animate-in zoom-in-95 duration-150 ring-1 ring-white/5"
            >
              {/* Top Close Button */}
              <button
                type="button"
                onClick={() => setShowPhotoOptionsModal(false)}
                className="absolute top-3.5 right-3.5 p-2 rounded-xl bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white border border-slate-700/60 hover:border-rose-600 transition cursor-pointer shadow-md"
                title="Close"
              >
                <FiX className="text-sm" />
              </button>

              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-white tracking-wide">
                  Change Group Photo
                </h3>
                <p className="text-[11px] text-slate-400">
                  Upload a custom photo or choose a preset avatar
                </p>
              </div>

              {/* Circular Current Photo Preview */}
              <div className="py-1">
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden ring-2 ring-indigo-500/80 shadow-[0_0_20px_rgba(99,102,241,0.25)] bg-slate-800 flex-shrink-0">
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="w-full space-y-2 pt-1">
                {/* 1. Upload Custom Photo Button */}
                <button
                  type="button"
                  onClick={() => {
                    setShowPhotoOptionsModal(false);
                    groupAvatarInputRef.current?.click();
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition flex items-center justify-center gap-2 shadow-md shadow-indigo-600/30 active:scale-95 cursor-pointer"
                >
                  <FiCamera className="text-sm" />
                  <span>Upload Custom Photo</span>
                </button>

                {/* 2. Choose Preset Avatar Button */}
                <button
                  type="button"
                  onClick={() => {
                    setShowPhotoOptionsModal(false);
                    setShowGroupAvatarPickerModal(true);
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700/80 text-slate-200 font-semibold text-xs transition flex items-center justify-center gap-2 active:scale-95 cursor-pointer shadow-sm"
                >
                  <FiSmile className="text-sm text-indigo-400" />
                  <span>Choose Preset Avatar</span>
                </button>

                {/* 3. Reset Button */}
                <button
                  type="button"
                  onClick={handleResetGroupAvatarToDefault}
                  disabled={uploadingGroupAvatar}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-800/60 hover:bg-rose-500/10 border border-slate-700/60 hover:border-rose-500/30 text-slate-400 hover:text-rose-400 font-semibold text-xs transition flex items-center justify-center gap-2 active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  <FiRotateCcw className="text-xs" />
                  <span>Reset to Default Avatar</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ── Group System Avatar Picker Modal (Circular & Streamlined UX) ── */}
      {showGroupAvatarPickerModal &&
        createPortal(
          <div
            onClick={() => setShowGroupAvatarPickerModal(false)}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-150 select-none font-sans"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900/98 border border-slate-700/80 rounded-3xl shadow-2xl p-5 sm:p-6 w-[360px] sm:w-[400px] flex flex-col space-y-4 relative animate-in zoom-in-95 duration-150 ring-1 ring-white/10"
            >
              {/* Header & Close Button */}
              <div className="flex items-start justify-between">
                <div className="space-y-0.5 text-left">
                  <h3 className="text-sm sm:text-base font-bold text-white tracking-wide flex items-center gap-2">
                    <FiSmile className="text-indigo-400 text-base" />
                    <span>Choose Group Avatar</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Select a circular preset avatar for this group
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowGroupAvatarPickerModal(false)}
                  className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white border border-slate-700/60 hover:border-rose-600 transition cursor-pointer shadow-md -mr-1 -mt-1"
                  title="Close"
                >
                  <FiX className="text-sm" />
                </button>
              </div>

              {/* Circular Group Presets Grid */}
              <div className="p-1 custom-scrollbar">
                <div className="grid grid-cols-3 gap-3.5 sm:gap-4 w-full py-2 place-items-center">
                  {GROUP_AVATAR_ITEMS.presets.map((item) => {
                    const isCurrent = avatarUrl === item.url;
                    return (
                      <div
                        key={item.key}
                        onClick={() => handleSelectSystemGroupAvatar(item.url)}
                        className="flex flex-col items-center gap-1.5 p-1.5 rounded-2xl hover:bg-slate-800/50 transition-all duration-200 cursor-pointer group/item"
                      >
                        <div className="relative">
                          <div
                            className={`w-16 h-16 sm:w-18 sm:h-18 rounded-full overflow-hidden transition-all duration-200 transform group-hover/item:scale-105 bg-slate-800 flex items-center justify-center ${
                              isCurrent
                                ? "ring-2 ring-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.4)] scale-105"
                                : "ring-2 ring-slate-700/80 group-hover/item:ring-indigo-400/80"
                            }`}
                          >
                            <img
                              src={item.url}
                              alt={item.label}
                              className="w-full h-full object-cover"
                            />
                          </div>

                          {/* Selected Checkmark Badge */}
                          {isCurrent && (
                            <span className="absolute -top-1 -right-1 p-1 bg-emerald-400 rounded-full text-slate-950 text-[10px] shadow-lg animate-in zoom-in-50 duration-150">
                              <FiCheck className="stroke-[3]" />
                            </span>
                          )}
                        </div>

                        <span
                          className={`text-[11px] font-medium tracking-tight text-center max-w-[70px] truncate transition-colors ${
                            isCurrent
                              ? "text-emerald-400 font-bold"
                              : "text-slate-300 group-hover/item:text-white"
                          }`}
                        >
                          {item.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ── Group Avatar Photo Crop Modal (Admin Power) ── */}
      {showCropModal && cropImageSrc && (
        <PhotoCropModal
          imageSrc={cropImageSrc}
          onApply={handleApplyGroupAvatarCrop}
          onClose={() => {
            setShowCropModal(false);
            setCropImageSrc(null);
          }}
        />
      )}

      {/* ── Group Member Profile Action Popup Card ── */}
      {selectedMemberForPopup && (
        <ProfileActionPopup
          user={selectedMemberForPopup}
          onClose={() => setSelectedMemberForPopup(null)}
        />
      )}
    </div>
  );
}

export default ChatInfoDrawer;
