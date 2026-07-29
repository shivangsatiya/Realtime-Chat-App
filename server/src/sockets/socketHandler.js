import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";

// Maps a userId -> Set of active socket ids (a user can have multiple tabs/devices open)
const onlineUsers = new Map();

const addOnlineSocket = (userId, socketId) => {
  if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
  onlineUsers.get(userId).add(socketId);
};

const removeOnlineSocket = (userId, socketId) => {
  const sockets = onlineUsers.get(userId);
  if (!sockets) return false;
  sockets.delete(socketId);
  if (sockets.size === 0) {
    onlineUsers.delete(userId);
    return true; // user is now fully offline
  }
  return false;
};

// Shared authorization check: is this user actually a participant of this
// conversation? Every socket handler that touches a conversationId must use
// this before acting on it — Socket.IO does not enforce this automatically.
const isParticipant = (conversation, userId) =>
  !!conversation && conversation.participants.some((p) => String(p) === userId);

// Logs the real error server-side and returns a generic message to the
// client. Sockets don't go through Express's centralized error middleware,
// but this applies the same principle: no internal error details (Mongoose
// CastErrors, validation text, etc.) ever reach the client.
const handleSocketError = (err, callback) => {
  console.error(err);
  callback?.({ error: "Something went wrong. Please try again." });
};

