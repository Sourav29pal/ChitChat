import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../../context/AuthProvider";
import api from "../../api";
import {
  FiUser,
  FiCopy,
  FiCheck,
  FiLogOut,
  FiEdit2,
  FiCamera,
  FiMail,
  FiHash,
  FiShield,
  FiLoader,
  FiX,
  FiMaximize2,
  FiRotateCcw,
  FiSmile,
  FiArrowLeft,
  FiCheckCircle,
} from "react-icons/fi";
import toast from "react-hot-toast";
import PhotoCropModal from "../../components/PhotoCropModal";
import ProfilePhotoPreview from "../../components/ProfilePhotoPreview";
import useConversation from "../../zustand/useConversation";
import {
  DEFAULT_USER_AVATAR_URL,
  USER_AVATAR_ITEMS,
} from "../../config/systemAvatars";

function UserProfile() {
  const [authUser, setAuthUser] = useAuth();
  const user = authUser?.user || (authUser && authUser._id ? authUser : null);
  const [loggingOut, setLoggingOut] = useState(false);

  // View vs Edit Mode
  const [isEditMode, setIsEditMode] = useState(false);

  // Photo Preview Modal State (Read-only mode lightbox)
  const [showPhotoPreview, setShowPhotoPreview] = useState(false);

  // Photo Options Modal State (Edit mode camera popup)
  const [showPhotoOptionsModal, setShowPhotoOptionsModal] = useState(false);

  // System Avatar Picker Modal State
  const [showAvatarPickerModal, setShowAvatarPickerModal] = useState(false);
  const [pickerCategory, setPickerCategory] = useState("all"); // "all" | "default" | "male" | "female"

  // Form Fields State
  const [fullname, setFullname] = useState(user?.fullname || "");
  const [about, setAbout] = useState(user?.about || "Hey there! I am using ChitChat.");
  const [showEmail, setShowEmail] = useState(user?.showEmail !== false);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarBlob, setAvatarBlob] = useState(null);

  // UI States
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  // Crop Modal State (Edit mode only)
  const [cropImageSrc, setCropImageSrc] = useState(null);
  const fileInputRef = useRef(null);

  const defaultAvatar = DEFAULT_USER_AVATAR_URL;
  const displayedAvatar = avatarPreview || user?.avatar || defaultAvatar;

  const getVisibleAvatars = () => {
    const maleItems = USER_AVATAR_ITEMS.male;
    const femaleItems = USER_AVATAR_ITEMS.female;

    if (pickerCategory === "male") return maleItems;
    if (pickerCategory === "female") return femaleItems;
    return [...maleItems, ...femaleItems];
  };

  // Sync state if user changes and NOT currently in edit mode
  useEffect(() => {
    if (user && !isEditMode) {
      setFullname(user.fullname || "");
      setAbout(user.about || "Hey there! I am using ChitChat.");
      setShowEmail(user.showEmail !== false);
      setAvatarPreview(null);
      setAvatarBlob(null);
    }
  }, [user, isEditMode]);

  const handleCopyUid = () => {
    if (user?.uid) {
      navigator.clipboard.writeText(user.uid);
      setCopied(true);
      toast.success("UID copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleEnterEditMode = () => {
    setFullname(user?.fullname || "");
    setAbout(user?.about || "Hey there! I am using ChitChat.");
    setShowEmail(user?.showEmail !== false);
    setAvatarPreview(null);
    setAvatarBlob(null);
    setIsEditMode(true);
  };

  const handleCancelEdit = () => {
    setFullname(user?.fullname || "");
    setAbout(user?.about || "Hey there! I am using ChitChat.");
    setShowEmail(user?.showEmail !== false);
    setAvatarPreview(null);
    setAvatarBlob(null);
    setIsEditMode(false);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    if (!file.type.startsWith("image/")) {
      toast.error("Please select a valid image file (PNG, JPG, WEBP)");
      return;
    }

    const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
    if (file.size > MAX_SIZE_BYTES) {
      toast.error("Image size exceeds the 5 MB limit.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCropImageSrc(reader.result);
    };
    reader.onerror = () => {
      toast.error("Failed to read image file");
    };
    reader.readAsDataURL(file);
  };

  const handleApplyCrop = async (croppedBlob) => {
    const toastId = toast.loading("Uploading photo to Cloudinary...");
    try {
      const formData = new FormData();
      formData.append("avatar", croppedBlob, "avatar.jpg");

      const res = await api.put("/api/user/profile", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      const updatedUser = { ...authUser, user: res.data.user };

      localStorage.setItem("ChatApp", JSON.stringify(updatedUser));
      setAuthUser(updatedUser);

      setAvatarPreview(null);
      setAvatarBlob(null);
      setCropImageSrc(null);
      setShowPhotoOptionsModal(false);
      toast.success("Profile photo updated! 🎉", { id: toastId });
      return true;
    } catch (err) {
      console.error("Profile photo upload error:", err);
      toast.error(err.response?.data?.error || "Failed to upload photo", { id: toastId });
      throw err;
    }
  };

  const handleSelectSystemAvatar = async (systemAvatarUrl) => {
    const toastId = toast.loading("Updating avatar...");
    try {
      const res = await api.put("/api/user/profile", {
        avatar: systemAvatarUrl,
      });
      const updatedUser = { ...authUser, user: res.data.user };

      localStorage.setItem("ChatApp", JSON.stringify(updatedUser));
      setAuthUser(updatedUser);

      setAvatarPreview(null);
      setAvatarBlob(null);
      setShowAvatarPickerModal(false);
      setShowPhotoOptionsModal(false);
      toast.success("Profile avatar updated! 🎉", { id: toastId });
    } catch (err) {
      console.error("Select system avatar error:", err);
      toast.error(err.response?.data?.error || "Failed to update avatar", { id: toastId });
    }
  };

  const handleResetToDefaultAvatar = async () => {
    const toastId = toast.loading("Resetting to default avatar...");
    try {
      const res = await api.put("/api/user/profile", {
        avatar: DEFAULT_USER_AVATAR_URL,
      });
      const updatedUser = { ...authUser, user: res.data.user };

      localStorage.setItem("ChatApp", JSON.stringify(updatedUser));
      setAuthUser(updatedUser);

      setAvatarPreview(null);
      setAvatarBlob(null);
      setShowPhotoOptionsModal(false);
      toast.success("Reset to default avatar! 🎉", { id: toastId });
    } catch (err) {
      console.error("Reset avatar error:", err);
      toast.error(err.response?.data?.error || "Failed to reset avatar", { id: toastId });
    }
  };

  const handleSaveProfile = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const cleanName = (fullname || "").trim();
    if (!cleanName) {
      toast.error("Display Name cannot be empty");
      return;
    }

    const currentName = (user?.fullname || "").trim();
    const currentAbout = (user?.about || "Hey there! I am using ChitChat.").trim();
    const currentShowEmail = user?.showEmail !== false;
    const currentAvatar = user?.avatar || DEFAULT_USER_AVATAR_URL;
    const newAbout = (about || "").trim();
    const newShowEmail = Boolean(showEmail);

    const isNameChanged = cleanName !== currentName;
    const isAboutChanged = newAbout !== currentAbout;
    const isShowEmailChanged = newShowEmail !== currentShowEmail;
    const isAvatarChanged = Boolean(avatarBlob) || (avatarPreview && avatarPreview !== currentAvatar);

    // If nothing changed, exit edit mode cleanly with informational toast (zero redundant network & DB ops)
    if (!isNameChanged && !isAboutChanged && !isShowEmailChanged && !isAvatarChanged) {
      toast("No changes were made", { icon: "ℹ️" });
      setIsEditMode(false);
      return;
    }

    setSaving(true);
    const toastId = toast.loading("Saving profile changes...");
    try {
      const formData = new FormData();
      formData.append("fullname", cleanName);
      formData.append("about", newAbout);
      formData.append("showEmail", String(newShowEmail));

      if (avatarBlob) {
        formData.append("avatar", avatarBlob, "avatar.jpg");
      } else if (avatarPreview && avatarPreview !== currentAvatar) {
        formData.append("avatar", avatarPreview);
      }

      const res = await api.put("/api/user/profile", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      const updatedUser = { ...authUser, user: res.data.user };

      localStorage.setItem("ChatApp", JSON.stringify(updatedUser));
      setAuthUser(updatedUser);

      if (res.data.noChange) {
        toast("No changes were made", { id: toastId, icon: "ℹ️" });
      } else {
        toast.success("Profile updated successfully! 🎉", { id: toastId });
      }
      setIsEditMode(false);
      setAvatarPreview(null);
      setAvatarBlob(null);
    } catch (err) {
      console.error("Profile save error:", err);
      toast.error(err.response?.data?.error || "Failed to update profile", { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await api.post("/api/user/logout");
      useConversation.getState().resetConversationState();
      localStorage.removeItem("ChatApp");
      setAuthUser(null);
      toast.success("Logged out successfully");
    } catch (error) {
      console.log("Error in logout: ", error);
      toast.error("Failed to logout");
      setLoggingOut(false);
    }
  };

  return (
    <div className="h-full flex flex-col min-h-0 bg-slate-950/40 select-none font-sans">
      {/* Hidden File Input for Custom Photo */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/png, image/jpeg, image/webp"
        className="hidden"
      />

      {/* ── Top Header Bar ── */}
      <div className="p-3.5 sm:p-4 border-b border-slate-800/80 bg-slate-900/95 flex items-center justify-between flex-shrink-0 z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 ring-1 ring-white/10 flex-shrink-0">
            <FiUser className="text-base" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white tracking-wide">
              {isEditMode ? "Edit Profile" : "Profile & Settings"}
            </h2>
            <p className="text-[10px] text-slate-400">
              {isEditMode ? "Update your public persona" : "Personal info and UID"}
            </p>
          </div>
        </div>
      </div>

      {/* ── Photo Preview Lightbox Modal ── */}
      {showPhotoPreview && (
        <ProfilePhotoPreview
          user={{ ...user, avatar: displayedAvatar }}
          imageUrl={displayedAvatar}
          name={user?.fullname || "Profile Photo"}
          subtitle={`UID • ${user?.uid || "User"}`}
          onClose={() => setShowPhotoPreview(false)}
        />
      )}

      {/* ── Photo Options Modal (Change Photo / Choose Avatar / Reset) ── */}
      {showPhotoOptionsModal &&
        createPortal(
          <div
            onClick={() => setShowPhotoOptionsModal(false)}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-150 select-none"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900/98 border border-slate-700/80 rounded-3xl shadow-2xl p-6 max-w-[320px] sm:max-w-[340px] w-full flex flex-col items-center text-center space-y-4 relative animate-in zoom-in-95 duration-150 ring-1 ring-white/10"
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

              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white tracking-wide">
                  Change Profile Photo
                </h3>
                <p className="text-[11px] text-slate-400">
                  Upload a photo or choose a system avatar
                </p>
              </div>

              {/* Circular Current Photo Preview */}
              <div className="py-1">
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden ring-2 ring-indigo-500/80 shadow-[0_0_20px_rgba(99,102,241,0.25)] bg-slate-800 flex-shrink-0">
                  <img
                    src={displayedAvatar}
                    alt="Current Profile Photo"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="w-full space-y-2 pt-1">
                {/* 1. Change Photo Button */}
                <button
                  type="button"
                  onClick={() => {
                    setShowPhotoOptionsModal(false);
                    fileInputRef.current?.click();
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition flex items-center justify-center gap-2 shadow-md shadow-indigo-600/30 active:scale-95 cursor-pointer"
                >
                  <FiCamera className="text-sm" />
                  <span>Upload Custom Photo</span>
                </button>

                {/* 2. Choose System Avatar Button */}
                <button
                  type="button"
                  onClick={() => {
                    setShowPhotoOptionsModal(false);
                    setShowAvatarPickerModal(true);
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700/80 text-slate-200 font-semibold text-xs transition flex items-center justify-center gap-2 active:scale-95 cursor-pointer shadow-sm"
                >
                  <FiSmile className="text-sm text-indigo-400" />
                  <span>Choose Preset Avatar</span>
                </button>

                {/* 3. Reset Button */}
                <button
                  type="button"
                  onClick={handleResetToDefaultAvatar}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-800/60 hover:bg-rose-500/10 border border-slate-700/60 hover:border-rose-500/30 text-slate-400 hover:text-rose-400 font-semibold text-xs transition flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                >
                  <FiRotateCcw className="text-xs" />
                  <span>Reset to Default Avatar</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ── System Avatar Picker Modal (Circular & Streamlined UX) ── */}
      {showAvatarPickerModal &&
        createPortal(
          <div
            onClick={() => setShowAvatarPickerModal(false)}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-150 select-none"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900/98 border border-slate-700/80 rounded-3xl shadow-2xl p-5 sm:p-6 w-[370px] sm:w-[420px] h-[430px] flex flex-col justify-between relative animate-in zoom-in-95 duration-150 ring-1 ring-white/10"
            >
              {/* Header & Close Button */}
              <div className="flex items-start justify-between">
                <div className="space-y-0.5 text-left">
                  <h3 className="text-sm sm:text-base font-bold text-white tracking-wide flex items-center gap-2">
                    <FiSmile className="text-indigo-400 text-base" />
                    <span>Choose Preset Avatar</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Select a character avatar for your profile
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAvatarPickerModal(false)}
                  className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white border border-slate-700/60 hover:border-rose-600 transition cursor-pointer shadow-md -mr-1 -mt-1"
                  title="Close"
                >
                  <FiX className="text-sm" />
                </button>
              </div>

              {/* Category Filter Pills (All, Male, Female) */}
              <div className="bg-slate-950/80 p-1 rounded-2xl border border-slate-800 grid grid-cols-3 gap-1">
                {["all", "male", "female"].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setPickerCategory(cat)}
                    className={`py-1.5 rounded-xl text-xs font-bold capitalize transition-colors duration-150 cursor-pointer ${
                      pickerCategory === cat
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Fixed Height Circular Avatars Grid Area (Fits all 6 without scrollbar) */}
              <div className="h-[250px] overflow-y-auto p-1 custom-scrollbar flex items-start justify-center">
                <div className="grid grid-cols-3 gap-3.5 sm:gap-4 w-full py-1 place-items-center">
                  {getVisibleAvatars().map((item) => {
                    const isCurrent = user?.avatar === item.url;
                    return (
                      <div
                        key={item.key}
                        onClick={() => handleSelectSystemAvatar(item.url)}
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

      {/* ── Photo Crop Modal (When Custom Photo is Uploaded) ── */}
      {cropImageSrc && (
        <PhotoCropModal
          imageSrc={cropImageSrc}
          onApply={handleApplyCrop}
          onClose={() => setCropImageSrc(null)}
        />
      )}

      {/* ── Main Scrollable Body ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5 space-y-4 sm:space-y-5 custom-scrollbar">
        {!isEditMode ? (
          /* ══════════════════════════════════════════════════════
             1. READ-ONLY VIEW MODE (Clean, Balanced & Modern)
             ══════════════════════════════════════════════════════ */
          <div className="space-y-4 sm:space-y-5 animate-in fade-in duration-200">
            {/* Top User Persona Card */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800/80 shadow-md flex flex-col items-center text-center relative overflow-hidden">
              {/* Subtle background glow */}
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-36 h-36 bg-indigo-600/10 rounded-full blur-[60px] pointer-events-none" />

              {/* Clickable Profile Photo */}
              <div className="relative group/avatar mb-3">
                <button
                  type="button"
                  onClick={() => setShowPhotoPreview(true)}
                  className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden ring-[2px] ring-white/90 shadow-[0_0_20px_rgba(255,255,255,0.12)] bg-slate-800 cursor-pointer group-hover/avatar:scale-105 active:scale-95 transition-all duration-200 block relative"
                  title="Click to preview photo in full size"
                >
                  <img
                    src={displayedAvatar}
                    alt={user?.fullname || "User"}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/avatar:opacity-100 transition-opacity flex items-center justify-center text-white">
                    <FiMaximize2 className="text-base drop-shadow-md" />
                  </div>
                </button>
              </div>

              {/* Name & About */}
              <div className="space-y-1 w-full max-w-full">
                <h3 className="text-base sm:text-lg font-black text-white tracking-tight truncate">
                  {user?.fullname || "User"}
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed break-words font-normal max-w-xs mx-auto">
                  {user?.about || "Hey there! I am using ChitChat."}
                </p>
              </div>
            </div>

            {/* Account Information Section */}
            <div className="space-y-2.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 px-0.5">
                <FiShield className="text-indigo-400 text-xs" />
                <span>Account Information</span>
              </span>

              <div className="space-y-2 text-xs">
                {/* UID Card */}
                <div className="p-3 sm:p-3.5 bg-slate-900/90 border border-slate-800/80 rounded-2xl flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 flex-shrink-0">
                      <FiHash className="text-sm" />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase font-semibold block">
                        Unique ID (UID)
                      </span>
                      <span className="font-mono text-indigo-300 font-bold text-sm tracking-wider">
                        {user?.uid || "—"}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyUid}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer border border-slate-700/60 shadow-sm active:scale-95"
                    title="Copy UID"
                  >
                    {copied ? (
                      <FiCheck className="text-emerald-400 text-sm" />
                    ) : (
                      <FiCopy className="text-slate-400 text-sm" />
                    )}
                  </button>
                </div>

                {/* Email Address Card */}
                <div className="p-3 sm:p-3.5 bg-slate-900/90 border border-slate-800/80 rounded-2xl flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 flex-shrink-0">
                      <FiMail className="text-sm" />
                    </div>
                    <div className="overflow-hidden min-w-0">
                      <span className="text-[10px] text-slate-500 uppercase font-semibold block">
                        Email Address
                      </span>
                      <span className="text-slate-200 font-medium truncate block">
                        {user?.email || "—"}
                      </span>
                    </div>
                  </div>

                  {user?.showEmail !== false && (
                    <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex-shrink-0">
                      Public
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 space-y-2">
              <button
                type="button"
                onClick={handleEnterEditMode}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-600/25 transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
              >
                <FiEdit2 className="text-sm" />
                <span>Edit Profile</span>
              </button>

              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                className={`w-full py-2.5 px-4 bg-slate-900/90 border border-slate-800 font-semibold text-xs rounded-xl transition-all flex items-center justify-center gap-2 ${
                  loggingOut
                    ? "opacity-75 cursor-not-allowed pointer-events-none text-rose-400/80 border-rose-500/20"
                    : "hover:bg-rose-500/10 hover:border-rose-500/30 text-slate-400 hover:text-rose-400 active:scale-95 cursor-pointer"
                }`}
              >
                {loggingOut ? (
                  <>
                    <FiLoader className="animate-spin text-sm text-rose-400" />
                    <span className="text-rose-400">Logging out...</span>
                  </>
                ) : (
                  <>
                    <FiLogOut className="text-sm" />
                    <span>Log Out</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* ══════════════════════════════════════════════════════
             2. EDIT PROFILE FORM MODE (Spacious, Clear & Polished)
             ══════════════════════════════════════════════════════ */
          <form
            onSubmit={handleSaveProfile}
            className="space-y-4 animate-in fade-in duration-200"
          >
            {/* Avatar Edit Section with Camera Action Button & Normal Informational Text */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800/80 flex flex-col items-center text-center space-y-2">
              <div className="relative">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden ring-[2px] ring-white/90 shadow-xl bg-slate-800">
                  <img
                    src={displayedAvatar}
                    alt="Profile Avatar"
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Corner Camera Button */}
                <button
                  type="button"
                  onClick={() => setShowPhotoOptionsModal(true)}
                  className="absolute bottom-0 right-0 p-2.5 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg border-2 border-slate-900 transition-transform transform hover:scale-110 active:scale-95 cursor-pointer"
                  title="Change profile avatar"
                >
                  <FiCamera className="text-xs" />
                </button>
              </div>

              {/* Normal Informational Text (Not a Button) */}
              <div className="space-y-0.5 pt-0.5">
                <h4 className="text-xs sm:text-sm font-bold text-white tracking-wide">
                  Profile Photo
                </h4>
                <p className="text-[11px] text-slate-400">
                  Tap the camera to update avatar
                </p>
              </div>
            </div>

            {/* Display Name Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between px-0.5">
                <span>Display Name</span>
                <span className="text-[10px] text-slate-500 font-normal">
                  {(fullname || "").length}/50
                </span>
              </label>
              <input
                type="text"
                value={fullname}
                onChange={(e) => setFullname(e.target.value)}
                placeholder="Enter your name..."
                maxLength={50}
                required
                disabled={saving}
                className="w-full px-3.5 py-2.5 bg-slate-900/90 border border-slate-700/80 focus:border-indigo-500 rounded-xl text-xs sm:text-sm font-medium text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition"
              />
            </div>

            {/* About / Status Textarea */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between px-0.5">
                <span>About / Bio</span>
                <span className="text-[10px] text-slate-500 font-normal">
                  {(about || "").length}/150
                </span>
              </label>
              <textarea
                rows={2}
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                placeholder="Tell others about yourself..."
                maxLength={150}
                disabled={saving}
                className="w-full px-3.5 py-2.5 bg-slate-900/90 border border-slate-700/80 focus:border-indigo-500 rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition resize-none custom-scrollbar"
              />
            </div>

            {/* Privacy Toggle Switch */}
            <div className="p-3.5 bg-slate-900/90 border border-slate-800/80 rounded-2xl">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-slate-200 block">
                    Show Email on Profile
                  </span>
                  <span className="text-[10px] text-slate-400 block leading-tight">
                    Allow other contacts to see your email address
                  </span>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={showEmail}
                  onClick={() => setShowEmail((prev) => !prev)}
                  disabled={saving}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    showEmail ? "bg-indigo-600" : "bg-slate-700"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      showEmail ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Form Save / Cancel Buttons */}
            <div className="pt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={saving}
                className="py-2.5 px-3 bg-slate-800/80 hover:bg-slate-800 text-slate-300 font-semibold text-xs rounded-xl transition cursor-pointer border border-slate-700/60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="py-2.5 px-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-600/25 transition flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {saving ? (
                  <>
                    <FiLoader className="animate-spin text-sm" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <FiCheckCircle className="text-sm" />
                    <span>Save</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default UserProfile;
