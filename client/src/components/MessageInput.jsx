import { useEffect, useRef, useState } from "react";

const TYPING_STOP_DELAY = 1500;
const SENT_FLOURISH_DURATION = 400;

const MessageInput = ({ conversationId, socket }) => {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);

  // Reset the composer whenever the active conversation changes
  useEffect(() => {
    setText("");
    isTypingRef.current = false;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
  }, [conversationId]);

  const stopTyping = () => {
    if (isTypingRef.current) {
      socket?.emit("typing:stop", { conversationId });
      isTypingRef.current = false;
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
  };

  const handleChange = (e) => {
    setText(e.target.value);

    if (!socket) return;
    if (!isTypingRef.current) {
      socket.emit("typing:start", { conversationId });
      isTypingRef.current = true;
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(stopTyping, TYPING_STOP_DELAY);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || !socket || sending) return;

    setSending(true);
    stopTyping();

    socket.emit("message:send", { conversationId, text: trimmed }, (response) => {
      setSending(false);
      if (!response?.error) {
        setText("");
        setJustSent(true);
        setTimeout(() => setJustSent(false), SENT_FLOURISH_DURATION);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="message-input-bar">
      <input
        type="text"
        value={text}
        onChange={handleChange}
        placeholder="Type a message"
        className="form-control"
        autoComplete="off"
      />
      <button
        type="submit"
        disabled={!text.trim() || sending}
        className={`send-btn ${justSent ? "sent" : ""}`}
        aria-label="Send message"
      >
        <i className="bi bi-send-fill" style={{ fontSize: "0.95rem" }} />
      </button>
    </form>
  );
};

export default MessageInput;
