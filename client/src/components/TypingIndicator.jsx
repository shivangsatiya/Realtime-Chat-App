const TypingIndicator = ({ label }) => {
  return (
    <div className="d-flex flex-column align-items-start">
      {label && <span className="message-sender-label">{label}</span>}
      <div className="typing-indicator">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
    </div>
  );
};

export default TypingIndicator;
