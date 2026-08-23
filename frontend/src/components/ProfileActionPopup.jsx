import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import useConversation from "../zustand/useConversation";
import { useSocketContext } from "../context/SocketContext";
import { useAuth } from "../context/AuthProvider";
import {
  FiMessageSquare,
  FiPhone,
  FiVideo,
  FiInfo,
  FiX,
  FiUsers,
  FiMaximize2,
  FiCopy,
  FiCheck,
  FiCamera,
  FiLoader,
  FiRotateCcw,
  FiSmile,
} from "react-icons/fi";
import api from "../api";
import toast from "react-hot-toast";
import ProfilePhotoPreview from "./ProfilePhotoPreview";
import PhotoCropModal from "./PhotoCropModal";
import {
  DEFAULT_GROUP_AVATAR_URL,
  GROUP_AVATAR_URLS,
  GROUP_AVATAR_ITEMS,
} from "../config/systemAvatars";

function ProfileActionPopup({ user, onClose }) {
  const {
    setSelectedConversation,
    setActiveTab,
    setActiveCall,
    openChatInfo,
    updateConversationInStore,
  } = useConversation();
  const { onlineUsers = [] } = useSocketContext() || {};
  const [authUser] = useAuth();
  const [showPhotoPreview, setShowPhotoPreview] = useState(false);
  const [copiedUid, setCopiedUid] = useState(false);

  // Group Avatar Upload & Crop State
  const groupAvatarInputRef = useRef(null);
  const [uploadingGroupAvatar, setUploadingGroupAvatar] = useState(false);
  const [showPhotoOptionsModal, setShowPhotoOptionsModal] = useState(false);
  const [showGroupAvatarPickerModal, setShowGroupAvatarPickerModal] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState(null);
  const [showCropModal, setShowCropModal] = useState(false);

  // Close on Escape key press (only when child modals are NOT open)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (
        e.key === "Escape" &&
        !showPhotoPreview &&
        !showCropModal &&
        !showPhotoOptionsModal &&
        !showGroupAvatarPickerModal
      ) {
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, showPhotoPreview, showCropModal, showPhotoOptionsModal, showGroupAvatarPickerModal]);

  if (!user || typeof document === "undefined" || !document.body) return null;

  const userObj = typeof user === "object" ? user : { _id: user, fullname: "User" };
  const isGroup = Boolean(userObj.isGroup);
  const isOnline =
    !isGroup &&
    Array.isArray(onlineUsers) &&
    onlineUsers.map(String).includes(String(userObj._id || ""));

  const avatarUrl = isGroup
    ? userObj.groupAvatar ||
      `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(
        userObj.groupName || "Group"
      )}`
    : userObj.avatar ||
      `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(
        userObj.uid || userObj._id || "User"
      )}`;

  const displayName = isGroup ? userObj.groupName || "Group" : userObj.fullname || "User";
  const subtitle = isGroup
    ? `${userObj.members?.length || 0} group members`
    : userObj.about || (isOnline ? "Online" : "Hey there! I am using ChitChat.");

  const uid = userObj.uid ? String(userObj.uid) : "";

  // Admin Check (Supports groupAdmin and co-admins)
  const loggedInUserId = String(authUser?.user?._id || authUser?._id || "");
  const adminIdStr = String(userObj.groupAdmin?._id || userObj.groupAdmin || "");
  const isUserAdmin =
    isGroup &&
    loggedInUserId &&
    (loggedInUserId === adminIdStr ||
      (Array.isArray(userObj.members) &&
        userObj.members.some(
          (m) => String(m._id || m) === loggedInUserId && m.role === "admin"
        )) ||
      (Array.isArray(userObj.admins) &&
        userObj.admins.some((a) => String(a._id || a) === loggedInUserId)));

  // Copy UID Handler with feedback
  const handleCopyUid = async (uidStr) => {
    if (!uidStr) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(uidStr);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = uidStr;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopiedUid(true);
      toast.success("UID copied to clipboard!");
      setTimeout(() => setCopiedUid(false), 2000);
    } catch (err) {
      console.error("Failed to copy UID:", err);
      toast.error("Failed to copy UID");
    }
  };

  // Open direct personal / group chat
  const handleOpenMessage = (e) => {
    e.stopPropagation();
    if (typeof setSelectedConversation === "function") {
      setSelectedConversation(userObj);
    }
    if (typeof setActiveTab === "function") {
      setActiveTab("chats");
    }
    onClose?.();
  };

  // Reusable Voice Call Handler
  const handleVoiceCall = (e) => {
    e.stopPropagation();
    if (typeof setActiveCall === "function") {
      setActiveCall({
        isInitiator: true,
        userToCall: userObj,
        callType: "voice",
      });
    }
    onClose?.();
  };

  // Reusable Video Call Handler
  const handleVideoCall = (e) => {
    e.stopPropagation();
    if (typeof setActiveCall === "function") {
      setActiveCall({
        isInitiator: true,
        userToCall: userObj,
        callType: "video",
      });
    }
    onClose?.();
  };

  // Open Contact/Group Info Drawer
  const handleOpenInfo = (e) => {
    e.stopPropagation();
    if (typeof openChatInfo === "function") {
      openChatInfo(userObj);
    }
    onClose?.();
  };

  // Handle Group Avatar File Selection (Admin Power)
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
    if (!croppedBlob || !userObj?._id) return;
    setUploadingGroupAvatar(true);
    const toastId = toast.loading("Updating group photo...");

    try {
      const formData = new FormData();
      formData.append("groupId", userObj._id);
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
    if (!userObj?._id) return;
    setUploadingGroupAvatar(true);
    const toastId = toast.loading("Updating group avatar...");
    try {
      const res = await api.put("/api/group/update-details", {
        groupId: userObj._id,
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
    if (!userObj?._id) return;
    setUploadingGroupAvatar(true);
    const toastId = toast.loading("Resetting group photo...");
    try {
      const res = await api.put("/api/group/update-details", {
        groupId: userObj._id,
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

  return (
    <>
      {createPortal(
        <div
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150 select-none"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900/98 border border-slate-700/80 rounded-3xl shadow-2xl p-6 sm:p-7 flex flex-col items-center text-center max-w-[320px] sm:max-w-[350px] w-full space-y-4 relative animate-in zoom-in-95 duration-150 ring-1 ring-white/5"
          >
            {/* Top-Right Close Button */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close profile"
              className="absolute top-3.5 right-3.5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-rose-600 transition cursor-pointer"
              title="Close (Esc)"
            >
              <FiX className="text-base" />
            </button>

            {/* Clickable Profile Photo with Thin Premium White Ring (Opens Photo Preview) */}
            <div className="pt-1">
              <div className="relative inline-block group/avatar">
                <button
                  type="button"
                  onClick={() => setShowPhotoPreview(true)}
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden ring-[1.5px] ring-white/90 shadow-[0_0_20px_rgba(255,255,255,0.15)] bg-slate-800 flex-shrink-0 cursor-pointer block relative group-hover/avatar:scale-105 active:scale-95 transition duration-200"
                  title="Click to view full photo"
                >
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(
                        uid || "User"
                      )}`;
                    }}
                  />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/avatar:opacity-100 transition-opacity flex items-center justify-center text-white">
                    <FiMaximize2 className="text-base drop-shadow-md" />
                  </div>
                </button>

                {/* Uploading Group Avatar Spinner */}
                {uploadingGroupAvatar && (
                  <div className="absolute inset-0 rounded-full bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center text-white z-10">
                    <FiLoader className="text-2xl animate-spin text-indigo-400" />
                    <span className="text-[9px] font-bold mt-1 text-slate-200">Saving...</span>
                  </div>
                )}

                {/* Online Status Dot */}
                {isOnline && (
                  <span
                    className="absolute bottom-1 right-1 w-3.5 h-3.5 bg-emerald-500 border-2 border-slate-900 rounded-full shadow-sm shadow-emerald-500/50 pointer-events-none"
                    title="Online"
                  />
                )}

                {/* Admin Camera Button / Group Badge */}
                {isGroup && isUserAdmin ? (
                  <>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowPhotoOptionsModal(true);
                      }}
                      disabled={uploadingGroupAvatar}
                      className="absolute bottom-0 right-0 p-2 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white rounded-full shadow-lg border-2 border-slate-900 transition-transform duration-200 cursor-pointer disabled:opacity-50 z-20"
                      title="Change Group Photo"
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
                ) : isGroup ? (
                  <span className="absolute -bottom-0.5 -right-0.5 p-1 bg-violet-600 border-2 border-slate-900 rounded-full text-white text-[10px] pointer-events-none">
                    <FiUsers />
                  </span>
                ) : null}
              </div>
            </div>

            {/* User / Group Info Details */}
            <div className="space-y-1 w-full">
              <h3 className="text-base sm:text-lg font-extrabold text-white tracking-wide truncate max-w-[260px] mx-auto">
                {displayName}
              </h3>

              <p className="text-xs text-slate-400 truncate max-w-[260px] mx-auto leading-relaxed">
                {subtitle}
              </p>

              {/* UID with Copy Button */}
              {!isGroup && uid && (
                <div className="flex items-center justify-center gap-1.5 pt-1">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-800/80 border border-slate-700/60 rounded-xl shadow-inner">
                    <span className="font-mono text-xs text-indigo-300 font-semibold tracking-wide">
                      UID: {uid}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyUid(uid);
                      }}
                      className="text-slate-400 hover:text-indigo-400 transition"
                      title="Copy UID"
                    >
                      {copiedUid ? (
                        <FiCheck className="text-emerald-400 text-xs" />
                      ) : (
                        <FiCopy className="text-xs" />
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Primary Action Buttons Matrix with Pop-Out Hover Animations */}
            <div className="w-full pt-1 space-y-2">
              {/* Message / Chat Action */}
              <button
                type="button"
                onClick={handleOpenMessage}
                className="group w-full py-2.5 px-4 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 hover:scale-[1.02] active:scale-[0.98] text-white font-semibold text-xs sm:text-sm rounded-xl shadow-lg shadow-indigo-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <FiMessageSquare className="text-sm group-hover:scale-125 transition-transform duration-200" />
                <span>{isGroup ? "Group Chat" : "Message"}</span>
              </button>

              {/* Secondary Actions: Call & Video for 1-on-1, Info for Groups */}
              <div className="grid grid-cols-2 gap-2">
                {!isGroup ? (
                  <>
                    <button
                      type="button"
                      onClick={handleVoiceCall}
                      className="group py-2.5 px-3 bg-slate-800 hover:bg-slate-700 hover:text-emerald-400 hover:scale-[1.03] active:scale-[0.98] text-slate-300 font-medium text-xs rounded-xl border border-slate-700/60 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <FiPhone className="text-xs text-emerald-400 group-hover:scale-125 transition-transform duration-200" />
                      <span>Audio</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleVideoCall}
                      className="group py-2.5 px-3 bg-slate-800 hover:bg-slate-700 hover:text-indigo-400 hover:scale-[1.03] active:scale-[0.98] text-slate-300 font-medium text-xs rounded-xl border border-slate-700/60 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <FiVideo className="text-xs text-indigo-400 group-hover:scale-125 transition-transform duration-200" />
                      <span>Video</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleOpenInfo}
                    className="group col-span-2 py-2.5 px-3 bg-slate-800 hover:bg-slate-700 hover:text-indigo-400 hover:scale-[1.02] active:scale-[0.98] text-slate-300 font-medium text-xs rounded-xl border border-slate-700/60 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <FiInfo className="text-xs text-indigo-400 group-hover:scale-125 transition-transform duration-200" />
                    <span>Group Info</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Dedicated Hero Photo Preview Lightbox ── */}
      {showPhotoPreview && (
        <ProfilePhotoPreview
          user={userObj}
          onClose={() => setShowPhotoPreview(false)}
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
              {/* Top-Right Close Button */}
              <button
                type="button"
                onClick={() => setShowPhotoOptionsModal(false)}
                className="absolute top-3.5 right-3.5 p-2 rounded-xl bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white border border-slate-700/60 hover:border-rose-600 transition cursor-pointer shadow-md"
                title="Close"
              >
                <FiX className="text-base" />
              </button>

              <h3 className="text-base font-bold text-white tracking-wide">
                Group Photo
              </h3>

              {/* Large Circular Current Photo Preview with White Ring */}
              <div className="py-1">
                <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden ring-[1.5px] ring-white/90 shadow-[0_0_20px_rgba(255,255,255,0.15)] bg-slate-800 flex-shrink-0">
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
    </>
  );
}

export default ProfileActionPopup;
