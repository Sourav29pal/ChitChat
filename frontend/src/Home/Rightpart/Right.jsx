import React, { useEffect } from "react";
import Chatuser from "./Chatuser";
import Messages from "./Messages";
import Typesend from "./Typesend";
import ChatInfoDrawer from "./ChatInfoDrawer";
import useConversation from "../../zustand/useConversation";
import { useAuth } from "../../context/AuthProvider";
import toast from "react-hot-toast";
import { FiMessageSquare, FiUsers, FiPhoneCall, FiCopy, FiCheck } from "react-icons/fi";
import chitChatLogo from "../../assets/chitchat_logo.svg";

function Right() {
    const { selectedConversation, setSelectedConversation } = useConversation();

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === "Escape") {
                setSelectedConversation(null);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            setSelectedConversation(null);
        };
    }, [setSelectedConversation]);

    return (
        <div className="h-full flex flex-col bg-slate-950/60 backdrop-blur-xl text-slate-100 relative overflow-hidden">
            {!selectedConversation ? (
                <NoChatSelected />
            ) : (
                <>
                    {/* HEADER */}
                    <div className="h-[72px] flex-shrink-0">
                        <Chatuser />
                    </div>

                    {/* MESSAGES BODY — scroll managed internally by Messages.jsx */}
                    <div className="flex-1 min-h-0 flex flex-col bg-slate-950/40">
                        <Messages />
                    </div>

                    {/* INPUT BAR */}
                    <div className="p-2.5 sm:p-4 pt-1 sm:pt-1.5 bg-slate-950/40 flex-shrink-0 relative z-30">
                        <Typesend />
                    </div>
                </>
            )}

            {/* RIGHT-SIDE CONTACT / GROUP INFO DRAWER */}
            <ChatInfoDrawer />
        </div>
    );
}

export default Right;

const NoChatSelected = () => {
    const [authUser] = useAuth();
    const { setActiveTab } = useConversation();
    const user = authUser?.user || (authUser && authUser._id ? authUser : null);
    const [copied, setCopied] = React.useState(false);

    const handleCopyUid = async (e) => {
        e.stopPropagation();
        if (!user?.uid) return;
        try {
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(String(user.uid));
            } else {
                const textarea = document.createElement("textarea");
                textarea.value = String(user.uid);
                textarea.style.position = "fixed";
                textarea.style.opacity = "0";
                document.body.appendChild(textarea);
                textarea.focus();
                textarea.select();
                document.execCommand("copy");
                document.body.removeChild(textarea);
            }
            setCopied(true);
            toast.success("UID copied to clipboard!");
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            toast.error("Failed to copy UID");
        }
    };

    return (
        <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 text-center bg-transparent relative overflow-hidden select-none">
            {/* Subtle Ambient Glow matching left side identically */}
            <div className="absolute -top-20 -left-20 w-64 h-64 bg-violet-600/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none"></div>

            {/* Compact Glassmorphic Welcome Card */}
            <div className="max-w-xl w-full p-5 sm:p-6 rounded-2xl bg-slate-900/60 backdrop-blur-2xl border border-slate-800/80 shadow-2xl space-y-5 relative z-10 overflow-hidden">
                {/* Soft Top Shimmer Line */}
                <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent absolute top-0 left-0"></div>

                {/* Logo & Brand Header */}
                <div className="space-y-2.5">
                    <div className="relative inline-block mx-auto">
                        <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500/20 to-cyan-500/20 rounded-2xl blur-sm pointer-events-none"></div>
                        <img
                            src={chitChatLogo}
                            alt="ChitChat"
                            className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl mx-auto shadow-md ring-1 ring-white/10 object-contain relative z-10"
                        />
                    </div>

                    <div className="space-y-1">
                        <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                            Welcome to{" "}
                            <span className="bg-gradient-to-r from-violet-400 via-indigo-300 to-cyan-400 bg-clip-text text-transparent font-black">
                                ChitChat
                            </span>
                        </h2>
                        <p className="text-xs sm:text-[13px] text-slate-400 max-w-sm mx-auto leading-relaxed">
                            Chat, connect, and stay in touch — all in one place.
                        </p>
                    </div>

                    {/* Secondary UID Badge with Copy Action */}
                    {user?.uid && (
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/50 border border-slate-700/50 text-xs text-slate-300">
                            <span className="text-slate-400 text-[11px]">Your UID:</span>
                            <span className="font-mono font-bold text-indigo-300 tracking-wider">{user.uid}</span>
                            <button
                                type="button"
                                onClick={handleCopyUid}
                                className="p-0.5 rounded hover:bg-slate-700/60 text-slate-400 hover:text-white transition-colors cursor-pointer"
                                title="Copy UID"
                            >
                                {copied ? <FiCheck className="text-emerald-400 text-xs" /> : <FiCopy className="text-xs" />}
                            </button>
                        </div>
                    )}
                </div>

                {/* 3 Compact Feature / Action Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-0.5 text-left">
                    {/* Card 1: Start Conversation */}
                    <button
                        type="button"
                        onClick={() => setActiveTab("search")}
                        className="p-3.5 bg-slate-950/30 hover:bg-slate-800/50 border border-slate-800/70 hover:border-indigo-500/40 rounded-xl space-y-1.5 group transition-all duration-150 active:scale-[0.98] cursor-pointer"
                    >
                        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                            <FiMessageSquare className="text-sm" />
                        </div>
                        <h4 className="text-xs font-bold text-slate-200 group-hover:text-white transition-colors">
                            Start a conversation
                        </h4>
                        <p className="text-[10px] sm:text-[11px] text-slate-400 leading-snug">
                            Search a UID to find someone and start chatting.
                        </p>
                    </button>

                    {/* Card 2: Create Group */}
                    <button
                        type="button"
                        onClick={() => setActiveTab("groups")}
                        className="p-3.5 bg-slate-950/30 hover:bg-slate-800/50 border border-slate-800/70 hover:border-violet-500/40 rounded-xl space-y-1.5 group transition-all duration-150 active:scale-[0.98] cursor-pointer"
                    >
                        <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 group-hover:bg-violet-600 group-hover:text-white transition-colors">
                            <FiUsers className="text-sm" />
                        </div>
                        <h4 className="text-xs font-bold text-slate-200 group-hover:text-white transition-colors">
                            Create a group
                        </h4>
                        <p className="text-[10px] sm:text-[11px] text-slate-400 leading-snug">
                            Bring people together and start a group conversation.
                        </p>
                    </button>

                    {/* Card 3: Call & Connect */}
                    <button
                        type="button"
                        onClick={() => setActiveTab("calls")}
                        className="p-3.5 bg-slate-950/30 hover:bg-slate-800/50 border border-slate-800/70 hover:border-emerald-500/40 rounded-xl space-y-1.5 group transition-all duration-150 active:scale-[0.98] cursor-pointer"
                    >
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                            <FiPhoneCall className="text-sm" />
                        </div>
                        <h4 className="text-xs font-bold text-slate-200 group-hover:text-white transition-colors">
                            Call & connect
                        </h4>
                        <p className="text-[10px] sm:text-[11px] text-slate-400 leading-snug">
                            Make voice and video calls directly from your chats.
                        </p>
                    </button>
                </div>

                {/* Footer Instruction */}
                <p className="text-[11px] text-slate-500">
                    Select a conversation from the sidebar to get started.
                </p>
            </div>
        </div>
    );
};
