const KEY = 'rf_active_workspace_id'

export function getActiveWorkspaceId() {
  try {
    return localStorage.getItem(KEY) || null
  } catch {
    return null
  }
}

export function setActiveWorkspaceId(id) {
  try {
    if (!id) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, String(id))
  } catch {
    // ignore
  }

  // Notify same-tab listeners
  window.dispatchEvent(new CustomEvent('rf:workspace-changed', { detail: { id } }))
}

export function onActiveWorkspaceChange(handler) {
  function onCustom(e) {
    handler?.(e?.detail?.id ?? null)
  }

  function onStorage(e) {
    if (e.key !== KEY) return
    handler?.(e.newValue || null)
  }

  window.addEventListener('rf:workspace-changed', onCustom)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener('rf:workspace-changed', onCustom)
    window.removeEventListener('storage', onStorage)
  }
}

