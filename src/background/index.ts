import { scanExtensions, extInstalledHandler, extEnabledHandler, extDisabledHandler, extUninstalledHandler, startExtensionMonitor } from './monitors/extensionMonitor'
import { handleFingerprintReport } from './monitors/browserMonitor'
import { startNetworkMonitor, checkPublicIp } from './monitors/networkMonitor'
import { cookieChangeHandler } from './monitors/cookieMonitor'
import { startAccountMonitor, handleAddAccount, handleRemoveAccount, detectAccountsFromCookies, verifyAccount, checkAllAccounts } from './monitors/accountMonitor'
import { setupNotificationHandlers, notifyRiskEvent } from './notifications'
import { loadState, getSecurityState, getCategoryState, acknowledgeEvent, clearEvents, updateSettings, getSettings, addCategoryEvent, updateSecurityState } from './storage'
import { recalculateCategoryScore, recalculateAllScores, getOverallScore } from './engine'
import { BackgroundMessage, BrowserFingerprint, RiskEvent, GlobalSettings, SecurityCategory, SensorUsage, PageScanResult } from '../types'
import { updateBadge } from './badge'
import { phishingTabUpdatedHandler, startPhishingMonitor, checkPhishing } from './monitors/phishingMonitor'
import { startPasswordStrengthMonitor, evaluatePasswordStrength } from './monitors/passwordStrengthMonitor'
import { sessionTabUpdatedHandler, sessionCookieChangedHandler } from './monitors/sessionHijackMonitor'
import { certTabUpdatedHandler, checkCert } from './monitors/certMonitor'
import { dnsTabUpdatedHandler, checkDns } from './monitors/dnsMonitor'
import { headersReceivedHandler, auditHeaders } from './monitors/headersMonitor'
import { threatTabUpdatedHandler, startThreatIntelMonitor, checkIntelDomain } from './monitors/threatIntelMonitor'
import { tabCreatedHandler, tabRemovedHandler, tabUpdatedHandler, startAnomalyMonitor, detectAnomalies } from './monitors/anomalyMonitor'
import { startCorrelationEngine, runCorrelation } from './monitors/correlationEngine'
import { startTimelineMonitor, checkWeeklyDigest, recordTimelineEntry } from './monitors/timelineDigest'
import { storageChangedHandler, autoKillSessions, isolateNetwork, takeForensicSnapshot } from './monitors/autoResponse'

function accountTabUpdatedHandler(_tabId: number, changeInfo: chrome.tabs.TabChangeInfo): void {
  if (!changeInfo.url) return
  try {
    const domain = new URL(changeInfo.url).hostname.replace(/^www\./, '')
    getSecurityState().then(state => {
      const match = (state.accounts || []).find(a => a.domain === domain || a.domain.endsWith('.' + domain))
      if (match) verifyAccount(match.domain)
    }).catch(() => {})
  } catch {}
}

chrome.webRequest.onHeadersReceived.addListener(headersReceivedHandler, { urls: ['<all_urls>'] }, ['responseHeaders', 'extraHeaders'])
chrome.cookies.onChanged.addListener(cookieChangeHandler)
chrome.cookies.onChanged.addListener(sessionCookieChangedHandler)
chrome.management.onInstalled.addListener(extInstalledHandler)
chrome.management.onEnabled.addListener(extEnabledHandler)
chrome.management.onDisabled.addListener(extDisabledHandler)
chrome.management.onUninstalled.addListener(extUninstalledHandler)
chrome.tabs.onCreated.addListener(tabCreatedHandler)
chrome.tabs.onRemoved.addListener(tabRemovedHandler)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  tabUpdatedHandler(tabId, changeInfo, tab)
  sessionTabUpdatedHandler(tabId, changeInfo, tab)
  certTabUpdatedHandler(tabId, changeInfo, tab)
  dnsTabUpdatedHandler(tabId, changeInfo, tab)
  threatTabUpdatedHandler(tabId, changeInfo)
  phishingTabUpdatedHandler(tabId, changeInfo, tab)
  accountTabUpdatedHandler(tabId, changeInfo)
})
chrome.storage.onChanged.addListener(storageChangedHandler)

