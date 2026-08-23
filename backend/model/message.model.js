import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
    },

    message: {
      type: String,
      maxlength: [4000, "Message cannot exceed 4000 characters"],
      default: "",
    },

    messageType: {
      type: String,
      enum: ["text", "image", "file", "call"],
      default: "text",
    },

    callDetails: {
      callType: {
        type: String,
        enum: ["voice", "video"],
        default: "voice",
      },
      status: {
        type: String,
        enum: ["completed", "missed", "declined", "unanswered", "cancelled"],
        default: "completed",
      },
      duration: {
        type: Number,
        default: 0, // duration in seconds
      },
      startedAt: {
        type: Date,
        default: null,
      },
      answeredAt: {
        type: Date,
        default: null,
      },
      endedAt: {
        type: Date,
        default: null,
      },
    },

    attachmentUrl: {
      type: String,
      default: "",
    },

    attachmentPublicId: {
      type: String,
      default: "",
    },

    attachmentSize: {
      type: Number,
      default: null,
    },

    attachmentWidth: {
      type: Number,
      default: null,
    },

    attachmentHeight: {
      type: Number,
      default: null,
    },

    attachments: [
      {
        url: {
          type: String,
          default: "",
        },
        publicId: {
          type: String,
          default: "",
        },
        size: {
          type: Number,
          default: null,
        },
        width: {
          type: Number,
          default: null,
        },
        height: {
          type: Number,
          default: null,
        },
      },
    ],

    status: {
      type: String,
      enum: ["sent", "delivered", "seen"],
      default: "sent",
    },

    deletedFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    deletedForAll: {
      type: Boolean,
      default: false,
    },

    reactions: [
      {
        emoji: {
          type: String,
          required: true,
        },
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    readBy: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        readAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  { timestamps: true }
);

// Message query indexes
messageSchema.index({ conversationId: 1, createdAt: 1 });
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1, receiverId: 1, status: 1 });

const Message = mongoose.model("Message", messageSchema);

export default Message;