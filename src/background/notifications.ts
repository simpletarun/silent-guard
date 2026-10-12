import { RiskEvent, sanitizeForDisplay } from '../types'
import { getSettings } from './storage'

// Page-influenced events (cookies, sensor usage) can reach this path —
// throttle so a website cannot spam desktop notifications.
const NOTIFICATION_THROTTLE_MS = 15 * 60 * 1000
const lastShown: Map<string, number> = new Map()

// The throttle map is memory-only by default — an MV3 worker restart wipes
// it and lets a page re-burst notification spam. Mirror it to session
// storage (cleared at browser shutdown, exactly the right scope).
const THROTTLE_STORAGE_KEY = 'sgNotifyThrottle'
let throttleHydrated = false

async function hydrateThrottle(): Promise<void> {
  if (throttleHydrated) return
  throttleHydrated = true
  try {
    const saved = await chrome.storage.session.get(THROTTLE_STORAGE_KEY)
    const entries = (saved as Record<string, unknown>)[THROTTLE_STORAGE_KEY]
    if (entries && typeof entries === 'object') {
      for (const [k, v] of Object.entries(entries)) {
        if (typeof v === 'number') lastShown.set(k, v)
      }
    }
  } catch { /* storage unavailable — fall back to memory-only */ }
}

function persistThrottle(): void {
  chrome.storage.session.set({ [THROTTLE_STORAGE_KEY]: Object.fromEntries(lastShown) }).catch(() => {})
}

export async function notifyRiskEvent(event: RiskEvent): Promise<void> {
  const settings = await getSettings()
  if (!settings.notificationsEnabled) return
  // Low never notifies (spam). With "only high risk" off, medium events
  // notify too — previously they fell through both gates and never showed.
  const allowed = event.severity === 'high' || event.severity === 'critical' ||
    (!settings.onlyHighRiskAlerts && event.severity === 'medium')
  if (!allowed) return
  await hydrateThrottle()

  const throttleKey = `${event.type}:${event.source}`
  const last = lastShown.get(throttleKey) || 0
  if (Date.now() - last < NOTIFICATION_THROTTLE_MS) return
  lastShown.set(throttleKey, Date.now())
  persistThrottle()
  // Evict the oldest entry — clear() would reset every active throttle and
  // let a page re-burst notifications it already burned.
  if (lastShown.size > 200) {
    const oldest = lastShown.keys().next().value
    if (oldest !== undefined) lastShown.delete(oldest)
  }

  const icon = event.severity === 'critical' ? '🔴' : '⚠️'
  try {
    chrome.notifications.create(event.id, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: `${icon} Security Alert`,
      message: sanitizeForDisplay(event.description, 250),
      priority: event.severity === 'critical' ? 2 : 1,
      buttons: [
        { title: 'View details' },
        { title: 'Dismiss' },
      ],
      requireInteraction: event.severity === 'critical',
    }, () => {})
  } catch (e) {
    console.error('Failed to create notification:', e)
  }
}

let notifListenersAdded = false

export function resetNotificationThrottles(): void {
  lastShown.clear()
  throttleHydrated = true
  persistThrottle()
}

export function setupNotificationHandlers(): void {
  if (notifListenersAdded) return
  notifListenersAdded = true
  chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
    if (buttonIndex === 0) {
      // "View details" — open the extension popup.
      chrome.action.openPopup().catch(() => {})
    } else if (buttonIndex === 1) {
      try { chrome.notifications.clear(notificationId) } catch {}
    }
  })
}