let initialized = false

async function initialize(): Promise<void> {
  if (initialized) return
  initialized = true

  await loadState()
  await recalculateAllScores()
  updateBadge()

  startExtensionMonitor()
  startNetworkMonitor()
  startAccountMonitor()
  setupNotificationHandlers()
  startPhishingMonitor()
  startPasswordStrengthMonitor()
  startThreatIntelMonitor()
  startAnomalyMonitor()
  startCorrelationEngine()
  startTimelineMonitor()

  chrome.alarms.create('scoreRecalculation', { periodInMinutes: 2 })
  chrome.alarms.create('ipCheck', { periodInMinutes: 5 })
  chrome.alarms.create('dnsCheck', { periodInMinutes: 30 })
  chrome.alarms.create('certCheck', { periodInMinutes: 60 })
  chrome.alarms.create('threatIntel', { periodInMinutes: 15 })
  chrome.alarms.create('anomalyScan', { periodInMinutes: 10 })
  chrome.alarms.create('correlationScan', { periodInMinutes: 2 })
  chrome.alarms.create('weeklyDigestCheck', { periodInMinutes: 60 })
}

chrome.runtime.onInstalled.addListener(() => {
  initialize().catch(() => {})
  detectAccountsFromCookies().catch(() => {})
})
chrome.runtime.onStartup.addListener(() => { initialize().catch(() => {}) })

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'scoreRecalculation') {
    recalculateAllScores().catch(() => {})
  }
  if (alarm.name === 'ipCheck') checkPublicIp().catch(() => {})
  if (alarm.name === 'dnsCheck') {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({})
        const domains = [...new Set(tabs.map(t => { try { return new URL(t.url || '').hostname } catch { return null } }).filter(Boolean))].slice(0, 5) as string[]
        for (const d of domains) checkDns(d).catch(() => {})
      } catch {}
    })()
  }
  if (alarm.name === 'certCheck') {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({})
        const domains = [...new Set(tabs.map(t => { try { return new URL(t.url || '').hostname } catch { return null } }).filter(Boolean))].slice(0, 5) as string[]
        for (const d of domains) checkCert(d).catch(() => {})
      } catch {}
    })()
  }
  if (alarm.name === 'threatIntel') {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({})
        const domains = [...new Set(tabs.map(t => { try { return new URL(t.url || '').hostname } catch { return null } }).filter(Boolean))].slice(0, 5) as string[]
        for (const d of domains) checkIntelDomain(d).catch(() => {})
      } catch {}
    })()
  }
  if (alarm.name === 'anomalyScan') { detectAnomalies().catch(() => {}) }
  if (alarm.name === 'correlationScan') { runCorrelation().catch(() => {}) }
  if (alarm.name === 'weeklyDigestCheck') { checkWeeklyDigest().catch(() => {}) }
  if (alarm.name === 'timelineRecord') { recordTimelineEntry().catch(() => {}) }
})

