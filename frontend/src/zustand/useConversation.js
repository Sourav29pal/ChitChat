import { create } from "zustand";
import toast from "react-hot-toast";

const useConversation = create((set) => ({
  // Restore last open conversation from localStorage on page refresh
  selectedConversation: (() => {
    try {
      const saved = localStorage.getItem("chatApp_selectedConv");
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  })(),
  setSelectedConversation: (selectedConversation) =>
    set((state) => {
      const convId = selectedConversation?._id ? String(selectedConversation._id) : null;
      const updatedUnread = { ...state.unreadCounts };
      if (convId) {
        updatedUnread[convId] = 0;
      }
      // Persist to localStorage so refresh reopens the same chat
      try {
        if (selectedConversation) {
          localStorage.setItem("chatApp_selectedConv", JSON.stringify(selectedConversation));
        } else {
          localStorage.removeItem("chatApp_selectedConv");
        }
      } catch (e) {}
      return { selectedConversation, unreadCounts: updatedUnread };
    }),
  messages: [],
  setMessage: (messages) =>
    set((state) => ({
      messages:
        typeof messages === "function"
          ? messages(Array.isArray(state.messages) ? state.messages : [])
          : Array.isArray(messages)
          ? messages
          : [],
    })),

  // ─── Realtime message collection ────────────────────────────────────────────
  //
  // Socket-delivered messages are stored here, separately from the historical
  // API-sourced messages[] array above.  They are never inserted into messages[].
  //
  // Three actions:
  //   addRealtimeMessage   — append one socket message (with duplicate guard)
  //   clearRealtimeMessages — empty the collection (conversation change)
  //   addHistoricalAndPurgeRealtime — ATOMIC: insert new API messages into
  //     messages[] AND remove any overlapping _ids from realtimeMessages[] in a
  //     single set() call so no render ever sees a message in both collections.
  //
  realtimeMessages: [],

  addRealtimeMessage: (message) =>
    set((state) => {
      const current = Array.isArray(state.realtimeMessages) ? state.realtimeMessages : [];
      // Guard: ignore if this _id is already present (network dedup)
      if (current.some((m) => String(m._id) === String(message._id))) return state;
      return { realtimeMessages: [...current, message] };
    }),

  clearRealtimeMessages: () => set({ realtimeMessages: [] }),

  // ─── In-place message patch ──────────────────────────────────────────────────
  //
  // Used by the deletion feature to update a single message's content/state
  // without moving it between arrays, changing its position, or touching any
  // batch/separator/unread/scroll state.
  //
  // Works across BOTH the historical messages[] and the realtimeMessages[] arrays.
  // Idempotent: applying the same patch twice produces the same result.
  //
  updateMessageInStore: (messageId, patch) =>
    set((state) => {
      const idStr = String(messageId);
      const updateMsg = (msg) =>
        String(msg._id) === idStr ? { ...msg, ...patch } : msg;

      const currentMessages  = Array.isArray(state.messages)         ? state.messages         : [];
      const currentRealtime  = Array.isArray(state.realtimeMessages)  ? state.realtimeMessages  : [];

      const newMessages = currentMessages.map(updateMsg);
      const newRealtime = currentRealtime.map(updateMsg);

      // Only create new array references when something actually changed,
      // preventing unnecessary re-renders of unaffected components.
      const messagesChanged = newMessages.some((m, i) => m !== currentMessages[i]);
      const realtimeChanged = newRealtime.some((m, i) => m !== currentRealtime[i]);

      return {
        ...(messagesChanged ? { messages: newMessages }         : {}),
        ...(realtimeChanged ? { realtimeMessages: newRealtime } : {}),
      };
    }),

  addHistoricalAndPurgeRealtime: (newMessages, direction) =>
    set((state) => {
      if (!Array.isArray(newMessages) || newMessages.length === 0) return state;

      const currentHistorical = Array.isArray(state.messages) ? state.messages : [];
      const currentRealtime   = Array.isArray(state.realtimeMessages) ? state.realtimeMessages : [];

      const existingHistoricalIds = new Set(currentHistorical.map((m) => String(m._id)));
      const incomingIds           = new Set(newMessages.map((m) => String(m._id)));

      const uniqueNewMessages =
        newMessages.filter((m) => !existingHistoricalIds.has(String(m._id)));

      const updatedHistorical =
        direction === "before"
          ? [...uniqueNewMessages, ...currentHistorical]
          : [...currentHistorical, ...uniqueNewMessages];

      // Only create a new realtimeMessages array when there is actual overlap.
      // If no overlap, return the same reference so subscribers of
      // realtimeMessages[] are not notified and do not re-render.
      const hasOverlap = currentRealtime.some((m) => incomingIds.has(String(m._id)));
      const updatedRealtime = hasOverlap
        ? currentRealtime.filter((m) => !incomingIds.has(String(m._id)))
        : currentRealtime;

      return {
        messages: updatedHistorical,
        ...(hasOverlap ? { realtimeMessages: updatedRealtime } : {}),
      };
    }),

  activeTab: "chats", // 'chats' | 'groups' | 'search' | 'profile'
  setActiveTab: (activeTab) => set({ activeTab }),
  myGroups: [],
  setMyGroups: (myGroups) => set({ myGroups }),
  activeCall: null,
  setActiveCall: (activeCall) => set({ activeCall }),
  imageAttachment: null,
  setImageAttachment: (imageAttachment) => set({ imageAttachment }),
  sharedMedia: [],
  setSharedMedia: (sharedMedia) => set({ sharedMedia }),
  lightboxMessageId: null,
  lightboxSource: "chat", // "chat" | "media"
  setLightboxMessageId: (lightboxMessageId, lightboxSource) =>
    set((state) => ({
      lightboxMessageId,
      lightboxSource: lightboxSource !== undefined ? lightboxSource : state.lightboxSource,
    })),
  isChatInfoOpen: false,
  infoDrawerUser: null,
  setInfoDrawerUser: (infoDrawerUser) => set({ infoDrawerUser }),
  setIsChatInfoOpen: (isChatInfoOpen) => set({ isChatInfoOpen }),
  openChatInfo: (user) => set({ infoDrawerUser: user, isChatInfoOpen: true }),
  closeChatInfo: () => set({ isChatInfoOpen: false, infoDrawerUser: null }),
  toggleChatInfoOpen: () =>
    set((state) => ({
      isChatInfoOpen: !state.isChatInfoOpen,
      infoDrawerUser: !state.isChatInfoOpen ? state.selectedConversation : null,
    })),
  updateConversationInStore: (updatedConv) =>
    set((state) => {
      if (!updatedConv || !updatedConv._id) return state;
      const convIdStr = String(updatedConv._id);

      let updatedSelected = state.selectedConversation;
      if (state.selectedConversation && String(state.selectedConversation._id) === convIdStr) {
        updatedSelected = updatedConv;
        try {
          localStorage.setItem("chatApp_selectedConv", JSON.stringify(updatedConv));
        } catch (e) {}
      }

      let updatedDrawerUser = state.infoDrawerUser;
      if (state.infoDrawerUser && String(state.infoDrawerUser._id) === convIdStr) {
        updatedDrawerUser = updatedConv;
      }

      const updatedMyGroups = (state.myGroups || []).map((g) =>
        String(g._id) === convIdStr ? updatedConv : g
      );

      const updatedAllUsers = (state.allUsers || []).map((u) =>
        String(u._id) === convIdStr ? updatedConv : u
      );

      return {
        selectedConversation: updatedSelected,
        infoDrawerUser: updatedDrawerUser,
        myGroups: updatedMyGroups,
        allUsers: updatedAllUsers,
      };
    }),

  // Unread Count Management
  unreadCounts: {},
  setUnreadCounts: (unreadCounts) => set({ unreadCounts }),
  incrementUnreadCount: (id) =>
    set((state) => {
      const key = String(id);
      return {
        unreadCounts: {
          ...state.unreadCounts,
          [key]: (state.unreadCounts[key] || 0) + 1,
        },
      };
    }),
  clearUnreadCount: (id) =>
    set((state) => {
      const key = String(id);
      return {
        unreadCounts: {
          ...state.unreadCounts,
          [key]: 0,
        },
      };
    }),

  // All Users (Conversation List) Management
  allUsers: [],
  setAllUsers: (allUsers) =>
    set((state) => ({
      allUsers: typeof allUsers === "function" ? allUsers(state.allUsers) : Array.isArray(allUsers) ? allUsers : [],
    })),

  bumpUserToTop: (targetId, lastMsg) =>
    set((state) => {
      const targetIdStr = String(targetId);
      const updatedLastMsgMap = { ...state.lastMessages };
      if (lastMsg) {
        updatedLastMsgMap[targetIdStr] = lastMsg;
      }

      // Check if target is a group conversation
      const groupIndex = state.myGroups.findIndex((g) => String(g._id) === targetIdStr);
      const isGroupMessage = groupIndex !== -1 || (lastMsg && (lastMsg.isGroup === true || lastMsg.receiverId === null));

      // ── 1. GROUP CONVERSATION PATH ──────────────────────────────────────────
      if (isGroupMessage) {
        if (groupIndex !== -1) {
          const updatedGroups = [...state.myGroups];
          const groupObj = { ...updatedGroups[groupIndex] };
          updatedGroups.splice(groupIndex, 1);
          if (lastMsg) groupObj.lastMessage = lastMsg;
          updatedGroups.unshift(groupObj);
          return {
            myGroups: updatedGroups,
            lastMessages: updatedLastMsgMap,
          };
        }
        // If it's a group message but the group is not yet loaded in myGroups,
        // do NOT leak it into allUsers. Just update lastMessages and return.
        return {
          lastMessages: updatedLastMsgMap,
        };
      }

      // ── 2. DIRECT (1-to-1) CONVERSATION PATH ─────────────────────────────────
      const userIndex = state.allUsers.findIndex((u) => String(u._id) === targetIdStr);
      let updatedUsers = [...state.allUsers];
      if (userIndex !== -1) {
        const userObj = { ...updatedUsers[userIndex] };
        updatedUsers.splice(userIndex, 1);
        if (lastMsg) userObj.lastMessage = lastMsg;
        updatedUsers.unshift(userObj);
      } else if (lastMsg && lastMsg.receiverId !== null) {
        // Genuine first-time direct message from a new contact not yet in allUsers:
        const senderObj = typeof lastMsg.senderId === "object" && lastMsg.senderId ? lastMsg.senderId : null;
        const newUserObj = {
          _id: senderObj?._id || targetIdStr,
          fullname: senderObj?.fullname || "User",
          uid: senderObj?.uid || "",
          avatar: senderObj?.avatar || "",
          about: senderObj?.about || "Hey there! I am using ChitChat.",
          lastMessage: lastMsg,
        };
        updatedUsers.unshift(newUserObj);
      }

      return {
        allUsers: updatedUsers,
        lastMessages: updatedLastMsgMap,
      };
    }),

  // Filter Pills ('all' | 'unread' | 'groups')
  activeFilter: "all",
  setActiveFilter: (activeFilter) => set({ activeFilter }),

  // Pinned Conversations (Stored as array of string IDs, Max 3 pins)
  pinnedIds: (() => {
    try {
      const saved = localStorage.getItem("chatApp_pinnedIds");
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  })(),
  togglePinChat: (id) =>
    set((state) => {
      const targetIdStr = String(id);
      const isAlreadyPinned = state.pinnedIds.includes(targetIdStr);
      let updatedPinned;

      if (isAlreadyPinned) {
        updatedPinned = state.pinnedIds.filter((pId) => pId !== targetIdStr);
        toast.success("Chat unpinned");
      } else {
        if (state.pinnedIds.length >= 3) {
          toast.error("You can only pin up to 3 chats");
          return state;
        }
        updatedPinned = [...state.pinnedIds, targetIdStr];
        toast.success("Chat pinned to top 📌");
      }

      try {
        localStorage.setItem("chatApp_pinnedIds", JSON.stringify(updatedPinned));
      } catch (e) {}

      return { pinnedIds: updatedPinned };
    }),

  // Active Message Reaction Picker Trigger
  activeReactMessageId: null,
  setActiveReactMessageId: (id) => set({ activeReactMessageId: id }),

  // Unified Multi-Typer State: { [conversationId]: { [senderId]: senderName } }
  typingUsers: {},
  setTypingUser: (convId, senderId, isTyping, senderName) =>
    set((state) => {
      // Overload handling if called with 2 or 3 arguments: (id, isTyping, senderName)
      let cId, sId, active, name;
      if (typeof senderId === "boolean") {
        cId = String(convId);
        sId = String(convId);
        active = senderId;
        name = isTyping || "Someone";
      } else {
        cId = String(convId);
        sId = String(senderId || convId);
        active = Boolean(isTyping);
        name = senderName || "Someone";
      }

      if (!cId || !sId) return state;

      const currentConvTypers = state.typingUsers[cId];

      if (!active) {
        if (!currentConvTypers || !currentConvTypers[sId]) return state;
        const nextConvTypers = { ...currentConvTypers };
        delete nextConvTypers[sId];

        const nextTypingUsers = { ...state.typingUsers };
        if (Object.keys(nextConvTypers).length === 0) {
          delete nextTypingUsers[cId];
        } else {
          nextTypingUsers[cId] = nextConvTypers;
        }
        return { typingUsers: nextTypingUsers };
      }

      if (currentConvTypers && currentConvTypers[sId] === name) return state;

      return {
        typingUsers: {
          ...state.typingUsers,
          [cId]: {
            ...(currentConvTypers || {}),
            [sId]: name,
          },
        },
      };
    }),

  clearTypingUsers: (convId) =>
    set((state) => {
      if (!convId) {
        if (Object.keys(state.typingUsers).length === 0) return state;
        return { typingUsers: {} };
      }
      const cId = String(convId);
      if (!state.typingUsers[cId]) return state;
      const next = { ...state.typingUsers };
      delete next[cId];
      return { typingUsers: next };
    }),

  // Last Message Management
  lastMessages: {},
  setLastMessage: (id, lastMsg) =>
    set((state) => {
      const key = String(id);
      return {
        lastMessages: {
          ...state.lastMessages,
          [key]: lastMsg,
        },
      };
    }),

  // ─── Call History Management ────────────────────────────────────────────────
  callHistory: [],
  setCallHistory: (callHistory) =>
    set((state) => ({
      callHistory:
        typeof callHistory === "function"
          ? callHistory(Array.isArray(state.callHistory) ? state.callHistory : [])
          : Array.isArray(callHistory)
          ? callHistory
          : [],
    })),

  // ─── Clear Chat (User-Scoped Local Synchronization) ─────────────────────────
  clearChatLocally: (conversationId, timeRange, sinceDateStr) =>
    set((state) => {
      if (!conversationId) return state;
      const convIdStr = String(conversationId);

      let sinceTimestamp = null;
      const now = new Date();
      if (timeRange === "today") {
        sinceTimestamp = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
      } else if (timeRange === "week") {
        sinceTimestamp = now.getTime() - 7 * 24 * 60 * 60 * 1000;
      } else if (timeRange === "month") {
        sinceTimestamp = now.getTime() - 30 * 24 * 60 * 60 * 1000;
      } else if (sinceDateStr) {
        sinceTimestamp = new Date(sinceDateStr).getTime();
      }

      const isMessageInConv = (m) => {
        const mConv = m.conversationId ? String(m.conversationId) : null;
        const mRecv = m.receiverId
          ? typeof m.receiverId === "object"
            ? String(m.receiverId._id)
            : String(m.receiverId)
          : null;
        const mSend = m.senderId
          ? typeof m.senderId === "object"
            ? String(m.senderId._id)
            : String(m.senderId)
          : null;
        return mConv === convIdStr || mRecv === convIdStr || mSend === convIdStr;
      };

      const markDeleted = (msg) => {
        if (!isMessageInConv(msg)) return msg;
        if (sinceTimestamp === null || new Date(msg.createdAt || 0).getTime() >= sinceTimestamp) {
          return { ...msg, isDeletedForMe: true };
        }
        return msg;
      };

      const currentMessages = Array.isArray(state.messages) ? state.messages : [];
      const currentRealtime = Array.isArray(state.realtimeMessages) ? state.realtimeMessages : [];

      const newMessages = currentMessages.map(markDeleted);
      const newRealtime = currentRealtime.map(markDeleted);

      // Recalculate newest remaining visible message for this conversation
      const remainingVisible = [...newMessages, ...newRealtime]
        .filter((m) => isMessageInConv(m) && !m.isDeletedForMe)
        .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());

      const newest = remainingVisible.length > 0 ? remainingVisible[remainingVisible.length - 1] : null;

      const newLastMsg = newest
        ? {
            text: newest.deletedForAll
              ? "This message was deleted"
              : newest.message || (newest.attachmentUrl ? "📷 Photo" : ""),
            messageType: newest.messageType || "text",
            senderId: newest.senderId,
            status: newest.status || "sent",
            createdAt: newest.createdAt,
            callDetails: newest.callDetails,
          }
        : { isEmpty: true, text: "", createdAt: null };

      // Synchronize Call History in Zustand if any calls belonged to cleared conversation
      const currentCallHistory = Array.isArray(state.callHistory) ? state.callHistory : [];
      const newCallHistory = currentCallHistory.filter((call) => {
        const isMatch = isMessageInConv(call);
        if (!isMatch) return true;
        if (sinceTimestamp === null || new Date(call.createdAt || 0).getTime() >= sinceTimestamp) {
          return false; // remove from user's call history view
        }
        return true;
      });

      return {
        messages: newMessages,
        realtimeMessages: newRealtime,
        callHistory: newCallHistory,
        lastMessages: {
          ...state.lastMessages,
          [convIdStr]: newLastMsg,
        },
        unreadCounts: {
          ...state.unreadCounts,
          [convIdStr]: 0,
        },
      };
    }),

  // ─── Remove Conversation (1-to-1 Only Local Synchronization) ────────────────
  removeConversationLocally: (partnerId, conversationId) =>
    set((state) => {
      if (!partnerId) return state;
      const partnerIdStr = String(partnerId);
      const convIdStr = conversationId ? String(conversationId) : partnerIdStr;

      // 1. Remove partner from allUsers (1-to-1 contacts list)
      const updatedAllUsers = (state.allUsers || []).filter(
        (u) => String(u._id) !== partnerIdStr
      );

      // 2. If this conversation is currently selected, close it
      const isCurrentlySelected =
        state.selectedConversation &&
        (String(state.selectedConversation._id) === partnerIdStr ||
          String(state.selectedConversation._id) === convIdStr);

      let updatedSelected = state.selectedConversation;
      if (isCurrentlySelected) {
        updatedSelected = null;
        try {
          localStorage.removeItem("chatApp_selectedConv");
        } catch (e) {}
      }

      // 3. Clear messages if currently viewing this conversation
      const updatedMessages = isCurrentlySelected ? [] : state.messages;
      const updatedRealtime = isCurrentlySelected ? [] : state.realtimeMessages;

      // 4. Remove matching call history entries
      const currentCallHistory = Array.isArray(state.callHistory) ? state.callHistory : [];
      const updatedCallHistory = currentCallHistory.filter((call) => {
        const cConv = call.conversationId ? String(call.conversationId) : null;
        const cRecv = call.receiverId
          ? typeof call.receiverId === "object"
            ? String(call.receiverId._id)
            : String(call.receiverId)
          : null;
        const cSend = call.senderId
          ? typeof call.senderId === "object"
            ? String(call.senderId._id)
            : String(call.senderId)
          : null;
        return cConv !== convIdStr && cConv !== partnerIdStr && cRecv !== partnerIdStr && cSend !== partnerIdStr;
      });

      // 5. Clear lastMessage and unreadCount entries
      const updatedLastMessages = { ...state.lastMessages };
      delete updatedLastMessages[partnerIdStr];
      delete updatedLastMessages[convIdStr];

      const updatedUnread = { ...state.unreadCounts };
      delete updatedUnread[partnerIdStr];
      delete updatedUnread[convIdStr];

      return {
        allUsers: updatedAllUsers,
        selectedConversation: updatedSelected,
        messages: updatedMessages,
        realtimeMessages: updatedRealtime,
        callHistory: updatedCallHistory,
        lastMessages: updatedLastMessages,
        unreadCounts: updatedUnread,
      };
    }),

  // ─── Reset Conversation & Navigation State (Auth Lifecycle) ───────────────
  resetConversationState: () => {
    try {
      localStorage.removeItem("chatApp_selectedConv");
      localStorage.removeItem("chatApp_pinnedIds");
    } catch (e) {}
    set({
      selectedConversation: null,
      messages: [],
      realtimeMessages: [],
      activeTab: "chats",
      myGroups: [],
      activeCall: null,
      imageAttachment: null,
      sharedMedia: [],
      lightboxMessageId: null,
      isChatInfoOpen: false,
      infoDrawerUser: null,
      unreadCounts: {},
      allUsers: [],
      activeFilter: "all",
      pinnedIds: [],
      typingUsers: {},
      lastMessages: {},
      callHistory: [],
    });
  },
}));

export default useConversation;