import React, { useEffect, useRef } from "react";
import { useSocketContext } from "./SocketContext";
import useConversation from "../zustand/useConversation.js";
import { useAuth } from "./AuthProvider.jsx";
import api from "../api";
import toast from "react-hot-toast";

const useGetSocketMessage = () => {
    const { socket } = useSocketContext();
    const [authUser] = useAuth();
    const {
        setMessage,
        selectedConversation,
        setSelectedConversation,
        incrementUnreadCount,
        clearUnreadCount,
        setLastMessage,
        lastMessages,
        bumpUserToTop,
        updateConversationInStore,
        setMyGroups,
        closeChatInfo,
        addRealtimeMessage,
        updateMessageInStore,
        setTypingUser,
        clearTypingUsers,
    } = useConversation();

    const typingTimeoutsRef = useRef({});

    useEffect(() => {
        if (!socket) return;

        socket.on("newMessage", (newMessage) => {
            const myIdStr = String(authUser?.user?._id || authUser?._id || "");
            const senderIdStr = String(newMessage.senderId?._id || newMessage.senderId || "");
            const receiverIdStr = newMessage.receiverId ? String(newMessage.receiverId?._id || newMessage.receiverId) : null;
            const conversationIdStr = newMessage.conversationId ? String(newMessage.conversationId?._id || newMessage.conversationId) : null;

            const isGroup = !receiverIdStr;
            const isSentByMe = Boolean(myIdStr && senderIdStr === myIdStr);

            // For groups: target conversation is conversationIdStr.
            // For 1-on-1 direct chats: target conversation is the OTHER person's ID (partner).
            // If I am sender, partner is receiverIdStr. If I am receiver, partner is senderIdStr.
            const targetKey = isGroup
                ? conversationIdStr
                : isSentByMe
                ? receiverIdStr
                : senderIdStr;

            if (!targetKey) return;

            // Automatically clear typing status for this sender on receiving a message
            if (isGroup && conversationIdStr) {
                const timerKey = `${conversationIdStr}_${senderIdStr}`;
                if (typingTimeoutsRef.current[timerKey]) {
                    clearTimeout(typingTimeoutsRef.current[timerKey]);
                    delete typingTimeoutsRef.current[timerKey];
                }
                setTypingUser(conversationIdStr, senderIdStr, false);
            } else if (!isGroup && senderIdStr) {
                const timerKey = `${targetKey}_${senderIdStr}`;
                if (typingTimeoutsRef.current[timerKey]) {
                    clearTimeout(typingTimeoutsRef.current[timerKey]);
                    delete typingTimeoutsRef.current[timerKey];
                }
                setTypingUser(targetKey, senderIdStr, false);
            }

            // Determine if this message belongs to the currently viewed conversation
            const currentSelectedId = selectedConversation?._id ? String(selectedConversation._id) : null;
            const isCurrentSelected = currentSelectedId && currentSelectedId === targetKey;

            if (isCurrentSelected) {
                // Route socket-delivered messages to the dedicated realtime collection
                addRealtimeMessage(newMessage);

                clearUnreadCount(targetKey);

                // ✅ Recipient is actively viewing the chat — immediately mark as seen (only if sent by someone else)
                if (!isSentByMe && socket && myIdStr) {
                    socket.emit("mark-seen", {
                        senderId: senderIdStr, // who sent the message
                        receiverId: myIdStr, // me (the viewer)
                        isGroup,
                        groupId: isGroup ? conversationIdStr : undefined,
                    });
                    // Also persist seen status to DB
                    const seenEndpoint = isGroup ? `/api/message/seen/${conversationIdStr}` : `/api/message/seen/${senderIdStr}`;
                    api.put(seenEndpoint).catch(() => {});
                }
            } else {
                // Only increment unread count if the message was sent by someone else!
                if (!isSentByMe) {
                    incrementUnreadCount(targetKey);
                }
            }

            // Bump conversation partner / group to top in real-time
            bumpUserToTop(targetKey, newMessage);

            // Update Last Message Snippet (with status)
            const snippet = newMessage.messageType === "image" ? "📷 Photo" : newMessage.message;
            setLastMessage(targetKey, {
                text: snippet,
                senderId: senderIdStr,
                createdAt: newMessage.createdAt || new Date(),
                status: newMessage.status || "sent",
            });
        });

        socket.on("messagesSeen", ({ seenBy } = {}) => {
            if (!seenBy) return;

            const seenByStr = String(seenBy);
            const currentUserId = String(authUser?.user?._id || "");
            const currentConversationId = selectedConversation?._id ? String(selectedConversation._id) : null;

            setMessage((prevMessages) =>
                Array.isArray(prevMessages)
                    ? prevMessages.map((msg) => {
                          const msgSenderId = String(msg.senderId?._id || msg.senderId || "");

                          const msgReceiverId = String(msg.receiverId?._id || msg.receiverId || "");

                          const msgConversationId = msg.conversationId ? String(msg.conversationId?._id || msg.conversationId) : null;

                          const isGroup = Boolean(selectedConversation?.isGroup);

                          const belongsToCurrentConversation = isGroup
                              ? msgConversationId === currentConversationId
                              : msgSenderId === currentConversationId || msgReceiverId === currentConversationId;

                          const isMyMessage = msgSenderId === currentUserId;

                          const wasReadByRecipient = msgReceiverId === seenByStr;

                          if (belongsToCurrentConversation && isMyMessage && wasReadByRecipient) {
                              return {
                                  ...msg,
                                  status: "seen",
                                  seen: true,
                              };
                          }

                          return msg;
                      })
                    : [],
            );

            // Update sidebar last-message status.
            const existing = lastMessages[seenByStr];

            if (existing && String(existing.senderId) === currentUserId) {
                setLastMessage(seenByStr, {
                    ...existing,
                    status: "seen",
                });
            }

            // Fallback for the currently selected conversation.
            if (currentConversationId) {
                const selectedExisting = lastMessages[currentConversationId];

                if (selectedExisting && String(selectedExisting.senderId) === currentUserId) {
                    setLastMessage(currentConversationId, {
                        ...selectedExisting,
                        status: "seen",
                    });
                }
            }
        });

        socket.on("messageDelivered", ({ receiverId: deliveredReceiverId, messages: deliveredMessages = [] } = {}) => {
            if (!deliveredReceiverId) return;

            const receiverIdStr = String(deliveredReceiverId);

            const deliveredMessageIds = new Set(deliveredMessages.map((item) => String(item.messageId)));

            // Update only the exact messages that changed
            // from "sent" to "delivered".
            setMessage((prevMessages) =>
                Array.isArray(prevMessages)
                    ? prevMessages.map((msg) => (deliveredMessageIds.has(String(msg._id)) ? { ...msg, status: "delivered" } : msg))
                    : [],
            );

            // Update sidebar last-message status.
            const existing = lastMessages[receiverIdStr];

            if (existing && existing.status === "sent") {
                setLastMessage(receiverIdStr, {
                    ...existing,
                    status: "delivered",
                });
            }

            // Fallback for currently selected conversation.
            if (selectedConversation?._id) {
                const convIdStr = String(selectedConversation._id);
                const selectedExisting = lastMessages[convIdStr];

                if (selectedExisting && selectedExisting.status === "sent" && String(selectedExisting.senderId) === String(authUser?.user?._id)) {
                    setLastMessage(convIdStr, {
                        ...selectedExisting,
                        status: "delivered",
                    });
                }
            }
        });

        // Real-time group updates (e.g. member added/removed, description updated)
        socket.on("groupUpdated", (updatedGroup) => {
            if (updatedGroup && updatedGroup._id) {
                updateConversationInStore(updatedGroup);
            }
        });

        // Real-time notification when a member is removed from group
        socket.on("groupMemberRemoved", ({ groupId, memberId }) => {
            if (authUser?.user?._id && String(authUser.user._id) === String(memberId)) {
                toast.error("You were removed from a group");
                setMyGroups((prev) => (prev || []).filter((g) => String(g._id) !== String(groupId)));
                if (selectedConversation?._id && String(selectedConversation._id) === String(groupId)) {
                    setSelectedConversation(null);
                    closeChatInfo();
                }
            }
        });

        // ── Real-time Bulk Message Deletion for Everyone (Phase 5) ─────────────
        socket.on("messagesBulkDeletedForEveryone", ({ messageIds = [], conversationId, lastMessageUpdated, newLastMessageText } = {}) => {
            if (Array.isArray(messageIds)) {
                messageIds.forEach((id) => {
                    updateMessageInStore(id, { deletedForAll: true });
                });
            }

            if (lastMessageUpdated && conversationId) {
                const convIdStr = String(conversationId);
                const existing = lastMessages[convIdStr];
                setLastMessage(convIdStr, {
                    ...(existing || {}),
                    text: newLastMessageText || "This message was deleted",
                    messageType: "text",
                });
            }
        });

        // ── Real-time Legacy Single Message Deletion (Backward Compatibility) ──
        socket.on("messageDeletedForEveryone", ({ messageId, conversationId } = {}) => {
            if (messageId) {
                updateMessageInStore(messageId, { deletedForAll: true });
            }
        });

        // ── Real-time Emoji Reaction Updates ─────────────────────────────────
        socket.on("messageReactionUpdated", (updatedMessage) => {
            if (!updatedMessage || !updatedMessage._id) return;
            updateMessageInStore(String(updatedMessage._id), {
                reactions: updatedMessage.reactions || [],
            });
        });

        // ── Real-time Typing Indicators (Rolling 2000ms Window) ─────────────
        socket.on("typing", ({ senderId, senderName, conversationId, isGroup } = {}) => {
            if (!senderId) return;
            const senderIdStr = String(senderId);
            const myId = String(authUser?.user?._id || "");
            if (senderIdStr === myId) return;

            const nameToUse = senderName || "Someone";
            const convKey = isGroup && conversationId ? String(conversationId) : senderIdStr;
            const timerKey = `${convKey}_${senderIdStr}`;

            // 1. Clear previous timeout for this exact (conversation, sender) pair
            if (typingTimeoutsRef.current[timerKey]) {
                clearTimeout(typingTimeoutsRef.current[timerKey]);
            }

            // 2. Add/update this specific sender in Zustand for this conversation
            setTypingUser(convKey, senderIdStr, true, nameToUse);

            // 3. Start fresh rolling 2000ms timeout
            typingTimeoutsRef.current[timerKey] = setTimeout(() => {
                setTypingUser(convKey, senderIdStr, false);
                delete typingTimeoutsRef.current[timerKey];
            }, 2000);
        });

        socket.on("typing-stop", ({ senderId, conversationId, isGroup } = {}) => {
            if (!senderId) return;
            const senderIdStr = String(senderId);
            const myId = String(authUser?.user?._id || "");
            if (senderIdStr === myId) return;

            const convKey = isGroup && conversationId ? String(conversationId) : senderIdStr;
            const timerKey = `${convKey}_${senderIdStr}`;

            if (typingTimeoutsRef.current[timerKey]) {
                clearTimeout(typingTimeoutsRef.current[timerKey]);
                delete typingTimeoutsRef.current[timerKey];
            }
            // Remove ONLY this sender from this conversation in Zustand
            setTypingUser(convKey, senderIdStr, false);
        });

        // Clean up active typing state on socket disconnect
        socket.on("disconnect", () => {
            Object.values(typingTimeoutsRef.current).forEach(clearTimeout);
            typingTimeoutsRef.current = {};
            clearTypingUsers();
        });

        return () => {
            socket.off("newMessage");
            socket.off("messagesSeen");
            socket.off("messageDelivered");
            socket.off("groupUpdated");
            socket.off("groupMemberRemoved");
            socket.off("messagesBulkDeletedForEveryone");
            socket.off("messageDeletedForEveryone");
            socket.off("messageReactionUpdated");
            socket.off("typing");
            socket.off("typing-stop");
            socket.off("disconnect");
            Object.values(typingTimeoutsRef.current).forEach(clearTimeout);
            typingTimeoutsRef.current = {};
        };
    }, [
        socket,
        setMessage,
        selectedConversation,
        setSelectedConversation,
        incrementUnreadCount,
        clearUnreadCount,
        setLastMessage,
        lastMessages,
        bumpUserToTop,
        updateConversationInStore,
        setMyGroups,
        closeChatInfo,
        addRealtimeMessage,
        updateMessageInStore,
        setTypingUser,
        clearTypingUsers,
        authUser,
    ]);
};

export default useGetSocketMessage;
