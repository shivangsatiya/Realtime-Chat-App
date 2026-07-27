import { useEffect, useState } from "react";
import api from "../api/axios.js";

const NewChatModal = ({ onClose, onConversationCreated }) => {
  const [mode, setMode] = useState("private"); // "private" | "group"
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [groupName, setGroupName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const { data } = await api.get("/users", { params: { search } });
        setUsers(data.users);
      } catch {
        // silently ignore transient search errors
      }
    };
    fetchUsers();
  }, [search]);

  const toggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleCreate = async () => {
    setError("");
    setLoading(true);
    try {
      if (mode === "private") {
        if (selectedIds.length !== 1) {
          setError("Pick exactly one person to message.");
          setLoading(false);
          return;
        }
        const { data } = await api.post("/conversations/private", { userId: selectedIds[0] });
        onConversationCreated(data.conversation);
      } else {
        if (!groupName.trim() || selectedIds.length < 2) {
          setError("Name the group and add at least 2 people.");
          setLoading(false);
          return;
        }
        const { data } = await api.post("/conversations/group", {
          name: groupName.trim(),
          participantIds: selectedIds,
        });
        onConversationCreated(data.conversation);
      }
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't start that conversation.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop-custom" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h2 className="h6 fw-semibold mb-0">New conversation</h2>
          <button onClick={onClose} className="icon-btn" aria-label="Close" style={{ fontSize: "1rem" }}>
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <div className="segmented-control">
          <div
            className="segmented-pill"
            style={{ transform: mode === "private" ? "translateX(0)" : "translateX(100%)" }}
          />
          <button
            type="button"
            onClick={() => {
              setMode("private");
              setSelectedIds([]);
            }}
            className={`segmented-btn ${mode === "private" ? "active" : ""}`}
          >
            <i className="bi bi-person me-1" />
            Direct message
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("group");
              setSelectedIds([]);
            }}
            className={`segmented-btn ${mode === "group" ? "active" : ""}`}
          >
            <i className="bi bi-people me-1" />
            Group room
          </button>
        </div>

        {mode === "group" && (
          <input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Group name"
            className="form-control mb-2"
            style={{ backgroundColor: "var(--color-bg)", borderColor: "var(--color-border)", color: "var(--color-text)" }}
          />
        )}

        <div className="input-group mb-3">
          <span className="input-group-text" style={{ backgroundColor: "var(--color-bg)", borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
            <i className="bi bi-search" />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search people by name or email"
            className="form-control"
            style={{ backgroundColor: "var(--color-bg)", borderColor: "var(--color-border)", color: "var(--color-text)" }}
          />
        </div>

        <div className="mb-3" style={{ maxHeight: "14rem", overflowY: "auto" }}>
          {users.map((u) => {
            const selected = selectedIds.includes(u.id);
            return (
              <button
                key={u.id}
                onClick={() => toggleSelect(u.id)}
                className={`user-pick-row mb-1 ${selected ? "selected" : ""}`}
              >
                <span className="avatar-circle sm" style={{ backgroundColor: u.avatarColor }}>
                  {u.username.slice(0, 2).toUpperCase()}
                </span>
                <span className="flex-grow-1" style={{ minWidth: 0 }}>
                  <span className="d-block" style={{ fontSize: "0.85rem" }}>{u.username}</span>
                  <span className="d-block" style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                    {u.email}
                  </span>
                </span>
                {selected && (
                  <i
                    key={u.id + "-check"}
                    className="bi bi-check-circle-fill check-pop"
                    style={{ color: "var(--color-accent)" }}
                  />
                )}
              </button>
            );
          })}
          {users.length === 0 && (
            <p className="empty-state mb-0 py-3">No matching people.</p>
          )}
        </div>

        {error && (
          <p className="mb-3" style={{ color: "var(--color-danger)", fontSize: "0.85rem" }}>
            {error}
          </p>
        )}

        <button onClick={handleCreate} disabled={loading} className="btn btn-accent w-100 py-2">
          {loading ? "Starting…" : mode === "private" ? "Start chat" : "Create group"}
        </button>
      </div>
    </div>
  );
};

export default NewChatModal;
