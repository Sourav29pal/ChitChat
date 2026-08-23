import mongoose from "mongoose";

const groupMemberSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
      enum: ["admin", "member"],
      default: "member",
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    removedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// 1. Compound unique index on { conversationId: 1, userId: 1 }
groupMemberSchema.index({ conversationId: 1, userId: 1 }, { unique: true });

// 2. Index on { userId: 1, removedAt: 1 } to support "get my groups" queries efficiently
groupMemberSchema.index({ userId: 1, removedAt: 1 });

const GroupMember = mongoose.model("GroupMember", groupMemberSchema);

export default GroupMember;
