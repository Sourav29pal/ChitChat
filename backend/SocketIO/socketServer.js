import { Server } from "socket.io";
import http from "http";
import express from "express";
import Message from "../model/message.model.js";
import { initRedis, setUserOnline, setUserOffline, refreshUserPresence, getAllOnlineUserIds, getLocalSocketId } from "../utils/redis.js";

const app = express();

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
});

// Initialize Redis adapter & presence client asynchronously
initRedis(io);

export const getReceiverSocketId = (receiverId) => {
    return getLocalSocketId(receiverId) || null;
};

io.on("connection", async (socket) => {
    console.log("A user connected:", socket.id);
    const userId = socket.handshake.query.userId;

    if (userId) {
        socket.join(userId);
        await setUserOnline(userId, socket.id);

        // Mark only currently pending messages for this user as delivered
        try {
            const pendingMessages = await Message.find({
                receiverId: userId,
                status: "sent",
            }).select("_id senderId conversationId");

            if (pendingMessages.length > 0) {
                await Message.updateMany(
                    {
                        _id: { $in: pendingMessages.map((msg) => msg._id) },
                        status: "sent",
                    },
                    {
                        $set: { status: "delivered" },
                    },
                );

                const messagesBySender = {};

                pendingMessages.forEach((msg) => {
                    const senderId = msg.senderId.toString();

                    if (!messagesBySender[senderId]) {
                        messagesBySender[senderId] = [];
                    }

                    messagesBySender[senderId].push({
                        messageId: msg._id,
                        conversationId: msg.conversationId,
                    });
                });

                for (const [senderId, messages] of Object.entries(messagesBySender)) {
                    const senderSocketId = getReceiverSocketId(senderId);

                    if (senderSocketId) {
                        io.to(senderSocketId).emit("messageDelivered", {
                            receiverId: userId,
                            messages,
                        });
                    }
                }
            }
        } catch (err) {
            console.error("Error updating delivered status:", err);
        }
    }

    // Broadcast online users
    const onlineUsers = await getAllOnlineUserIds();
    io.emit("getOnlineUsers", onlineUsers);

    // Periodic heartbeat from client to maintain presence in Redis
    socket.on("heartbeat", async () => {
        if (userId) {
            await refreshUserPresence(userId);
        }
    });

    // --- WebRTC Audio & Video Signaling ---
    socket.on("call-user", ({ userToCall, signalData, from, callerName, callerAvatar, callType }) => {
        const recipientTarget = getReceiverSocketId(userToCall);
        if (recipientTarget) {
            io.to(recipientTarget).emit("incoming-call", {
                signal: signalData,
                from,
                callerName,
                callerAvatar,
                callType, // 'voice' or 'video'
            });
        }
    });

    socket.on("answer-call", ({ to, signal }) => {
        const callerTarget = getReceiverSocketId(to);
        if (callerTarget) {
            io.to(callerTarget).emit("call-accepted", { signal });
        }
    });

    socket.on("reject-call", ({ to }) => {
        const callerTarget = getReceiverSocketId(to);
        if (callerTarget) {
            io.to(callerTarget).emit("call-rejected");
        }
    });

    socket.on("ice-candidate", ({ to, candidate }) => {
        const target = getReceiverSocketId(to);
        if (target) {
            io.to(target).emit("ice-candidate", { candidate });
        }
    });

    socket.on("end-call", ({ to }) => {
        const target = getReceiverSocketId(to);
        if (target) {
            io.to(target).emit("call-ended");
        }
    });

    socket.on("toggle-camera", ({ to, videoEnabled }) => {
        const target = getReceiverSocketId(to);
        if (target) {
            io.to(target).emit("remote-toggle-camera", { videoEnabled });
        }
    });

    socket.on("toggle-audio", ({ to, audioEnabled }) => {
        const target = getReceiverSocketId(to);
        if (target) {
            io.to(target).emit("remote-toggle-audio", { audioEnabled });
        }
    });

    // --- Typing Indicator (ephemeral — no DB writes, no message mutation) ---
    socket.on("typing", ({ receiverId, conversationId, isGroup, senderName } = {}) => {
        if (!receiverId || !conversationId) return;
        if (isGroup) {
            socket.broadcast.emit("typing", {
                senderId: userId,
                senderName: senderName || "",
                conversationId,
                isGroup: true,
            });
        } else {
            const target = getReceiverSocketId(receiverId);
            if (target) {
                io.to(target).emit("typing", {
                    senderId: userId,
                    senderName: senderName || "",
                    conversationId,
                    isGroup: false,
                });
            }
        }
    });

    socket.on("typing-stop", ({ receiverId, conversationId, isGroup } = {}) => {
        if (!receiverId || !conversationId) return;
        if (isGroup) {
            socket.broadcast.emit("typing-stop", {
                senderId: userId,
                conversationId,
                isGroup: true,
            });
        } else {
            const target = getReceiverSocketId(receiverId);
            if (target) {
                io.to(target).emit("typing-stop", {
                    senderId: userId,
                    conversationId,
                    isGroup: false,
                });
            }
        }
    });

    socket.on("mark-seen", async ({ senderId, receiverId, isGroup, groupId }) => {
        if (isGroup || groupId) {
            const targetGroupId = groupId || senderId;
            const viewingUserId = receiverId || userId;
            if (targetGroupId && viewingUserId) {
                try {
                    await Message.updateMany(
                        {
                            conversationId: targetGroupId,
                            senderId: { $ne: viewingUserId },
                            "readBy.userId": { $ne: viewingUserId },
                        },
                        {
                            $push: {
                                readBy: { userId: viewingUserId, readAt: new Date() },
                            },
                        },
                    );
                } catch (err) {
                    console.error("Error updating group readBy in mark-seen socket:", err);
                }
            }
            socket.broadcast.emit("groupMessagesSeen", {
                conversationId: targetGroupId,
                seenBy: viewingUserId,
            });
        } else {
            const target = getReceiverSocketId(senderId);
            if (target) {
                io.to(target).emit("messagesSeen", { seenBy: receiverId || userId });
            }
        }
    });

    socket.on("mark-group-seen", async ({ groupId, userId: seenUserId }) => {
        const viewingUserId = seenUserId || userId;
        if (groupId && viewingUserId) {
            try {
                await Message.updateMany(
                    {
                        conversationId: groupId,
                        senderId: { $ne: viewingUserId },
                        "readBy.userId": { $ne: viewingUserId },
                    },
                    {
                        $push: {
                            readBy: { userId: viewingUserId, readAt: new Date() },
                        },
                    },
                );
            } catch (err) {
                console.error("Error updating group readBy in mark-group-seen socket:", err);
            }
        }
        socket.broadcast.emit("groupMessagesSeen", {
            conversationId: groupId,
            seenBy: viewingUserId,
        });
    });

    // Disconnect handler
    socket.on("disconnect", async () => {
        console.log("A user disconnected:", socket.id);
        if (userId) {
            await setUserOffline(userId, socket.id);
        }
        const updatedOnlineUsers = await getAllOnlineUserIds();
        io.emit("getOnlineUsers", updatedOnlineUsers);
    });
});

export { app, io, server };
