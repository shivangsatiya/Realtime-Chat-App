import express from "express";
import Message from "../models/Message.js";
import Conversation from "../models/Conversation.js";
import { protect } from "../middleware/auth.js";
import asyncHandler from "../middleware/asyncHandler.js";

const router = express.Router();

// @route  GET /api/messages/:conversationId
router.get(
  "/:conversationId",
  protect,
  asyncHandler(async (req, res) => {
    const { conversationId } = req.params;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.participants.some((p) => p.equals(req.user._id))) {
      return res.status(403).json({ message: "Not a participant of this conversation" });
    }

    const messages = await Message.find({ conversation: conversationId })
      .populate("sender", "username avatarColor")
      .sort({ createdAt: 1 });

    res.json({ messages });
  })
);

export default router;