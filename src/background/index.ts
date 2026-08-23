import { scanExtensions, extInstalledHandler, extEnabledHandler, extDisabledHandler, extUninstalledHandler, startExtensionMonitor } from './monitors/extensionMonitor'
import { startNetworkMonitor, checkPublicIp } from './monitors/networkMonitor'
import { cookieChangeHandler } from './monitors/cookieMonitor'
import { handleAddAccount, handleRemoveAccount, recordAccountAuth, recordAuthFormSeen } from './monitors/accountMonitor'
import { setupNotificationHandlers, notifyRiskEvent, resetNotificationThrottles } from './notifications'
import { resetAuditCaches as resetHeadersAuditCaches } from './monitors/headersMonitor'
import { resetAuditCaches as resetCertAuditCaches } from './monitors/certMonitor'
import { resetAuditCaches as resetCookieAuditCaches } from './monitors/cookieMonitor'
import { resetAuditCaches as resetPolicyAuditCaches } from './monitors/policyMonitor'
import { resetAuditCaches as resetSessionAuditCaches } from './monitors/sessionHijackMonitor'
import { resetAuditCaches as resetThreatAuditCaches } from './monitors/threatIntelMonitor'
import { resetAuditCaches as resetDnsAuditCaches } from './monitors/dnsMonitor'
import { loadState, getSecurityState, acknowledgeEvent, updateSettings, getSettings, addCategoryEvent, updateSecurityState, mutateSecurityState, clearAllData } from './storage'
import { recalculateCategoryScore, recalculateAllScores } from './engine'
import { BackgroundMessage, RiskEvent, GlobalSettings, SecurityCategory, SensorUsage, PageScanResult, DEFAULT_GLOBAL_SETTINGS } from '../types'
import { updateBadge } from './badge'
import { normalizeDomain, canonicalAccountDomain, isValidDomain } from '../utils/domain'
import { dbg, setDebugEnabled } from '../utils/debug'
import { phishingTabUpdatedHandler, startPhishingMonitor } from './monitors/phishingMonitor'
import { startPasswordStrengthMonitor, evaluatePasswordStrength } from './monitors/passwordStrengthMonitor'
import { sessionTabUpdatedHandler, sessionCookieChangedHandler } from './monitors/sessionHijackMonitor'
import { certTabUpdatedHandler, checkCert } from './monitors/certMonitor'
import { dnsTabUpdatedHandler, checkDns } from './monitors/dnsMonitor'
import { headersReceivedHandler } from './monitors/headersMonitor'
import { threatTabUpdatedHandler, startThreatIntelMonitor, checkIntelDomain } from './monitors/threatIntelMonitor'
import { tabCreatedHandler, tabRemovedHandler, tabUpdatedHandler, startAnomalyMonitor, detectAnomalies } from './monitors/anomalyMonitor'
import { startCorrelationEngine, runCorrelation } from './monitors/correlationEngine'
import { startTimelineMonitor, checkWeeklyDigest, recordTimelineEntry } from './monitors/timelineDigest'
import { storageChangedHandler } from './monitors/autoResponse'
import { startPolicyMonitor, handlePolicyLinks, handlePolicyText, analyzeCurrentTab, analyzePolicyUrl, getPolicyDomain, getPolicyReport, getPolicyReports, isScrapeTab, notifyScrapeComplete, notifyProbeComplete, getScrapeSiteDomain, clearAnalysisHistory } from './monitors/policyMonitor'
import { startDownloadMonitor } from './monitors/downloadMonitor'
import { executePanic, recoverFromPanic, startPanicListeners, restoreLockdownState } from './monitors/panicButton'

// Content-script-supplied policy text/probe paths: cap sizes so a hostile
// page cannot stuff the service worker's memory or state.
const MAX_POLICY_TEXT_LEN = 250000
const MAX_PROBED_PATHS = 300

// Lowercase, strip leading www. — canonical hostname for comparing the
// domain a content script claims against the tab it actually ran on.
function normalizeHostname(input: string): string | null {
  try {
    return new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.')
  } catch {
    return false
  }
}

