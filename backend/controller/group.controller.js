import Conversation from "../model/conversation.model.js";
import GroupMember from "../model/groupMember.model.js";
import Message from "../model/message.model.js";
import User from "../model/user.model.js";
import { getReceiverSocketId, io } from "../SocketIO/socketServer.js";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
  isCloudinaryConfigured,
  CLOUDINARY_FOLDERS,
} from "../utils/cloudinary.js";
import { DEFAULT_GROUP_AVATAR_URL } from "../config/systemAvatars.js";

// Helper to fetch populated group details with active members & roles
export const getPopulatedGroupData = async (groupId) => {
  const conversation = await Conversation.findById(groupId).lean();
  if (!conversation) return null;

  const activeMemberships = await GroupMember.find({
    conversationId: groupId,
    removedAt: null,
  })
    .populate({ path: "userId", select: "-password" })
    .lean();

  const members = activeMemberships
    .filter((gm) => gm.userId)
    .map((gm) => ({
      ...gm.userId,
      role: gm.role,
      joinedAt: gm.joinedAt,
    }));

  const admins = members.filter((m) => m.role === "admin");
  const primaryAdmin = admins[0] || null;

  return {
    ...conversation,
    members,
    admins,
    groupAdmin: primaryAdmin ? primaryAdmin._id : null,
  };
};

