const EVENT = 'rf:inbox-unread-changed'

let _count = 0

export function getInboxUnreadCount() {
  return _count
}

export function setInboxUnreadCount(count) {
  _count = count || 0
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { count: _count } }))
}

export function onInboxUnreadChange(handler) {
  function onCustom(e) {
    handler?.(e?.detail?.count ?? 0)
  }
  window.addEventListener(EVENT, onCustom)
  return () => window.removeEventListener(EVENT, onCustom)
}
