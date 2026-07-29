import { useEffect, useRef, useState } from "react";

const TYPING_STOP_DELAY = 1500;
const SENT_FLOURISH_DURATION = 400;

const MessageInput = ({ conversationId, socket, replyingTo, onCancelReply, editingMessage, onCancelEdit }) => {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);
  const inputRef = useRef(null);

  // Reset the composer whenever the active conversation changes
  useEffect(() => {
    setText("");
    isTypingRef.current = false;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
  }, [conversationId]);

  // Focus the input the moment a reply target is picked
  useEffect(() => {
    if (replyingTo) inputRef.current?.focus();
  }, [replyingTo]);

  // Prefill with the existing text the moment an edit target is picked
  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.text);
      inputRef.current?.focus();
    }
  }, [editingMessage]);

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

    if (editingMessage) {
      socket.emit(
        "message:edit",
        { conversationId, messageId: editingMessage._id, text: trimmed },
        (response) => {
          setSending(false);
          if (!response?.error) {
            setText("");
            onCancelEdit?.();
          }
        }
      );
      return;
    }

    socket.emit(
      "message:send",
      { conversationId, text: trimmed, replyTo: replyingTo?._id },
      (response) => {
        setSending(false);
        if (!response?.error) {
          setText("");
          setJustSent(true);
          setTimeout(() => setJustSent(false), SENT_FLOURISH_DURATION);
          onCancelReply?.();
        }
      }
    );
  };

  return (
    <div className="message-input-area">
      {editingMessage && (
        <div className="reply-preview-bar">
          <div className="reply-preview-content">
            <span className="reply-preview-label">
              <i className="bi bi-pencil-fill me-1" />
              Editing message
            </span>
          </div>
          <button
            type="button"
            className="reply-preview-cancel"
            onClick={onCancelEdit}
            aria-label="Cancel edit"
          >
            <i className="bi bi-x-lg" />
          </button>
        </div>
      )}
      {!editingMessage && replyingTo && (
        <div className="reply-preview-bar">
          <div className="reply-preview-content">
            <span className="reply-preview-label">Replying to {replyingTo.sender?.username}</span>
            <span className="reply-preview-text">{replyingTo.text}</span>
          </div>
          <button
            type="button"
            className="reply-preview-cancel"
            onClick={onCancelReply}
            aria-label="Cancel reply"
          >
            <i className="bi bi-x-lg" />
          </button>
        </div>
      )}
      <form onSubmit={handleSubmit} className="message-input-bar">
        <input
          ref={inputRef}
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
          aria-label={editingMessage ? "Save edit" : "Send message"}
        >
          <i className={`bi ${editingMessage ? "bi-check-lg" : "bi-send-fill"}`} style={{ fontSize: "0.95rem" }} />
        </button>
      </form>
    </div>
  );
};

export default MessageInput;