// Create Group Room
export const createGroup = async (req, res) => {
  try {
    const { groupName, members, groupAvatar, groupDescription } = req.body;
    const adminId = req.user._id;

    if (!groupName || (typeof groupName === "string" && !groupName.trim())) {
      return res.status(400).json({ error: "Group name is required" });
    }

    // Robust parsing for members (supports array or JSON-encoded string from FormData)
    let parsedMembers = members;
    if (typeof members === "string") {
      try {
        parsedMembers = JSON.parse(members);
      } catch (e) {
        parsedMembers = members.split(",").map((m) => m.trim()).filter(Boolean);
      }
    }

    if (!parsedMembers || !Array.isArray(parsedMembers) || parsedMembers.length === 0) {
      return res.status(400).json({ error: "Group members are required" });
    }

    // Ensure admin is included in members
    const allMemberIds = Array.from(
      new Set([...parsedMembers.map((m) => m.toString()), adminId.toString()])
    );

    let finalGroupAvatar = DEFAULT_GROUP_AVATAR_URL;
    let finalGroupAvatarPublicId = "";
    let newlyUploadedPublicId = null;

    if (req.file) {
      if (!isCloudinaryConfigured()) {
        return res.status(503).json({ error: "Cloudinary service is not configured on the server." });
      }
      try {
        const uploadResult = await uploadToCloudinary(req.file, {
          folder: CLOUDINARY_FOLDERS.GROUP_AVATARS,
          transformation: [{ width: 400, height: 400, crop: "fill" }],
        });
        newlyUploadedPublicId = uploadResult.public_id;
        finalGroupAvatar = uploadResult.secure_url;
        finalGroupAvatarPublicId = uploadResult.public_id;
      } catch (uploadError) {
        console.error("Cloudinary group avatar upload error in createGroup:", uploadError);
        return res.status(400).json({ error: uploadError.message || "Failed to upload group avatar" });
      }
    } else if (typeof groupAvatar === "string" && groupAvatar.startsWith("data:image/")) {
      if (!isCloudinaryConfigured()) {
        return res.status(503).json({ error: "Cloudinary service is not configured on the server." });
      }
      try {
        const uploadResult = await uploadToCloudinary(groupAvatar, {
          folder: CLOUDINARY_FOLDERS.GROUP_AVATARS,
          transformation: [{ width: 400, height: 400, crop: "fill" }],
        });
        newlyUploadedPublicId = uploadResult.public_id;
        finalGroupAvatar = uploadResult.secure_url;
        finalGroupAvatarPublicId = uploadResult.public_id;
      } catch (uploadError) {
        console.error("Cloudinary group avatar upload error in createGroup:", uploadError);
        return res.status(400).json({ error: uploadError.message || "Failed to upload group avatar" });
      }
    } else if (typeof groupAvatar === "string" && groupAvatar.trim()) {
      finalGroupAvatar = groupAvatar.trim();
      finalGroupAvatarPublicId = "";
    }

    let groupConversation;
    try {
      // Create Conversation doc (no embedded members or groupAdmin)
      groupConversation = await Conversation.create({
        isGroup: true,
        groupName: String(groupName).trim(),
        groupAvatar: finalGroupAvatar,
        groupAvatarPublicId: finalGroupAvatarPublicId,
        groupDescription: groupDescription ? String(groupDescription).trim() : "",
      });

      // Create GroupMember rows for each participant
      const groupMemberDocs = allMemberIds.map((mId) => ({
        conversationId: groupConversation._id,
        userId: mId,
        role: mId === adminId.toString() ? "admin" : "member",
        joinedAt: new Date(),
        removedAt: null,
      }));

      await GroupMember.insertMany(groupMemberDocs);
    } catch (dbError) {
      if (newlyUploadedPublicId) {
        try {
          await deleteFromCloudinary(newlyUploadedPublicId);
        } catch (cleanupErr) {
          console.error("Failed to clean up newly uploaded Cloudinary group asset on DB error in createGroup:", cleanupErr);
        }
      }
      throw dbError;
    }

    const populatedGroup = await getPopulatedGroupData(groupConversation._id);

    // Broadcast event to online group members
    allMemberIds.forEach((memberId) => {
      const socketId = getReceiverSocketId(memberId);
      if (socketId) {
        io.to(socketId).emit("newGroupCreated", populatedGroup);
      }
    });

    res.status(201).json(populatedGroup);
  } catch (error) {
    console.log("Error in createGroup controller: ", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Fetch User's Groups (filtered by active membership removedAt: null)
export const getMyGroups = async (req, res) => {
  try {
    const userId = req.user._id;

    // 1. Find all active group memberships for this user
    const memberships = await GroupMember.find({
      userId,
      removedAt: null,
    }).select("conversationId role").lean();

    if (!memberships || memberships.length === 0) {
      return res.status(200).json([]);
    }

    const groupConversationIds = memberships.map((m) => m.conversationId);

    // 2. Fetch all group conversations
    const groups = await Conversation.find({
      _id: { $in: groupConversationIds },
      isGroup: true,
    }).lean();

    // 3. Enrich each group with its active members, roles, and latest message
    const resultGroups = await Promise.all(
      groups.map(async (g) => {
        const activeMemberships = await GroupMember.find({
          conversationId: g._id,
          removedAt: null,
        })
          .populate({ path: "userId", select: "-password" })
          .lean();

        const members = activeMemberships
          .filter((gm) => gm.userId)
          .map((gm) => ({
            ...gm.userId,
            role: gm.role,
            joinedAt: gm.joinedAt,
          }));

        const admins = members.filter((m) => m.role === "admin");

        // Resolve latest message visible to this specific user in the group
        const latestVisible = await Message.findOne({
          conversationId: g._id,
          deletedFor: { $ne: userId },
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

        return {
          ...g,
          members,
          admins,
          groupAdmin: admins[0] || null,
          lastMessage: lastMsg,
        };
      })
    );

    // Sort by latest message date or creation date
    resultGroups.sort((a, b) => {
      const timeA = a.lastMessage?.createdAt
        ? new Date(a.lastMessage.createdAt).getTime()
        : new Date(a.createdAt).getTime();
      const timeB = b.lastMessage?.createdAt
        ? new Date(b.lastMessage.createdAt).getTime()
        : new Date(b.createdAt).getTime();
      return timeB - timeA;
    });

    res.status(200).json(resultGroups);
  } catch (error) {
    console.log("Error in getMyGroups controller: ", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Add member(s) to existing group
export const addGroupMember = async (req, res) => {
  try {
    const { groupId, memberId, members } = req.body;
    const adminId = req.user._id;

    const group = await Conversation.findById(groupId);
    if (!group || !group.isGroup) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Verify requester is an active admin
    const requesterAdmin = await GroupMember.findOne({
      conversationId: groupId,
      userId: adminId,
      role: "admin",
      removedAt: null,
    });

    if (!requesterAdmin) {
      return res.status(403).json({ error: "Only group admins can add members" });
    }

    const newMembers = Array.isArray(members) ? members : memberId ? [memberId] : [];
    if (newMembers.length === 0) {
      return res.status(400).json({ error: "No members specified to add" });
    }

    // Add or reactivate membership for each user
    for (const id of newMembers) {
      const existing = await GroupMember.findOne({
        conversationId: groupId,
        userId: id,
      });

      if (existing) {
        if (existing.removedAt !== null) {
          existing.removedAt = null;
          existing.joinedAt = new Date();
          existing.role = "member";
          await existing.save();
        }
      } else {
        await GroupMember.create({
          conversationId: groupId,
          userId: id,
          role: "member",
          joinedAt: new Date(),
          removedAt: null,
        });
      }
    }

    const updatedGroup = await getPopulatedGroupData(groupId);

    // Broadcast updated group info to all active members
    updatedGroup.members.forEach((m) => {
      const socketId = getReceiverSocketId(m._id.toString());
      if (socketId) {
        io.to(socketId).emit("groupUpdated", updatedGroup);
      }
    });

    res.status(200).json(updatedGroup);
  } catch (error) {
    console.log("Error in addGroupMember controller: ", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Remove member from group (Admin power or leave group, soft-removal)
export const removeGroupMember = async (req, res) => {
  try {
    const { groupId, memberId } = req.body;
    const requesterId = req.user._id;

    const group = await Conversation.findById(groupId);
    if (!group || !group.isGroup) {
      return res.status(404).json({ error: "Group not found" });
    }

    const isSelfLeaving = requesterId.toString() === memberId.toString();

    // Verify requester is admin if removing another user
    if (!isSelfLeaving) {
      const requesterAdmin = await GroupMember.findOne({
        conversationId: groupId,
        userId: requesterId,
        role: "admin",
        removedAt: null,
      });

      if (!requesterAdmin) {
        return res.status(403).json({ error: "Only group admins can remove members" });
      }
    }

    // Find the target member's active membership
    const targetMember = await GroupMember.findOne({
      conversationId: groupId,
      userId: memberId,
      removedAt: null,
    });

    if (!targetMember) {
      return res.status(404).json({ error: "Member is not active in this group" });
    }

    // If target is admin, check if they are the only remaining admin
    if (targetMember.role === "admin") {
      const activeAdminCount = await GroupMember.countDocuments({
        conversationId: groupId,
        role: "admin",
        removedAt: null,
      });

      if (activeAdminCount <= 1) {
        return res.status(400).json({
          error: "Cannot remove the only admin. Please promote another member to admin first.",
        });
      }
    }

    // Soft-remove by setting removedAt timestamp
    targetMember.removedAt = new Date();
    await targetMember.save();

    const updatedGroup = await getPopulatedGroupData(groupId);

    // Notify remaining active members and the removed member
    if (updatedGroup) {
      updatedGroup.members.forEach((m) => {
        const socketId = getReceiverSocketId(m._id.toString());
        if (socketId) {
          io.to(socketId).emit("groupUpdated", updatedGroup);
        }
      });
    }

    const removedSocketId = getReceiverSocketId(memberId.toString());
    if (removedSocketId) {
      io.to(removedSocketId).emit("groupMemberRemoved", { groupId, memberId });
    }

    res.status(200).json(updatedGroup);
  } catch (error) {
    console.error("Error removing group member:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Promote member to Admin (Multiple Co-Admins support)
export const promoteToAdmin = async (req, res) => {
  try {
    const { groupId, memberId } = req.body;
    const requesterId = req.user._id;

    const group = await Conversation.findById(groupId);
    if (!group || !group.isGroup) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Verify requester is an active admin
    const requesterAdmin = await GroupMember.findOne({
      conversationId: groupId,
      userId: requesterId,
      role: "admin",
      removedAt: null,
    });

    if (!requesterAdmin) {
      return res.status(403).json({ error: "Only group admins can promote members" });
    }

    const targetMembership = await GroupMember.findOne({
      conversationId: groupId,
      userId: memberId,
      removedAt: null,
    });

    if (!targetMembership) {
      return res.status(404).json({ error: "Member is not active in this group" });
    }

    targetMembership.role = "admin";
    await targetMembership.save();

    const updatedGroup = await getPopulatedGroupData(groupId);

    // Broadcast updated group details to online members
    updatedGroup.members.forEach((m) => {
      const socketId = getReceiverSocketId(m._id.toString());
      if (socketId) {
        io.to(socketId).emit("groupUpdated", updatedGroup);
      }
    });

    res.status(200).json(updatedGroup);
  } catch (error) {
    console.error("Error in promoteToAdmin controller: ", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Demote Admin to Member
export const demoteAdmin = async (req, res) => {
  try {
    const { groupId, memberId } = req.body;
    const requesterId = req.user._id;

    const group = await Conversation.findById(groupId);
    if (!group || !group.isGroup) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Verify requester is an active admin
    const requesterAdmin = await GroupMember.findOne({
      conversationId: groupId,
      userId: requesterId,
      role: "admin",
      removedAt: null,
    });

    if (!requesterAdmin) {
      return res.status(403).json({ error: "Only group admins can demote admins" });
    }

    const targetMembership = await GroupMember.findOne({
      conversationId: groupId,
      userId: memberId,
      removedAt: null,
    });

    if (!targetMembership || targetMembership.role !== "admin") {
      return res.status(400).json({ error: "Target is not an active admin in this group" });
    }

    // Check if there are other active admins in the group
    const activeAdminCount = await GroupMember.countDocuments({
      conversationId: groupId,
      role: "admin",
      removedAt: null,
    });

    if (activeAdminCount <= 1) {
      return res.status(400).json({
        error: "Cannot demote the only admin. Promote another member to admin first.",
      });
    }

    targetMembership.role = "member";
    await targetMembership.save();

    const updatedGroup = await getPopulatedGroupData(groupId);

    // Broadcast updated group details to online members
    updatedGroup.members.forEach((m) => {
      const socketId = getReceiverSocketId(m._id.toString());
      if (socketId) {
        io.to(socketId).emit("groupUpdated", updatedGroup);
      }
    });

    res.status(200).json(updatedGroup);
  } catch (error) {
    console.error("Error in demoteAdmin controller: ", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Update group details (About / Description / Name) - Admin power
export const updateGroupDetails = async (req, res) => {
  try {
    const { groupId, groupDescription, groupName, groupAvatar } = req.body;
    const adminId = req.user._id;

    const group = await Conversation.findById(groupId);
    if (!group || !group.isGroup) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Verify requester is an active admin
    const requesterAdmin = await GroupMember.findOne({
      conversationId: groupId,
      userId: adminId,
      role: "admin",
      removedAt: null,
    });

    if (!requesterAdmin) {
      return res.status(403).json({ error: "Only group admins can update group details" });
    }

    if (groupDescription !== undefined) {
      group.groupDescription = typeof groupDescription === "string" ? groupDescription.trim() : groupDescription;
    }
    if (groupName !== undefined) {
      if (typeof groupName !== "string" || !groupName.trim()) {
        return res.status(400).json({ error: "Group name cannot be empty" });
      }
      group.groupName = groupName.trim();
      // If groupAvatar is using default dicebear seed, refresh it with new group name
      if (!group.groupAvatar || group.groupAvatar.includes("dicebear.com/7.x/identicon/svg?seed=")) {
        group.groupAvatar = `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(group.groupName)}`;
      }
    }
    let oldGroupAvatarPublicIdToDelete = null;
    let newlyUploadedPublicId = null;

    if (req.file) {
      if (!isCloudinaryConfigured()) {
        return res.status(503).json({ error: "Cloudinary service is not configured on the server." });
      }
      try {
        const uploadResult = await uploadToCloudinary(req.file, {
          folder: CLOUDINARY_FOLDERS.GROUP_AVATARS,
          transformation: [{ width: 400, height: 400, crop: "fill" }],
        });
        newlyUploadedPublicId = uploadResult.public_id;
        if (group.groupAvatarPublicId && group.groupAvatarPublicId !== uploadResult.public_id) {
          oldGroupAvatarPublicIdToDelete = group.groupAvatarPublicId;
        }
        group.groupAvatar = uploadResult.secure_url;
        group.groupAvatarPublicId = uploadResult.public_id;
      } catch (uploadError) {
        console.error("Cloudinary group avatar upload error:", uploadError);
        return res.status(400).json({ error: uploadError.message || "Failed to upload group avatar" });
      }
    } else if (groupAvatar !== undefined) {
      if (typeof groupAvatar === "string" && groupAvatar.startsWith("data:image/")) {
        if (!isCloudinaryConfigured()) {
          return res.status(503).json({ error: "Cloudinary service is not configured on the server." });
        }
        try {
          const uploadResult = await uploadToCloudinary(groupAvatar, {
            folder: CLOUDINARY_FOLDERS.GROUP_AVATARS,
            transformation: [{ width: 400, height: 400, crop: "fill" }],
          });
          newlyUploadedPublicId = uploadResult.public_id;
          if (group.groupAvatarPublicId && group.groupAvatarPublicId !== uploadResult.public_id) {
            oldGroupAvatarPublicIdToDelete = group.groupAvatarPublicId;
          }
          group.groupAvatar = uploadResult.secure_url;
          group.groupAvatarPublicId = uploadResult.public_id;
        } catch (uploadError) {
          console.error("Cloudinary group avatar upload error:", uploadError);
          return res.status(400).json({ error: uploadError.message || "Failed to upload group avatar" });
        }
      } else if (typeof groupAvatar === "string" && groupAvatar.trim()) {
        const cleanGroupAvatarUrl = groupAvatar.trim();
        // If switching to a system avatar, default avatar, or remote URL:
        // Schedule old custom group avatar for deletion and clear groupAvatarPublicId
        if (group.groupAvatarPublicId && cleanGroupAvatarUrl !== group.groupAvatar) {
          oldGroupAvatarPublicIdToDelete = group.groupAvatarPublicId;
          group.groupAvatarPublicId = "";
        }
        group.groupAvatar = cleanGroupAvatarUrl;
      }
    }

    try {
      await group.save();
    } catch (dbError) {
      // Rollback newly uploaded asset if DB save failed
      if (newlyUploadedPublicId) {
        try {
          await deleteFromCloudinary(newlyUploadedPublicId);
        } catch (cleanupErr) {
          console.error("Failed to clean up newly uploaded Cloudinary group asset on DB error:", cleanupErr);
        }
      }
      throw dbError;
    }

    // Delete previous custom group asset only AFTER successful DB save
    if (oldGroupAvatarPublicIdToDelete) {
      deleteFromCloudinary(oldGroupAvatarPublicIdToDelete).catch((delErr) => {
        console.error("Failed to delete previous Cloudinary group asset:", delErr);
      });
    }

    const updatedGroup = await getPopulatedGroupData(groupId);

    // Broadcast updated group details to online members
    updatedGroup.members.forEach((m) => {
      const socketId = getReceiverSocketId(m._id.toString());
      if (socketId) {
        io.to(socketId).emit("groupUpdated", updatedGroup);
      }
    });

    res.status(200).json(updatedGroup);
  } catch (error) {
    console.log("Error in updateGroupDetails controller: ", error);
    res.status(500).json({ error: "Internal server error" });
  }
};



