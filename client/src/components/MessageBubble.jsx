const formatTime = (isoString) =>
  new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const MessageBubble = ({ message, isOwn, showSender }) => {
  return (
    <div className={`message-row ${isOwn ? "own" : "other"}`}>
      <div className="message-col" style={{ alignItems: isOwn ? "flex-end" : "flex-start" }}>
        {showSender && !isOwn && (
          <span className="message-sender-label">{message.sender?.username}</span>
        )}
        <div className={`message-bubble ${isOwn ? "own" : "other"}`}>{message.text}</div>
        <span className="message-meta">{formatTime(message.createdAt)}</span>
      </div>
    </div>
  );
};

export default MessageBubble;
