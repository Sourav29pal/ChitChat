import React, { useState } from "react";
import useConversation from "../zustand/useConversation.js";
import axios from "axios";

const useSendMessage = () => {
    const [loading, setLoading] = useState(false);
    const { setMessage, selectedConversation, setLastMessage, bumpUserToTop } = useConversation();

    const sendMessages = async (messageData, optimisticMessage = null) => {
        if (!selectedConversation || !selectedConversation._id) return;
        setLoading(true);
        try {
            const payload = typeof messageData === "string" ? { message: messageData } : messageData;
            const res = await axios.post(`/api/message/send/${selectedConversation._id}`, payload);
            const returnedMessage = res.data;
            const returnedMessages = Array.isArray(returnedMessage) ? returnedMessage : [returnedMessage];

            if (optimisticMessage && optimisticMessage._id) {
                // Replace optimistic message atomically with server-returned message
                setMessage((prev) => {
                    const list = Array.isArray(prev) ? prev : [];
                    const optId = String(optimisticMessage._id);
                    const hasOpt = list.some((m) => String(m._id) === optId);
                    if (hasOpt) {
                        return list.map((m) => (String(m._id) === optId ? returnedMessage : m));
                    }
                    return [...list, ...returnedMessages];
                });
            } else {
                setMessage((prev) => [...(Array.isArray(prev) ? prev : []), ...returnedMessages]);
            }

            // Bump conversation to top (#1) on sender's sidebar in real-time with the last returned message
            const lastMsg = returnedMessages[returnedMessages.length - 1];
            if (lastMsg) {
                bumpUserToTop(selectedConversation._id, lastMsg);

                // Update Last Message Snippet for sender's sidebar (with server-confirmed status)
                const senderIdStr = String(lastMsg.senderId?._id || lastMsg.senderId);
                const attCount = Array.isArray(lastMsg.attachments)
                    ? lastMsg.attachments.length
                    : lastMsg.attachmentUrl
                    ? 1
                    : 0;
                const snippet =
                    lastMsg.messageType === "image"
                        ? lastMsg.message
                            ? `📷 ${lastMsg.message}`
                            : attCount > 1
                            ? `📷 ${attCount} Photos`
                            : "📷 Photo"
                        : lastMsg.message;
                setLastMessage(selectedConversation._id, {
                    text: snippet,
                    senderId: senderIdStr,
                    createdAt: lastMsg.createdAt || new Date(),
                    status: lastMsg.status || "sent",
                });
            }

            setLoading(false);
            return res.data;
        } catch (error) {
            console.log("Error in send messages", error);
            if (optimisticMessage && optimisticMessage._id) {
                // Remove failed optimistic message
                setMessage((prev) => {
                    const list = Array.isArray(prev) ? prev : [];
                    return list.filter((m) => String(m._id) !== String(optimisticMessage._id));
                });
            }
            setLoading(false);
            throw error;
        }
    };
    return { loading, sendMessages };
};

export default useSendMessage;
