import { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useSocket } from "../context/SocketContext.jsx";
import PresenceDot from "./PresenceDot.jsx";
import NewChatModal from "./NewChatModal.jsx";

const getConversationLabel = (conversation, currentUserId) => {
  if (conversation.isGroup) return conversation.name;
  const other = conversation.participants.find((p) => p._id !== currentUserId);
  return other?.username || "Unknown user";
};

const Sidebar = ({
  conversations,
  activeId,
  unreadIds,
  soundEnabled,
  onToggleSound,
  onSelect,
  onConversationCreated,
  onLoadMore,
  hasMoreConversations,
  loadingMoreConversations,
}) => {
  const { user, logout } = useAuth();
  const { onlineUserIds } = useSocket();
  const [modalOpen, setModalOpen] = useState(false);

  const handleScroll = (e) => {
    const el = e.target;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (nearBottom && hasMoreConversations && !loadingMoreConversations) {
      onLoadMore?.();
    }
  };

  return (
    <div className="sidebar-panel">
      <div className="sidebar-header border-bottom">
        <div className="brand-mark">
          <span className="pulse-dot" style={{ height: 8, width: 8 }} />
          <span>Wire</span>
        </div>
        <div className="d-flex align-items-center gap-1">
          <button
            onClick={onToggleSound}
            className="icon-btn icon-btn-muted"
            aria-label={soundEnabled ? "Mute notifications" : "Unmute notifications"}
            title={soundEnabled ? "Mute notifications" : "Unmute notifications"}
          >
            <i className={`bi ${soundEnabled ? "bi-volume-up-fill" : "bi-volume-mute-fill"}`} />
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="icon-btn icon-plus"
            aria-label="New conversation"
            title="New conversation"
          >
            <i className="bi bi-plus-lg" />
          </button>
        </div>
      </div>

      <div className="conversation-list" onScroll={handleScroll}>
        {conversations.length === 0 && (
          <p className="empty-state">No conversations yet. Tap + to start one.</p>
        )}
        {conversations.map((c, idx) => {
          const label = getConversationLabel(c, user.id);
          const other = !c.isGroup && c.participants.find((p) => p._id !== user.id);
          const isOnline = other && onlineUserIds.has(other._id);
          const isActive = activeId === c._id;
          const isUnread = unreadIds?.has(c._id);

          return (
            <button
              key={c._id}
              onClick={() => onSelect(c)}
              className={`conversation-item ${isActive ? "active" : ""} ${isUnread ? "unread" : ""}`}
              style={{ animationDelay: `${Math.min(idx, 10) * 40}ms` }}
            >
              <span className="position-relative flex-shrink-0">
                <span
                  className="avatar-circle"
                  style={{ backgroundColor: c.isGroup ? "#8b5cf6" : other?.avatarColor || "#64748b" }}
                >
                  {c.isGroup ? <i className="bi bi-people-fill" /> : label.slice(0, 2).toUpperCase()}
                </span>
                {!c.isGroup && (
                  <span className="position-absolute" style={{ bottom: -1, right: -1 }}>
                    <PresenceDot isOnline={isOnline} />
                  </span>
                )}
                {isUnread && <span className="unread-badge" />}
              </span>
              <span className="flex-grow-1" style={{ minWidth: 0 }}>
                <span className="conversation-name d-block">{label}</span>
                <span className="conversation-preview d-block">
                  {c.lastMessage
                    ? `${c.lastMessage.sender?.username ?? ""}: ${c.lastMessage.text}`
                    : c.isGroup
                    ? "Group room created"
                    : "Say hello"}
                </span>
              </span>
            </button>
          );
        })}
        {loadingMoreConversations && (
          <p className="empty-state py-2" style={{ fontSize: "0.75rem" }}>
            <i className="bi bi-arrow-repeat me-1" /> Loading more…
          </p>
        )}
      </div>

      <div className="sidebar-footer border-top">
        <div className="d-flex align-items-center gap-2" style={{ minWidth: 0 }}>
          <span className="avatar-circle sm" style={{ backgroundColor: user.avatarColor }}>
            {user.username.slice(0, 2).toUpperCase()}
          </span>
          <span className="text-truncate" style={{ fontSize: "0.9rem" }}>{user.username}</span>
        </div>
        <button
          onClick={logout}
          className="btn btn-sm"
          style={{ color: "var(--color-text-muted)", fontSize: "0.75rem" }}
          title="Sign out"
        >
          <i className="bi bi-box-arrow-right" />
        </button>
      </div>

      {modalOpen && (
        <NewChatModal
          onClose={() => setModalOpen(false)}
          onConversationCreated={onConversationCreated}
        />
      )}
    </div>
  );
};

export default Sidebar;
