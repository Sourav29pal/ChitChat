import express from "express";
import {
  signup,
  login,
  logout,
  allUsers,
  searchUserByUid,
  addContact,
  updateProfile,
} from "../controller/user.controller.js";
import secureRoute from "../middleware/secureRoutes.js";
import { uploadAvatar } from "../middleware/multer.js";

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/logout", logout);
router.get("/allusers", secureRoute, allUsers);
router.get("/search", secureRoute, searchUserByUid);
router.post("/add-contact", secureRoute, addContact);
router.put("/profile", secureRoute, uploadAvatar, updateProfile);

export default router;
