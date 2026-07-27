import { RiskEvent, sanitizeForDisplay } from '../types'
import { getSettings } from './storage'

export async function notifyRiskEvent(event: RiskEvent): Promise<void> {
  const settings = await getSettings()
  if (!settings.notificationsEnabled) return
  if (settings.onlyHighRiskAlerts && event.severity !== 'high' && event.severity !== 'critical') return

  if (event.severity === 'high' || event.severity === 'critical') {
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
        requireInteraction: true,
      })
    } catch (e) {
      console.error('Failed to create notification:', e)
    }
  }
}

let notifListenersAdded = false

export function setupNotificationHandlers(): void {
  if (notifListenersAdded) return
  notifListenersAdded = true
  chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
    if (buttonIndex === 1) {
      try { chrome.notifications.clear(notificationId) } catch {}
    }
  })
}
