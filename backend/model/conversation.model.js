import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
    {
        isGroup: {
            type: Boolean,
            default: false,
        },
        groupName: { type: String, default: "" },
        groupAvatar: { type: String, default: "" },
        groupAvatarPublicId: { type: String, default: "" },
        groupDescription: { type: String, default: "" },
        // members[] is used strictly for 1-on-1 direct conversations.
        // For groups (isGroup: true), membership & roles are stored in the GroupMember collection.
        members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
        // Denormalized snapshot of the most recent message for UI sidebar
        lastMessage: {
            text: { type: String, default: "" },
            messageType: {
                type: String,
                enum: ["text", "image", "file", "call"],
                default: "text",
            },
            callDetails: {
                callType: { type: String, enum: ["voice", "video"] },
                status: { type: String, enum: ["completed", "missed", "declined", "unanswered", "cancelled"] },
                duration: { type: Number, default: 0 },
                startedAt: { type: Date, default: null },
                answeredAt: { type: Date, default: null },
                endedAt: { type: Date, default: null },
            },
            senderId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            },
            status: {
                type: String,
                enum: ["sent", "delivered", "seen"],
                default: "sent",
            },
            createdAt: {
                type: Date,
            },
        },
    },
    { timestamps: true },
);

conversationSchema.index({ members: 1 });
conversationSchema.index({ members: 1, "lastMessage.createdAt": -1 });

const Conversation = mongoose.model("Conversation", conversationSchema);

export default Conversation;
