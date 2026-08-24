import React, { useState } from "react";
import { createPortal } from "react-dom";
import useGetAllUsers from "../../context/useGetAllUser";
import useConversation from "../../zustand/useConversation";
import api from "../../api";
import {
  FiUsers,
  FiCheck,
  FiSearch,
  FiX,
  FiArrowRight,
  FiArrowLeft,
  FiInfo,
  FiUserX,
} from "react-icons/fi";
import toast from "react-hot-toast";
import {
  DEFAULT_USER_AVATAR_URL,
  DEFAULT_GROUP_AVATAR_URL,
} from "../../config/systemAvatars";

function CreateGroup() {
  const [allUsers, loadingUsers] = useGetAllUsers();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMembers, setSelectedMembers] = useState([]);

  // Modal / Popup state for Screen 2 (Group Setup)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const { setSelectedConversation, setActiveTab, setMyGroups } = useConversation();

  // Toggle member selection in sidebar list
  const toggleSelectMember = (userId) => {
    if (selectedMembers.includes(userId)) {
      setSelectedMembers(selectedMembers.filter((id) => id !== userId));
    } else {
      setSelectedMembers([...selectedMembers, userId]);
    }
  };

  // Remove a specific selected member
  const removeSelectedMember = (userId, e) => {
    if (e) e.stopPropagation();
    setSelectedMembers(selectedMembers.filter((id) => id !== userId));
  };

  // Clear all selections
  const clearAllSelections = () => {
    setSelectedMembers([]);
  };

  // Filter connected users by name or UID
  const filteredUsers = allUsers.filter((user) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const nameMatch = user.fullname?.toLowerCase().includes(q);
    const uidMatch = user.uid?.toLowerCase().includes(q);
    return nameMatch || uidMatch;
  });

  // Get full object array of selected users
  const selectedUserObjects = allUsers.filter((u) => selectedMembers.includes(u._id));

  // Step 1 -> Open Step 2 Modal
  const handleOpenModal = () => {
    if (selectedMembers.length === 0) {
      toast.error("Please select at least 1 member for the group");
      return;
    }
    setIsModalOpen(true);
  };

  // Step 2 -> Submit API Call
  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!groupName.trim()) {
      toast.error("Please enter a group name");
      return;
    }
    if (selectedMembers.length === 0) {
      toast.error("Please select at least 1 member for the group");
      return;
    }

    setCreating(true);
    const toastId = toast.loading("Creating group...");
    try {
      const res = await api.post("/api/group/create", {
        groupName: groupName.trim(),
        groupDescription: groupDescription.trim(),
        groupAvatar: DEFAULT_GROUP_AVATAR_URL,
        members: selectedMembers,
      });

      toast.success("Group created successfully! 🎉", { id: toastId });

      // Reset states
      setIsModalOpen(false);
      setSelectedMembers([]);
      setGroupName("");
      setGroupDescription("");
      setSearchQuery("");

      // Open new group conversation
      setMyGroups((prev) => [res.data, ...(prev || [])]);
      setSelectedConversation(res.data);
      setActiveTab("chats");
    } catch (err) {
      console.error("Create group error:", err);
      toast.error(err.response?.data?.error || "Failed to create group", { id: toastId });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-900/30 text-slate-100 relative overflow-hidden select-none">
      {/* Top Header & Search Section (Unified with Conversations & Calls) */}
      <div className="p-3 sm:p-4 pb-2.5 sm:pb-3 border-b border-slate-800/80 space-y-2.5 sm:space-y-3 flex-shrink-0 bg-slate-950/40">
        {/* Fixed-height Header Bar */}
        <div className="h-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent">
              Create Group
            </h1>
            {selectedMembers.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-800 text-indigo-400 border border-slate-700/60 animate-in zoom-in-95 duration-150">
                {selectedMembers.length}
              </span>
            )}
          </div>
        </div>

        {/* Real-time Search Input */}
        <div className="relative flex items-center w-full">
          <FiSearch className="absolute left-3 text-slate-400 text-sm pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search contacts by name or UID..."
            className="w-full pl-9 pr-8 py-1.5 sm:py-2 bg-slate-800/60 border border-slate-700/60 rounded-xl text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 text-slate-400 hover:text-white transition text-xs p-0.5 rounded"
            >
              <FiX className="text-xs" />
            </button>
          )}
        </div>

        {/* Selected Members Stack Chips Preview */}
        {selectedMembers.length > 0 && (
          <div className="space-y-1.5 pt-0.5 animate-in fade-in duration-200">
            <div className="flex items-center justify-between text-[11px] px-0.5">
              <span className="font-semibold text-indigo-400 text-[11px]">
                Selected ({selectedMembers.length})
              </span>
              <button
                type="button"
                onClick={clearAllSelections}
                className="text-slate-400 hover:text-rose-400 text-[10px] font-medium transition cursor-pointer"
              >
                Clear all
              </button>
            </div>

            {/* Smooth Pill Avatar Bar */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-1 custom-scrollbar">
              {selectedUserObjects.map((user) => (
                <div
                  key={user._id}
                  onClick={(e) => removeSelectedMember(user._id, e)}
                  className="flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 bg-slate-800/60 hover:bg-slate-700/70 border border-slate-700/50 rounded-full transition cursor-pointer group flex-shrink-0"
                  title={`Remove ${user.fullname}`}
                >
                  <img
                    src={user.avatar || DEFAULT_USER_AVATAR_URL}
                    alt={user.fullname}
                    onError={(e) => {
                      if (e.currentTarget.src !== DEFAULT_USER_AVATAR_URL) {
                        e.currentTarget.src = DEFAULT_USER_AVATAR_URL;
                      }
                    }}
                    className="w-4 h-4 rounded-full object-cover ring-1 ring-white/80"
                  />
                  <span className="text-[11px] font-medium text-slate-200 group-hover:text-white max-w-[80px] truncate">
                    {user.fullname.split(" ")[0]}
                  </span>
                  <FiX className="text-xs text-slate-400 group-hover:text-rose-400 transition" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* CONNECTED USERS LIST (SEAMLESS CONTINUOUS LIST) */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1 custom-scrollbar">
        {loadingUsers ? (
          <div className="py-8 text-center text-xs text-slate-500">Loading contacts...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-12 text-center space-y-2 text-slate-400">
            <FiInfo className="text-xl text-slate-600 mx-auto" />
            <p className="text-xs font-medium">No contacts match your search</p>
            <p className="text-[11px] text-slate-500 max-w-[180px] mx-auto">
              Search a user by UID in the Add User tab to connect first.
            </p>
          </div>
        ) : (
          filteredUsers.map((user) => {
            const isSelected = selectedMembers.includes(user._id);
            return (
              <div
                key={user._id}
                onClick={() => toggleSelectMember(user._id)}
                className={`p-2.5 px-3 rounded-xl flex items-center justify-between cursor-pointer transition-all duration-150 group ${
                  isSelected
                    ? "bg-indigo-600/15 text-white"
                    : "hover:bg-slate-800/40 text-slate-300 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative flex-shrink-0">
                    <img
                      src={user.avatar || DEFAULT_USER_AVATAR_URL}
                      alt={user.fullname}
                      onError={(e) => {
                        if (e.currentTarget.src !== DEFAULT_USER_AVATAR_URL) {
                          e.currentTarget.src = DEFAULT_USER_AVATAR_URL;
                        }
                      }}
                      className="w-9 h-9 rounded-full object-cover ring-[1.5px] ring-white/85 shadow-sm"
                    />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold truncate leading-tight">
                      {user.fullname}
                    </h4>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                      UID: {user.uid}
                    </p>
                  </div>
                </div>

                <div
                  className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${
                    isSelected
                      ? "bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/30"
                      : "border-slate-700 bg-slate-800/60 group-hover:border-slate-600"
                  }`}
                >
                  {isSelected && <FiCheck className="text-[10px] stroke-[3]" />}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* PINNED BOTTOM BUTTON */}
      <div className="p-3.5 border-t border-slate-800/60 bg-slate-900/80 backdrop-blur-lg flex-shrink-0">
        <button
          onClick={handleOpenModal}
          disabled={selectedMembers.length === 0}
          className={`w-full py-2.5 px-4 rounded-xl font-semibold text-xs flex items-center justify-between shadow-lg transition-all duration-200 transform active:scale-[0.99] ${
            selectedMembers.length > 0
              ? "bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-indigo-600/25 cursor-pointer"
              : "bg-slate-800/40 text-slate-500 cursor-not-allowed border border-slate-800"
          }`}
        >
          <div className="flex items-center gap-2">
            <span>Next</span>
            {selectedMembers.length > 0 && (
              <span className="bg-white/20 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white">
                {selectedMembers.length}
              </span>
            )}
          </div>
          <FiArrowRight className="text-sm" />
        </button>
      </div>

      {/* SCREEN 2: GROUP SETUP POPUP MODAL (RENDERED VIA PORTAL TO BODY FOR FULL-SCREEN CENTERING) */}
      {isModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200 text-slate-100 select-none font-sans">
            <div className="bg-slate-900 border border-slate-800/90 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden relative flex flex-col max-h-[90vh]">
              {/* Modal Ambient Glow */}
              <div className="absolute -top-16 -right-16 w-44 h-44 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none"></div>

              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between flex-shrink-0 bg-slate-900/80">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
                    <FiUsers className="text-lg" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white leading-tight">Group Setup</h3>
                    <p className="text-xs text-slate-400">
                      Configure group info and manage selected members
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-rose-600 flex items-center justify-center text-slate-300 hover:text-white border border-slate-700/60 hover:border-rose-600 transition cursor-pointer shadow-md"
                  title="Close (Esc)"
                >
                  <FiX className="text-sm" />
                </button>
              </div>

              {/* Modal Body */}
              <form onSubmit={handleCreateGroup} className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
                {/* Group Name Field */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                    <span>Group Name <span className="text-indigo-400">*</span></span>
                    <span className="text-[10px] text-slate-500 font-mono">{groupName.length}/50</span>
                  </label>
                  <input
                    type="text"
                    autoFocus
                    required
                    maxLength={50}
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Enter group name"
                    className="w-full px-4 py-2.5 bg-slate-800/60 border border-slate-700/80 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                  />
                </div>

                {/* Group Description Field */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Group Description <span className="text-slate-500 font-normal">(Optional)</span>
                  </label>
                  <textarea
                    rows={3}
                    maxLength={200}
                    value={groupDescription}
                    onChange={(e) => setGroupDescription(e.target.value)}
                    placeholder="Add group description (optional)"
                    className="w-full px-4 py-2.5 bg-slate-800/60 border border-slate-700/80 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition resize-none"
                  />
                </div>

                {/* Selected Members Management in Modal */}
                <div className="space-y-2 pt-1 border-t border-slate-800/80">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-300">
                      Selected Members ({selectedMembers.length})
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium">Click ✕ to remove</span>
                  </div>

                  {selectedUserObjects.length === 0 ? (
                    <div className="p-4 text-center text-xs text-red-400 bg-red-950/20 border border-red-900/30 rounded-xl flex items-center justify-center gap-2">
                      <FiUserX /> Select at least 1 member from the list to proceed.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                      {selectedUserObjects.map((user) => (
                        <div
                          key={user._id}
                          className="flex items-center justify-between p-2 px-3 bg-slate-950/50 border border-slate-800 rounded-xl text-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={user.avatar || DEFAULT_USER_AVATAR_URL}
                              alt={user.fullname}
                              onError={(e) => {
                                if (e.currentTarget.src !== DEFAULT_USER_AVATAR_URL) {
                                  e.currentTarget.src = DEFAULT_USER_AVATAR_URL;
                                }
                              }}
                              className="w-6 h-6 rounded-full object-cover flex-shrink-0 ring-[1.5px] ring-white/85 shadow-sm"
                            />
                            <span className="font-medium text-white truncate text-xs">
                              {user.fullname}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeSelectedMember(user._id)}
                            className="w-5 h-5 rounded-md text-slate-400 hover:text-red-400 hover:bg-slate-800 flex items-center justify-center transition flex-shrink-0 cursor-pointer"
                            title="Remove member"
                          >
                            <FiX className="text-xs" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-3 pt-3 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <FiArrowLeft className="text-xs" /> Back
                  </button>
                  <button
                    type="submit"
                    disabled={creating || selectedMembers.length === 0}
                    className={`flex-1 py-2.5 px-4 font-medium text-xs rounded-xl shadow-lg transition transform active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer ${
                      selectedMembers.length > 0
                        ? "bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-indigo-600/30"
                        : "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50"
                    }`}
                  >
                    {creating ? (
                      "Creating Group..."
                    ) : (
                      <>
                        <FiCheck className="text-sm" /> Create Group
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export default CreateGroup;