// Only accept keys that exist in GlobalSettings defaults, with a value of
// the matching type — an attacker (or a stale popup) can't smuggle junk
// keys or wrong-typed values into settings.
function sanitizeSettings(patch: Partial<GlobalSettings>): Partial<GlobalSettings> {
  const out: Partial<GlobalSettings> = {}
  const defaults = DEFAULT_GLOBAL_SETTINGS as unknown as Record<string, unknown>
  for (const [key, def] of Object.entries(defaults)) {
    const v = (patch as Record<string, unknown>)[key]
    if (v === undefined) continue
    if (typeof def === 'boolean' && typeof v === 'boolean') out[key as keyof GlobalSettings] = v as never
    else if (typeof def === 'number' && typeof v === 'number' && isFinite(v)) out[key as keyof GlobalSettings] = v as never
    else if (typeof def === 'string' && typeof v === 'string') out[key as keyof GlobalSettings] = v as never
    else if (Array.isArray(def) && Array.isArray(v)) out[key as keyof GlobalSettings] = v.filter((x: unknown) => typeof x === 'string').slice(0, 500) as never
  }
  return out
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
})
chrome.storage.onChanged.addListener(storageChangedHandler)

let initialized = false

const STARTUP_ALARMS: Record<string, chrome.alarms.AlarmCreateInfo> = {
  scoreRecalculation: { periodInMinutes: 2 },
  ipCheck: { periodInMinutes: 5 },
  dnsCheck: { periodInMinutes: 30 },
  certCheck: { periodInMinutes: 60 },
  threatIntel: { periodInMinutes: 15 },
  anomalyScan: { periodInMinutes: 10 },
  correlationScan: { periodInMinutes: 2 },
  weeklyDigestCheck: { periodInMinutes: 60 },
}

async function initialize(): Promise<void> {
  if (initialized) return
  initialized = true
  try {
    await loadState()
    const settings = await getSettings()
    setDebugEnabled(!!settings.debugMode)
    await recalculateAllScores()
    updateBadge()

    startExtensionMonitor()
    startNetworkMonitor()
    setupNotificationHandlers()
    startPhishingMonitor()
    startPasswordStrengthMonitor()
    startThreatIntelMonitor()
    startAnomalyMonitor()
    startCorrelationEngine()
    startTimelineMonitor()
    startPolicyMonitor()
    startDownloadMonitor()
    startPanicListeners()
    restoreLockdownState()

    // Alarms survive service-worker restarts — only create the ones that
    // don't exist yet instead of re-scheduling every wake.
    for (const [name, info] of Object.entries(STARTUP_ALARMS)) {
      const existing = await chrome.alarms.get(name).catch(() => null)
      if (!existing) chrome.alarms.create(name, info)
    }
  } catch (e) {
    console.error('initialize failed:', e)
    // Retry on the next wake — don't leave monitors half-started.
    initialized = false
    throw e
  }
}

chrome.runtime.onInstalled.addListener(() => {
  initialize().catch(() => {})
})
chrome.runtime.onStartup.addListener(() => { initialize().catch(() => {}) })

// Ensure content scripts scan for login forms on every page navigation,
// not just when the popup opens.
chrome.webNavigation.onCompleted.addListener((details) => {
  if (details.frameId !== 0) return  // main frame only
  if (details.url.startsWith('chrome://') || details.url.startsWith('about:')) return
  chrome.tabs.sendMessage(details.tabId, { type: 'SCAN_PASSWORD_FORMS' }).catch(() => {})
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'scoreRecalculation') {
    recalculateAllScores().catch(() => {})
  }
  if (alarm.name === 'ipCheck') {
    getSettings().then(s => { if (s.monitorNetwork) checkPublicIp().catch(() => {}) }).catch(() => {})
  }
  if (alarm.name === 'dnsCheck') {
    getSettings().then(async (s) => {
      if (!s.monitorDns) return
      try {
        const tabs = await chrome.tabs.query({})
        // Dot-less "hostnames" are chrome://internal pages (newtab, extensions,
        // about) — querying DoH/crt.sh/URLhaus with them is junk traffic.
        const domains = [...new Set(tabs.map(t => { try { return new URL(t.url || '').hostname } catch { return null } }).filter(d => d && d.includes('.')))].slice(0, 5) as string[]
        for (const d of domains) checkDns(d).catch(() => {})
      } catch {}
    }).catch(() => {})
  }
  if (alarm.name === 'certCheck') {
    getSettings().then(async (s) => {
      if (!s.monitorCertificates) return
      try {
        const tabs = await chrome.tabs.query({})
        const domains = [...new Set(tabs.map(t => { try { return new URL(t.url || '').hostname } catch { return null } }).filter(d => d && d.includes('.')))].slice(0, 5) as string[]
        for (const d of domains) checkCert(d).catch(() => {})
      } catch {}
    }).catch(() => {})
  }
  if (alarm.name === 'threatIntel') {
    getSettings().then(async (s) => {
      if (!s.monitorThreatIntel) return
      try {
        const tabs = await chrome.tabs.query({})
        const domains = [...new Set(tabs.map(t => { try { return new URL(t.url || '').hostname } catch { return null } }).filter(d => d && d.includes('.')))].slice(0, 5) as string[]
        for (const d of domains) checkIntelDomain(d).catch(() => {})
      } catch {}
    }).catch(() => {})
  }
  if (alarm.name === 'anomalyScan') {
    getSettings().then(s => { if (s.monitorAnomaly) detectAnomalies().catch(() => {}) }).catch(() => {})
  }
  if (alarm.name === 'correlationScan') {
    getSettings().then(s => { if (s.monitorCorrelation) runCorrelation().catch(() => {}) }).catch(() => {})
  }
  if (alarm.name === 'weeklyDigestCheck') {
    getSettings().then(s => { if (s.weeklyDigest) checkWeeklyDigest().catch(() => {}) }).catch(() => {})
  }
  if (alarm.name === 'timelineRecord') { recordTimelineEntry().catch(() => {}) }
  if (alarm.name === 'scoreRecalculation' || alarm.name === 'anomalyScan') dbg('alarm', alarm.name)
})

