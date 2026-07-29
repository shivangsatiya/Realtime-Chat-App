import { useEffect, useRef, useState } from "react";
import api from "../api/axios.js";

const TYPING_STOP_DELAY = 1500;
const SENT_FLOURISH_DURATION = 400;

const MessageInput = ({ conversationId, socket, replyingTo, onCancelReply, editingMessage, onCancelEdit }) => {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  // Reset the composer whenever the active conversation changes
  useEffect(() => {
    setText("");
    setPendingAttachment(null);
    setUploadError("");
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

  const handlePickFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again later
    if (!file) return;

    setUploadError("");
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await api.post("/uploads", formData);
      setPendingAttachment(data);
    } catch (err) {
      setUploadError(err.response?.data?.message || "Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if ((!trimmed && !pendingAttachment) || !socket || sending || uploading) return;

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
      { conversationId, text: trimmed, replyTo: replyingTo?._id, attachment: pendingAttachment },
      (response) => {
        setSending(false);
        if (!response?.error) {
          setText("");
          setPendingAttachment(null);
          setJustSent(true);
          setTimeout(() => setJustSent(false), SENT_FLOURISH_DURATION);
          onCancelReply?.();
        }
      }
    );
  };

  const canSubmit = (text.trim() || pendingAttachment) && !sending && !uploading;

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
      {(uploading || pendingAttachment || uploadError) && (
        <div className="reply-preview-bar">
          <div className="reply-preview-content">
            {uploading && <span className="reply-preview-label">Uploading…</span>}
            {!uploading && pendingAttachment && (
              <>
                <span className="reply-preview-label">
                  <i className={`bi ${pendingAttachment.type === "image" ? "bi-image" : "bi-file-earmark"} me-1`} />
                  Attachment ready
                </span>
                <span className="reply-preview-text">{pendingAttachment.name}</span>
              </>
            )}
            {!uploading && uploadError && (
              <span className="reply-preview-label" style={{ color: "var(--color-danger)" }}>
                {uploadError}
              </span>
            )}
          </div>
          {!uploading && (
            <button
              type="button"
              className="reply-preview-cancel"
              onClick={() => {
                setPendingAttachment(null);
                setUploadError("");
              }}
              aria-label="Remove attachment"
            >
              <i className="bi bi-x-lg" />
            </button>
          )}
        </div>
      )}
      <form onSubmit={handleSubmit} className="message-input-bar">
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelected}
          style={{ display: "none" }}
          accept="image/*,.pdf,.doc,.docx,.txt,.zip"
        />
        <button
          type="button"
          className="icon-btn icon-btn-muted"
          onClick={handlePickFile}
          disabled={uploading || !!editingMessage}
          aria-label="Attach a file"
          title="Attach a file"
        >
          <i className="bi bi-paperclip" />
        </button>
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
          disabled={!canSubmit}
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