import createTokenAndSaveCookie from "../jwt/generateToken.js";
import User from "../model/user.model.js";
import Conversation from "../model/conversation.model.js";
import Message from "../model/message.model.js";
import bcrypt from "bcryptjs";
import {
    uploadToCloudinary,
    deleteFromCloudinary,
    isCloudinaryConfigured,
    CLOUDINARY_FOLDERS,
} from "../utils/cloudinary.js";
import { DEFAULT_USER_AVATAR_URL } from "../config/systemAvatars.js";

// Helper function to auto-generate a unique 10-digit numerical UID
const generateUniqueUID = async () => {
    let isUnique = false;
    let uid = "";
    while (!isUnique) {
        // Generates a 10-digit number (e.g. 9842104812)
        uid = Math.floor(1000000000 + Math.random() * 9000000000).toString();
        const existing = await User.findOne({ uid });
        if (!existing) {
            isUnique = true;
        }
    }
    return uid;
};

export const signup = async (req, res) => {
    const { fullname, email, password, confirmPassword, avatar, about } = req.body;
    try {
        if (!password || !confirmPassword) {
            return res.status(400).json({ error: "Please fill in all fields" });
        }
        if (password !== confirmPassword) {
            return res.status(400).json({ error: "Passwords do not match" });
        }
        const passwordPolicyRegex = /^(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$/;
        if (!passwordPolicyRegex.test(password)) {
            return res.status(400).json({
                error: "Password must be at least 8 characters and include an uppercase letter and a special character",
            });
        }
        const cleanEmail = email ? email.toLowerCase().trim() : "";
        const existingUser = await User.findOne({ email: cleanEmail });
        if (existingUser) {
            return res.status(400).json({ error: "User with this email already registered" });
        }

        // System auto-generates a unique 10-digit UID
        const uid = await generateUniqueUID();

        // Default Avatar if not provided
        const userAvatar = avatar || DEFAULT_USER_AVATAR_URL;

        // Hashing the password
        const hashPassword = await bcrypt.hash(password, 10);
        const initialName = fullname || cleanEmail.split("@")[0];

        const newUser = new User({
            fullname: initialName,
            email: cleanEmail,
            uid,
            avatar: userAvatar,
            about: about || "Hey there! I am using ChatApp.",
            isProfileComplete: false,
            password: hashPassword,
        });
        await newUser.save();
        if (newUser) {
            createTokenAndSaveCookie(newUser._id, res);
            res.status(201).json({
                message: "User created successfully",
                user: {
                    _id: newUser._id,
                    fullname: newUser.fullname,
                    email: newUser.email,
                    uid: newUser.uid,
                    avatar: newUser.avatar,
                    about: newUser.about,
                    showEmail: newUser.showEmail ?? true,
                    isProfileComplete: false,
                    contacts: newUser.contacts,
                },
            });
        }
    } catch (error) {
        console.log("Error in signup controller: ", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const login = async (req, res) => {
    const { email, password } = req.body;
    try {
        if (!email || !password) {
            return res.status(400).json({ error: "Please fill in all fields" });
        }
        const cleanEmail = email.toLowerCase().trim();
        // Search case-insensitively or via cleanEmail
        const user = await User.findOne({
            $or: [{ email: cleanEmail }, { email: new RegExp(`^${cleanEmail.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")}$`, "i") }],
        });
        if (!user) {
            return res.status(400).json({ error: "Invalid email or password" });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: "Invalid email or password" });
        }

        // Auto-generate UID if existing user doesn't have one
        if (!user.uid) {
            user.uid = user.email.split("@")[0] + Math.floor(1000 + Math.random() * 9000);
            await user.save();
        }
        if (!user.avatar) {
            user.avatar = DEFAULT_USER_AVATAR_URL;
            await user.save();
        }

        createTokenAndSaveCookie(user._id, res);
        res.status(200).json({
            message: "User logged in successfully",
            user: {
                _id: user._id,
                fullname: user.fullname,
                email: user.email,
                uid: user.uid,
                avatar: user.avatar,
                about: user.about,
                showEmail: user.showEmail ?? true,
                isProfileComplete: user.isProfileComplete === true,
                contacts: user.contacts,
            },
        });
    } catch (error) {
        console.log("Error in login controller: ", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const logout = async (req, res) => {
    try {
        res.clearCookie("jwt", {
            httpOnly: true,
            secure: false,
            sameSite: "lax",
            path: "/",
        });
        return res.status(200).json({ message: "User logged out successfully" });
    } catch (error) {
        console.log("Error in logout controller: ", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

// Returns all registered users with active conversation metadata & unread counts (never empty on refresh)
export const allUsers = async (req, res) => {
    try {
        const loggedInUserId = req.user._id;

        // 1. Get logged-in user's contacts
        const loggedInUser = await User.findById(loggedInUserId).select("contacts").lean();
        const contactIds = (loggedInUser?.contacts || []).map((id) => id.toString());

        // 2. Fetch 1-on-1 conversations for current user
        const conversations = await Conversation.find({
            members: { $in: [loggedInUserId] },
            isGroup: { $ne: true },
        })
            .select("members lastMessage")
            .lean();

        const conversationPartnerIds = [];
        const convMap = new Map();

        if (conversations && conversations.length > 0) {
            for (const conv of conversations) {
                const partnerId = conv.members.find((mId) => mId && mId.toString() !== loggedInUserId.toString());

                if (partnerId) {
                    const partnerIdStr = partnerId.toString();

                    // Resolve latest message visible to loggedInUserId in this conversation
                    const latestVisible = await Message.findOne({
                        conversationId: conv._id,
                        deletedFor: { $ne: loggedInUserId },
                    })
                        .sort({ createdAt: -1, _id: -1 })
                        .select("message messageType senderId status createdAt callDetails attachmentUrl deletedForAll")
                        .lean();

                    let lastMsg = null;
                    if (latestVisible) {
                        lastMsg = {
                            text: latestVisible.deletedForAll
                                ? "This message was deleted"
                                : (latestVisible.message || (latestVisible.attachmentUrl ? "📷 Photo" : "")),
                            messageType: latestVisible.messageType || (latestVisible.attachmentUrl ? "image" : "text"),
                            senderId: latestVisible.senderId,
                            status: latestVisible.status || "sent",
                            createdAt: latestVisible.createdAt,
                            callDetails: latestVisible.callDetails,
                        };
                    }

                    // Only count as an active conversation partner if at least one message is visible
                    // OR if the partner is in the user's contacts
                    const hasMessageExchange = Boolean(lastMsg && (lastMsg.text || lastMsg.messageType));
                    if (hasMessageExchange) {
                        conversationPartnerIds.push(partnerIdStr);
                    }

                    const unreadCount = await Message.countDocuments({
                        conversationId: conv._id,
                        senderId: partnerId,
                        receiverId: loggedInUserId,
                        deletedFor: { $ne: loggedInUserId },
                        status: { $ne: "seen" },
                    });

                    convMap.set(partnerIdStr, {
                        lastMsg,
                        unreadCount,
                    });
                }
            }
        }

        // Combine contacts + conversation partners (excluding self)
        const activeUserIds = Array.from(new Set([...contactIds, ...conversationPartnerIds])).filter((id) => id !== loggedInUserId.toString());

        // Fetch details of active users only
        const relevantUsers = await User.find({
            _id: { $in: activeUserIds },
        })
            .select("-password")
            .lean();

        // Map metadata onto relevant users and enforce email privacy
        const resultUsers = relevantUsers.map((u) => {
            const convData = convMap.get(u._id.toString());
            const shouldShowEmail = u.showEmail !== false;
            return {
                ...u,
                email: shouldShowEmail ? u.email : undefined,
                lastMessage: convData?.lastMsg || null,
                unreadCount: convData?.unreadCount || 0,
            };
        });

        // Sort: active conversations first by latest message date, then alphabetically
        resultUsers.sort((a, b) => {
            const timeA = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
            const timeB = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
            if (timeA !== timeB) return timeB - timeA;
            return (a.fullname || "").localeCompare(b.fullname || "");
        });

        res.status(200).json(resultUsers);
    } catch (error) {
        console.log("Error in allUsers controller: " + error);
        res.status(500).json({ error: "Internal server error" });
    }
};

// Search user by UID, Mobile, or Email
export const searchUserByUid = async (req, res) => {
    try {
        const { query } = req.query;
        const loggedInUserId = req.user ? req.user._id : null;
        if (!query || !query.trim()) {
            return res.status(200).json([]);
        }

        const escapedQuery = query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        const filter = {
            $or: [
                { uid: { $regex: escapedQuery, $options: "i" } },
                { email: { $regex: escapedQuery, $options: "i" } },
                { fullname: { $regex: escapedQuery, $options: "i" } },
            ],
        };

        if (loggedInUserId) {
            filter._id = { $ne: loggedInUserId };
        }

        const users = await User.find(filter).select("-password").lean();

        // Enforce email privacy in search results
        const sanitizedUsers = users.map((u) => {
            if (u.showEmail === false) {
                const { email, ...rest } = u;
                return rest;
            }
            return u;
        });

        res.status(200).json(sanitizedUsers);
    } catch (error) {
        console.log("Error in searchUserByUid controller: ", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

// Add a searched user to contacts list (unidirectional: only added to requesting user's contacts)
export const addContact = async (req, res) => {
    try {
        const { contactId } = req.body;
        const loggedInUserId = req.user._id;

        if (contactId === loggedInUserId.toString()) {
            return res.status(400).json({ error: "Cannot add yourself to contacts" });
        }

        const targetUser = await User.findById(contactId);
        if (!targetUser) {
            return res.status(404).json({ error: "User not found" });
        }

        const user = await User.findById(loggedInUserId);

        // Only add to the requesting user's contacts (User 1 adds User 2)
        // User 2 will see User 1 ONLY after User 1 sends their first message
        if (!user.contacts.includes(contactId)) {
            user.contacts.push(contactId);
            await user.save();
        }

        const returnContact = await User.findById(contactId).select("-password").lean();
        if (returnContact && returnContact.showEmail === false) {
            delete returnContact.email;
        }

        res.status(200).json({ message: "Contact added successfully", contact: returnContact });
    } catch (error) {
        console.log("Error in addContact controller: ", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

// Update Profile
export const updateProfile = async (req, res) => {
    try {
        const loggedInUserId = req.user._id;
        const { fullname, about, avatar, showEmail } = req.body;

        const user = await User.findById(loggedInUserId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        let isModified = false;

        if (fullname !== undefined) {
            const cleanFullname = String(fullname).trim();
            if (user.fullname !== cleanFullname) {
                user.fullname = cleanFullname;
                isModified = true;
            }
        }
        if (about !== undefined) {
            const cleanAbout = String(about).trim();
            if (user.about !== cleanAbout) {
                user.about = cleanAbout;
                isModified = true;
            }
        }
        if (showEmail !== undefined) {
            const nextShowEmail = showEmail === true || showEmail === "true" || showEmail === "1";
            if ((user.showEmail ?? true) !== nextShowEmail) {
                user.showEmail = nextShowEmail;
                isModified = true;
            }
        }

        let oldAvatarPublicIdToDelete = null;
        let newlyUploadedPublicId = null;

        if (req.file) {
            if (!isCloudinaryConfigured()) {
                return res.status(503).json({ error: "Cloudinary service is not configured on the server." });
            }
            try {
                const uploadResult = await uploadToCloudinary(req.file, {
                    folder: CLOUDINARY_FOLDERS.PROFILES,
                    transformation: [{ width: 400, height: 400, crop: "fill", gravity: "face" }],
                });
                newlyUploadedPublicId = uploadResult.public_id;
                if (user.avatarPublicId && user.avatarPublicId !== uploadResult.public_id) {
                    oldAvatarPublicIdToDelete = user.avatarPublicId;
                }
                user.avatar = uploadResult.secure_url;
                user.avatarPublicId = uploadResult.public_id;
                isModified = true;
            } catch (uploadError) {
                console.error("Cloudinary profile avatar upload error:", uploadError);
                return res.status(400).json({ error: uploadError.message || "Failed to upload profile picture" });
            }
        } else if (avatar !== undefined) {
            if (typeof avatar === "string" && avatar.startsWith("data:image/")) {
                if (!isCloudinaryConfigured()) {
                    return res.status(503).json({ error: "Cloudinary service is not configured on the server." });
                }
                try {
                    const uploadResult = await uploadToCloudinary(avatar, {
                        folder: CLOUDINARY_FOLDERS.PROFILES,
                        transformation: [{ width: 400, height: 400, crop: "fill", gravity: "face" }],
                    });
                    newlyUploadedPublicId = uploadResult.public_id;
                    if (user.avatarPublicId && user.avatarPublicId !== uploadResult.public_id) {
                        oldAvatarPublicIdToDelete = user.avatarPublicId;
                    }
                    user.avatar = uploadResult.secure_url;
                    user.avatarPublicId = uploadResult.public_id;
                    isModified = true;
                } catch (uploadError) {
                    console.error("Cloudinary profile avatar upload error:", uploadError);
                    return res.status(400).json({ error: uploadError.message || "Failed to upload profile picture" });
                }
            } else if (typeof avatar === "string" && avatar.trim()) {
                const cleanAvatarUrl = avatar.trim();
                if (user.avatar !== cleanAvatarUrl) {
                    // If resetting to a default avatar (e.g. dicebear) or changing URL, delete old Cloudinary asset
                    if (user.avatarPublicId && cleanAvatarUrl !== user.avatar) {
                        oldAvatarPublicIdToDelete = user.avatarPublicId;
                        user.avatarPublicId = "";
                    }
                    user.avatar = cleanAvatarUrl;
                    isModified = true;
                }
            }
        }

        if (!user.isProfileComplete) {
            user.isProfileComplete = true;
            isModified = true;
        }

        // If no changes were made to MongoDB document, avoid redundant database write
        if (!isModified) {
            return res.status(200).json({
                message: "No changes detected",
                noChange: true,
                user: {
                    _id: user._id,
                    fullname: user.fullname,
                    email: user.email,
                    uid: user.uid,
                    avatar: user.avatar,
                    about: user.about,
                    showEmail: user.showEmail ?? true,
                    isProfileComplete: true,
                    contacts: user.contacts,
                },
            });
        }

        try {
            await user.save();
        } catch (dbError) {
            // Clean up newly uploaded asset if DB save failed
            if (newlyUploadedPublicId) {
                try {
                    await deleteFromCloudinary(newlyUploadedPublicId);
                } catch (cleanupErr) {
                    console.error("Failed to clean up newly uploaded Cloudinary asset on DB error:", cleanupErr);
                }
            }
            throw dbError;
        }

        // Delete old Cloudinary asset AFTER successful DB save
        if (oldAvatarPublicIdToDelete) {
            deleteFromCloudinary(oldAvatarPublicIdToDelete).catch((delErr) => {
                console.error("Failed to delete previous Cloudinary profile asset:", delErr);
            });
        }

        res.status(200).json({
            message: "Profile updated successfully",
            user: {
                _id: user._id,
                fullname: user.fullname,
                email: user.email,
                uid: user.uid,
                avatar: user.avatar,
                about: user.about,
                showEmail: user.showEmail ?? true,
                isProfileComplete: true,
                contacts: user.contacts,
            },
        });
    } catch (error) {
        console.log("Error in updateProfile controller: ", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
