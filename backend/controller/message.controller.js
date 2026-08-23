import mongoose from "mongoose";
import Conversation from "../model/conversation.model.js";
import GroupMember from "../model/groupMember.model.js";
import Message from "../model/message.model.js";
import User from "../model/user.model.js";
import { getReceiverSocketId, io } from "../SocketIO/socketServer.js";
import {
    uploadToCloudinary,
    deleteFromCloudinary,
    isCloudinaryConfigured,
    CLOUDINARY_FOLDERS,
} from "../utils/cloudinary.js";

export const sendMessage = async (req, res) => {
    try {
        const { message, messageType, attachmentUrl } = req.body;
        const { id: targetId } = req.params;
        const senderId = req.user._id;

        // ── Text Validation ───────────────────────────────────────────────────
        if (message !== undefined && message !== null && typeof message !== "string") {
            return res.status(400).json({ error: "Message must be a string" });
        }

        const rawMessage = typeof message === "string" ? message : "";

        // Collect any attached files from Multer
        const files = [];
        if (req.file) {
            files.push(req.file);
        } else if (req.files) {
            if (Array.isArray(req.files)) {
                files.push(...req.files);
            } else if (typeof req.files === "object") {
                if (req.files.image) files.push(...req.files.image);
                if (req.files.images) files.push(...req.files.images);
            }
        }

        if (files.length > 5) {
            return res.status(400).json({ error: "Maximum 5 images allowed per upload." });
        }

        const isMedia =
            files.length > 0 ||
            Boolean(attachmentUrl) ||
            messageType === "image" ||
            messageType === "file" ||
            messageType === "call";

        // Reject empty or whitespace-only text messages
        if (!isMedia && rawMessage.trim().length === 0) {
            return res.status(400).json({ error: "Message cannot be empty" });
        }

        // Reject messages exceeding maximum character limit (4,000 characters)
        if (rawMessage.length > 4000) {
            return res.status(400).json({
                error: "Message exceeds maximum allowed length of 4000 characters",
                currentLength: rawMessage.length,
                maxLength: 4000,
            });
        }

        let conversation = null;
        let isGroupChat = false;

        // Check if targetId is an existing Group Conversation
        conversation = await Conversation.findOne({ _id: targetId, isGroup: true });

        if (conversation) {
            isGroupChat = true;
        } else {
            // 1-on-1 direct conversation
            conversation = await Conversation.findOne({
                isGroup: { $ne: true },
                members: { $all: [senderId, targetId] },
            });

            if (!conversation) {
                conversation = await Conversation.create({
                    isGroup: false,
                    members: [senderId, targetId],
                });
            }
        }

        let initialStatus = "sent";
        if (!isGroupChat) {
            const receiverSocketId = getReceiverSocketId(targetId);
            if (receiverSocketId) {
                initialStatus = "delivered";
            }
        }

        // ── Branch A: Files uploaded via Multer (1 to 5 images) ────────────────
        if (files.length > 0) {
            if (!isCloudinaryConfigured()) {
                return res.status(503).json({ error: "Cloudinary service is not configured on the server." });
            }

            const uploadedAssets = [];
            try {
                for (const file of files) {
                    const uploadResult = await uploadToCloudinary(file, {
                        folder: CLOUDINARY_FOLDERS.CHAT_MEDIA,
                    });
                    uploadedAssets.push(uploadResult);
                }
            } catch (uploadError) {
                console.error("Cloudinary upload error in sendMessage:", uploadError);
                // Clean up any successfully uploaded assets before error
                if (uploadedAssets.length > 0) {
                    await Promise.allSettled(uploadedAssets.map((a) => deleteFromCloudinary(a.public_id)));
                }
                return res.status(400).json({ error: uploadError.message || "Failed to upload image attachment" });
            }

            const attachments = uploadedAssets.map((asset) => ({
                url: asset.secure_url,
                publicId: asset.public_id,
                size: asset.bytes || asset.size || null,
                width: asset.width || null,
                height: asset.height || null,
            }));

            const primaryAsset = uploadedAssets[0];
            const newMessage = new Message({
                senderId,
                receiverId: isGroupChat ? null : targetId,
                conversationId: conversation._id,
                message: rawMessage,
                messageType: "image",
                attachmentUrl: primaryAsset.secure_url,
                attachmentPublicId: primaryAsset.public_id,
                attachmentSize: primaryAsset.bytes || primaryAsset.size || null,
                attachmentWidth: primaryAsset.width || null,
                attachmentHeight: primaryAsset.height || null,
                attachments,
                status: initialStatus,
            });

            try {
                await newMessage.save();
            } catch (dbError) {
                console.error("MongoDB save error for message attachments:", dbError);
                await Promise.allSettled(uploadedAssets.map((a) => deleteFromCloudinary(a.public_id)));
                throw dbError;
            }

            // Update conversation with the last saved message snapshot
            const snippetText = newMessage.message || (attachments.length > 1 ? `📷 ${attachments.length} Photos` : "📷 Photo");
            await Conversation.findByIdAndUpdate(conversation._id, {
                $set: {
                    "lastMessage.text": snippetText,
                    "lastMessage.messageType": newMessage.messageType,
                    "lastMessage.senderId": newMessage.senderId,
                    "lastMessage.status": newMessage.status,
                    "lastMessage.createdAt": newMessage.createdAt,
                },
            });

            // Populate sender info for the saved message
            const populatedMessage = await Message.findById(newMessage._id).populate({
                path: "senderId",
                select: "fullname uid avatar",
            });

            // Broadcast message via Socket.IO
            if (isGroupChat) {
                GroupMember.find({ conversationId: conversation._id, removedAt: null })
                    .select("userId")
                    .then((activeMembers) => {
                        activeMembers.forEach((gm) => {
                            if (gm.userId && gm.userId.toString() !== senderId.toString()) {
                                const recipientSocketId = getReceiverSocketId(gm.userId.toString());
                                if (recipientSocketId) {
                                    io.to(recipientSocketId).emit("newMessage", populatedMessage);
                                }
                            }
                        });
                    })
                    .catch((err) => console.error("Error broadcasting group socket:", err));
            } else {
                const receiverSocketId = getReceiverSocketId(targetId);
                if (receiverSocketId) {
                    io.to(receiverSocketId).emit("newMessage", populatedMessage);
                }
            }

            return res.status(201).json(populatedMessage);
        }

        // ── Branch B: Legacy base64 / string attachment or text-only message ───
        let finalAttachmentUrl = attachmentUrl || "";
        let finalAttachmentPublicId = "";
        let attachmentSize = null;
        let attachmentWidth = null;
        let attachmentHeight = null;
        let newlyUploadedPublicId = null;

        if (attachmentUrl && typeof attachmentUrl === "string" && attachmentUrl.startsWith("data:")) {
            if (!isCloudinaryConfigured()) {
                return res.status(503).json({ error: "Cloudinary service is not configured on the server." });
            }
            try {
                const uploadResult = await uploadToCloudinary(attachmentUrl, {
                    folder: CLOUDINARY_FOLDERS.CHAT_MEDIA,
                });
                finalAttachmentUrl = uploadResult.secure_url;
                finalAttachmentPublicId = uploadResult.public_id;
                newlyUploadedPublicId = uploadResult.public_id;
                attachmentSize = uploadResult.bytes || uploadResult.size || null;
                attachmentWidth = uploadResult.width || null;
                attachmentHeight = uploadResult.height || null;
            } catch (uploadError) {
                console.error("Cloudinary upload error in sendMessage:", uploadError);
                return res.status(400).json({ error: uploadError.message || "Failed to upload image attachment" });
            }
        }

        const newMessage = new Message({
            senderId,
            receiverId: isGroupChat ? null : targetId,
            conversationId: conversation._id,
            message: rawMessage,
            messageType: messageType || (finalAttachmentUrl ? "image" : "text"),
            attachmentUrl: finalAttachmentUrl,
            attachmentPublicId: finalAttachmentPublicId,
            attachmentSize,
            attachmentWidth,
            attachmentHeight,
            status: initialStatus,
        });

        try {
            await newMessage.save();
        } catch (dbError) {
            // Clean up newly uploaded asset on DB save error
            if (newlyUploadedPublicId) {
                deleteFromCloudinary(newlyUploadedPublicId).catch(() => {});
            }
            throw dbError;
        }

        // Update conversation with denormalized lastMessage snapshot
        await Conversation.findByIdAndUpdate(conversation._id, {
            $set: {
                "lastMessage.text": newMessage.message || (newMessage.messageType === "image" ? "📷 Photo" : ""),
                "lastMessage.messageType": newMessage.messageType,
                "lastMessage.senderId": newMessage.senderId,
                "lastMessage.status": newMessage.status,
                "lastMessage.createdAt": newMessage.createdAt,
            },
        });

        const populatedMessage = await Message.findById(newMessage._id).populate({
            path: "senderId",
            select: "fullname uid avatar",
        });

        if (isGroupChat) {
            const activeMembers = await GroupMember.find({
                conversationId: conversation._id,
                removedAt: null,
            }).select("userId");

            activeMembers.forEach((gm) => {
                if (gm.userId && gm.userId.toString() !== senderId.toString()) {
                    const recipientSocketId = getReceiverSocketId(gm.userId.toString());
                    if (recipientSocketId) {
                        io.to(recipientSocketId).emit("newMessage", populatedMessage);
                    }
                }
            });
        } else {
            const receiverSocketId = getReceiverSocketId(targetId);
            if (receiverSocketId) {
                io.to(receiverSocketId).emit("newMessage", populatedMessage);
            }
        }

        res.status(201).json(populatedMessage);
    } catch (error) {
        console.log("Error in sendMessage controller: ", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

// GET /api/message/get/:id?before=<messageId>&limit=<n>
// Cursor-based pagination — loads the most recent `limit` messages.
// Pass `before` (a message ObjectId) to fetch the next older page.
export const getMessage = async (req, res) => {
    try {
        const { id: targetId } = req.params;
        const senderId = req.user._id;
        const limit = Math.min(parseInt(req.query.limit) || 30, 100); // default 30, max 100
        const before = req.query.before || null;
        const after = req.query.after || null;
        const until = req.query.until || null;
        const isInitialLoad = !before && !after;

        // Resolve the conversation (group or 1-on-1)
        let conversation = await Conversation.findOne({ _id: targetId, isGroup: true });
        if (!conversation) {
            conversation = await Conversation.findOne({
                isGroup: { $ne: true },
                members: { $all: [senderId, targetId] },
            });
        }

        if (!conversation) {
            return res.status(200).json({ messages: [], hasMore: false });
        }

        // Build cursor filter — return ALL messages including soft-deleted ones
        // so pagination cursors, date separators, and scroll anchors are never broken.
        // Deletion is a CONTENT/STATE dimension, not a position dimension.
        // The isDeletedForMe annotation is applied after fetch (see below).
        const cursorFilter = {
            conversationId: conversation._id,
        };

        if (before) {
            const cursorMsg = await Message.findById(before).select("createdAt _id").lean();

            if (cursorMsg) {
                cursorFilter.$or = [
                    {
                        createdAt: { $lt: cursorMsg.createdAt },
                    },
                    {
                        createdAt: cursorMsg.createdAt,
                        _id: { $lt: cursorMsg._id },
                    },
                ];
            }
        }

        if (after) {
            const cursorMsg = await Message.findById(after).select("createdAt _id").lean();

            if (cursorMsg) {
                const afterCondition = [
                    {
                        createdAt: { $gt: cursorMsg.createdAt },
                    },
                    {
                        createdAt: cursorMsg.createdAt,
                        _id: { $gt: cursorMsg._id },
                    },
                ];

                if (until) {
                    const untilMsg = await Message.findById(until).select("createdAt _id").lean();

                    if (untilMsg) {
                        cursorFilter.$and = [
                            {
                                $or: afterCondition,
                            },
                            {
                                $or: [
                                    {
                                        createdAt: { $lt: untilMsg.createdAt },
                                    },
                                    {
                                        createdAt: untilMsg.createdAt,
                                        _id: { $lte: untilMsg._id },
                                    },
                                ],
                            },
                        ];
                    } else {
                        cursorFilter.$or = afterCondition;
                    }
                } else {
                    cursorFilter.$or = afterCondition;
                }
            }
        }

        // Find unread messages for the current user.
        // IMPORTANT: Do this BEFORE markMessagesAsSeen() is called.
        let unreadCount = 0;
        let firstUnreadMessageId = null;
        let firstUnreadCreatedAt = null;

        let lastUnreadMessageId = null;
        let lastUnreadCreatedAt = null;

        if (conversation.isGroup) {
            const unreadFilter = {
                conversationId: conversation._id,
                senderId: { $ne: senderId },
                "readBy.userId": { $ne: senderId },
            };

            unreadCount = await Message.countDocuments(unreadFilter);

            if (unreadCount > 0) {
                const firstUnreadMessage = await Message.findOne(unreadFilter).sort({ createdAt: 1, _id: 1 }).select("_id createdAt").lean();

                firstUnreadMessageId = firstUnreadMessage?._id || null;
                firstUnreadCreatedAt = firstUnreadMessage?.createdAt || null;

                const lastUnreadMessage = await Message.findOne(unreadFilter).sort({ createdAt: -1, _id: -1 }).select("_id createdAt").lean();

                lastUnreadMessageId = lastUnreadMessage?._id || null;
                lastUnreadCreatedAt = lastUnreadMessage?.createdAt || null;
            }
        } else {
            const unreadFilter = {
                conversationId: conversation._id,
                senderId: { $ne: senderId },
                status: { $ne: "seen" },
            };

            unreadCount = await Message.countDocuments(unreadFilter);

            if (unreadCount > 0) {
                const firstUnreadMessage = await Message.findOne(unreadFilter).sort({ createdAt: 1, _id: 1 }).select("_id createdAt").lean();

                firstUnreadMessageId = firstUnreadMessage?._id || null;
                firstUnreadCreatedAt = firstUnreadMessage?.createdAt || null;

                const lastUnreadMessage = await Message.findOne(unreadFilter).sort({ createdAt: -1, _id: -1 }).select("_id createdAt").lean();

                lastUnreadMessageId = lastUnreadMessage?._id || null;
                lastUnreadCreatedAt = lastUnreadMessage?.createdAt || null;
            }
        }

        let messages = [];
        let hasMore = false;
        let hasMoreAfter = false;

        if (isInitialLoad) {
            const INITIAL_WINDOW_SIZE = 30;
            const MIN_OLDER_CONTEXT = 10;

            if (firstUnreadMessageId && firstUnreadCreatedAt) {
                const unreadMessagesToLoad = Math.min(unreadCount, INITIAL_WINDOW_SIZE - MIN_OLDER_CONTEXT);

                const olderContextToLoad = INITIAL_WINDOW_SIZE - unreadMessagesToLoad;

                const olderContext = await Message.find({
                    ...cursorFilter,
                    $or: [
                        {
                            createdAt: { $lt: firstUnreadCreatedAt },
                        },
                        {
                            createdAt: firstUnreadCreatedAt,
                            _id: { $lt: firstUnreadMessageId },
                        },
                    ],
                })
                    .sort({ createdAt: -1, _id: -1 })
                    .limit(olderContextToLoad)
                    .populate({ path: "senderId", select: "fullname uid avatar" })
                    .populate({ path: "reactions.userId", select: "fullname uid avatar" })
                    .populate({ path: "readBy.userId", select: "fullname uid avatar" })
                    .lean();

                const unreadWindow = await Message.find({
                    ...cursorFilter,
                    $or: [
                        {
                            createdAt: { $gt: firstUnreadCreatedAt },
                        },
                        {
                            createdAt: firstUnreadCreatedAt,
                            _id: { $gte: firstUnreadMessageId },
                        },
                    ],
                    senderId: { $ne: senderId },
                    ...(conversation.isGroup ? { "readBy.userId": { $ne: senderId } } : { status: { $ne: "seen" } }),
                })
                    .sort({ createdAt: 1, _id: 1 })
                    .limit(unreadMessagesToLoad)
                    .populate({ path: "senderId", select: "fullname uid avatar" })
                    .populate({ path: "reactions.userId", select: "fullname uid avatar" })
                    .populate({ path: "readBy.userId", select: "fullname uid avatar" })
                    .lean();

                messages = [...olderContext.reverse(), ...unreadWindow];

                if (olderContext.length > 0) {
                    const oldestLoadedMessage = olderContext[olderContext.length - 1];

                    const olderMessageExists = await Message.exists({
                        ...cursorFilter,
                        $or: [
                            {
                                createdAt: { $lt: oldestLoadedMessage.createdAt },
                            },
                            {
                                createdAt: oldestLoadedMessage.createdAt,
                                _id: { $lt: oldestLoadedMessage._id },
                            },
                        ],
                    });

                    hasMore = Boolean(olderMessageExists);
                } else {
                    hasMore = false;
                }
            } else {
                const rawMessages = await Message.find(cursorFilter)
                    .sort({ createdAt: -1, _id: -1 })
                    .limit(limit + 1)
                    .populate({ path: "senderId", select: "fullname uid avatar" })
                    .populate({ path: "reactions.userId", select: "fullname uid avatar" })
                    .populate({ path: "readBy.userId", select: "fullname uid avatar" })
                    .lean();

                hasMore = rawMessages.length > limit;

                messages = hasMore ? rawMessages.slice(0, limit) : rawMessages;

                messages.reverse();
            }
        } else if (before) {
            const rawMessages = await Message.find(cursorFilter)
                .sort({ createdAt: -1, _id: -1 })
                .limit(limit + 1)
                .populate({ path: "senderId", select: "fullname uid avatar" })
                .populate({ path: "reactions.userId", select: "fullname uid avatar" })
                .populate({ path: "readBy.userId", select: "fullname uid avatar" })
                .lean();

            hasMore = rawMessages.length > limit;

            messages = hasMore ? rawMessages.slice(0, limit) : rawMessages;

            messages.reverse();
        } else if (after) {
            const rawMessages = await Message.find(cursorFilter)
                .sort({ createdAt: 1, _id: 1 })
                .limit(limit + 1)
                .populate({ path: "senderId", select: "fullname uid avatar" })
                .populate({ path: "reactions.userId", select: "fullname uid avatar" })
                .populate({ path: "readBy.userId", select: "fullname uid avatar" })
                .lean();

            hasMoreAfter = rawMessages.length > limit;

            messages = hasMoreAfter ? rawMessages.slice(0, limit) : rawMessages;
        }

        if (isInitialLoad && messages.length > 0) {
            const newestLoadedMessage = messages[messages.length - 1];

            const newerMessageExists = await Message.exists({
                ...cursorFilter,
                $or: [
                    {
                        createdAt: { $gt: newestLoadedMessage.createdAt },
                    },
                    {
                        createdAt: newestLoadedMessage.createdAt,
                        _id: { $gt: newestLoadedMessage._id },
                    },
                ],
            });

            hasMoreAfter = Boolean(newerMessageExists);
        }

        // Annotate each message with isDeletedForMe (computed from deletedFor[]).
        // This avoids sending the full deletedFor array to every client.
        const senderIdStr = String(senderId);
        messages = messages.map((msg) => ({
            ...msg,
            isDeletedForMe: Array.isArray(msg.deletedFor)
                ? msg.deletedFor.map((id) => String(id)).includes(senderIdStr)
                : false,
        }));

        res.status(200).json({
            messages,
            hasMore,
            hasMoreBefore: hasMore,
            hasMoreAfter,
            unreadCount,
            firstUnreadMessageId,
            lastUnreadMessageId,
        });
    } catch (error) {
        console.log("Error in getMessage controller: ", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const markMessagesAsSeen = async (req, res) => {
    try {
        const { id: targetId } = req.params;
        const userId = req.user._id;

        // Check if target is a group conversation
        const groupConv = await Conversation.findOne({ _id: targetId, isGroup: true });

        if (groupConv) {
            // Group Read Tracking: push { userId, readAt } for active group messages
            await Message.updateMany(
                {
                    conversationId: groupConv._id,
                    senderId: { $ne: userId },
                    "readBy.userId": { $ne: userId },
                },
                {
                    $push: {
                        readBy: { userId, readAt: new Date() },
                    },
                },
            );

            // Notify all active group members via Socket.IO
            const activeMembers = await GroupMember.find({
                conversationId: groupConv._id,
                removedAt: null,
            }).select("userId");

            activeMembers.forEach((gm) => {
                if (gm.userId && gm.userId.toString() !== userId.toString()) {
                    const recipientSocketId = getReceiverSocketId(gm.userId.toString());
                    if (recipientSocketId) {
                        io.to(recipientSocketId).emit("groupMessagesSeen", {
                            conversationId: groupConv._id,
                            seenBy: userId,
                        });
                    }
                }
            });
        } else {
            const directConversation = await Conversation.findOne({
                isGroup: { $ne: true },
                members: { $all: [userId, targetId] },
            });

            if (directConversation) {
                await Message.updateMany(
                    {
                        conversationId: directConversation._id,
                        senderId: { $ne: userId },
                        status: { $ne: "seen" },
                    },
                    {
                        $set: { status: "seen" },
                    },
                );

                await Conversation.findByIdAndUpdate(directConversation._id, {
                    $set: {
                        "lastMessage.status": "seen",
                    },
                });

                const otherMember = directConversation.members.find((memberId) => memberId.toString() !== userId.toString());

                if (otherMember) {
                    const senderSocketId = getReceiverSocketId(otherMember.toString());

                    if (senderSocketId) {
                        io.to(senderSocketId).emit("messagesSeen", {
                            seenBy: userId,
                            conversationId: directConversation._id,
                        });
                    }
                }
            }
        }

        res.status(200).json({ message: "Messages marked as seen" });
    } catch (error) {
        console.log("Error in markMessagesAsSeen controller: ", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const getSharedMedia = async (req, res) => {
    try {
        const { id: targetId } = req.params;
        const userId = req.user._id;

        let conversation = await Conversation.findOne({ _id: targetId, isGroup: true });

        if (!conversation) {
            // Direct conversation
            conversation = await Conversation.findOne({
                isGroup: false,
                members: { $all: [userId, targetId] },
            });
        }

        if (!conversation) {
            return res.status(200).json([]);
        }

        // Find all active media messages in this conversation
        const mediaMessages = await Message.find({
            conversationId: conversation._id,
            $or: [
                { attachmentUrl: { $ne: "", $exists: true } },
                { "attachments.0": { $exists: true } },
                { messageType: "image" },
            ],
            deletedForAll: { $ne: true },
            deletedFor: { $nin: [userId] },
        })
            .populate({ path: "senderId", select: "fullname uid avatar" })
            .sort({ createdAt: -1 });

        res.status(200).json(mediaMessages);
    } catch (error) {
        console.log("Error in getSharedMedia controller: ", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

// Toggle Message Reaction
export const toggleReaction = async (req, res) => {
    try {
        const { id: messageId } = req.params;
        const { emoji } = req.body;
        const userId = req.user._id;

        if (!emoji || !emoji.trim()) {
            return res.status(400).json({ error: "Emoji is required" });
        }

        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ error: "Message not found" });
        }

        const existingIndex = message.reactions.findIndex(
            (r) => r.userId.toString() === userId.toString() && r.emoji === emoji.trim()
        );

        if (existingIndex > -1) {
            // Toggle off if same user reacted with same emoji
            message.reactions.splice(existingIndex, 1);
        } else {
            // In WhatsApp, if user already reacted with another emoji, update to new emoji; otherwise push
            const userPrevIndex = message.reactions.findIndex(
                (r) => r.userId.toString() === userId.toString()
            );
            if (userPrevIndex > -1) {
                message.reactions[userPrevIndex].emoji = emoji.trim();
                message.reactions[userPrevIndex].createdAt = new Date();
            } else {
                message.reactions.push({
                    emoji: emoji.trim(),
                    userId,
                    createdAt: new Date(),
                });
            }
        }

        await message.save();

        const populatedMessage = await Message.findById(message._id)
            .populate({ path: "senderId", select: "fullname uid avatar" })
            .populate({ path: "reactions.userId", select: "fullname uid avatar" });

        // Broadcast reaction update
        const conversation = await Conversation.findById(message.conversationId);
        if (conversation) {
            if (conversation.isGroup) {
                const activeMembers = await GroupMember.find({
                    conversationId: conversation._id,
                    removedAt: null,
                }).select("userId");

                activeMembers.forEach((gm) => {
                    const socketId = getReceiverSocketId(gm.userId.toString());
                    if (socketId) {
                        io.to(socketId).emit("messageReactionUpdated", populatedMessage);
                    }
                });
            } else {
                conversation.members.forEach((mId) => {
                    const socketId = getReceiverSocketId(mId.toString());
                    if (socketId) {
                        io.to(socketId).emit("messageReactionUpdated", populatedMessage);
                    }
                });
            }
        }

        res.status(200).json(populatedMessage);
    } catch (error) {
        console.error("Error in toggleReaction controller:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * Helper to safely delete Cloudinary assets for messages that are no longer needed by ANY participant.
 * Condition:
 *   - Message has a non-empty attachmentPublicId, AND
 *   - Message is marked deletedForAll === true, OR all active conversation participants are in deletedFor[]
 *
 * @param {Array|Object} messages - Single message document/object or array of message documents/objects
 */
export const cleanOrphanedMessageAssets = async (messages) => {
    try {
        const msgList = Array.isArray(messages) ? messages : [messages];
        const publicIdsToDelete = new Set();

        for (const msg of msgList) {
            if (!msg || !msg.attachmentPublicId || typeof msg.attachmentPublicId !== "string" || !msg.attachmentPublicId.trim()) {
                continue;
            }

            // Case 1: Deleted for everyone
            if (msg.deletedForAll) {
                publicIdsToDelete.add(msg.attachmentPublicId.trim());
                continue;
            }

            // Case 2: Deleted for me by all participants
            if (!msg.conversationId) continue;

            const conversation = await Conversation.findById(msg.conversationId).select("isGroup members").lean();
            if (!conversation) continue;

            const deletedForStrings = new Set((msg.deletedFor || []).map((id) => id.toString()));

            let allParticipantsDeleted = false;
            if (conversation.isGroup) {
                const activeMembers = await GroupMember.find({
                    conversationId: conversation._id,
                    removedAt: null,
                }).select("userId").lean();

                if (activeMembers.length > 0) {
                    allParticipantsDeleted = activeMembers.every((m) =>
                        deletedForStrings.has(m.userId.toString())
                    );
                }
            } else {
                // 1-on-1 direct conversation
                const members = conversation.members && conversation.members.length > 0
                    ? conversation.members
                    : [msg.senderId, msg.receiverId].filter(Boolean);

                if (members.length > 0) {
                    allParticipantsDeleted = members.every((mId) =>
                        deletedForStrings.has(mId.toString())
                    );
                }
            }

            if (allParticipantsDeleted) {
                publicIdsToDelete.add(msg.attachmentPublicId.trim());
            }
        }

        if (publicIdsToDelete.size > 0) {
            await Promise.allSettled(
                [...publicIdsToDelete].map((publicId) =>
                    deleteFromCloudinary(publicId).catch((err) => {
                        console.error(`Failed to delete Cloudinary message asset (${publicId}):`, err);
                    })
                )
            );
        }
    } catch (err) {
        console.error("Error in cleanOrphanedMessageAssets helper:", err);
    }
};

// Soft delete: Hide message for current user only
export const deleteMessageForMe = async (req, res) => {
    try {
        const { id: messageId } = req.params;
        const userId = req.user._id;

        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ error: "Message not found" });
        }

        // Verify the caller is an active member of this conversation
        const conversation = await Conversation.findById(message.conversationId);
        if (!conversation) {
            return res.status(404).json({ error: "Conversation not found" });
        }

        const isMember = conversation.isGroup
            ? await GroupMember.exists({
                  conversationId: conversation._id,
                  userId,
                  removedAt: null,
              })
            : conversation.members.map(String).includes(String(userId));

        if (!isMember) {
            return res.status(403).json({ error: "Not a member of this conversation" });
        }

        // Idempotent push — only add if not already in the array
        if (!message.deletedFor.map((id) => id.toString()).includes(userId.toString())) {
            message.deletedFor.push(userId);
            await message.save();
        }

        // Trigger Cloudinary cleanup if ALL participants have deleted this message
        if (message.attachmentPublicId) {
            cleanOrphanedMessageAssets(message).catch((err) => {
                console.error("Error cleaning up orphaned message asset in deleteMessageForMe:", err);
            });
        }

        // If this was the conversation's denormalized lastMessage, update the sidebar
        // preview text for the deleting user's perspective.
        const lastMsgCreatedAt = conversation.lastMessage?.createdAt
            ? new Date(conversation.lastMessage.createdAt).getTime()
            : 0;
        const thisMsgCreatedAt = new Date(message.createdAt).getTime();

        if (thisMsgCreatedAt >= lastMsgCreatedAt) {
            // Handled on client side for Delete for Me
        }

        res.status(200).json({ messageId, deletedFor: message.deletedFor });
    } catch (error) {
        console.error("Error in deleteMessageForMe controller:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

// Soft delete: Delete message for everyone (sender only)
export const deleteMessageForEveryone = async (req, res) => {
    try {
        const { id: messageId } = req.params;
        const userId = req.user._id;

        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ error: "Message not found" });
        }

        // Permission: only the original sender may delete for everyone
        if (message.senderId.toString() !== userId.toString()) {
            return res.status(403).json({ error: "Only the sender can delete this message for everyone" });
        }

        // Verify the caller is still an active member of this conversation
        const conversation = await Conversation.findById(message.conversationId);
        if (!conversation) {
            return res.status(404).json({ error: "Conversation not found" });
        }

        const isMember = conversation.isGroup
            ? await GroupMember.exists({
                  conversationId: conversation._id,
                  userId,
                  removedAt: null,
              })
            : conversation.members.map(String).includes(String(userId));

        if (!isMember) {
            return res.status(403).json({ error: "Not a member of this conversation" });
        }

        // Idempotent: if already deleted for all, still return success
        if (!message.deletedForAll) {
            message.deletedForAll = true;
            await message.save();
        }

        // Delete asset from Cloudinary
        if (message.attachmentPublicId) {
            deleteFromCloudinary(message.attachmentPublicId).catch((delErr) => {
                console.error("Failed to delete Cloudinary asset in deleteMessageForEveryone:", delErr);
            });
        }

        // If this was the conversation's denormalized lastMessage, update it
        // globally so the sidebar shows "This message was deleted" after refresh.
        const lastMsgCreatedAt = conversation.lastMessage?.createdAt
            ? new Date(conversation.lastMessage.createdAt).getTime()
            : 0;
        const thisMsgCreatedAt = new Date(message.createdAt).getTime();

        if (thisMsgCreatedAt >= lastMsgCreatedAt) {
            await Conversation.findByIdAndUpdate(conversation._id, {
                $set: {
                    "lastMessage.text": "This message was deleted",
                    "lastMessage.messageType": "text",
                },
            });
        }

        // Broadcast deletion via Socket.IO to all conversation members
        if (conversation.isGroup) {
            const activeMembers = await GroupMember.find({
                conversationId: conversation._id,
                removedAt: null,
            }).select("userId");

            activeMembers.forEach((gm) => {
                const socketId = getReceiverSocketId(gm.userId.toString());
                if (socketId) {
                    io.to(socketId).emit("messageDeletedForEveryone", {
                        messageId,
                        conversationId: conversation._id,
                    });
                }
            });
        } else {
            conversation.members.forEach((mId) => {
                const socketId = getReceiverSocketId(mId.toString());
                if (socketId) {
                    io.to(socketId).emit("messageDeletedForEveryone", {
                        messageId,
                        conversationId: conversation._id,
                    });
                }
            });
        }

        res.status(200).json({ messageId, deletedForAll: true });
    } catch (error) {
        console.error("Error in deleteMessageForEveryone controller:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

// ─── Bulk: Hide messages for current user only ────────────────────────────────
export const bulkDeleteForMe = async (req, res) => {
    try {
        const userId = req.user._id;
        const { messageIds } = req.body;

        // Input validation
        if (!Array.isArray(messageIds) || messageIds.length === 0) {
            return res.status(400).json({ error: "messageIds must be a non-empty array" });
        }
        if (messageIds.length > 100) {
            return res.status(400).json({ error: "Cannot delete more than 100 messages at once" });
        }

        // Fetch all requested messages in a single query
        const messages = await Message.find({ _id: { $in: messageIds } }).select("_id conversationId").lean();

        const membershipCache = new Map();

        const checkMembership = async (conversationId) => {
            const key = String(conversationId);
            if (membershipCache.has(key)) return membershipCache.get(key);

            const conversation = await Conversation.findById(conversationId).select("isGroup members").lean();
            if (!conversation) {
                membershipCache.set(key, false);
                return false;
            }

            let isMember;
            if (conversation.isGroup) {
                isMember = Boolean(
                    await GroupMember.exists({ conversationId, userId, removedAt: null }),
                );
            } else {
                isMember = conversation.members.map(String).includes(String(userId));
            }

            membershipCache.set(key, isMember);
            return isMember;
        };

        const requestedIds = new Set(messageIds.map(String));
        const foundIds = new Set(messages.map((m) => String(m._id)));

        const deletedIds = [];
        const failedIds = [];

        for (const id of requestedIds) {
            if (!foundIds.has(id)) {
                failedIds.push({ id, reason: "not_found" });
            }
        }

        const allowedIds = [];
        for (const msg of messages) {
            const allowed = await checkMembership(msg.conversationId);
            if (allowed) {
                allowedIds.push(msg._id);
                deletedIds.push(String(msg._id));
            } else {
                failedIds.push({ id: String(msg._id), reason: "not_member" });
            }
        }

        // Single atomic updateMany — $addToSet is idempotent
        if (allowedIds.length > 0) {
            await Message.updateMany(
                { _id: { $in: allowedIds } },
                { $addToSet: { deletedFor: userId } },
            );

            // Trigger cleanup for media messages where all participants have now deleted
            const mediaMsgs = await Message.find({
                _id: { $in: allowedIds },
                attachmentPublicId: { $ne: "", $exists: true },
            }).lean();

            if (mediaMsgs.length > 0) {
                cleanOrphanedMessageAssets(mediaMsgs).catch((err) => {
                    console.error("Error in cleanOrphanedMessageAssets after bulkDeleteForMe:", err);
                });
            }
        }

        res.status(200).json({ deletedIds, failedIds });
    } catch (error) {
        console.error("Error in bulkDeleteForMe controller:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

// ─── Bulk: Delete messages for everyone (sender only) ────────────────────────
export const bulkDeleteForEveryone = async (req, res) => {
    try {
        const userId = req.user._id;
        const { messageIds } = req.body;

        // Input validation
        if (!Array.isArray(messageIds) || messageIds.length === 0) {
            return res.status(400).json({ error: "messageIds must be a non-empty array" });
        }
        if (messageIds.length > 100) {
            return res.status(400).json({ error: "Cannot delete more than 100 messages at once" });
        }

        // Fetch all requested messages
        const messages = await Message.find({ _id: { $in: messageIds } })
            .select("_id senderId conversationId createdAt deletedForAll attachmentPublicId")
            .lean();

        const notMine = messages.filter((m) => String(m.senderId) !== String(userId));
        if (notMine.length > 0) {
            return res.status(403).json({
                error: "You can only delete your own messages for everyone",
                unauthorizedIds: notMine.map((m) => String(m._id)),
            });
        }

        const alreadyDeleted = messages.filter((m) => Boolean(m.deletedForAll));
        if (alreadyDeleted.length > 0) {
            return res.status(400).json({
                error: "One or more messages are already deleted for everyone",
                alreadyDeletedIds: alreadyDeleted.map((m) => String(m._id)),
            });
        }

        const foundIds = new Set(messages.map((m) => String(m._id)));
        const missingIds = messageIds.filter((id) => !foundIds.has(String(id)));
        if (missingIds.length > 0) {
            return res.status(404).json({
                error: "One or more messages were not found",
                missingIds,
            });
        }

        const membershipCache = new Map();

        const checkMembership = async (conversationId) => {
            const key = String(conversationId);
            if (membershipCache.has(key)) return membershipCache.get(key);

            const conversation = await Conversation.findById(conversationId)
                .select("isGroup members")
                .lean();
            if (!conversation) {
                membershipCache.set(key, false);
                return false;
            }

            let isMember;
            if (conversation.isGroup) {
                isMember = Boolean(
                    await GroupMember.exists({ conversationId, userId, removedAt: null }),
                );
            } else {
                isMember = conversation.members.map(String).includes(String(userId));
            }

            membershipCache.set(key, isMember);
            return isMember;
        };

        for (const msg of messages) {
            const allowed = await checkMembership(msg.conversationId);
            if (!allowed) {
                return res.status(403).json({
                    error: "Not a member of the conversation for one or more messages",
                    messageId: String(msg._id),
                });
            }
        }

        // All checks passed — apply soft-delete
        const idsToDelete = messages.map((m) => m._id);
        await Message.updateMany(
            { _id: { $in: idsToDelete }, deletedForAll: { $ne: true } },
            { $set: { deletedForAll: true } },
        );

        // Delete all unique Cloudinary assets for the deleted batch
        const publicIdsToDelete = [
            ...new Set(
                messages
                    .map((m) => m.attachmentPublicId)
                    .filter((pId) => typeof pId === "string" && pId.trim())
            ),
        ];

        if (publicIdsToDelete.length > 0) {
            Promise.allSettled(
                publicIdsToDelete.map((pId) =>
                    deleteFromCloudinary(pId).catch((err) => {
                        console.error(`Failed to delete Cloudinary asset (${pId}) in bulkDeleteForEveryone:`, err);
                    })
                )
            );
        }

        const deletedIds = messages.map((m) => String(m._id));

        // ── Update lastMessage per conversation ───────────────────────────────
        //
        // Group deleted messages by conversationId so we only run one DB query
        // per affected conversation.
        //
        const byConversation = new Map(); // conversationId (string) → Message[]
        for (const msg of messages) {
            const key = String(msg.conversationId);
            if (!byConversation.has(key)) byConversation.set(key, []);
            byConversation.get(key).push(msg);
        }

        // For each conversation, check if any deleted message is the current lastMessage.
        // If so, update the denormalized snapshot globally.
        const conversationUpdateResults = new Map(); // conversationId → { lastMessageUpdated, newLastMessageText }

        for (const [convIdStr, convMessages] of byConversation.entries()) {
            const conversation = await Conversation.findById(convIdStr)
                .select("isGroup members lastMessage")
                .lean();
            if (!conversation) {
                conversationUpdateResults.set(convIdStr, {
                    lastMessageUpdated: false,
                    newLastMessageText: null,
                });
                continue;
            }

            const lastMsgCreatedAt = conversation.lastMessage?.createdAt
                ? new Date(conversation.lastMessage.createdAt).getTime()
                : 0;

            // Find the newest of the deleted messages in this conversation
            const newestDeletedTs = Math.max(
                ...convMessages.map((m) => new Date(m.createdAt).getTime()),
            );

            let lastMessageUpdated = false;
            let newLastMessageText = null;

            if (newestDeletedTs >= lastMsgCreatedAt) {
                // The deleted batch includes the current last message — update the snapshot.
                await Conversation.findByIdAndUpdate(convIdStr, {
                    $set: {
                        "lastMessage.text": "This message was deleted",
                        "lastMessage.messageType": "text",
                    },
                });
                lastMessageUpdated = true;
                newLastMessageText = "This message was deleted";
            }

            conversationUpdateResults.set(convIdStr, { lastMessageUpdated, newLastMessageText });
        }

        // ── Socket.IO broadcast per conversation ──────────────────────────────
        //
        // Emit messagesBulkDeletedForEveryone once per affected conversation.
        // Also emit the legacy per-message messageDeletedForEveryone event for
        // any frontend code that already listens to it (backward compatibility).
        //
        for (const [convIdStr, convMessages] of byConversation.entries()) {
            const { lastMessageUpdated, newLastMessageText } =
                conversationUpdateResults.get(convIdStr) || {};

            const convMsgIds = convMessages.map((m) => String(m._id));

            const conversation = await Conversation.findById(convIdStr)
                .select("isGroup members")
                .lean();
            if (!conversation) continue;

            const bulkPayload = {
                messageIds: convMsgIds,
                conversationId: convIdStr,
                lastMessageUpdated: Boolean(lastMessageUpdated),
                newLastMessageText: newLastMessageText || null,
            };

            if (conversation.isGroup) {
                const activeMembers = await GroupMember.find({
                    conversationId: convIdStr,
                    removedAt: null,
                }).select("userId");

                activeMembers.forEach((gm) => {
                    const socketId = getReceiverSocketId(gm.userId.toString());
                    if (socketId) {
                        // New bulk event
                        io.to(socketId).emit("messagesBulkDeletedForEveryone", bulkPayload);
                        // Legacy per-message events (backward compat)
                        convMsgIds.forEach((msgId) => {
                            io.to(socketId).emit("messageDeletedForEveryone", {
                                messageId: msgId,
                                conversationId: convIdStr,
                            });
                        });
                    }
                });
            } else {
                conversation.members.forEach((mId) => {
                    const socketId = getReceiverSocketId(mId.toString());
                    if (socketId) {
                        // New bulk event
                        io.to(socketId).emit("messagesBulkDeletedForEveryone", bulkPayload);
                        // Legacy per-message events (backward compat)
                        convMsgIds.forEach((msgId) => {
                            io.to(socketId).emit("messageDeletedForEveryone", {
                                messageId: msgId,
                                conversationId: convIdStr,
                            });
                        });
                    }
                });
            }
        }

        res.status(200).json({ deletedIds, failedIds: [] });
    } catch (error) {
        console.error("Error in bulkDeleteForEveryone controller:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

// ─── Restore: Undo "Delete for Me" ────────────────────────────────────────────
//
// POST /api/message/restore-delete-me
// Body: { messageIds: string[] }
//
// Used exclusively by the 5-second Undo flow. When the frontend's Undo button
// is clicked within the window, this endpoint removes the caller's userId from
// deletedFor[] so the messages become visible again.
//
// Rules:
//  - Caller must be an active member of each message's conversation.
//  - Uses $pull for an atomic idempotent remove (no-op if userId not present).
//  - Does NOT restore deletedForAll — that flag is controlled by the
//    "delete for everyone" flow and has no Undo path.
//
export const restoreDeleteForMe = async (req, res) => {
    try {
        const userId = req.user._id;
        const { messageIds } = req.body;

        // Input validation
        if (!Array.isArray(messageIds) || messageIds.length === 0) {
            return res.status(400).json({ error: "messageIds must be a non-empty array" });
        }
        if (messageIds.length > 100) {
            return res.status(400).json({ error: "Cannot restore more than 100 messages at once" });
        }

        // Fetch all requested messages
        const messages = await Message.find({ _id: { $in: messageIds } })
            .select("_id conversationId")
            .lean();

        // Membership cache (same pattern as bulkDeleteForMe)
        const membershipCache = new Map();

        const checkMembership = async (conversationId) => {
            const key = String(conversationId);
            if (membershipCache.has(key)) return membershipCache.get(key);

            const conversation = await Conversation.findById(conversationId)
                .select("isGroup members")
                .lean();
            if (!conversation) {
                membershipCache.set(key, false);
                return false;
            }

            let isMember;
            if (conversation.isGroup) {
                isMember = Boolean(
                    await GroupMember.exists({ conversationId, userId, removedAt: null }),
                );
            } else {
                isMember = conversation.members.map(String).includes(String(userId));
            }

            membershipCache.set(key, isMember);
            return isMember;
        };

        const restoredIds = [];
        const failedIds = [];

        // Collect IDs not found in DB
        const foundIds = new Set(messages.map((m) => String(m._id)));
        for (const id of messageIds) {
            if (!foundIds.has(String(id))) {
                failedIds.push({ id, reason: "not_found" });
            }
        }

        // Check membership per message
        const allowedIds = [];
        for (const msg of messages) {
            const allowed = await checkMembership(msg.conversationId);
            if (allowed) {
                allowedIds.push(msg._id);
                restoredIds.push(String(msg._id));
            } else {
                failedIds.push({ id: String(msg._id), reason: "not_member" });
            }
        }

        // Single atomic updateMany — $pull removes userId from deletedFor[] idempotently
        if (allowedIds.length > 0) {
            await Message.updateMany(
                { _id: { $in: allowedIds } },
                { $pull: { deletedFor: userId } },
            );
        }

        res.status(200).json({ restoredIds, failedIds });
    } catch (error) {
        console.error("Error in restoreDeleteForMe controller:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

// ─── User-Scoped Clear Chat (1-to-1 & Group) ──────────────────────────────────
//
// POST /api/message/clear-chat
// Body: { conversationId: string, timeRange: "today" | "week" | "month" | "all" }
//
// Rules:
//  - Authenticated user must belong to Conversation.members (1-to-1) or GroupMember (Group).
//  - Uses $addToSet on deletedFor[] so the operation affects ONLY the authenticated caller.
//  - Other participants' copies, unread counts, and histories remain completely untouched.
//  - Physical Message documents are NEVER deleted.
//  - Time range semantics:
//      - "today": Messages with createdAt >= midnight 00:00:00.000 of the current day.
//      - "week": Messages with createdAt >= Date.now() - (7 * 24 * 60 * 60 * 1000).
//      - "month": Messages with createdAt >= Date.now() - (30 * 24 * 60 * 60 * 1000).
//      - "all": All messages in the conversation (unbounded createdAt).
//
export const clearChat = async (req, res) => {
    try {
        const userId = req.user._id;
        const { conversationId, timeRange = "all" } = req.body;

        if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
            return res.status(400).json({ error: "Valid conversationId is required" });
        }

        const validRanges = ["today", "week", "month", "all"];
        if (!validRanges.includes(timeRange)) {
            return res.status(400).json({ error: "Invalid timeRange. Allowed: today, week, month, all" });
        }

        // 1. Authorization: verify conversation exists and user is a participant
        let conversation = await Conversation.findById(conversationId).select("isGroup members").lean();
        if (!conversation) {
            conversation = await Conversation.findOne({
                isGroup: { $ne: true },
                members: { $all: [userId, conversationId] },
            }).select("isGroup members").lean();
        }
        if (!conversation) {
            return res.status(404).json({ error: "Conversation not found" });
        }

        let isMember;
        if (conversation.isGroup) {
            isMember = Boolean(
                await GroupMember.exists({ conversationId: conversation._id, userId, removedAt: null }),
            );
        } else {
            isMember = conversation.members.map(String).includes(String(userId));
        }

        if (!isMember) {
            return res.status(403).json({ error: "Unauthorized: You are not an active member of this conversation" });
        }

        // 2. Compute date boundary
        let sinceDate = null;
        const now = new Date();
        if (timeRange === "today") {
            sinceDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        } else if (timeRange === "week") {
            sinceDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        } else if (timeRange === "month") {
            sinceDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }

        // 3. Filter messages belonging to this conversation that are not already deleted for this user
        const filter = {
            conversationId: conversation._id,
            deletedFor: { $ne: userId },
        };
        if (sinceDate) {
            filter.createdAt = { $gte: sinceDate };
        }

        // 4. Atomic user-scoped update
        const result = await Message.updateMany(filter, {
            $addToSet: { deletedFor: userId },
        });

        // 5. Clean up any media messages where all participants have now deleted
        const mediaFilter = {
            conversationId: conversation._id,
            attachmentPublicId: { $ne: "", $exists: true },
        };
        if (sinceDate) {
            mediaFilter.createdAt = { $gte: sinceDate };
        }

        const mediaMsgs = await Message.find(mediaFilter).lean();
        if (mediaMsgs.length > 0) {
            cleanOrphanedMessageAssets(mediaMsgs).catch((err) => {
                console.error("Error in cleanOrphanedMessageAssets after clearChat:", err);
            });
        }

        res.status(200).json({
            success: true,
            conversationId: String(conversation._id),
            timeRange,
            sinceDate: sinceDate ? sinceDate.toISOString() : null,
            clearedCount: result.modifiedCount,
        });
    } catch (error) {
        console.error("Error in clearChat controller:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

// ─── User-Scoped Remove Conversation (1-to-1 Only) ────────────────────────────
export const removeConversation = async (req, res) => {
    try {
        const userId = req.user._id;
        const { conversationId, partnerId } = req.body;

        const targetPartnerId = partnerId || (conversationId !== String(userId) ? conversationId : null);

        if (!targetPartnerId || !mongoose.Types.ObjectId.isValid(targetPartnerId)) {
            return res.status(400).json({ error: "Valid partnerId is required" });
        }
        if (String(userId) === String(targetPartnerId)) {
            return res.status(400).json({ error: "Cannot remove conversation with yourself" });
        }

        // 1. Authorization: verify 1-to-1 conversation exists and members match
        let conversation = null;
        if (conversationId && mongoose.Types.ObjectId.isValid(conversationId)) {
            conversation = await Conversation.findById(conversationId).select("isGroup members").lean();
        }
        if (!conversation) {
            conversation = await Conversation.findOne({
                isGroup: { $ne: true },
                members: { $all: [userId, targetPartnerId] },
            }).select("isGroup members").lean();
        }

        if (!conversation) {
            // Even if conversation document doesn't exist yet, pull partner from contacts
            await User.findByIdAndUpdate(userId, {
                $pull: { contacts: targetPartnerId },
            });
            return res.status(200).json({
                success: true,
                conversationId: conversationId ? String(conversationId) : null,
                partnerId: String(targetPartnerId),
                clearedCount: 0,
            });
        }

        if (conversation.isGroup) {
            return res.status(400).json({ error: "Group conversations cannot be removed this way" });
        }

        const isUserMember = conversation.members.map(String).includes(String(userId));
        const isPartnerMember = conversation.members.map(String).includes(String(targetPartnerId));

        if (!isUserMember) {
            return res.status(403).json({ error: "Unauthorized: You are not a member of this conversation" });
        }
        if (!isPartnerMember) {
            return res.status(400).json({ error: "Specified partnerId is not a participant in this conversation" });
        }

        // 2. Mark all messages in this conversation as deletedFor the authenticated user
        const result = await Message.updateMany(
            {
                conversationId: conversation._id,
                deletedFor: { $ne: userId },
            },
            {
                $addToSet: { deletedFor: userId },
            },
        );

        // 3. Clean up any media messages where all participants have now deleted
        const mediaMsgs = await Message.find({
            conversationId: conversation._id,
            attachmentPublicId: { $ne: "", $exists: true },
        }).lean();

        if (mediaMsgs.length > 0) {
            cleanOrphanedMessageAssets(mediaMsgs).catch((err) => {
                console.error("Error in cleanOrphanedMessageAssets after removeConversation:", err);
            });
        }

        // 4. Remove partner from the authenticated user's contacts
        await User.findByIdAndUpdate(userId, {
            $pull: { contacts: targetPartnerId },
        });

        res.status(200).json({
            success: true,
            conversationId: String(conversation._id),
            partnerId: String(targetPartnerId),
            clearedCount: result.modifiedCount,
        });
    } catch (error) {
        console.error("Error in removeConversation controller:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
