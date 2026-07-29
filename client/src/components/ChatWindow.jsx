import { useEffect, useRef, useState } from "react";
import api from "../api/axios.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useSocket } from "../context/SocketContext.jsx";
import PresenceDot from "./PresenceDot.jsx";
import MessageBubble from "./MessageBubble.jsx";
import MessageInput from "./MessageInput.jsx";
import TypingIndicator from "./TypingIndicator.jsx";

const getConversationLabel = (conversation, currentUserId) => {
  if (conversation.isGroup) return conversation.name;
  const other = conversation.participants.find((p) => p._id !== currentUserId);
  return other?.username || "Unknown user";
};

const ChatWindow = ({ conversation, onMessageActivity, onBack }) => {
  const { user } = useAuth();
  const { socket, onlineUserIds } = useSocket();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typingUsers, setTypingUsers] = useState({}); // userId -> username
  const [otherHasSeenLatest, setOtherHasSeenLatest] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const bottomRef = useRef(null);
  const conversationId = conversation._id;

  const other = !conversation.isGroup
    ? conversation.participants.find((p) => p._id !== user.id)
    : null;
  const label = getConversationLabel(conversation, user.id);
  const isOnline = other && onlineUserIds.has(other._id);

  // Load history + join the socket room whenever the active conversation changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessages([]);
    setTypingUsers({});
    setOtherHasSeenLatest(false);
    setReplyingTo(null);

    const load = async () => {
      try {
        const { data } = await api.get(`/messages/${conversationId}`);
        if (!cancelled) setMessages(data.messages);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();

    socket?.emit("conversation:join", conversationId);
    socket?.emit("message:read", { conversationId });

    return () => {
      cancelled = true;
    };
  }, [conversationId, socket]);

  // Socket listeners scoped to the currently open conversation
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (message) => {
      if (message.conversation !== conversationId) return;
      setMessages((prev) => [...prev, message]);
      onMessageActivity?.(message);
      if (message.sender._id !== user.id) {
        socket.emit("message:read", { conversationId });
      }
    };

    const handleTyping = ({ conversationId: cid, userId, username, isTyping }) => {
      if (cid !== conversationId || userId === user.id) return;
      setTypingUsers((prev) => {
        const next = { ...prev };
        if (isTyping) next[userId] = username;
        else delete next[userId];
        return next;
      });
    };

    const handleReadUpdate = ({ conversationId: cid, userId }) => {
      if (cid !== conversationId || userId === user.id) return;
      setOtherHasSeenLatest(true);
    };

    socket.on("message:new", handleNewMessage);
    socket.on("typing:update", handleTyping);
    socket.on("message:read-update", handleReadUpdate);

    return () => {
      socket.off("message:new", handleNewMessage);
      socket.off("typing:update", handleTyping);
      socket.off("message:read-update", handleReadUpdate);
    };
  }, [socket, conversationId, user.id, onMessageActivity]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingUsers]);

  const typingLabel = Object.values(typingUsers)[0]
    ? `${Object.values(typingUsers)[0]} is typing…`
    : null;

  const lastMessage = messages[messages.length - 1];
  const showSeen =
    !conversation.isGroup &&
    lastMessage &&
    lastMessage.sender._id === user.id &&
    otherHasSeenLatest;

  return (
    <div className="chat-window">
      <div className="chat-header">
        <button
          onClick={onBack}
          className="icon-btn d-md-none"
          aria-label="Back to conversations"
          style={{ fontSize: "1.1rem" }}
        >
          <i className="bi bi-arrow-left" />
        </button>
        <span className="position-relative flex-shrink-0">
          <span
            className="avatar-circle"
            style={{ backgroundColor: conversation.isGroup ? "#8b5cf6" : other?.avatarColor || "#64748b" }}
          >
            {conversation.isGroup ? <i className="bi bi-people-fill" /> : label.slice(0, 2).toUpperCase()}
          </span>
          {!conversation.isGroup && (
            <span className="position-absolute" style={{ bottom: -1, right: -1 }}>
              <PresenceDot isOnline={isOnline} />
            </span>
          )}
        </span>
        <span>
          <span className="d-block fw-medium">{label}</span>
          <span className="d-block" style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
            {conversation.isGroup
              ? `${conversation.participants.length} members`
              : isOnline
              ? "Online"
              : "Offline"}
          </span>
        </span>
      </div>

      <div className="message-list">
        {loading && (
          <>
            <div className="skeleton-bubble" style={{ width: "45%", alignSelf: "flex-start" }} />
            <div className="skeleton-bubble" style={{ width: "60%", alignSelf: "flex-end" }} />
            <div className="skeleton-bubble" style={{ width: "35%", alignSelf: "flex-start" }} />
          </>
        )}

        {!loading && messages.length === 0 && (
          <p className="empty-state m-auto">No messages yet — say hello 👋</p>
        )}

        {!loading &&
          messages.map((m, idx) => {
            const prev = messages[idx - 1];
            const showSender = conversation.isGroup && (!prev || prev.sender._id !== m.sender._id);
            return (
              <MessageBubble
                key={m._id}
                message={m}
                isOwn={m.sender._id === user.id}
                showSender={showSender}
                onReply={setReplyingTo}
              />
            );
          })}

        {typingLabel && <TypingIndicator label={conversation.isGroup ? typingLabel : null} />}

        {showSeen && (
          <span
            className="align-self-end mt-1"
            style={{ fontSize: "0.65rem", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}
          >
            Seen
          </span>
        )}

        <div ref={bottomRef} />
      </div>

      <MessageInput
        conversationId={conversationId}
        socket={socket}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
      />
    </div>
  );
};

export default ChatWindow;