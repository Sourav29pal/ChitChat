import express from "express";
import {
  createGroup,
  getMyGroups,
  addGroupMember,
  removeGroupMember,
  updateGroupDetails,
  promoteToAdmin,
  demoteAdmin,
} from "../controller/group.controller.js";
import { uploadGroupAvatar } from "../middleware/multer.js";
import secureRoute from "../middleware/secureRoutes.js";

const router = express.Router();

router.post("/create", secureRoute, uploadGroupAvatar, createGroup);
router.get("/my-groups", secureRoute, getMyGroups);
router.post("/add-member", secureRoute, addGroupMember);
router.post("/remove-member", secureRoute, removeGroupMember);
router.post("/promote-admin", secureRoute, promoteToAdmin);
router.post("/demote-admin", secureRoute, demoteAdmin);
router.put("/update-details", secureRoute, uploadGroupAvatar, updateGroupDetails);
router.post("/update-details", secureRoute, uploadGroupAvatar, updateGroupDetails);

export default router;
