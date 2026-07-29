import { useEffect, useRef, useState } from "react";
import api from "../api/axios.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useSocket } from "../context/SocketContext.jsx";
import PresenceDot from "./PresenceDot.jsx";
import MessageBubble from "./MessageBubble.jsx";
import MessageInput from "./MessageInput.jsx";
import TypingIndicator from "./TypingIndicator.jsx";

const MESSAGES_PAGE_SIZE = 30;

const getConversationLabel = (conversation, currentUserId) => {
  if (conversation.isGroup) return conversation.name;
  const other = conversation.participants.find((p) => p._id !== currentUserId);
  return other?.username || "Unknown user";
};

const formatSearchTime = (isoString) =>
  new Date(isoString).toLocaleDateString([], { month: "short", day: "numeric" });

const ChatWindow = ({ conversation, onMessageActivity, onBack }) => {
  const { user } = useAuth();
  const { socket, onlineUserIds } = useSocket();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [typingUsers, setTypingUsers] = useState({}); // userId -> username
  const [otherHasSeenLatest, setOtherHasSeenLatest] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchNextCursor, setSearchNextCursor] = useState(null);
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
  const searchDebounceRef = useRef(null);
  const bottomRef = useRef(null);
  const messageListRef = useRef(null);
  const conversationId = conversation._id;

  const other = !conversation.isGroup
    ? conversation.participants.find((p) => p._id !== user.id)
    : null;
  const label = getConversationLabel(conversation, user.id);
  const isOnline = other && onlineUserIds.has(other._id);

  const scrollToBottom = (behavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior });
  };

  // Load the most recent page + join the socket room whenever the active
  // conversation changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessages([]);
    setNextCursor(null);
    setTypingUsers({});
    setOtherHasSeenLatest(false);
    setReplyingTo(null);
    setEditingMessage(null);

    const load = async () => {
      try {
        const { data } = await api.get(`/messages/${conversationId}`, {
          params: { limit: MESSAGES_PAGE_SIZE },
        });
        if (!cancelled) {
          setMessages(data.messages);
          setNextCursor(data.nextCursor);
        }
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

  // Pin to the bottom the moment the initial page finishes loading
  useEffect(() => {
    if (!loading) scrollToBottom("auto");
  }, [loading]);

  // Keep the bottom pinned when the typing indicator appears/disappears
  useEffect(() => {
    scrollToBottom();
  }, [typingUsers]);

  // Fetches the next-older page of messages ("load more" on scroll-up),
  // preserving the reader's visual scroll position — without this, prepending
  // older messages above the viewport would otherwise yank the view down.
  const loadOlderMessages = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const container = messageListRef.current;
    const prevScrollHeight = container?.scrollHeight ?? 0;
    try {
      const { data } = await api.get(`/messages/${conversationId}`, {
        params: { cursor: nextCursor, limit: MESSAGES_PAGE_SIZE },
      });
      setMessages((prev) => [...data.messages, ...prev]);
      setNextCursor(data.nextCursor);
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = container.scrollHeight - prevScrollHeight;
        }
      });
    } finally {
      setLoadingMore(false);
    }
  };

  const handleMessageListScroll = (e) => {
    if (e.target.scrollTop < 150 && nextCursor && !loadingMore && !loading) {
      loadOlderMessages();
    }
  };

  // Socket listeners scoped to the currently open conversation
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (message) => {
      if (message.conversation !== conversationId) return;
      setMessages((prev) => [...prev, message]);
      scrollToBottom();
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

    const handleReactionUpdate = ({ messageId, reactions }) => {
      setMessages((prev) => prev.map((m) => (m._id === messageId ? { ...m, reactions } : m)));
    };

    const handleEdited = ({ messageId, text, editedAt }) => {
      setMessages((prev) => prev.map((m) => (m._id === messageId ? { ...m, text, editedAt } : m)));
    };

    const handleDeleted = ({ messageId }) => {
      setMessages((prev) =>
        prev.map((m) => (m._id === messageId ? { ...m, isDeleted: true, text: "" } : m))
      );
    };

    socket.on("message:new", handleNewMessage);
    socket.on("typing:update", handleTyping);
    socket.on("message:read-update", handleReadUpdate);
    socket.on("message:reaction-update", handleReactionUpdate);
    socket.on("message:edited", handleEdited);
    socket.on("message:deleted", handleDeleted);

    return () => {
      socket.off("message:new", handleNewMessage);
      socket.off("typing:update", handleTyping);
      socket.off("message:read-update", handleReadUpdate);
      socket.off("message:reaction-update", handleReactionUpdate);
      socket.off("message:edited", handleEdited);
      socket.off("message:deleted", handleDeleted);
    };
  }, [socket, conversationId, user.id, onMessageActivity]);

  const typingLabel = Object.values(typingUsers)[0]
    ? `${Object.values(typingUsers)[0]} is typing…`
    : null;

  const handleReply = (message) => {
    setEditingMessage(null);
    setReplyingTo(message);
  };

  const handleEdit = (message) => {
    setReplyingTo(null);
    setEditingMessage(message);
  };

  const handleReact = (messageId, emoji) => {
    socket?.emit("message:react", { conversationId, messageId, emoji });
  };

  const handleDelete = (message) => {
    if (!window.confirm("Delete this message?")) return;
    socket?.emit("message:delete", { conversationId, messageId: message._id });
  };

  // Debounced search-within-conversation (fresh query each time)
  useEffect(() => {
    if (!searchOpen) return;
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearchNextCursor(null);
      return;
    }
    setSearching(true);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/messages/${conversationId}/search`, {
          params: { q: searchQuery.trim() },
        });
        setSearchResults(data.messages);
        setSearchNextCursor(data.nextCursor);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(searchDebounceRef.current);
  }, [searchQuery, searchOpen, conversationId]);

  // Loads the next page of search results, appended to the end — no scroll
  // preservation needed here since results grow downward, not upward.
  const loadMoreSearchResults = async () => {
    if (!searchNextCursor || searchLoadingMore) return;
    setSearchLoadingMore(true);
    try {
      const { data } = await api.get(`/messages/${conversationId}/search`, {
        params: { q: searchQuery.trim(), cursor: searchNextCursor },
      });
      setSearchResults((prev) => [...prev, ...data.messages]);
      setSearchNextCursor(data.nextCursor);
    } finally {
      setSearchLoadingMore(false);
    }
  };

  const handleSearchResultsScroll = (e) => {
    const el = e.target;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (nearBottom && searchNextCursor && !searchLoadingMore) {
      loadMoreSearchResults();
    }
  };

  const toggleSearch = () => {
    setSearchOpen((prev) => {
      const next = !prev;
      if (!next) {
        setSearchQuery("");
        setSearchResults([]);
        setSearchNextCursor(null);
      }
      return next;
    });
  };

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
        <button
          onClick={toggleSearch}
          className="icon-btn ms-auto"
          aria-label="Search messages"
          title="Search messages"
        >
          <i className="bi bi-search" />
        </button>
      </div>

      {searchOpen && (
        <div className="search-panel">
          <div className="search-input-wrap">
            <i className="bi bi-search" />
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search in this conversation"
              className="form-control"
            />
            <button type="button" className="icon-btn" onClick={toggleSearch} aria-label="Close search">
              <i className="bi bi-x-lg" />
            </button>
          </div>
          {searching && <p className="empty-state py-2 mb-0">Searching…</p>}
          {!searching && searchQuery.trim() && searchResults.length === 0 && (
            <p className="empty-state py-2 mb-0">No matches</p>
          )}
          {!searching && searchResults.length > 0 && (
            <div className="search-results" onScroll={handleSearchResultsScroll}>
              {searchResults.map((m) => (
                <div key={m._id} className="search-result-item">
                  <span className="search-result-sender">{m.sender?.username}</span>
                  <span className="search-result-text">{m.text}</span>
                  <span className="search-result-time">{formatSearchTime(m.createdAt)}</span>
                </div>
              ))}
              {searchLoadingMore && (
                <p className="empty-state py-2 mb-0" style={{ fontSize: "0.75rem" }}>
                  Loading more…
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="message-list" ref={messageListRef} onScroll={handleMessageListScroll}>
        {loading && (
          <>
            <div className="skeleton-bubble" style={{ width: "45%", alignSelf: "flex-start" }} />
            <div className="skeleton-bubble" style={{ width: "60%", alignSelf: "flex-end" }} />
            <div className="skeleton-bubble" style={{ width: "35%", alignSelf: "flex-start" }} />
          </>
        )}

        {!loading && loadingMore && (
          <p className="empty-state mb-2" style={{ fontSize: "0.75rem" }}>
            <i className="bi bi-arrow-repeat me-1" /> Loading older messages…
          </p>
        )}

        {!loading && !nextCursor && messages.length > 0 && (
          <p className="empty-state mb-2" style={{ fontSize: "0.7rem" }}>
            Beginning of conversation
          </p>
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
                onReply={handleReply}
                onReact={handleReact}
                onEdit={handleEdit}
                onDelete={handleDelete}
                currentUserId={user.id}
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
        editingMessage={editingMessage}
        onCancelEdit={() => setEditingMessage(null)}
      />
    </div>
  );
};

export default ChatWindow;
