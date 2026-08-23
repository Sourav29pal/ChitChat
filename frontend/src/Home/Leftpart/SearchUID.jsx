import React, { useState } from "react";
import api from "../../api";
import useConversation from "../../zustand/useConversation";
import { FiSearch, FiUserPlus, FiMessageSquare, FiCheck } from "react-icons/fi";
import toast from "react-hot-toast";
import ProfileActionPopup from "../../components/ProfileActionPopup";

function SearchUID() {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [addedIds, setAddedIds] = useState([]);
  const [popupUser, setPopupUser] = useState(null);
  const { setSelectedConversation, setActiveTab, setAllUsers } = useConversation();

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    try {
      const res = await api.get(`/api/user/search?query=${encodeURIComponent(query.trim())}`);
      setSearchResults(res.data);
      if (res.data.length === 0) {
        toast("No user found with that UID / Phone Number", { icon: "🔍" });
      }
    } catch (err) {
      console.error("Search error:", err);
      const msg = err.response?.data?.error || "Error searching for user";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleAddContact = async (user) => {
    try {
      await api.post("/api/user/add-contact", { contactId: user._id });
      setAddedIds((prev) => [...prev, user._id]);
      setAllUsers((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        if (list.some((u) => String(u._id) === String(user._id))) return list;
        return [user, ...list];
      });
      toast.success(`Added ${user.fullname} to contacts!`);
    } catch (err) {
      toast.error("Failed to add contact");
    }
  };

  const handleStartChat = async (user) => {
    try {
      await api.post("/api/user/add-contact", { contactId: user._id });
    } catch (e) {}
    setAllUsers((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      if (list.some((u) => String(u._id) === String(user._id))) return list;
      return [user, ...list];
    });
    setSelectedConversation(user);
    setActiveTab("chats");
  };

  return (
    <div className="h-full flex flex-col bg-slate-900/60 text-slate-100 select-none overflow-hidden relative">
      {/* Top Header & Search Section (Unified with Conversations & Calls) */}
      <div className="p-3 sm:p-4 pb-2.5 sm:pb-3 border-b border-slate-800/80 space-y-2.5 sm:space-y-3 flex-shrink-0 bg-slate-950/40">
        {/* Fixed-height Header Bar */}
        <div className="h-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent">
              Find Users
            </h1>
          </div>
        </div>

        {/* Real-time Search Form */}
        <form onSubmit={handleSearch} className="relative flex items-center w-full">
          <FiSearch className="absolute left-3 text-slate-400 text-sm pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by UID (e.g. 9876543210)"
            className="w-full pl-9 pr-20 py-1.5 sm:py-2 bg-slate-800/60 border border-slate-700/60 rounded-xl text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="absolute right-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-lg shadow-sm shadow-indigo-600/30 transition disabled:opacity-40 disabled:pointer-events-none active:scale-95"
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </form>
      </div>

      {/* Search Results List */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 custom-scrollbar">
        {searchResults.map((user) => {
          const isAdded = addedIds.includes(user._id);
          return (
            <div
              key={user._id}
              className="p-3 bg-slate-800/60 border border-slate-700/60 rounded-2xl flex items-center justify-between hover:border-slate-600 transition"
            >
              {/* ── TARGET 1: DEDICATED AVATAR BUTTON (Profile Action Popup) ── */}
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <button
                  type="button"
                  aria-label={`View profile actions for ${user.fullname}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setPopupUser(user);
                  }}
                  className="cursor-pointer flex-shrink-0 group/avatar p-0 bg-transparent border-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                  title={`Click to view ${user.fullname}'s profile actions`}
                >
                  <img
                    src={user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}`}
                    alt={user.fullname}
                    className="w-11 h-11 rounded-full object-cover ring-[1.5px] ring-white/85 shadow-sm group-hover/avatar:scale-105 active:scale-95 transition duration-200"
                  />
                </button>

                {/* ── TARGET 2: DEDICATED USER CONTENT (Open Chat) ── */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`Open chat with ${user.fullname}`}
                  onClick={() => handleStartChat(user)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleStartChat(user);
                    }
                  }}
                  className="min-w-0 flex-1 cursor-pointer focus:outline-none py-0.5"
                >
                  <h4 className="text-sm font-semibold text-white truncate hover:text-indigo-300 transition">
                    {user.fullname}
                  </h4>
                  <p className="text-xs text-indigo-400 font-mono">UID: {user.uid}</p>
                  <p className="text-[11px] text-slate-400 truncate max-w-[150px]">
                    {user.about || "Hey there! I am using ChitChat."}
                  </p>
                </div>
              </div>

              {/* ── TARGET 3: ACTION BUTTONS ── */}
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddContact(user);
                  }}
                  disabled={isAdded}
                  className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1 transition ${
                    isAdded
                      ? "bg-slate-700 text-slate-400"
                      : "bg-slate-700 hover:bg-slate-600 text-white"
                  }`}
                  title={isAdded ? "Contact Added" : "Add Contact"}
                >
                  {isAdded ? <FiCheck className="text-emerald-400" /> : <FiUserPlus />}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartChat(user);
                  }}
                  className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1 shadow-md shadow-indigo-600/30 transition"
                  title="Message Now"
                >
                  <FiMessageSquare />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Profile Action Popup ── */}
      {popupUser && (
        <ProfileActionPopup
          user={popupUser}
          onClose={() => setPopupUser(null)}
        />
      )}
    </div>
  );
}

export default SearchUID;
