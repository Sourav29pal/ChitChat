import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import connectDB from "./server.js";
import userRoute from "./routes/user.routes.js";
import messageRoute from "./routes/message.route.js";
import groupRoute from "./routes/group.routes.js";
import callRoute from "./routes/call.route.js";
import { app, server } from "./SocketIO/socketServer.js";

dotenv.config();

// Fail fast if critical environment variables are missing
if (!process.env.JWT_SECRET) {
    console.error("FATAL ERROR: JWT_SECRET environment variable is not defined.");
    process.exit(1);
}

// Middleware (increased limit for base64 image uploads)
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ limit: "15mb", extended: true }));
app.use(cookieParser());

const allowedOrigin = process.env.NODE_ENV === "production" ? process.env.FRONTEND_URL : "http://localhost:3001";
app.use(
    cors({
        origin: allowedOrigin,
        credentials: true,
    }),
);

const PORT = process.env.PORT || 4001;

// Routes
app.use("/api/user", userRoute);
app.use("/api/message", messageRoute);
app.use("/api/group", groupRoute);
app.use("/api/call", callRoute);

// Connect to MongoDB first, then start Server
connectDB().then(() => {
    server.listen(PORT, () => {
        console.log(`Server is Running on port ${PORT}`);
    });
});