// Canonical domains where a password form was recently seen — lets a later
// ACCOUNT_LOGGED_IN count as proven even when the login hopped subdomains.
const PASSWORD_FORM_TTL_MS = 600000
const recentPasswordForms = new Map<string, number>()

chrome.runtime.onMessage.addListener((
  message: BackgroundMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void
) => {
  // Only accept messages from this extension's own contexts (popup, pages,
  // content scripts). Nothing else may reach these handlers.
  if (!sender?.id || sender.id !== chrome.runtime.id) { return }
  // Destructive commands only from extension pages (the popup) — a content
  // script running on a hostile website must never reach them.
  const fromExtensionPage = !!sender.url && sender.url.startsWith(`chrome-extension://${chrome.runtime.id}`)
  // Read-only state queries are also popup-only: no content script uses
  // them, and an attacker-influenced content script must not be able to
  // exfiltrate accounts/IP/fingerprints to a page.
  const privileged = ['PANIC', 'PANIC_RECOVER', 'CLEAR_ALL_DATA', 'UPDATE_SETTINGS', 'SCAN_EXTENSIONS', 'ADD_ACCOUNT', 'REMOVE_ACCOUNT', 'ADD_EVENT', 'POPUP_OPENED', 'ANALYZE_POLICY', 'GET_STATE', 'GET_SETTINGS', 'GET_POLICY_REPORTS', 'GET_POLICY_REPORT']
  if (privileged.includes(message.type) && !fromExtensionPage) {
    sendResponse({ success: false, error: 'Forbidden: popup-only command' })
    return
  }
  switch (message.type) {
    case 'GET_STATE':
      (async () => {
        try {
          const state = await getSecurityState()
          sendResponse({ success: true, state })
        } catch (e) {
          console.error('GET_STATE error:', e)
          sendResponse({ success: false, state: null, error: String(e) })
        }
      })().catch(() => { sendResponse({ success: false, state: null }) })
      return true

    case 'PING':
      sendResponse({ success: true })
      return true

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

    case 'CLEAR_ALL_DATA':
      (async () => {
        try {
          await clearAllData()
          // In-memory cooldown/dedupe caches must not outlive the wipe, or
          // audits stay silently skipped after clearing.
          resetHeadersAuditCaches()
          resetCertAuditCaches()
          resetCookieAuditCaches()
          resetPolicyAuditCaches()
          resetSessionAuditCaches()
          resetThreatAuditCaches()
          resetDnsAuditCaches()
          // Otherwise a login reported within 10 min of the wipe could
          // re-add a "verified" account into the freshly emptied state.
          recentPasswordForms.clear()
          resetNotificationThrottles()
          await recalculateAllScores()
          await updateBadge()
          sendResponse({ success: true })
        } catch (e) {
          console.error('CLEAR_ALL_DATA error:', e)
          sendResponse({ success: false })
        }
      })()
      return true

    case 'GET_SETTINGS':
      (async () => {
        try {
          const s = await getSettings()
          sendResponse({ success: true, settings: s })
        } catch {
          sendResponse({ success: false, settings: null })
        }
      })().catch(() => { sendResponse({ success: false, settings: null }) })
      return true

    case 'UPDATE_SETTINGS':
      (async () => {
        await updateSettings(sanitizeSettings(message.settings))
        await recalculateAllScores()
        sendResponse({ success: true })
      })().catch(() => { sendResponse({ success: false }) })
      return true

    case 'SCAN_EXTENSIONS':
      (async () => {
        await scanExtensions()
        sendResponse({ success: true })
      })().catch(() => { sendResponse({ success: false }) })
      return true

    case 'PAGE_SCAN_RESULT':
      (async () => {
        const result = (message as any).result as PageScanResult
        if (!result || typeof result !== 'object') { sendResponse({ success: false }); return }
        // Validate before storing — one malformed scan must not poison the
        // privacy score (engine reads these fields unguarded).
        try {
          const u = new URL(result.url)
          result.url = u.origin + u.pathname
          if (typeof result.domain !== 'string' || !result.domain) result.domain = u.hostname.replace(/^www\./, '')
        } catch {}
        if (typeof result.scannedAt !== 'number' || !isFinite(result.scannedAt)) result.scannedAt = Date.now()
        result.trackers = Array.isArray(result.trackers)
          ? result.trackers.filter(t => t && typeof t === 'object' && typeof t.domain === 'string').slice(0, 200)
          : []
        for (const k of ['canvasAttempts', 'audioAttempts', 'thirdPartyRequests', 'totalCookies'] as const) {
          const v = (result as any)[k]
          // Negative counts would INVERT the score penalties (subtracting a
          // negative adds points) — clamp at the trust boundary.
          if (typeof v !== 'number' || !isFinite(v) || v < 0) (result as any)[k] = 0
        }
        // Read-modify-write inside the storage mutex — two tabs reporting
        // concurrently must not drop each other's scan.
        await mutateSecurityState(state => {
          const scans = (state.pageScans || []).slice()
          const idx = scans.findIndex(s => s.url === result.url)
          if (idx >= 0) scans[idx] = result
          else scans.push(result)
          if (scans.length > 50) scans.splice(0, scans.length - 50)
          state.pageScans = scans
          // Update lastActive for verified accounts when visiting their domain
          let host: string | null = null
          try { host = new URL(result.url).hostname.replace(/^www\./, '') } catch {}
          if (host) {
            for (const acc of (state.accounts || [])) {
              if (acc.domain === host && acc.status === 'verified') {
                acc.lastActive = Date.now()
              }
            }
          }
        })
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
          const raw = message.data
          // SENSOR_USAGE arrives from an ISOLATED-world listener fed by
          // MAIN-world page hooks — the background owns validation, so the
          // api whitelist + clamps here are the ONLY defense.
          if (!raw || typeof raw.api !== 'string' || !['camera_mic', 'clipboard_read', 'clipboard_write', 'geolocation'].includes(raw.api)) {
            sendResponse({ success: false }); return
          }
          const now = Date.now()
          const ts = typeof raw.timestamp === 'number' ? raw.timestamp : now
          if (Math.abs(now - ts) > 5 * 60 * 1000) { sendResponse({ success: false }); return }
          let domain = 'unknown'
          try { domain = new URL(raw.url).hostname.replace(/^www\./, '') } catch { domain = 'unknown' }
          const entry: SensorUsage = {
            api: raw.api,
            domain,
            url: `https://${domain}`,
            timestamp: ts,
          }
          // Rate-limit and append inside the storage mutex — a page must not
          // flood the event list, and concurrent reports must not drop each
          // other's entries.
          let pushed = false
          await mutateSecurityState(state => {
            const usage = (state.sensorUsage || []).slice()
            const last = [...usage].reverse().find(u => u.domain === domain)
            if (last && ts - last.timestamp < 30000) return
            usage.push(entry)
            if (usage.length > 200) usage.splice(0, usage.length - 200)
            state.sensorUsage = usage
            pushed = true
          })
          if (!pushed) { sendResponse({ success: true }); return }
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

    case 'PANIC':
      (async () => {
        await executePanic()
        sendResponse({ success: true })
      })().catch(() => { sendResponse({ success: false }) })
      return true

    case 'PANIC_RECOVER':
      (async () => {
        await recoverFromPanic()
        sendResponse({ success: true })
      })().catch(() => { sendResponse({ success: false }) })
      return true

    case 'POPUP_OPENED':
      ;(async () => {
        try {
          await scanExtensions()
        } catch { }
        try {
          const state = await getSecurityState()
          const lastIpCheck = state.network?.lastChecked || 0
          if (Date.now() - lastIpCheck > 60000) {
            const s = await getSettings()
            if (s.monitorNetwork) await checkPublicIp()
          }
        } catch { }
        try {
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
          for (const tab of tabs) {
            if (!tab.id || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:')) continue
           chrome.tabs.sendMessage(tab.id, { type: 'SCAN_PASSWORD_FORMS' }).catch(() => {})
           }
           const active = tabs.find(t => t.active && t.url)
           if (active?.id) chrome.tabs.sendMessage(active.id, { type: 'SCAN_PAGE' }).catch(() => {})
           // Update lastActive for verified accounts when visiting their domain,
           // so the popup shows "active now" instead of a stale login time.
           if (active?.url && !active.url.startsWith('chrome') && !active.url.startsWith('about')) {
             try {
               const host = new URL(active.url).hostname.replace(/^www\./, '')
               if (host) {
                 await mutateSecurityState(state => {
                   for (const acc of (state.accounts || [])) {
                     if (acc.domain === host && acc.status === 'verified') {
                       acc.lastActive = Date.now()
                     }
                   }
                 })
               }
             } catch { }
           }
          // Content scripts inject at document_start — link detection there
          // saw an empty DOM. Ask the loaded page for its real policy links;
          // POLICY_LINKS_FOUND → handlePolicyLinks (with its 5-min domain
          // cooldown) drives the analysis, falling back to common URLs.
          if (active?.url && !active.url.startsWith('chrome') && !active.url.startsWith('about')) {
            try {
              const domain = new URL(active.url).hostname.replace(/^www\./, '')
              if (domain) {
                const reports = await getPolicyReports()
                const report = reports.find(r => r.domain === domain)
                if (!report || Date.now() - report.analyzedAt > 3600000) {
                  if (active.id) chrome.tabs.sendMessage(active.id, { type: 'FIND_POLICY_LINKS' }).catch(() => {})
                  // If the page has no content script (or no policy links),
                  // POLICY_LINKS_FOUND never arrives to claim the cooldown —
                  // fall back to common-URL probing. If link discovery DID
                  // respond first, the cooldown makes this a no-op.
                  setTimeout(() => { analyzeCurrentTab(domain).catch(() => {}) }, 2500)
                }
              }
            } catch { }
          }
        } catch { }
      })()
      sendResponse({ success: true })
      return true

    case 'PASSWORD_FORM_DETECTED':
      (async () => {
        // Same trust boundary as the account handlers — the claimed URL must
        // be the tab the content script actually ran on.
        const tabUrl = sender?.tab?.url
        if (tabUrl && message.url && normalizeHostname(tabUrl) !== normalizeHostname(message.url)) {
          sendResponse({ success: false })
          return
        }
        // A password form was just seen on this site. Remember it per
        // CANONICAL domain: two-step logins hop subdomains (accounts.google.com
        // → myaccount.google.com) where sessionStorage markers are lost, so a
        // later ACCOUNT_LOGGED_IN from any sibling host still counts as proven.
        const formCanonical = canonicalAccountDomain(normalizeDomain(normalizeHostname(message.url || tabUrl || '') || ''))
        if (formCanonical && isValidDomain(formCanonical)) {
          const now = Date.now()
          recentPasswordForms.set(formCanonical, now)
          if (recentPasswordForms.size > 50) {
            for (const [k, t] of recentPasswordForms) {
              if (now - t > PASSWORD_FORM_TTL_MS) recentPasswordForms.delete(k)
            }
          }
        }
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

    case 'ACCOUNT_AUTH_DETECTED':
      (async () => {
        // Content-script only, and the claimed domain must be the tab it
        // actually ran on — a page cannot register accounts for other sites.
        const tabUrl = sender?.tab?.url
        if (!tabUrl || (message.role !== 'login' && message.role !== 'signup')) {
          sendResponse({ success: false })
          return
        }
        if (normalizeHostname(tabUrl) !== normalizeHostname(message.domain)) {
          sendResponse({ success: false })
          return
        }
        // Seeing a login form is NOT proof of an account — only refresh the
        // role hint on already-tracked accounts. Verification happens via
        // ACCOUNT_LOGGED_IN (logout control / successful submit).
        await recordAuthFormSeen(normalizeHostname(message.domain) || message.domain, message.role)
        sendResponse({ success: true })
      })().catch(() => { sendResponse({ success: false }) })
      return true

    case 'ACCOUNT_LOGGED_IN':
      (async () => {
        const tabUrl = sender?.tab?.url
        if (!tabUrl) { sendResponse({ success: false }); return }
        if (normalizeHostname(tabUrl) !== normalizeHostname(message.domain)) {
          sendResponse({ success: false }); return
        }
        const state = await getSecurityState()
        const domain = normalizeHostname(message.domain) || message.domain
        const canonical = canonicalAccountDomain(normalizeDomain(domain))
        const acc = state.accounts?.find(a => a.domain === canonical || a.domain === domain)
        const role = message.role === 'signup' ? 'signup' : 'login'
        // Strong evidence: an actual submit-proof (role present) or a password
        // form seen on this canonical domain recently (two-step subdomain hops).
        // Weak evidence (logout link only) keeps the strict tracked/dismissed
        // gate so arbitrary sites never auto-add.
        const dismissed = new Set(state.dismissedAccounts || [])
        const formSeenAt = recentPasswordForms.get(canonical)
        // Corroboration gate: a bare "logged in" report (even with a role,
        // which the page world can fabricate) must not mint an account on a
        // never-before-seen domain. Real logins always announced
        // PASSWORD_FORM_DETECTED shortly before — require that, or an
        // existing/dismissed account.
        const formRecent = typeof formSeenAt === 'number' && Date.now() - formSeenAt < PASSWORD_FORM_TTL_MS
        if (acc || dismissed.has(canonical) || formRecent) {
          await recordAccountAuth(domain, role)
        }
        sendResponse({ success: true })
       })().catch(() => { sendResponse({ success: false }) })
      return true

    case 'ACCOUNT_LOGIN_FAILED':
      (async () => {
        const tabUrl = sender?.tab?.url
        if (!tabUrl) { sendResponse({ success: false }); return }
        if (normalizeHostname(tabUrl) !== normalizeHostname(message.domain)) {
          sendResponse({ success: false }); return
        }
        const state = await getSecurityState()
        const domain = normalizeHostname(message.domain) || message.domain
        const canonical = canonicalAccountDomain(normalizeDomain(domain))
        const acc = state.accounts?.find(a => a.domain === canonical || a.domain === domain)
        if (!acc) { sendResponse({ success: false }); return }
        // Login failed — keep verified (form was detected) but clear session
        // flag. Mutate under the storage mutex: a stale-array replace here
        // clobbered concurrent add/remove writes.
        await mutateSecurityState(s => {
          s.accounts = (s.accounts || []).map(a =>
            a.domain === canonical || a.domain === domain
              ? { ...a, hasSession: false }
              : a
          )
        })
        chrome.runtime.sendMessage({ type: 'STATE_UPDATED' }).catch(() => {})
        sendResponse({ success: true })
      })().catch(() => { sendResponse({ success: false }) })
      return true

    case 'POLICY_LINKS_FOUND':
      (async () => {
        try {
          // A page controls its own DOM — these links are page-supplied. Only
          // trust them when they come from a content script on the exact site
          // they claim, and only allow http(s) targets (no chrome://, file://,
          // javascript: URLs that could be fed into the hidden-tab navigator).
          const tabUrl = sender?.tab?.url
          if (!tabUrl) {
            sendResponse({ success: false })
            return
          }
          if (normalizeHostname(tabUrl) !== normalizeHostname(message.domain)) {
            sendResponse({ success: false })
            return
          }
          const safeLinks = (message.links || []).filter(l => l && typeof l.url === 'string' && typeof l.type === 'string' && isHttpUrl(l.url))
          // Links harvested from a scrape tab WE opened belong to the site
          // that tab was opened for (second-hop discovery) — the tab's own
          // host may be a corporate policy domain, not the analyzed site.
          const scrapeSite = getScrapeSiteDomain(sender?.tab?.id)
          await handlePolicyLinks(scrapeSite || normalizeHostname(message.domain || '') || '', safeLinks, !!scrapeSite)
          sendResponse({ success: true })
        } catch (e) {
          console.error('POLICY_LINKS_FOUND error:', e)
          sendResponse({ success: false, error: String(e) })
        }
      })().catch(() => { sendResponse({ success: false }) })
      return true

    case 'POLICY_TEXT':
      (async () => {
        try {
          // 'dom' = text scraped from a rendered page; 'probe' = same-origin
          // fetch done in the page context (the CORS-free path).
          if ((message.source !== 'dom' && message.source !== 'probe') || typeof message.text !== 'string' || message.text.trim().length === 0) {
            sendResponse({ success: false })
            return
          }
          // Report domain = the SITE being analyzed. The sender's own host is
          // the POLICY host (docs.github.com) — the matrix looks up by site
          // (github.com), so use the siteDomain the content script sent, or
          // the domain a scrape tab was opened for.
          // A scrape tab is one WE opened (never page-initiated) and its site
          // mapping is trusted; any other sender must claim a siteDomain that
          // matches the tab it actually ran on, or the report is dropped.
          const senderTabUrl = sender?.tab?.url
          if (!senderTabUrl) {
            sendResponse({ success: false })
            return
          }
          const siteDomain = isScrapeTab(sender?.tab?.id)
            ? getScrapeSiteDomain(sender?.tab?.id)
            : message.siteDomain && normalizeHostname(senderTabUrl) === normalizeHostname(message.siteDomain)
              ? normalizeHostname(message.siteDomain)
              : undefined
          const domain = siteDomain || getPolicyDomain(message.url)
          if (!domain) {
            sendResponse({ success: false })
            return
          }
          // Hidden scrape tabs already paid the domain cooldown via the fetch
          // attempt that opened them; page-context probes are triggered from
          // flows that paid it too — don't reject either's text.
          const skipCooldown = isScrapeTab(sender?.tab?.id) || message.source === 'probe'
          const done = await handlePolicyText(domain, message.url, message.text.slice(0, MAX_POLICY_TEXT_LEN), skipCooldown)
          // Scrape tabs exist only to deliver this text — their job is done
          // even if the analysis deduped. Close early, resolve the scrape.
          notifyScrapeComplete(sender?.tab?.id)
          if (message.source === 'probe') {
            notifyProbeComplete(message.url)
            if (Array.isArray(message.probed)) {
              const probed = message.probed.filter(p => typeof p === 'string').slice(0, MAX_PROBED_PATHS)
              if (probed.length > 0) {
                await updateSecurityState({ lastPolicyProbes: probed }).catch(() => {})
              }
            }
          }
          sendResponse({ success: done })
        } catch (e) {
          console.error('POLICY_TEXT error:', e)
          sendResponse({ success: false, error: String(e) })
        }
      })().catch(() => { sendResponse({ success: false }) })
      return true

    case 'ANALYZE_POLICY':
      (async () => {
        try {
          const domain = message.domain
          const policyUrl = message.policyUrl
          // Explicit retry — the user clicked the button; don't let a recent
          // auto-analysis cooldown/attempt-TTL silently no-op it.
          if (domain) clearAnalysisHistory(domain)
          if (domain && policyUrl) {
            await analyzePolicyUrl(domain, policyUrl)
          } else {
            await analyzeCurrentTab(domain, policyUrl)
          }
          sendResponse({ success: true })
        } catch (e) {
          console.error('ANALYZE_POLICY error:', e)
          sendResponse({ success: false, error: String(e) })
        }
      })().catch(() => { sendResponse({ success: false }) })
      return true

    case 'GET_POLICY_REPORTS':
      (async () => {
        try {
          const reports = await getPolicyReports()
          sendResponse({ success: true, reports })
        } catch (e) {
          console.error('GET_POLICY_REPORTS error:', e)
          sendResponse({ success: false, reports: [] })
        }
      })().catch(() => { sendResponse({ success: false, reports: [] }) })
      return true

    case 'GET_POLICY_REPORT':
      (async () => {
        try {
          const report = await getPolicyReport(message.domain)
          sendResponse(report ?? null)
        } catch (e) {
          console.error('GET_POLICY_REPORT error:', e)
          sendResponse(null)
        }
      })().catch(() => { sendResponse(null) })
      return true

    default:
      dbg('message', 'unhandled message type')
      sendResponse({ success: false, error: 'Unknown message type' })
      return true

  }
})

initialize().catch(() => {})
