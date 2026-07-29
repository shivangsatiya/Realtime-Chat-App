import { useCallback, useEffect, useRef, useState } from "react";
import api from "../api/axios.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useSocket } from "../context/SocketContext.jsx";
import { playNotificationSound } from "../utils/sound.js";
import Sidebar from "../components/Sidebar.jsx";
import ChatWindow from "../components/ChatWindow.jsx";

const Chat = () => {
  const { user } = useAuth();
  const { socket, connected, hasConnectedOnce } = useSocket();
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [conversationsNextCursor, setConversationsNextCursor] = useState(null);
  const [loadingMoreConversations, setLoadingMoreConversations] = useState(false);
  const [unreadIds, setUnreadIds] = useState(new Set());
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const stored = localStorage.getItem("wire_sound_enabled");
    return stored === null ? true : stored === "true";
  });

  const activeIdRef = useRef(null);
  useEffect(() => {
    activeIdRef.current = activeConversation?._id ?? null;
  }, [activeConversation]);

  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const { data } = await api.get("/conversations");
        setConversations(data.conversations);
        setConversationsNextCursor(data.nextCursor);

        const storedId = sessionStorage.getItem("wire_active_conversation");
        if (storedId) {
          const match = data.conversations.find((c) => c._id === storedId);
          if (match) setActiveConversation(match);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchConversations();
  }, []);

  // Fetches the next page of older/less-recently-active conversations,
  // appended to the end of the list — triggered by scrolling near the
  // bottom of the sidebar's conversation list.
  const loadMoreConversations = async () => {
    if (!conversationsNextCursor || loadingMoreConversations) return;
    setLoadingMoreConversations(true);
    try {
      const { data } = await api.get("/conversations", {
        params: {
          cursor: conversationsNextCursor.cursor,
          cursorId: conversationsNextCursor.cursorId,
        },
      });
      setConversations((prev) => [...prev, ...data.conversations]);
      setConversationsNextCursor(data.nextCursor);
    } finally {
      setLoadingMoreConversations(false);
    }
  };

  const updateConversationWithMessage = useCallback((message) => {
    setConversations((prev) => {
      const idx = prev.findIndex((c) => c._id === message.conversation);
      if (idx === -1) return prev;
      const updated = { ...prev[idx], lastMessage: message };
      const rest = prev.filter((_, i) => i !== idx);
      return [updated, ...rest];
    });
  }, []);

  // Single global listener: keeps sidebar previews/order fresh, tracks
  // unread state for background conversations, and plays a notification
  // sound for anything the current user didn't send themselves.
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (message) => {
      updateConversationWithMessage(message);

      const isMine = message.sender._id === user.id;
      const isOpen = activeIdRef.current === message.conversation;

      if (!isMine && !isOpen) {
        setUnreadIds((prev) => new Set(prev).add(message.conversation));
      }
      if (!isMine && soundEnabled) {
        playNotificationSound();
      }
    };

    socket.on("message:new", handleNewMessage);
    return () => socket.off("message:new", handleNewMessage);
  }, [socket, updateConversationWithMessage, user.id, soundEnabled]);

  const handleConversationCreated = (conversation) => {
    setConversations((prev) => {
      const exists = prev.some((c) => c._id === conversation._id);
      return exists ? prev : [conversation, ...prev];
    });
    socket?.emit("conversation:join", conversation._id);
    setActiveConversation(conversation);
    sessionStorage.setItem("wire_active_conversation", conversation._id);
  };

  const handleSelect = (conversation) => {
    setActiveConversation(conversation);
    sessionStorage.setItem("wire_active_conversation", conversation._id);
    setUnreadIds((prev) => {
      if (!prev.has(conversation._id)) return prev;
      const next = new Set(prev);
      next.delete(conversation._id);
      return next;
    });
  };

  const toggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      localStorage.setItem("wire_sound_enabled", String(next));
      return next;
    });
  };

  const sidebarWrapperClass = activeConversation ? "d-none d-md-block h-100" : "d-block h-100";
  const mainWrapperClass = activeConversation
    ? "d-flex flex-grow-1 h-100"
    : "d-none d-md-flex flex-grow-1 h-100";

  return (
    <div className="chat-shell-wrap">
      {hasConnectedOnce && !connected && (
        <div className="reconnect-banner">
          <span className="pulse-dot" style={{ height: 7, width: 7, background: "var(--color-danger)" }} />
          Reconnecting…
        </div>
      )}
      <div className="chat-shell">
      <div className={sidebarWrapperClass}>
        {loading ? (
          <div className="sidebar-panel align-items-center justify-content-center">
            <span className="pulse-dot" />
          </div>
        ) : (
          <Sidebar
            conversations={conversations}
            activeId={activeConversation?._id}
            unreadIds={unreadIds}
            soundEnabled={soundEnabled}
            onToggleSound={toggleSound}
            onSelect={handleSelect}
            onConversationCreated={handleConversationCreated}
            onLoadMore={loadMoreConversations}
            hasMoreConversations={!!conversationsNextCursor}
            loadingMoreConversations={loadingMoreConversations}
          />
        )}
      </div>

      <div className={mainWrapperClass} style={{ minWidth: 0 }}>
        {activeConversation ? (
          <ChatWindow
            key={activeConversation._id}
            conversation={activeConversation}
            onMessageActivity={updateConversationWithMessage}
            onBack={() => {
              setActiveConversation(null);
              sessionStorage.removeItem("wire_active_conversation");
            }}
          />
        ) : (
          <div className="d-flex flex-column align-items-center justify-content-center flex-grow-1 text-center px-4">
            <i
              className="bi bi-chat-square-text empty-state-icon"
              style={{ fontSize: "2.5rem", color: "var(--color-text-muted)" }}
            />
            <p className="mt-3 mb-0" style={{ color: "var(--color-text-muted)" }}>
              Select a conversation, or start a new one.
            </p>
          </div>
        )}
      </div>
    </div>
    </div>
  );
};

export default Chat;
