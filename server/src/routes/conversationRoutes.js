import express from "express";
import Conversation from "../models/Conversation.js";
import { protect } from "../middleware/auth.js";
import asyncHandler from "../middleware/asyncHandler.js";
import validate from "../middleware/validate.js";
import {
  startPrivateSchema,
  createGroupSchema,
  conversationsPaginationQuerySchema,
} from "../validators/conversationValidators.js";

const router = express.Router();

// @route  GET /api/conversations?cursor=...&cursorId=...&limit=...
// Lists conversations most-recent-activity-first. Pass `cursor` (the
// updatedAt of the last conversation already loaded) and `cursorId` (its
// _id, as a tiebreaker) to fetch the next page.
router.get(
  "/",
  protect,
  validate(conversationsPaginationQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const { cursor, cursorId, limit } = req.query;

    const filter = { participants: req.user._id };
    if (cursor && cursorId) {
      filter.$or = [
        { updatedAt: { $lt: new Date(cursor) } },
        { updatedAt: new Date(cursor), _id: { $lt: cursorId } },
      ];
    }

    const results = await Conversation.find(filter)
      .populate("participants", "-password")
      .populate({
        path: "lastMessage",
        populate: { path: "sender", select: "username" },
      })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(limit + 1);

    const hasMore = results.length > limit;
    const page = hasMore ? results.slice(0, limit) : results;
    const last = page[page.length - 1];

    res.json({
      conversations: page,
      nextCursor: hasMore ? { cursor: last.updatedAt, cursorId: last._id } : null,
    });
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