export const initSocket = (io) => {
  // Authenticate every socket connection using the same JWT issued by /api/auth
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("Authentication error: no token"));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select("-password");
      if (!user) return next(new Error("Authentication error: user not found"));

      socket.user = user;
      next();
    } catch (err) {
      next(new Error("Authentication error: invalid token"));
    }
  });

  io.on("connection", async (socket) => {
    const userId = String(socket.user._id);
    addOnlineSocket(userId, socket.id);

    await User.findByIdAndUpdate(userId, { isOnline: true });
    io.emit("presence:update", { userId, isOnline: true });

    // Join a personal room (used for direct notifications) plus every
    // conversation room this user already belongs to.
    socket.join(userId);
    const conversations = await Conversation.find({ participants: userId }).select("_id");
    conversations.forEach((c) => socket.join(String(c._id)));

    // --- Join a specific conversation room on demand (e.g. right after creating it) ---
    socket.on("conversation:join", async (conversationId) => {
      const conversation = await Conversation.findById(conversationId);
      if (!isParticipant(conversation, userId)) return;
      socket.join(conversationId);
    });

    // --- Send a message ---
    socket.on("message:send", async ({ conversationId, text, replyTo, attachment }, callback) => {
      try {
        const trimmedText = text ? text.trim() : "";
        if (!trimmedText && !attachment?.url) {
          return callback?.({ error: "Message cannot be empty" });
        }

        const conversation = await Conversation.findById(conversationId);
        if (!isParticipant(conversation, userId)) {
          return callback?.({ error: "Not a participant of this conversation" });
        }

        let replyToId = null;
        if (replyTo) {
          // The replied-to message must actually belong to this conversation —
          // otherwise a crafted payload could reference a message from a
          // conversation the sender has no access to.
          const repliedMessage = await Message.findOne({ _id: replyTo, conversation: conversationId });
          if (!repliedMessage) {
            return callback?.({ error: "Cannot reply to a message outside this conversation" });
          }
          replyToId = repliedMessage._id;
        }

        const message = await Message.create({
          conversation: conversationId,
          sender: userId,
          text: trimmedText,
          readBy: [userId],
          replyTo: replyToId,
          attachment: attachment?.url
            ? {
                url: attachment.url,
                type: attachment.type === "image" ? "image" : "file",
                name: attachment.name || "file",
              }
            : undefined,
        });

        conversation.lastMessage = message._id;
        await conversation.save();

        const populated = await message.populate([
          { path: "sender", select: "username avatarColor" },
          {
            path: "replyTo",
            select: "text sender",
            populate: { path: "sender", select: "username" },
          },
        ]);

        io.to(conversationId).emit("message:new", populated);
        callback?.({ message: populated });
      } catch (err) {
        handleSocketError(err, callback);
      }
    });

    // --- React to a message (toggle) ---
    socket.on("message:react", async ({ conversationId, messageId, emoji }, callback) => {
      try {
        if (!emoji || typeof emoji !== "string" || emoji.length > 8) {
          return callback?.({ error: "Invalid emoji" });
        }

        const conversation = await Conversation.findById(conversationId);
        if (!isParticipant(conversation, userId)) {
          return callback?.({ error: "Not a participant of this conversation" });
        }

        const message = await Message.findOne({ _id: messageId, conversation: conversationId });
        if (!message) {
          return callback?.({ error: "Message not found in this conversation" });
        }

        const existingIndex = message.reactions.findIndex(
          (r) => String(r.user) === userId && r.emoji === emoji
        );
        if (existingIndex > -1) {
          message.reactions.splice(existingIndex, 1); // toggle off
        } else {
          message.reactions.push({ emoji, user: userId });
        }

        await message.save();
        await message.populate({ path: "reactions.user", select: "username" });

        io.to(conversationId).emit("message:reaction-update", {
          messageId: message._id,
          reactions: message.reactions,
        });
        callback?.({ reactions: message.reactions });
      } catch (err) {
        handleSocketError(err, callback);
      }
    });

    // --- Edit a message (sender only) ---
    socket.on("message:edit", async ({ conversationId, messageId, text }, callback) => {
      try {
        if (!text || !text.trim()) {
          return callback?.({ error: "Message cannot be empty" });
        }

        const conversation = await Conversation.findById(conversationId);
        if (!isParticipant(conversation, userId)) {
          return callback?.({ error: "Not a participant of this conversation" });
        }

        const message = await Message.findOne({ _id: messageId, conversation: conversationId });
        if (!message) {
          return callback?.({ error: "Message not found in this conversation" });
        }
        if (String(message.sender) !== userId) {
          return callback?.({ error: "You can only edit your own messages" });
        }
        if (message.isDeleted) {
          return callback?.({ error: "Cannot edit a deleted message" });
        }

        message.text = text.trim();
        message.editedAt = new Date();
        await message.save();

        io.to(conversationId).emit("message:edited", {
          messageId: message._id,
          text: message.text,
          editedAt: message.editedAt,
        });
        callback?.({ message });
      } catch (err) {
        handleSocketError(err, callback);
      }
    });

    // --- Delete a message (soft delete, sender only) ---
    socket.on("message:delete", async ({ conversationId, messageId }, callback) => {
      try {
        const conversation = await Conversation.findById(conversationId);
        if (!isParticipant(conversation, userId)) {
          return callback?.({ error: "Not a participant of this conversation" });
        }

        const message = await Message.findOne({ _id: messageId, conversation: conversationId });
        if (!message) {
          return callback?.({ error: "Message not found in this conversation" });
        }
        if (String(message.sender) !== userId) {
          return callback?.({ error: "You can only delete your own messages" });
        }

        message.isDeleted = true;
        message.text = "";
        await message.save();

        io.to(conversationId).emit("message:deleted", { messageId: message._id });
        callback?.({ success: true });
      } catch (err) {
        handleSocketError(err, callback);
      }
    });

    // --- Typing indicators ---
    socket.on("typing:start", async ({ conversationId }) => {
      try {
        const conversation = await Conversation.findById(conversationId);
        if (!isParticipant(conversation, userId)) return;
        socket.to(conversationId).emit("typing:update", {
          conversationId,
          userId,
          username: socket.user.username,
          isTyping: true,
        });
      } catch (err) {
        // Non-critical, safe to ignore
      }
    });

    socket.on("typing:stop", async ({ conversationId }) => {
      try {
        const conversation = await Conversation.findById(conversationId);
        if (!isParticipant(conversation, userId)) return;
        socket.to(conversationId).emit("typing:update", {
          conversationId,
          userId,
          username: socket.user.username,
          isTyping: false,
        });
      } catch (err) {
        // Non-critical, safe to ignore
      }
    });

    // --- Read receipts ---
    socket.on("message:read", async ({ conversationId }) => {
      try {
        const conversation = await Conversation.findById(conversationId);
        if (!isParticipant(conversation, userId)) return;

        await Message.updateMany(
          { conversation: conversationId, readBy: { $ne: userId } },
          { $addToSet: { readBy: userId } }
        );
        socket.to(conversationId).emit("message:read-update", { conversationId, userId });
      } catch (err) {
        // Non-critical, safe to ignore
      }
    });

    // --- Disconnect / presence teardown ---
    socket.on("disconnect", async () => {
      const wentOffline = removeOnlineSocket(userId, socket.id);
      if (wentOffline) {
        await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() });
        io.emit("presence:update", { userId, isOnline: false, lastSeen: new Date() });
      }
    });
  });
};

export const getOnlineUserIds = () => Array.from(onlineUsers.keys());