import { useState } from "react";

export default function ImportContactsModal({
  open,
  onClose,
  onConfirm,
  members = [],
  lists = [],
  onCreateList,
  saving = false,
}) {
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedListId, setSelectedListId] = useState("");
  const [moveExisting, setMoveExisting] = useState(false);
  const [showNewList, setShowNewList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [creatingList, setCreatingList] = useState(false);

  if (!open) return null;

  async function handleCreateList() {
    const name = newListName.trim();
    if (!name || !onCreateList) return;
    setCreatingList(true);
    try {
      const created = await onCreateList(name);
      setSelectedListId(created.id);
      setNewListName("");
      setShowNewList(false);
    } catch {}
    setCreatingList(false);
  }

  function handleConfirm() {
    if (!selectedUserId || !selectedListId) return;
    onConfirm({ userId: selectedUserId, listId: selectedListId, moveExisting });
  }

  const canConfirm = selectedUserId && selectedListId && !saving;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="animate-fade-in"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border-2)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-lg), 0 0 0 1px rgba(255,255,255,0.04)",
          width: "100%",
          maxWidth: 460,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: "24px 24px 20px" }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)" }}>
            Import contacts
          </div>
        </div>
        <div style={{ borderTop: "1px solid var(--border)" }} />

        {/* Body */}
        <div style={{ padding: "24px 24px 20px", display: "flex", flexDirection: "column", gap: 24 }}>

          {/* Select a user */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 4 }}>
              Select a user <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            <div style={{ position: "relative" }}>
              <select
                className="input"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                style={{
                  cursor: "pointer",
                  appearance: "none",
                  paddingRight: 36,
                  color: selectedUserId ? "var(--text-primary)" : "var(--text-muted)",
                }}
              >
                <option value="" disabled>Select User</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name || m.username || m.email || m.id}
                  </option>
                ))}
              </select>
              <span style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                pointerEvents: "none",
                color: "var(--text-muted)",
                fontSize: 12,
              }}>▾</span>
            </div>
          </div>

          {/* Add to a list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 4 }}>
              Add to a list<span style={{ color: "var(--danger)" }}>*</span>
            </label>

            {/* Existing list dropdown */}
            <div style={{ position: "relative" }}>
              <select
                className="input"
                value={selectedListId}
                onChange={(e) => { setSelectedListId(e.target.value); setShowNewList(false); }}
                style={{
                  cursor: "pointer",
                  appearance: "none",
                  paddingRight: 36,
                  color: selectedListId ? "var(--text-primary)" : "var(--text-muted)",
                }}
              >
                <option value="" disabled>Select an existing list</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
              <span style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                pointerEvents: "none",
                color: "var(--text-muted)",
                fontSize: 12,
              }}>▾</span>
            </div>

            {/* Move existing checkbox */}
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "var(--text-secondary)" }}>
              <input
                type="checkbox"
                checked={moveExisting}
                onChange={(e) => setMoveExisting(e.target.checked)}
                style={{ width: 15, height: 15, cursor: "pointer", accentColor: "var(--signal)", flexShrink: 0 }}
              />
              Move existing leads to the new list
              <span
                title="Leads that already exist in another list will be moved to this list"
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  border: "1px solid var(--border-2)",
                  color: "var(--text-muted)",
                  fontSize: 10,
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "default",
                  flexShrink: 0,
                }}
              >?</span>
            </label>

            {/* Create a new list */}
            {showNewList ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  autoFocus
                  className="input"
                  style={{ flex: 1, fontSize: 13 }}
                  placeholder="New list name…"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateList();
                    if (e.key === "Escape") { setShowNewList(false); setNewListName(""); }
                  }}
                />
                <button
                  className="btn btn-primary btn-sm"
                  disabled={creatingList || !newListName.trim()}
                  onClick={handleCreateList}
                  style={{ flexShrink: 0 }}
                >
                  {creatingList ? "…" : "Create"}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => { setShowNewList(false); setNewListName(""); }}
                  style={{ flexShrink: 0 }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowNewList(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: "10px 16px",
                  border: "1.5px solid var(--signal)",
                  borderRadius: "var(--radius-md)",
                  background: "none",
                  color: "var(--signal)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "background var(--transition-fast)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--signal-subtle)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                + Create a new list
              </button>
            )}
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--border)" }} />

        {/* Footer */}
        <div style={{ padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button
            className="btn btn-secondary"
            onClick={onClose}
            style={{ minWidth: 80 }}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!canConfirm}
            onClick={handleConfirm}
            style={{ minWidth: 100 }}
          >
            {saving ? "Saving…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
