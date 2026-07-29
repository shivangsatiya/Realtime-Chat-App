const formatTime = (isoString) =>
  new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const MessageBubble = ({ message, isOwn, showSender, onReply }) => {
  return (
    <div className={`message-row ${isOwn ? "own" : "other"}`}>
      <div className="message-col" style={{ alignItems: isOwn ? "flex-end" : "flex-start" }}>
        {showSender && !isOwn && (
          <span className="message-sender-label">{message.sender?.username}</span>
        )}
        <div className="message-bubble-wrap">
          <button
            type="button"
            className="reply-trigger"
            onClick={() => onReply?.(message)}
            aria-label="Reply to this message"
            title="Reply"
          >
            <i className="bi bi-reply-fill" />
          </button>
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
        <span className="message-meta">{formatTime(message.createdAt)}</span>
      </div>
    </div>
  );
};

export default MessageBubble;