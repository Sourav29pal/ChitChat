import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { FiX } from "react-icons/fi";
import {
  DEFAULT_USER_AVATAR_URL,
  DEFAULT_GROUP_AVATAR_URL,
} from "../config/systemAvatars.js";

function ProfilePhotoPreview({ user, imageUrl, name, subtitle, onClose }) {
  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if ((!user && !imageUrl) || typeof document === "undefined" || !document.body) return null;

  const userObj = user && typeof user === "object" ? user : { fullname: name || "User" };
  const isGroup = Boolean(userObj.isGroup);

  const avatarUrl =
    imageUrl ||
    (isGroup
      ? userObj.groupAvatar || DEFAULT_GROUP_AVATAR_URL
      : userObj.avatar || DEFAULT_USER_AVATAR_URL);

  const displayName = name || (isGroup ? userObj.groupName || "Group" : userObj.fullname || "User");
  const uid = userObj.uid ? String(userObj.uid) : "";

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-200 select-none cursor-pointer"
    >
      {/* Modal Container: Photo and Right-Side Top-Aligned Close Button */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex items-start gap-2.5 sm:gap-3 animate-in zoom-in-95 duration-150 cursor-default"
      >
        {/* Profile Photo Card */}
        <div className="relative bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden w-[290px] xs:w-[330px] sm:w-[380px] md:w-[420px] aspect-square flex items-center justify-center p-1.5 flex-shrink-0">
          <div className="w-full h-full rounded-xl overflow-hidden bg-slate-950 flex items-center justify-center">
            <img
              src={avatarUrl}
              alt={displayName}
              className="w-full h-full object-cover"
              onError={(e) => {
                const fallback = isGroup ? DEFAULT_GROUP_AVATAR_URL : DEFAULT_USER_AVATAR_URL;
                if (e.currentTarget.src !== fallback) {
                  e.currentTarget.src = fallback;
                }
              }}
            />
          </div>
        </div>

        {/* Close Button on the Right Side Edge, Top-Aligned with the Top Edge of the Photo */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close photo preview"
          className="p-1.5 sm:p-2 rounded-xl bg-slate-800/90 hover:bg-rose-600 text-slate-300 hover:text-white border border-slate-700/70 hover:border-rose-600 transition duration-150 cursor-pointer shadow-xl flex items-center justify-center flex-shrink-0"
          title="Close (Esc)"
        >
          <FiX className="text-sm sm:text-base" />
        </button>
      </div>
    </div>,
    document.body
  );
}

export default ProfilePhotoPreview;
