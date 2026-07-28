import express from "express";
import Conversation from "../models/Conversation.js";
import { protect } from "../middleware/auth.js";
import asyncHandler from "../middleware/asyncHandler.js";
import validate from "../middleware/validate.js";
import { startPrivateSchema, createGroupSchema } from "../validators/conversationValidators.js";

const router = express.Router();

// @route  GET /api/conversations
// List all conversations the current user belongs to, most recent first
router.get(
  "/",
  protect,
  asyncHandler(async (req, res) => {
    const conversations = await Conversation.find({ participants: req.user._id })
      .populate("participants", "-password")
      .populate({
        path: "lastMessage",
        populate: { path: "sender", select: "username" },
      })
      .sort({ updatedAt: -1 });

    res.json({ conversations });
  })
);

// @route  POST /api/conversations/private
// body: { userId } -> finds or creates a 1-on-1 conversation
router.post(
  "/private",
  protect,
  validate(startPrivateSchema),
  asyncHandler(async (req, res) => {
    const { userId } = req.body;

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
  })
);

// @route  POST /api/conversations/group
// body: { name, participantIds: [] }
router.post(
  "/group",
  protect,
  validate(createGroupSchema),
  asyncHandler(async (req, res) => {
    const { name, participantIds } = req.body;

    const participants = [...new Set([...participantIds, String(req.user._id)])];

    const conversation = await Conversation.create({
      isGroup: true,
      name,
      participants,
      admin: req.user._id,
    });

    const populated = await conversation.populate("participants", "-password");
    res.status(201).json({ conversation: populated });
  })
);

export default router;