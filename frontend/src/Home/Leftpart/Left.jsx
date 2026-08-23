import React from "react";
import Users from "./Users";
import SearchUID from "./SearchUID";
import CreateGroup from "./CreateGroup";
import UserProfile from "./UserProfile";
import CallHistory from "./CallHistory";
import useConversation from "../../zustand/useConversation";
import { useAuth } from "../../context/AuthProvider";
import {
  FiMessageSquare,
  FiUsers,
  FiUserPlus,
  FiPhone,
} from "react-icons/fi";
import chitChatLogo from "../../assets/chitchat_logo.svg";

function Left() {
  const { activeTab, setActiveTab } = useConversation();
  const [authUser] = useAuth();
  const user = authUser?.user || (authUser && authUser._id ? authUser : null);

  return (
    <div className="h-full flex bg-slate-950/60 backdrop-blur-xl text-slate-100 select-none p-1.5 gap-1.5 overflow-hidden relative">
      {/* Subtle Left-Side Ambient Glow */}
      <div className="absolute -top-20 -left-20 w-64 h-64 bg-violet-600/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none"></div>

      {/* Vertical Icon Navigation Inner Card */}
      <div className="w-14 flex flex-col items-center justify-between py-3.5 bg-slate-900/90 rounded-xl border border-slate-800/80 ring-1 ring-white/5 shadow-md flex-shrink-0 relative z-10">
        {/* App Logo */}
        <img
          src={chitChatLogo}
          alt="ChitChat"
          title="ChitChat"
          onClick={() => setActiveTab("chats")}
          className="w-10 h-10 rounded-xl shadow-md shadow-indigo-500/30 cursor-pointer ring-1 ring-white/10 object-contain hover:scale-105 active:scale-95 transition-transform"
        />

        {/* Navigation Tabs */}
        <div className="flex flex-col gap-2.5">
          <button
            onClick={() => setActiveTab("chats")}
            className={`p-2.5 rounded-xl transition ${
              activeTab === "chats"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
            title="Conversations & Direct Chats"
          >
            <FiMessageSquare className="text-lg" />
          </button>

          <button
            onClick={() => setActiveTab("calls")}
            className={`p-2.5 rounded-xl transition ${
              activeTab === "calls"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
            title="Call Logs & History"
          >
            <FiPhone className="text-lg" />
          </button>

          <button
            onClick={() => setActiveTab("groups")}
            className={`p-2.5 rounded-xl transition ${
              activeTab === "groups"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
            title="Create Group"
          >
            <FiUsers className="text-lg" />
          </button>

          <button
            onClick={() => setActiveTab("search")}
            className={`p-2.5 rounded-xl transition ${
              activeTab === "search"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
            title="Search & Add User by UID / Mobile"
          >
            <FiUserPlus className="text-lg" />
          </button>
        </div>

        {/* User Profile Avatar Tab */}
        <button
          type="button"
          onClick={() => setActiveTab("profile")}
          className={`relative p-0.5 rounded-full transition-all duration-200 border-2 cursor-pointer ${
            activeTab === "profile"
              ? "border-indigo-500 shadow-md shadow-indigo-500/30 scale-105"
              : "border-transparent hover:border-slate-700"
          }`}
          title="User Settings & Profile"
        >
          <img
            src={user?.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${user?.uid}`}
            alt="Profile"
            className="w-8 h-8 rounded-full object-cover ring-[1.5px] ring-white/90 shadow-sm"
          />
        </button>
      </div>

      {/* Main Tab Content View Inner Card */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-900/90 rounded-xl border border-slate-800/80 ring-1 ring-white/5 shadow-md overflow-hidden">
        {activeTab === "chats" && <Users />}
        {activeTab === "calls" && <CallHistory />}
        {activeTab === "groups" && <CreateGroup />}
        {activeTab === "search" && <SearchUID />}
        {activeTab === "profile" && <UserProfile />}
      </div>
    </div>
  );
}

export default Left;
