import express from "express";

import {
  sendMessage,
  getMessage,
  markMessagesAsSeen,
  getSharedMedia,
  toggleReaction,
  deleteMessageForMe,
  deleteMessageForEveryone,
  bulkDeleteForMe,
  bulkDeleteForEveryone,
  restoreDeleteForMe,
  clearChat,
  removeConversation,
} from "../controller/message.controller.js";
import secureRoute from "../middleware/secureRoutes.js";
import { uploadChatFiles } from "../middleware/multer.js";

const router = express.Router();

// ── Existing single-message routes (kept for backward compatibility) ──────────
router.post("/send/:id", secureRoute, uploadChatFiles, sendMessage);
router.get("/get/:id", secureRoute, getMessage);
router.get("/media/:id", secureRoute, getSharedMedia);
router.put("/seen/:id", secureRoute, markMessagesAsSeen);
router.post("/react/:id", secureRoute, toggleReaction);
router.post("/delete-me/:id", secureRoute, deleteMessageForMe);
router.post("/delete-everyone/:id", secureRoute, deleteMessageForEveryone);

// ── Bulk delete routes ────────────────────────────────────────────────────────
router.post("/bulk-delete-me", secureRoute, bulkDeleteForMe);
router.post("/bulk-delete-everyone", secureRoute, bulkDeleteForEveryone);
router.post("/restore-delete-me", secureRoute, restoreDeleteForMe);

// ── User-scoped clear chat & conversation removal routes ───────────────────────
router.post("/clear-chat", secureRoute, clearChat);
router.post("/remove-conversation", secureRoute, removeConversation);

export default router;