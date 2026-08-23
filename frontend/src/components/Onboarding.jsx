import React, { useState, useRef, useEffect } from "react";
import api from "../api";
import { useAuth } from "../context/AuthProvider";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  FiUser,
  FiCheck,
  FiArrowRight,
  FiSmile,
  FiShield,
  FiCamera,
  FiUpload,
  FiRotateCcw,
  FiTrash2,
  FiLoader,
} from "react-icons/fi";
import {
  DEFAULT_USER_AVATAR_URL,
  MALE_AVATAR_URLS,
  FEMALE_AVATAR_URLS,
  USER_AVATAR_ITEMS,
} from "../config/systemAvatars";
import useConversation from "../zustand/useConversation";
import PhotoCropModal from "./PhotoCropModal";

const ABOUT_PRESETS = [
  "Hey there! I am using ChitChat.",
  "Available",
  "Busy",
  "In a meeting",
  "Urgent calls only",
];

function Onboarding() {
  const [authUser, setAuthUser] = useAuth();
  const { setActiveTab } = useConversation();
  const navigate = useNavigate();

  const userUid = authUser?.user?.uid || "5835770230";

  // Form State
  const [displayName, setDisplayName] = useState(
    authUser?.user?.fullname && !authUser.user.fullname.includes("@")
      ? authUser.user.fullname
      : ""
  );
  const [about, setAbout] = useState("Hey there! I am using ChitChat.");
  const [loading, setLoading] = useState(false);

  // Avatar Selection State: "system" | "custom"
  const [avatarSelectionType, setAvatarSelectionType] = useState("system");
  const [activeCategory, setActiveCategory] = useState("male"); // "male" | "female"
  const [selectedAvatar, setSelectedAvatar] = useState(DEFAULT_USER_AVATAR_URL);
  const [avatarBlob, setAvatarBlob] = useState(null);
  const [customPreviewUrl, setCustomPreviewUrl] = useState(null);

  const getVisibleAvatars = () => {
    if (activeCategory === "male") return USER_AVATAR_ITEMS.male;
    if (activeCategory === "female") return USER_AVATAR_ITEMS.female;
    return [...USER_AVATAR_ITEMS.male, ...USER_AVATAR_ITEMS.female];
  };

  // Custom Photo Upload & Crop State
  const fileInputRef = useRef(null);
  const [cropImageSrc, setCropImageSrc] = useState(null);

  // Clean up any temporary Object URL on component unmount
  useEffect(() => {
    return () => {
      if (customPreviewUrl && customPreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(customPreviewUrl);
      }
    };
  }, [customPreviewUrl]);

  // Handle switching to a System Avatar
  const handleSelectSystemAvatar = (url) => {
    // Revoke any existing custom preview object URL
    if (customPreviewUrl && customPreviewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(customPreviewUrl);
      setCustomPreviewUrl(null);
    }
    setAvatarBlob(null);
    setSelectedAvatar(url);
    setAvatarSelectionType("system");
  };

  // Handle File Input Selection for Custom Photo
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

  // Handle Cropped Image from PhotoCropModal
  const handleApplyCrop = async (croppedBlob) => {
    if (!croppedBlob) return;

    // Revoke previous blob URL if any
    if (customPreviewUrl && customPreviewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(customPreviewUrl);
    }

    const previewUrl = URL.createObjectURL(croppedBlob);
    setCustomPreviewUrl(previewUrl);
    setAvatarBlob(croppedBlob);
    setSelectedAvatar(previewUrl);
    setAvatarSelectionType("custom");
    setCropImageSrc(null);
    return true;
  };

  // Handle Removing Custom Uploaded Photo
  const handleRemoveCustomPhoto = (e) => {
    e?.stopPropagation();
    if (customPreviewUrl && customPreviewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(customPreviewUrl);
    }
    setCustomPreviewUrl(null);
    setAvatarBlob(null);
    setSelectedAvatar(DEFAULT_USER_AVATAR_URL);
    setAvatarSelectionType("system");
    toast.success("Custom photo removed. Reset to default.");
  };

  // Form Submit Handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!displayName.trim()) {
      toast.error("Please enter a display name");
      return;
    }

    setLoading(true);
    try {
      let res;
      if (avatarSelectionType === "custom" && avatarBlob) {
        // Custom Photo Upload: Submit via multipart FormData
        const formData = new FormData();
        formData.append("fullname", displayName.trim());
        formData.append("about", about.trim());
        formData.append("avatar", avatarBlob, "avatar.jpg");

        res = await api.put("/api/user/profile", formData, {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        });
      } else {
        // System Avatar Selection: Submit clean JSON with existing Cloudinary URL
        const payload = {
          fullname: displayName.trim(),
          avatar: selectedAvatar || DEFAULT_USER_AVATAR_URL,
          about: about.trim(),
        };

        res = await api.put("/api/user/profile", payload);
      }

      if (res.data && res.data.user) {
        const updatedAuthData = {
          ...authUser,
          user: {
            ...res.data.user,
            isProfileComplete: true,
          },
        };
        localStorage.setItem("ChatApp", JSON.stringify(updatedAuthData));
        setAuthUser(updatedAuthData);
        setActiveTab("chats");
        toast.success("Profile setup complete! 🎉");
        navigate("/");
      }
    } catch (err) {
      console.error("Profile update error:", err);
      toast.error(err.response?.data?.error || "Failed to complete profile");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen md:h-screen w-full flex items-center justify-center p-3 sm:p-5 overflow-y-auto md:overflow-hidden bg-slate-950 text-slate-100 relative select-none">
      {/* Hidden File Input for Custom Photo */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/png, image/jpeg, image/webp"
        className="hidden"
      />

      {/* Photo Crop Modal for Custom Photo */}
      {cropImageSrc && (
        <PhotoCropModal
          imageSrc={cropImageSrc}
          onApply={handleApplyCrop}
          onClose={() => setCropImageSrc(null)}
        />
      )}

      {/* Ambient Neon Glowing Mesh Orbs */}
      <div className="absolute -top-28 -left-28 w-[550px] h-[550px] bg-gradient-to-tr from-violet-600/30 to-indigo-600/30 rounded-full blur-[140px] pointer-events-none animate-pulse"></div>
      <div className="absolute -bottom-28 -right-28 w-[550px] h-[550px] bg-gradient-to-tr from-cyan-600/25 to-indigo-600/25 rounded-full blur-[140px] pointer-events-none animate-pulse"></div>

      {/* Main Glassmorphism Card with Outer Neon Glow */}
      <div className="w-full max-w-4xl rounded-3xl bg-slate-900/80 backdrop-blur-3xl border border-slate-700/60 shadow-[0_0_80px_rgba(99,102,241,0.25)] p-4 sm:p-6 flex flex-col justify-between relative z-10 my-auto">

        {/* Top Shimmer Line */}
        <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-indigo-500/80 to-transparent absolute top-0 left-0"></div>

        {/* Header */}
        <div className="text-center space-y-1.5 pb-3 sm:pb-4">
          <span className="px-3 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 tracking-wider uppercase inline-block shadow-sm">
            Step 1 of 1 • Profile Setup
          </span>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-indigo-200 bg-clip-text text-transparent">
            Set Up Your Profile
          </h1>
          <p className="text-xs text-slate-400 font-medium">
            Choose a system avatar or upload a custom profile photo
          </p>
        </div>

        {/* 2-Column Layout */}
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-6 my-auto items-center">

          {/* LEFT SIDE: Real-World Profile Preview Card */}
          <div className="md:col-span-5 space-y-2.5 sm:space-y-4">
            <div className="p-3.5 sm:p-6 rounded-3xl bg-gradient-to-b from-slate-900/90 via-slate-950/90 to-slate-900/90 border border-indigo-500/40 shadow-[0_0_40px_rgba(99,102,241,0.25)] text-center space-y-2.5 sm:space-y-4 relative overflow-hidden group">

              {/* Card Ambient Glow Orb */}
              <div className="absolute -top-12 -right-12 w-32 h-32 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none"></div>

              {/* Avatar Preview with Glowing Shimmer Ring */}
              <div className="relative inline-block mx-auto pt-0.5 sm:pt-1">
                <div className="p-1 rounded-2xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-cyan-400 shadow-[0_0_30px_rgba(99,102,241,0.5)] transition transform duration-300 group-hover:scale-105">
                  <img
                    src={selectedAvatar}
                    alt="Profile Avatar"
                    className="w-16 h-16 sm:w-28 sm:h-28 rounded-xl object-cover bg-slate-950"
                  />
                </div>
                <span className="absolute bottom-1 right-1 w-3 h-3 sm:w-4 sm:h-4 bg-emerald-400 border-2 border-slate-950 rounded-full shadow-[0_0_10px_#34d399]"></span>
              </div>

              {/* Name & ID */}
              <div className="space-y-1">
                <h3 className="text-lg sm:text-xl font-extrabold bg-gradient-to-r from-white via-indigo-100 to-cyan-200 bg-clip-text text-transparent truncate px-2">
                  {displayName.trim() || "Your Name"}
                </h3>
                <div className="inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-mono font-extrabold px-3 py-0.5 sm:py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/40 shadow-[0_0_15px_rgba(99,102,241,0.3)]">
                  <FiShield className="text-indigo-400 text-xs" />
                  ID • {userUid}
                </div>
              </div>

              {/* Status Message Bubble with Neon Accent */}
              <div className="p-2 sm:p-3 rounded-2xl bg-slate-900/90 border border-indigo-500/30 text-[11px] sm:text-xs text-indigo-200 italic truncate max-w-full shadow-[0_0_15px_rgba(99,102,241,0.15)]">
                "{about}"
              </div>
            </div>

            {/* Status Quick Presets */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-slate-400">
                Status Presets
              </label>
              <div className="flex flex-wrap gap-1.5">
                {ABOUT_PRESETS.map((preset, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setAbout(preset)}
                    className={`text-[10px] sm:text-[11px] px-2.5 py-1 rounded-lg border transition-all duration-150 active:scale-95 cursor-pointer ${
                      about === preset
                        ? "bg-indigo-600/30 text-indigo-200 border-indigo-500/60 font-bold shadow-[0_0_12px_rgba(99,102,241,0.25)]"
                        : "bg-slate-950/60 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200"
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT SIDE: Input Form & Avatar Categories */}
          <div className="md:col-span-7 space-y-3.5">

            {/* Display Name Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">
                Display Name
              </label>
              <div className="relative">
                <FiUser className="absolute left-3.5 top-3.5 text-slate-400 text-sm" />
                <input
                  type="text"
                  placeholder="Enter your name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  maxLength={30}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all duration-200"
                />
              </div>
            </div>

            {/* Avatar Selection Categories */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-300">
                  Select Avatar
                </label>
                {/* Reset to Default Button (Minimalist) */}
                <button
                  type="button"
                  onClick={() => handleSelectSystemAvatar(DEFAULT_USER_AVATAR_URL)}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-xl transition flex items-center gap-1.5 cursor-pointer ${
                    selectedAvatar === DEFAULT_USER_AVATAR_URL && avatarSelectionType === "system"
                      ? "bg-slate-800 text-slate-200 border border-slate-700 shadow-sm"
                      : "bg-slate-900/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800"
                  }`}
                  title="Reset to standard default avatar"
                >
                  <FiRotateCcw className="text-xs text-slate-400" />
                  <span>Default</span>
                </button>
              </div>

              {/* Main Avatar Selection Box: Stacked on Mobile (<sm), Side-by-Side on Desktop (sm+) */}
              <div className="p-3 sm:p-3.5 bg-slate-950/40 border border-slate-800/80 rounded-2xl flex flex-col sm:flex-row items-center sm:items-stretch justify-between gap-3 sm:gap-2">
                {/* ── 1. Custom Upload Sub-Region (Centered on Mobile, Left Column on Desktop) ── */}
                <div className="w-full sm:w-[125px] flex flex-col items-center justify-center sm:justify-between py-0.5 flex-shrink-0">
                  {/* Top Invisible Spacer on Desktop matching Male/Female Toggle Height for Baseline Alignment */}
                  <div className="hidden sm:block sm:h-[30px] w-full"></div>

                  {/* Custom Photo Circle */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center gap-1.5 p-1 rounded-2xl hover:bg-slate-800/40 transition duration-150 cursor-pointer group/custom"
                    title={customPreviewUrl ? "Click to change photo" : "Upload a custom photo"}
                  >
                    <div className="relative">
                      <div
                        className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden transition-all duration-150 transform group-hover/custom:scale-105 bg-slate-900/90 border-2 border-dashed flex flex-col items-center justify-center ${
                          avatarSelectionType === "custom" && customPreviewUrl
                            ? "border-emerald-400 ring-2 ring-emerald-400/50 scale-105 shadow-[0_0_15px_rgba(52,211,153,0.4)]"
                            : "border-indigo-500/60 group-hover/custom:border-indigo-400 group-hover/custom:bg-slate-800"
                        }`}
                      >
                        {customPreviewUrl ? (
                          <img src={customPreviewUrl} alt="Custom" className="w-full h-full object-cover" />
                        ) : (
                          <div className="flex flex-col items-center text-indigo-400 group-hover/custom:text-indigo-300">
                            <FiCamera className="text-base sm:text-lg" />
                            <span className="text-[8px] font-bold mt-0.5">+ Custom</span>
                          </div>
                        )}
                      </div>
                      {avatarSelectionType === "custom" && customPreviewUrl && (
                        <span className="absolute -top-1 -right-1 p-0.5 bg-emerald-400 rounded-full text-slate-950 text-[9px] shadow-md">
                          <FiCheck className="stroke-[3]" />
                        </span>
                      )}
                    </div>

                    {/* Bottom Label/Action */}
                    <div className="h-5 flex items-center justify-center">
                      {customPreviewUrl ? (
                        <button
                          type="button"
                          onClick={handleRemoveCustomPhoto}
                          className="text-[10px] sm:text-[11px] font-bold text-rose-400 hover:text-rose-300 flex items-center gap-1 hover:underline cursor-pointer transition-colors"
                          title="Remove custom photo and reset to default"
                        >
                          <FiTrash2 className="text-[10px]" />
                          <span>Remove</span>
                        </button>
                      ) : (
                        <span className="text-[10px] sm:text-[11px] font-medium text-slate-300 group-hover/custom:text-white text-center truncate max-w-[65px]">
                          Upload
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── 2. Horizontal OR Separator on Mobile (<sm) ── */}
                <div className="w-full flex items-center justify-center sm:hidden my-0.5">
                  <div className="w-full h-px bg-slate-800/80 relative flex items-center justify-center">
                    <span className="absolute px-2 py-0.5 rounded-full bg-slate-900 border border-indigo-500/40 text-[9px] font-black text-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.25)] uppercase tracking-widest select-none">
                      OR
                    </span>
                  </div>
                </div>

                {/* ── 2. Vertical OR Separator on Desktop (sm+) ── */}
                <div className="hidden sm:flex flex-col items-center justify-center self-stretch px-1">
                  <div className="w-px h-full bg-slate-800/80 relative flex items-center justify-center">
                    <span className="absolute px-1.5 py-0.5 rounded-full bg-slate-900 border border-indigo-500/40 text-[9px] font-black text-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.25)] uppercase tracking-widest select-none">
                      OR
                    </span>
                  </div>
                </div>

                {/* ── 3. Presets Sub-Region (Below OR on Mobile, Right Column on Desktop) ── */}
                <div className="w-full sm:flex-1 flex flex-col items-center justify-between space-y-2.5 py-0.5">
                  {/* Male / Female Segmented Pill Switch */}
                  <div className="bg-slate-900/90 p-0.5 rounded-xl border border-slate-800 grid grid-cols-2 gap-1 w-36 sm:w-40 shadow-inner">
                    {["male", "female"].map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setActiveCategory(cat)}
                        className={`py-1 rounded-lg text-[11px] sm:text-xs font-bold capitalize transition-all duration-150 cursor-pointer ${
                          activeCategory === cat
                            ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  {/* 3 Circular Avatar Bubbles */}
                  <div className="flex items-center justify-center gap-3 sm:gap-4">
                    {USER_AVATAR_ITEMS[activeCategory === "female" ? "female" : "male"].map((item) => {
                      const isSelected = avatarSelectionType === "system" && selectedAvatar === item.url;
                      return (
                        <div
                          key={item.key}
                          onClick={() => handleSelectSystemAvatar(item.url)}
                          className="flex flex-col items-center gap-1.5 p-1 rounded-2xl hover:bg-slate-800/40 transition duration-150 cursor-pointer group/item flex-shrink-0"
                        >
                          <div className="relative">
                            <div
                              className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden transition-all duration-150 transform group-hover/item:scale-105 bg-slate-800 flex items-center justify-center ${
                                isSelected
                                  ? "ring-2 ring-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.4)] scale-105"
                                  : "ring-2 ring-slate-700/80 group-hover/item:ring-indigo-400/80"
                              }`}
                            >
                              <img src={item.url} alt={item.label} className="w-full h-full object-cover" />
                            </div>
                            {isSelected && (
                              <span className="absolute -top-1 -right-1 p-0.5 bg-emerald-400 rounded-full text-slate-950 text-[9px] shadow-md">
                                <FiCheck className="stroke-[3]" />
                              </span>
                            )}
                          </div>
                          <div className="h-5 flex items-center justify-center">
                            <span
                              className={`text-[10px] sm:text-[11px] font-medium text-center max-w-[65px] truncate transition-colors ${
                                isSelected ? "text-emerald-400 font-bold" : "text-slate-300 group-hover/item:text-white"
                              }`}
                            >
                              {item.label}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Custom About Input */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">
                Custom About Status
              </label>
              <div className="relative">
                <FiSmile className="absolute left-3.5 top-3 text-slate-400 text-sm" />
                <input
                  type="text"
                  value={about}
                  onChange={(e) => setAbout(e.target.value)}
                  maxLength={60}
                  className="w-full pl-10 pr-4 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-500 transition-all"
                />
              </div>
            </div>

            {/* Submit Action Button with Glowing Effect */}
            <button
              type="submit"
              disabled={loading || !displayName.trim()}
              className={`w-full py-3.5 px-6 bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 text-white font-extrabold text-xs uppercase tracking-wider rounded-2xl shadow-[0_0_30px_rgba(99,102,241,0.4)] transition-all duration-300 transform flex items-center justify-center gap-2 ${
                loading || !displayName.trim()
                  ? "opacity-50 cursor-not-allowed pointer-events-none"
                  : "hover:from-violet-500 hover:via-indigo-500 hover:to-cyan-400 hover:scale-[1.01] active:scale-[0.98] cursor-pointer"
              }`}
            >
              {loading ? (
                <>
                  <FiLoader className="animate-spin text-sm" />
                  <span>Saving Profile...</span>
                </>
              ) : (
                <>
                  <span>Continue to Chat</span>
                  <FiArrowRight className="text-sm" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Onboarding;
