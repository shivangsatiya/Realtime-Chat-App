import express from "express";
import Message from "../models/Message.js";
import Conversation from "../models/Conversation.js";
import { protect } from "../middleware/auth.js";
import asyncHandler from "../middleware/asyncHandler.js";
import validate from "../middleware/validate.js";
import {
  conversationIdParamSchema,
  searchMessagesQuerySchema,
  messagesPaginationQuerySchema,
} from "../validators/messageValidators.js";

const router = express.Router();

// @route  GET /api/messages/:conversationId/search?q=...&cursor=...&limit=...
// Full-text search within a single conversation's messages, cursor-paginated
// the same way as message history (see below for why _id-based).
// Defined before the plain /:conversationId route below so Express doesn't
// need any special ordering trick — they match different path shapes.
router.get(
  "/:conversationId/search",
  protect,
  validate(conversationIdParamSchema, "params"),
  validate(searchMessagesQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const { q, cursor, limit } = req.query;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.participants.some((p) => p.equals(req.user._id))) {
      return res.status(403).json({ message: "Not a participant of this conversation" });
    }

    const filter = {
      conversation: conversationId,
      isDeleted: { $ne: true },
      $text: { $search: q },
    };
    if (cursor) filter._id = { $lt: cursor };

    // Fetch one extra beyond the page size — its presence (or absence) is
    // how we know whether there's a next page, without a separate count query.
    const results = await Message.find(filter)
      .populate("sender", "username avatarColor")
      .sort({ _id: -1 })
      .limit(limit + 1);

    const hasMore = results.length > limit;
    const page = hasMore ? results.slice(0, limit) : results;

    res.json({
      messages: page,
      nextCursor: hasMore ? page[page.length - 1]._id : null,
    });
  })
);

// @route  GET /api/messages/:conversationId?cursor=...&limit=...
// Returns the most recent page of messages by default (chronological order,
// ready to render). Pass `cursor` (the _id of the oldest message already
// loaded) to fetch the next page further back in history — this is how the
// client implements "load older messages" without ever fetching the full
// conversation into memory.
router.get(
  "/:conversationId",
  protect,
  validate(conversationIdParamSchema, "params"),
  validate(messagesPaginationQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const { cursor, limit } = req.query;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.participants.some((p) => p.equals(req.user._id))) {
      return res.status(403).json({ message: "Not a participant of this conversation" });
    }

    const filter = { conversation: conversationId };
    if (cursor) filter._id = { $lt: cursor };

    const results = await Message.find(filter)
      .populate("sender", "username avatarColor")
      .populate({
        path: "replyTo",
        select: "text sender isDeleted",
        populate: { path: "sender", select: "username" },
      })
      .populate({ path: "reactions.user", select: "username" })
      .sort({ _id: -1 }) // newest first, so limit/cursor stay near the useful end
      .limit(limit + 1);

    const hasMore = results.length > limit;
    const page = hasMore ? results.slice(0, limit) : results;
    const nextCursor = hasMore ? page[page.length - 1]._id : null;

    res.json({ messages: page.reverse(), nextCursor });
  })
);

export default router;
