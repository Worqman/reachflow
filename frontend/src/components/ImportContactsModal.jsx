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
      <div className="modal-box animate-fade-in" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-header">
          <h2 className="modal-title">Import contacts</h2>
          <button className="btn btn-icon btn-ghost" onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Select a user */}
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">
              Select a user <span style={{ color: "var(--danger)", textTransform: "none", fontWeight: 700 }}>*</span>
            </label>
            <select
              className="input"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              style={{ cursor: "pointer" }}
            >
              <option value="" disabled>Select user…</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || m.username || m.email || m.id}
                </option>
              ))}
            </select>
          </div>

          {/* Add to a list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label className="input-label">
              Add to a list <span style={{ color: "var(--danger)", textTransform: "none", fontWeight: 700 }}>*</span>
            </label>

            <select
              className="input"
              value={selectedListId}
              onChange={(e) => { setSelectedListId(e.target.value); setShowNewList(false); }}
              style={{ cursor: "pointer" }}
            >
              <option value="" disabled>Select an existing list…</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>

            {/* Move existing checkbox */}
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                checked={moveExisting}
                onChange={(e) => setMoveExisting(e.target.checked)}
                style={{ width: 14, height: 14, accentColor: "var(--signal)", cursor: "pointer", flexShrink: 0 }}
              />
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                Move existing leads to the new list
              </span>
              <span
                title="Leads that already exist in another list will be moved to this list"
                style={{
                  width: 15, height: 15,
                  borderRadius: "50%",
                  border: "1px solid var(--border-2)",
                  color: "var(--text-muted)",
                  fontSize: 9,
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "default",
                  flexShrink: 0,
                  lineHeight: 1,
                }}
              >?</span>
            </label>

            {/* Create a new list */}
            {showNewList ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  autoFocus
                  className="input"
                  placeholder="List name…"
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
                  style={{ flexShrink: 0, padding: "5px 8px" }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                className="btn btn-ghost"
                onClick={() => setShowNewList(true)}
                style={{
                  border: "1px dashed var(--border-2)",
                  color: "var(--signal)",
                  justifyContent: "center",
                  gap: 6,
                  fontSize: 13,
                }}
              >
                + Create a new list
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!canConfirm}
            onClick={handleConfirm}
            style={{ minWidth: 90 }}
          >
            {saving ? "Saving…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
