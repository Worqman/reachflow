import { useEffect, useState } from 'react'
import { notifications as notificationsApi } from '../lib/api'
import { useToast } from '../components/Toast'
import { Sk } from '../components/Skeleton'
import './Notifications.css'

export default function NotificationsTab() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState([])
  const [savingKey, setSavingKey] = useState(null)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await notificationsApi.list()
      setEvents(res?.events || [])
    } catch (e) {
      setError(e?.message || 'Failed to load notification preferences')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleToggle(key, enabled) {
    setEvents(list => list.map(e => e.key === key ? { ...e, enabled } : e))
    setSavingKey(key)
    try {
      const res = await notificationsApi.setEvent(key, enabled)
      if (res?.events) setEvents(res.events)
    } catch (e) {
      // revert on failure
      setEvents(list => list.map(ev => ev.key === key ? { ...ev, enabled: !enabled } : ev))
      toast?.(e?.message || 'Could not save notification preference', 'danger')
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <div>
          <h2 className="settings-section-title">Notifications</h2>
          <p className="settings-section-desc">Choose which events notify you.</p>
        </div>
      </div>

      {error && <div className="settings-error">{error}</div>}

      <div className="settings-card">
        <div className="settings-card-title">Events</div>
        {loading ? (
          <div className="notif-list">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="notif-row">
                <div style={{ flex: 1 }}><Sk w="35%" h={13} /><div style={{ marginTop: 6 }}><Sk w="65%" h={11} /></div></div>
                <Sk w={36} h={20} r={10} />
              </div>
            ))}
          </div>
        ) : (
          <div className="notif-list">
            {events.map(ev => (
              <div key={ev.key} className="notif-row">
                <div>
                  <div className="notif-label">{ev.label}</div>
                  <div className="notif-desc">{ev.description}</div>
                </div>
                <label className="toggle" style={{ margin: 0, flexShrink: 0 }}>
                  <input
                    type="checkbox"
                    checked={!!ev.enabled}
                    disabled={savingKey === ev.key}
                    onChange={e => handleToggle(ev.key, e.target.checked)}
                  />
                  <span className="toggle-track" />
                </label>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
