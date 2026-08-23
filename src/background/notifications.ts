import { RiskEvent, sanitizeForDisplay } from '../types'
import { getSettings } from './storage'

// Page-influenced events (cookies, sensor usage) can reach this path —
// throttle so a website cannot spam desktop notifications.
const NOTIFICATION_THROTTLE_MS = 15 * 60 * 1000
const lastShown: Map<string, number> = new Map()

export async function notifyRiskEvent(event: RiskEvent): Promise<void> {
  const settings = await getSettings()
  if (!settings.notificationsEnabled) return
  // Low never notifies (spam). With "only high risk" off, medium events
  // notify too — previously they fell through both gates and never showed.
  const allowed = event.severity === 'high' || event.severity === 'critical' ||
    (!settings.onlyHighRiskAlerts && event.severity === 'medium')
  if (!allowed) return

  const throttleKey = `${event.type}:${event.source}`
  const last = lastShown.get(throttleKey) || 0
  if (Date.now() - last < NOTIFICATION_THROTTLE_MS) return
  lastShown.set(throttleKey, Date.now())
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
