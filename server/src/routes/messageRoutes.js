import express from "express";
import Message from "../models/Message.js";
import Conversation from "../models/Conversation.js";
import { protect } from "../middleware/auth.js";
import asyncHandler from "../middleware/asyncHandler.js";
import validate from "../middleware/validate.js";
import { conversationIdParamSchema, searchMessagesQuerySchema } from "../validators/messageValidators.js";

const router = express.Router();

// @route  GET /api/messages/:conversationId/search?q=...
// Full-text search within a single conversation's messages.
// Defined before the plain /:conversationId route below so Express doesn't
// need any special ordering trick — they match different path shapes.
router.get(
  "/:conversationId/search",
  protect,
  validate(conversationIdParamSchema, "params"),
  validate(searchMessagesQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const { q } = req.query;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.participants.some((p) => p.equals(req.user._id))) {
      return res.status(403).json({ message: "Not a participant of this conversation" });
    }

    const messages = await Message.find({
      conversation: conversationId,
      isDeleted: { $ne: true },
      $text: { $search: q },
    })
      .populate("sender", "username avatarColor")
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ messages });
  })
);

// @route  GET /api/messages/:conversationId
router.get(
  "/:conversationId",
  protect,
  validate(conversationIdParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const { conversationId } = req.params;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.participants.some((p) => p.equals(req.user._id))) {
      return res.status(403).json({ message: "Not a participant of this conversation" });
    }

    const messages = await Message.find({ conversation: conversationId })
      .populate("sender", "username avatarColor")
      .populate({
        path: "replyTo",
        select: "text sender",
        populate: { path: "sender", select: "username" },
      })
      .populate({ path: "reactions.user", select: "username" })
      .sort({ createdAt: 1 });

    res.json({ messages });
  })
);

export default router;