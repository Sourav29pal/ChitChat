import Conversation from "../model/conversation.model.js";
import Message from "../model/message.model.js";
import User from "../model/user.model.js";
import { getReceiverSocketId, io } from "../SocketIO/socketServer.js";

const formatDuration = (seconds = 0) => {
    if (!seconds || seconds <= 0) return "";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
};

// Log a call event (completed, missed, declined, unanswered)
export const logCall = async (req, res) => {
    try {
        const {
            receiverId,
            callType = "voice",
            status = "completed",
            duration = 0,
            startedAt,
            answeredAt,
            endedAt,
        } = req.body;
        const senderId = req.user._id;

        if (!receiverId) {
            return res.status(400).json({ error: "receiverId is required" });
        }

        // Server-hardened timestamp and duration normalization
        let finalStartedAt = startedAt ? new Date(startedAt) : null;
        let finalAnsweredAt = answeredAt ? new Date(answeredAt) : null;
        let finalEndedAt = endedAt ? new Date(endedAt) : new Date();

        let finalDuration = Number(duration) || 0;

        if (status === "completed") {
            if (finalAnsweredAt && finalEndedAt && !isNaN(finalAnsweredAt.getTime()) && !isNaN(finalEndedAt.getTime())) {
                const diffSec = Math.round((finalEndedAt.getTime() - finalAnsweredAt.getTime()) / 1000);
                finalDuration = Math.max(0, diffSec);
            }
        } else {
            // For missed, declined, unanswered calls: duration is strictly 0
            finalDuration = 0;
            finalAnsweredAt = null;
        }

        if (!finalStartedAt || isNaN(finalStartedAt.getTime())) {
            finalStartedAt = finalAnsweredAt || finalEndedAt || new Date();
        }

        // Find or create 1-on-1 direct conversation
        let conversation = await Conversation.findOne({
            isGroup: { $ne: true },
            members: { $all: [senderId, receiverId] },
        });

        if (!conversation) {
            conversation = await Conversation.create({
                isGroup: false,
                members: [senderId, receiverId],
            });
        }

        // Build human-readable call summary string
        const durStr = formatDuration(finalDuration);
        let summaryText = "";
        const callLabel = callType === "video" ? "Video call" : "Voice call";

        if (status === "completed" && finalDuration > 0) {
            summaryText = `${callLabel} (${durStr})`;
        } else if (status === "missed") {
            summaryText = `Missed ${callLabel.toLowerCase()}`;
        } else if (status === "declined") {
            summaryText = `Declined ${callLabel.toLowerCase()}`;
        } else {
            summaryText = `${callLabel}`;
        }

        const newCallMessage = new Message({
            senderId,
            receiverId,
            conversationId: conversation._id,
            message: summaryText,
            messageType: "call",
            callDetails: {
                callType,
                status,
                duration: finalDuration,
                startedAt: finalStartedAt,
                answeredAt: finalAnsweredAt,
                endedAt: finalEndedAt,
            },
            status: "delivered",
        });

        await newCallMessage.save();

        const populatedMessage = await Message.findById(newCallMessage._id)
            .populate("senderId", "fullname email uid avatar about")
            .populate("receiverId", "fullname email uid avatar about");

        // Update conversation lastMessage
        conversation.lastMessage = {
            text: summaryText,
            messageType: "call",
            callDetails: {
                callType,
                status,
                duration: finalDuration,
                startedAt: finalStartedAt,
                answeredAt: finalAnsweredAt,
                endedAt: finalEndedAt,
            },
            senderId,
            status: "delivered",
            createdAt: new Date(),
        };
        await conversation.save();

        // Emit real-time socket events to both caller and receiver
        const receiverSocketId = getReceiverSocketId(receiverId.toString());
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("newMessage", populatedMessage);
        }

        const senderSocketId = getReceiverSocketId(senderId.toString());
        if (senderSocketId) {
            io.to(senderSocketId).emit("newMessage", populatedMessage);
        }

        return res.status(201).json(populatedMessage);
    } catch (error) {
        console.error("Error in logCall controller:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

// Fetch call history logs for the current authenticated user
export const getCallHistory = async (req, res) => {
    try {
        const myId = req.user._id;

        const calls = await Message.find({
            messageType: "call",
            $or: [{ senderId: myId }, { receiverId: myId }],
            deletedFor: { $ne: myId },
            deletedForAll: { $ne: true },
        })
            .populate("senderId", "fullname email uid avatar about")
            .populate("receiverId", "fullname email uid avatar about")
            .sort({ createdAt: -1 })
            .limit(100);

        return res.status(200).json({ calls });
    } catch (error) {
        console.error("Error in getCallHistory controller:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

// Clear all or selected call history for the authenticated user
export const clearCallHistory = async (req, res) => {
    try {
        const myId = req.user._id;
        const { callIds } = req.body || {};

        const filter = {
            messageType: "call",
            $or: [{ senderId: myId }, { receiverId: myId }],
        };

        if (Array.isArray(callIds) && callIds.length > 0) {
            filter._id = { $in: callIds };
        }

        await Message.updateMany(filter, {
            $addToSet: { deletedFor: myId },
        });

        return res.status(200).json({ message: "Call history updated successfully" });
    } catch (error) {
        console.error("Error in clearCallHistory controller:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};
