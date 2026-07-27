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
    socket.on("conversation:join", (conversationId) => {
      socket.join(conversationId);
    });

    // --- Send a message ---
    socket.on("message:send", async ({ conversationId, text }, callback) => {
      try {
        if (!text || !text.trim()) {
          return callback?.({ error: "Message cannot be empty" });
        }

        const conversation = await Conversation.findById(conversationId);
        if (!conversation || !conversation.participants.some((p) => String(p) === userId)) {
          return callback?.({ error: "Not a participant of this conversation" });
        }

        const message = await Message.create({
          conversation: conversationId,
          sender: userId,
          text: text.trim(),
          readBy: [userId],
        });

        conversation.lastMessage = message._id;
        await conversation.save();

        const populated = await message.populate("sender", "username avatarColor");

        io.to(conversationId).emit("message:new", populated);
        callback?.({ message: populated });
      } catch (err) {
        callback?.({ error: err.message });
      }
    });

    // --- Typing indicators ---
    socket.on("typing:start", ({ conversationId }) => {
      socket.to(conversationId).emit("typing:update", {
        conversationId,
        userId,
        username: socket.user.username,
        isTyping: true,
      });
    });

    socket.on("typing:stop", ({ conversationId }) => {
      socket.to(conversationId).emit("typing:update", {
        conversationId,
        userId,
        username: socket.user.username,
        isTyping: false,
      });
    });

    // --- Read receipts ---
    socket.on("message:read", async ({ conversationId }) => {
      try {
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
