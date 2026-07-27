import express from "express";
import Conversation from "../models/Conversation.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// @route  GET /api/conversations
// List all conversations the current user belongs to, most recent first
router.get("/", protect, async (req, res) => {
  try {
    const conversations = await Conversation.find({ participants: req.user._id })
      .populate("participants", "-password")
      .populate({
        path: "lastMessage",
        populate: { path: "sender", select: "username" },
      })
      .sort({ updatedAt: -1 });

    res.json({ conversations });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch conversations", error: err.message });
  }
});

// @route  POST /api/conversations/private
// body: { userId } -> finds or creates a 1-on-1 conversation
router.post("/private", protect, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: "userId is required" });

    let conversation = await Conversation.findOne({
      isGroup: false,
      participants: { $all: [req.user._id, userId], $size: 2 },
    }).populate("participants", "-password");

    if (!conversation) {
      conversation = await Conversation.create({
        isGroup: false,
        participants: [req.user._id, userId],
      });
      conversation = await conversation.populate("participants", "-password");
    }

    res.status(200).json({ conversation });
  } catch (err) {
    res.status(500).json({ message: "Failed to start conversation", error: err.message });
  }
});

// @route  POST /api/conversations/group
// body: { name, participantIds: [] }
router.post("/group", protect, async (req, res) => {
  try {
    const { name, participantIds } = req.body;
    if (!name || !Array.isArray(participantIds) || participantIds.length < 2) {
      return res
        .status(400)
        .json({ message: "Group name and at least 2 other participants are required" });
    }

    const participants = [...new Set([...participantIds, String(req.user._id)])];

    const conversation = await Conversation.create({
      isGroup: true,
      name,
      participants,
      admin: req.user._id,
    });

    const populated = await conversation.populate("participants", "-password");
    res.status(201).json({ conversation: populated });
  } catch (err) {
    res.status(500).json({ message: "Failed to create group", error: err.message });
  }
});

export default router;
