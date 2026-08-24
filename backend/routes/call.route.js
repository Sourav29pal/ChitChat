import express from "express";
import { logCall, getCallHistory, clearCallHistory, getIceServers } from "../controller/call.controller.js";
import secureRoute from "../middleware/secureRoutes.js";

const router = express.Router();

router.get("/ice-servers", secureRoute, getIceServers);
router.post("/log", secureRoute, logCall);
router.get("/history", secureRoute, getCallHistory);
router.post("/delete", secureRoute, clearCallHistory);
router.delete("/history", secureRoute, clearCallHistory);

export default router;