chrome.runtime.onMessage.addListener((
  message: BackgroundMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void
) => {
  switch (message.type) {
    case 'GET_STATE':
      getSecurityState().then(state => sendResponse(state))
      return true

    case 'GET_CATEGORY':
      getCategoryState(message.category as SecurityCategory).then(c => sendResponse(c))
      return true

    case 'GET_OVERALL_SCORE':
      getOverallScore().then(s => sendResponse(s))
      return true

    case 'FINGERPRINT_REPORT':
      handleFingerprintReport(message.fingerprint as BrowserFingerprint).catch(() => {})
      sendResponse({ success: true })
      break

    case 'ADD_EVENT':
      (async () => {
        await addCategoryEvent(message.category as SecurityCategory, message.event as RiskEvent)
        await notifyRiskEvent(message.event as RiskEvent)
        await recalculateCategoryScore(message.category as SecurityCategory)
        sendResponse({ success: true })
      })().catch(() => { sendResponse({ success: false }) })
      return true

    case 'ACKNOWLEDGE_EVENT':
      (async () => {
        await acknowledgeEvent(message.eventId)
        await recalculateAllScores()
        sendResponse({ success: true })
      })().catch(() => { sendResponse({ success: false }) })
      return true

    case 'CLEAR_EVENTS':
      (async () => {
        await clearEvents()
        await recalculateAllScores()
        sendResponse({ success: true })
      })().catch(() => { sendResponse({ success: false }) })
      return true

    case 'GET_SETTINGS':
      getSettings().then(s => sendResponse(s)).catch(() => sendResponse(null))
      return true

    case 'UPDATE_SETTINGS':
      (async () => {
        await updateSettings(message.settings as Partial<GlobalSettings>)
        await recalculateAllScores()
        sendResponse({ success: true })
      })().catch(() => { sendResponse({ success: false }) })
      return true

    case 'HTTPS_UPDATE':
      (async () => {
        try {
          const state = await getSecurityState()
          const totalSites = (state.totalSites || 0) + 1
          const httpsSites = (state.httpsSites || 0) + (message.isHttps ? 1 : 0)
          await updateSecurityState({ totalSites, httpsSites })
        } catch {}
        sendResponse({ success: true })
      })()
      return true

    case 'SCAN_EXTENSIONS':
      (async () => {
        await scanExtensions()
        sendResponse({ success: true })
      })().catch(() => { sendResponse({ success: false }) })
      return true

    case 'CHECK_IP':
      (async () => {
        await checkPublicIp()
        sendResponse({ success: true })
      })().catch(() => { sendResponse({ success: false }) })
      return true

    case 'PAGE_SCAN_RESULT':
      (async () => {
        const result = (message as any).result as PageScanResult
        if (!result) { sendResponse({ success: false }); return }
        const state = await getSecurityState()
        const scans = (state.pageScans || []).slice()
        const idx = scans.findIndex(s => s.url === result.url)
        if (idx >= 0) scans[idx] = result
        else scans.push(result)
        if (scans.length > 50) scans.splice(0, scans.length - 50)
        await updateSecurityState({ pageScans: scans })
        await recalculateCategoryScore('privacy')
        await updateBadge()
        chrome.runtime.sendMessage({ type: 'STATE_UPDATED' }).catch(() => {})
        sendResponse({ success: true })
      })().catch(() => { sendResponse({ success: false }) })
      return true

    case 'ADD_ACCOUNT':
      (async () => {
        await handleAddAccount(message.domain, message.name)
        sendResponse({ success: true })
      })().catch(() => { sendResponse({ success: false }) })
      return true

    case 'REMOVE_ACCOUNT':
      (async () => {
        await handleRemoveAccount(message.domain)
        sendResponse({ success: true })
      })().catch(() => { sendResponse({ success: false }) })
      return true

    case 'SENSOR_USAGE':
      (async () => {
        try {
          const state = await getSecurityState()
          let domain = 'unknown'
          try { domain = new URL(message.data.url).hostname } catch { domain = message.data.url || 'unknown' }
          const entry: SensorUsage = {
            api: message.data.api,
            domain,
            url: message.data.url || '',
            timestamp: message.data.timestamp || Date.now(),
          }
          const usage = (state.sensorUsage || []).slice()
          usage.push(entry)
          if (usage.length > 200) usage.splice(0, usage.length - 200)
          await updateSecurityState({ sensorUsage: usage })
          const titleMap: Record<string, string> = {
            clipboard_read: 'Clipboard read',
            clipboard_write: 'Clipboard write',
            geolocation: 'Location access',
            camera_mic: 'Camera/mic access',
          }
          const descMap: Record<string, string> = {
            clipboard_read: 'your clipboard (read)',
            clipboard_write: 'your clipboard (write)',
            geolocation: 'your location',
            camera_mic: 'your camera or microphone',
          }
          const label = titleMap[entry.api] || 'Sensor access'
          const detail = descMap[entry.api] || entry.api
          const event: RiskEvent = {
            id: crypto.randomUUID(),
            type: 'sensor_access',
            category: 'privacy',
            severity: 'medium',
            title: `${label} by ${entry.domain}`,
            description: `${entry.domain} used ${detail} at ${new Date(entry.timestamp).toLocaleTimeString()}`,
            source: entry.domain,
            timestamp: entry.timestamp,
            acknowledged: false,
          }
          await addCategoryEvent('privacy', event)
          await notifyRiskEvent(event)
          await recalculateCategoryScore('privacy')
        } catch (e) {
          console.error('Sensor usage handler failed:', e)
        }
        sendResponse({ success: true })
      })().catch(() => { sendResponse({ success: false }) })
      return true

    case 'REMOVE_EXTENSION':
      (async () => {
        try {
          await new Promise<void>((resolve, reject) => {
            chrome.management.uninstall(message.extensionId, () => {
              if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
              else resolve()
            })
          })
          await scanExtensions()
          sendResponse({ success: true })
        } catch {
          sendResponse({ success: false })
        }
      })()
      return true

    case 'PHISHING_CHECK':
      (async () => {
        await checkPhishing(message.url).catch(() => {})
        sendResponse({ success: true })
      })().catch(() => { sendResponse({ success: false }) })
      return true

    case 'HEADERS_AUDIT':
      (async () => {
        await auditHeaders(message.url, message.headers).catch(() => {})
        sendResponse({ success: true })
      })().catch(() => { sendResponse({ success: false }) })
      return true

    case 'FORENSIC_SNAPSHOT':
      (async () => {
        await takeForensicSnapshot(message.trigger || 'manual')
        sendResponse({ success: true })
      })().catch(() => { sendResponse({ success: false }) })
      return true

    case 'KILL_SESSIONS':
      (async () => {
        await autoKillSessions(message.domains || [])
        sendResponse({ success: true })
      })().catch(() => { sendResponse({ success: false }) })
      return true

    case 'ISOLATE_NETWORK':
      (async () => {
        await isolateNetwork()
        sendResponse({ success: true })
      })().catch(() => { sendResponse({ success: false }) })
      return true

    case 'POPUP_OPENED':
      (async () => {
        await scanExtensions()
        await checkPublicIp()
        try {
          const tabs = await chrome.tabs.query({ currentWindow: true })
          for (const tab of tabs) {
            if (!tab.id || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:')) continue
            chrome.tabs.sendMessage(tab.id, { type: 'SCAN_PASSWORD_FORMS' }).catch(() => {})
          }
          const active = tabs.find(t => t.active)
          if (active?.id) chrome.tabs.sendMessage(active.id, { type: 'SCAN_PAGE' }).catch(() => {})
        } catch {}
        sendResponse({ success: true })
      })().catch(() => { sendResponse({ success: false }) })
      return true

    case 'PASSWORD_FORM_DETECTED':
      (async () => {
        await evaluatePasswordStrength({
          url: message.url || '',
          hasPasswordField: message.hasPasswordField ?? false,
          isOverHttp: message.isOverHttp ?? false,
          formAction: message.formAction,
          autocomplete: message.autocomplete,
          timestamp: Date.now(),
        })
        sendResponse({ success: true })
      })().catch(() => { sendResponse({ success: false }) })
      return true

    case 'VERIFY_ACCOUNT':
      (async () => {
        await verifyAccount(message.domain)
        sendResponse({ success: true })
      })().catch(() => { sendResponse({ success: false }) })
      return true

    case 'CHECK_ALL_ACCOUNTS':
      (async () => {
        await checkAllAccounts()
        sendResponse({ success: true })
      })().catch(() => { sendResponse({ success: false }) })
      return true
  }
})

initialize().catch(() => {})
