import { useState } from "react";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

const formatTime = (isoString) =>
  new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const groupReactions = (reactions = []) => {
  const groups = {};
  reactions.forEach((r) => {
    if (!groups[r.emoji]) groups[r.emoji] = [];
    groups[r.emoji].push(r.user);
  });
  return groups;
};

const MessageBubble = ({ message, isOwn, showSender, onReply, onReact, onEdit, onDelete, currentUserId }) => {
  const [pickerOpen, setPickerOpen] = useState(false);

  if (message.isDeleted) {
    return (
      <div className={`message-row ${isOwn ? "own" : "other"}`}>
        <div className="message-col" style={{ alignItems: isOwn ? "flex-end" : "flex-start" }}>
          <div className="message-bubble deleted">
            <i className="bi bi-slash-circle me-1" />
            This message was deleted
          </div>
          <span className="message-meta">{formatTime(message.createdAt)}</span>
        </div>
      </div>
    );
  }

  const grouped = groupReactions(message.reactions);

  return (
    <div className={`message-row ${isOwn ? "own" : "other"}`}>
      <div className="message-col" style={{ alignItems: isOwn ? "flex-end" : "flex-start" }}>
        {showSender && !isOwn && (
          <span className="message-sender-label">{message.sender?.username}</span>
        )}
        <div className="message-bubble-wrap">
          <div className="message-actions">
            <button
              type="button"
              className="reply-trigger"
              onClick={() => onReply?.(message)}
              aria-label="Reply to this message"
              title="Reply"
            >
              <i className="bi bi-reply-fill" />
            </button>
            <div className="reaction-picker-wrap">
              <button
                type="button"
                className="reply-trigger"
                onClick={() => setPickerOpen((p) => !p)}
                aria-label="Add reaction"
                title="React"
              >
                <i className="bi bi-emoji-smile" />
              </button>
              {pickerOpen && (
                <div className="reaction-picker">
                  {QUICK_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className="reaction-picker-option"
                      onClick={() => {
                        onReact?.(message._id, emoji);
                        setPickerOpen(false);
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {isOwn && (
              <>
                <button
                  type="button"
                  className="reply-trigger"
                  onClick={() => onEdit?.(message)}
                  aria-label="Edit message"
                  title="Edit"
                >
                  <i className="bi bi-pencil-fill" />
                </button>
                <button
                  type="button"
                  className="reply-trigger"
                  onClick={() => onDelete?.(message)}
                  aria-label="Delete message"
                  title="Delete"
                >
                  <i className="bi bi-trash-fill" />
                </button>
              </>
            )}
          </div>
          <div className={`message-bubble ${isOwn ? "own" : "other"}`}>
            {message.replyTo && (
              <div className="reply-quote">
                <span className="reply-quote-sender">{message.replyTo.sender?.username}</span>
                <span className="reply-quote-text">{message.replyTo.text}</span>
              </div>
            )}
            {message.text}
          </div>
        </div>

        {Object.keys(grouped).length > 0 && (
          <div className="reaction-bar">
            {Object.entries(grouped).map(([emoji, users]) => {
              const mine = users.some((u) => (u._id || u) === currentUserId);
              return (
                <button
                  key={emoji}
                  type="button"
                  className={`reaction-pill ${mine ? "mine" : ""}`}
                  onClick={() => onReact?.(message._id, emoji)}
                  title={users.map((u) => u.username || "Someone").join(", ")}
                >
                  <span>{emoji}</span>
                  <span className="reaction-count">{users.length}</span>
                </button>
              );
            })}
          </div>
        )}

        <span className="message-meta">
          {formatTime(message.createdAt)}
          {message.editedAt && <span className="ms-1">(edited)</span>}
        </span>
      </div>
    </div>
  );
};

export default MessageBubble;