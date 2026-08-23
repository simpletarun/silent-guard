import { initUrlCleaner, stopUrlCleaner } from './urlCleaner'
import { detectPolicyLinks, handleFindPolicyLinks, initPolicyDetection, stopPolicyDetection, probePolicyPaths, fetchPolicyUrlForProbe } from './policyDetection'
import { TRACKER_DOMAINS_LIST } from '../utils/trackerDomains'
import { classifyAuthFromForm, classifyPasswordInput, getFormSignals, findLogoutIndicator, USERNAME_INPUT_SELECTORS } from '../utils/authRole'

let authScanInterval: ReturnType<typeof setInterval> | null = null
let canvasAttempts = 0
let audioAttempts = 0
let webRTCDetected = false

const INLINE_TRACKING_PATTERNS = [
  /google-analytics/gi, /gtag\s*\(/gi,
  // \b + call-shape so "figma("/"yoga("-style text and the words
  // "drift"/"clarity"/"crisp" in prose don't count as tracker snippets.
  /\bga\s*\(/gi,
  /fbq\s*\(/gi, /facebook.*pixel/gi, /connect\.facebook/gi,
  /doubleclick/gi, /gtm\.js/gi, /googletagmanager/gi,
  /piwik\s*\(/gi, /_paq\.push/gi, /matomo/gi,
  /hotjar/gi, /\bmsclarity|\bclarity\s*[.(]/gi,
  /amplitude/gi, /mixpanel/gi, /segment\.io/gi,
  /analytics\.tiktok/gi, /pinterest.*pixel/gi,
  /linkedin.*insight/gi, /_linkedin/gi,
  /twq\s*\(/gi, /twitter.*pixel/gi,
  /snap.*pixel/gi, /snaptr/gi,
  /reddit.*pixel/gi, /rdt\s*\(/gi,
  /outbrain/gi, /taboola/gi,
  /fullstory/gi, /crazyegg/gi,
  /mouseflow/gi, /luckyorange/gi,
  /intercom/gi, /\bdrift\s*[.(]|\bdrift\.chat/gi,
  /hubspot/gi, /salesforce/gi,
  /zendesk/gi, /freshchat/gi,
  /tidio/gi, /\bcrisp\s*[.(]|crisp\.chat/gi,
  /tawk/gi, /olark/gi,
]

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

function categorizeTracker(domain: string): 'analytics' | 'advertising' | 'social' | 'fingerprinting' | 'tracking' {
  if (['doubleclick', 'adsrvr', 'adnxs', 'rubiconproject', 'criteo', 'bat.bing', 'pixel.quantserve', 'demdex', 'ads.yahoo', 'adservice.google', 'pagead2', 'taboola', 'outbrain', 'pubmatic', 'openx', 'casalemedia', 'bidswitch', 'sharethrough', 'indexww', 'sovrn', 'media.net', 'turn.com', 'mathtag', 'bluekai', 'exelator', 'krxd', 'rlcdn'].some(a => domain.includes(a))) return 'advertising'
  if (['facebook', 'twitter', 'linkedin', 'snapchat', 'pinterest', 'tiktok', 'reddit'].some(s => domain.includes(s))) return 'social'
  if (['fullstory', 'crazyegg', 'mouseflow', 'luckyorange', 'sessioncam', 'smartlook', 'clarity', 'heap', 'posthog', 'hotjar'].some(f => domain.includes(f))) return 'fingerprinting'
  return 'analytics'
}

function isTrackerDomain(domain: string): boolean {
  return TRACKER_DOMAINS_LIST.some(td => domain === td || domain.endsWith('.' + td))
}

function scanForTrackers() {
  const trackers: { domain: string; source: string; type: any; category: any; details?: string }[] = []

  document.querySelectorAll<HTMLScriptElement>('script[src]').forEach(script => {
    const src = script.src
    const domain = extractDomain(src)
    if (isTrackerDomain(domain)) {
      trackers.push({ domain, source: src, type: 'script', category: categorizeTracker(domain) })
    }
  })

  document.querySelectorAll<HTMLScriptElement>('script:not([src])').forEach(script => {
    const text = script.textContent || ''
    for (const pattern of INLINE_TRACKING_PATTERNS) {
      // pattern.test() is stateful with /g — use match() instead, which
      // never advances lastIndex and works across multiple scripts.
      const m = text.match(pattern)
      if (m) {
        trackers.push({
          domain: window.location.hostname,
          source: m[0].substring(0, 40),
          type: 'inline',
          category: categorizeTracker(window.location.hostname),
          details: m[0].substring(0, 60),
        })
        break
      }
    }
  })

  document.querySelectorAll<HTMLImageElement>('img').forEach(img => {
    // A real tracking pixel is a 1×1 image. complete+naturalWidth 0 is also
    // true for FAILED loads — counting those fabricated pixel hits.
    if (img.naturalWidth === 1 && img.naturalHeight === 1 && img.src) {
      const domain = extractDomain(img.src)
      trackers.push({ domain, source: img.src, type: 'pixel', category: 'tracking', details: 'Tracking pixel' })
    }
  })

  document.querySelectorAll<HTMLIFrameElement>('iframe').forEach(iframe => {
    const src = iframe.src
    if (!src) return
    const domain = extractDomain(src)
    const rect = iframe.getBoundingClientRect()
    const isHidden = rect.width <= 1 || rect.height <= 1 ||
      iframe.style.display === 'none' || iframe.style.visibility === 'hidden'
    // One entry per tracker iframe element — a hidden tracker iframe must
    // not count twice ('iframe' AND 'hidden').
    if (isTrackerDomain(domain)) {
      trackers.push({
        domain, source: src, type: 'iframe', category: categorizeTracker(domain),
        details: isHidden ? 'Hidden iframe' : undefined,
      })
    }
  })

  const entries = performance.getEntriesByType('resource')
  for (const entry of entries) {
    const domain = extractDomain((entry as PerformanceResourceTiming).name)
    // One entry per tracker domain — five analytics pings must not count
    // as five trackers.
    if (isTrackerDomain(domain) && !trackers.some(t => t.domain === domain)) {
      trackers.push({
        domain,
        source: (entry as PerformanceResourceTiming).name,
        type: 'script',
        category: categorizeTracker(domain),
        details: `Loaded in ${Math.round((entry as PerformanceResourceTiming).duration)}ms`,
      })
    }
  }

  const totalCookies = document.cookie ? document.cookie.split(';').length : 0

  // Same tracker seen several ways (script tag + iframe + resource) counts
  // once per type — duplicates must not inflate totals or scores.
  const seen = new Set<string>()
  const dedupedTrackers = trackers.filter(t => {
    const k = `${t.domain}|${t.type}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })

  return { trackers: dedupedTrackers, totalCookies }
}

function scanThirdPartyRequests(): number {
  try {
    const entries = performance.getEntriesByType('resource')
    // Subdomains of the current site (cdn.example.com on example.com) are
    // first-party; data:/blob:/about: URLs have no real host.
    const currentHost = window.location.hostname.replace(/^www\./, '')
    let count = 0
    for (const entry of entries) {
      try {
        const url = new URL((entry as PerformanceResourceTiming).name)
        if (!url.protocol.startsWith('http')) continue
        const host = url.hostname.replace(/^www\./, '')
        if (host !== currentHost && !host.endsWith('.' + currentHost)) count++
      } catch {}
    }
    return count
  } catch { return 0 }
}

function scanPage() {
  const trackerResult = scanForTrackers()
  const thirdParty = scanThirdPartyRequests()

  const result = {
    url: window.location.href,
    domain: window.location.hostname.replace(/^www\./, ''),
    scannedAt: Date.now(),
    trackers: trackerResult.trackers,
    canvasAttempts,
    audioAttempts,
    webRTCLeakDetected: webRTCDetected,
    thirdPartyRequests: thirdParty,
    totalCookies: trackerResult.totalCookies,
  }

  safeSend({ type: 'PAGE_SCAN_RESULT', result })
}

// Fingerprinting + sensor hooks live in public/page-hooks.js, registered in
// the manifest with "world": "MAIN" — patches made from this ISOLATED world
// are invisible to website scripts (they call the real native APIs), which
// is why every counter below stayed 0 before. This listener consumes the
// page-world reports and feeds the same module-level counters scanPage() reads.
// The one-shot setTimeout(scanPage, 2000) snapshotted counters before fp
// scripts ran (most fire on load/interaction, well past 2s) — the stored
// scan always read 0 canvas / 0 audio. Coalesce a re-scan shortly after any
// hook report: scanPage reads LIVE counters, so one pending timer covers
// whole bursts; sustained activity re-arms at most every 1.5s.
let fpRescanQueued = false
function queueFpRescan(): void {
  if (fpRescanQueued) return
  fpRescanQueued = true
  setTimeout(() => {
    fpRescanQueued = false
    try { if (isContextValid()) scanPage() } catch {}
  }, 1500)
}

window.addEventListener('message', (e) => {
  if (e.source !== window) return
  const d = e.data as { source?: string; kind?: string; api?: string } | null
  if (!d || d.source !== '__SG_PAGE_HOOKS__') return
  try {
    if (d.kind === 'fp') {
      if (d.api === 'canvas') canvasAttempts++
      else if (d.api === 'audio') audioAttempts++
      queueFpRescan()
    } else if (d.kind === 'rtc') {
      webRTCDetected = true
      queueFpRescan()
    } else if (d.kind === 'sensor' && d.api) {
      safeSend({ type: 'SENSOR_USAGE', data: { api: d.api, url: window.location.href, timestamp: Date.now() } })
    }
  } catch {}
})

// One role per page load — the strongest signal wins (signup > login).
// Module-level so re-scans (DOM mutations) don't re-report the same action.
let pageAuthRole: 'login' | 'signup' | null = null
let loggedInDetected = false

// Reset detection state on SPA navigation so a login-form page doesn't
// suppress logged-in detection on the post-login dashboard.
function resetAuthState(): void {
  pageAuthRole = null
  loggedInDetected = false
  reportedPasswordForms.clear()
}

// The 10-second interval used to re-send PASSWORD_FORM_DETECTED for every
// open form forever, churning the stored list — one send per form signature.
const reportedPasswordForms = new Set<string>()

const host = (): string => window.location.hostname.replace(/^www\./, '')

// Climb a few ancestor levels from a bare password input collecting button /
// submit / heading text plus aria-label and placeholder — the formless
// equivalent of getFormSignals().
function gatherContextText(input: HTMLInputElement): string {
  const parts: string[] = [input.getAttribute('aria-label') || '', input.placeholder || '']
  let node: HTMLElement | null = input.closest('form') || input.parentElement
  for (let i = 0; node && i < 3; i++) {
    node.querySelectorAll('button, input[type="submit"], h1, h2').forEach(el =>
      parts.push(el.textContent || (el as HTMLInputElement).value || ''))
    node = node.parentElement
  }
  return parts.join(' ').slice(0, 500)
}

function containerHasUsername(input: HTMLInputElement): boolean {
  let scope: HTMLElement | null = input.closest('form') || input.parentElement
  for (let i = 0; scope && i < 3; i++) {
    if (scope.querySelector(USERNAME_INPUT_SELECTORS)) return true
    scope = scope.parentElement
  }
  return false
}

// One role per page load — report it once.
function ensureRoleForForm(form: HTMLFormElement, pw: HTMLInputElement): void {
  if (pageAuthRole) return
  const role = classifyAuthFromForm(getFormSignals(form, pw))
  if (role) {
    pageAuthRole = role
    safeSend({ type: 'ACCOUNT_AUTH_DETECTED', domain: host(), role })
  }
}

function detectPasswordForms(): void {
  const forms = document.querySelectorAll('form')
  let reportedRole = pageAuthRole
  for (const form of forms) {
    const passwordInput = form.querySelector<HTMLInputElement>('input[type="password"]')
    if (!passwordInput) continue
    const action = (form as HTMLFormElement).action || ''
    const autocomplete = passwordInput.getAttribute('autocomplete') || ''
    const signature = `${action}\u0000${autocomplete}`
    if (!reportedPasswordForms.has(signature)) {
      reportedPasswordForms.add(signature)
      safeSend({
        type: 'PASSWORD_FORM_DETECTED',
        url: window.location.href,
        hasPasswordField: true,
        isOverHttp: window.location.protocol !== 'https:',
        formAction: action,
        autocomplete,
      })
    }
    if (reportedRole) continue

    const signals = getFormSignals(form as HTMLFormElement, passwordInput)
    const role = classifyAuthFromForm(signals)

    if (role) {
      reportedRole = role
      pageAuthRole = role
      safeSend({ type: 'ACCOUNT_AUTH_DETECTED', domain: host(), role })
    }
  }

  // Bare password inputs without a <form> wrapper — Google, X and most SPAs
  // render login UI this way, and the loop above never sees them.
  if (!reportedRole) {
    for (const input of Array.from(document.querySelectorAll<HTMLInputElement>('input[type="password"]'))) {
      if (input.closest('form')) continue // already handled above
      const signature = 'bare\u0000' + `${input.name || ''}\u0000${input.id || ''}\u0000${input.getAttribute('autocomplete') || ''}`
      if (reportedPasswordForms.has(signature)) continue
      reportedPasswordForms.add(signature)
      safeSend({
        type: 'PASSWORD_FORM_DETECTED',
        url: window.location.href,
        hasPasswordField: true,
        isOverHttp: window.location.protocol !== 'https:',
        formAction: '',
        autocomplete: input.getAttribute('autocomplete') || '',
      })
      const role = classifyPasswordInput({
        autocomplete: input.getAttribute('autocomplete') || '',
        contextText: gatherContextText(input),
        hasUsernameField: containerHasUsername(input),
        path: window.location.pathname,
      })
      if (role) {
        reportedRole = role
        pageAuthRole = role
        safeSend({ type: 'ACCOUNT_AUTH_DETECTED', domain: host(), role })
      }
    }
  }

  // Always check for logged-in state, independent of form detection.
  // This catches post-login pages (logout link) even when the login form
  // was on a previous URL and is no longer in the DOM.
  if (!loggedInDetected) {
    detectLoggedInState()
  }
}

function detectLoggedInState(): void {
  // Scan anchors AND buttons — many sites render "Log out" as a <button>.
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('a, button'))
  const candidates = nodes.map(el => ({
    text: el.textContent || '',
    className: typeof el.className === 'string' ? el.className : '',
    href: el.tagName === 'A' ? (el as HTMLAnchorElement).href || '' : '',
  }))
  const hit = findLogoutIndicator(candidates, window.location.origin)
  if (!hit) return
  loggedInDetected = true
  // No `role` — a logout link alone is weak evidence. Submit-proofs (which
  // carry the role) are what let unknown sites auto-track.
  safeSend({ type: 'ACCOUNT_LOGGED_IN', domain: host() })
}

const ERROR_SELECTORS = '.error, .error-message, .alert-danger, .form-error, [aria-invalid="true"], .invalid-feedback, .error-text'
let authOutcomeTimer: ReturnType<typeof setTimeout> | null = null

// --- Auth attempt proof -----------------------------------------------------
// An attempt must survive BOTH outcomes: SPA logins stay on this page
// (checkAuthOutcome decides after 800ms), classic logins navigate away and
// the 800ms timer dies with the page — so the attempt is also parked in
// sessionStorage and resolved by consumePendingAuth() on the next load.
const PENDING_AUTH_KEY = 'sg_pending_auth'

function markAuthAttempt(role: 'login' | 'signup'): void {
  // Only arm when a password field actually holds text. Clicking a button
  // near an EMPTY login form (or Enter-in-empty-password) fired this too,
  // and "fields cleared 800ms later" then fabricated verified accounts for
  // sites the user never logged into.
  const typed = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="password"]'))
    .some(i => document.contains(i) && i.value.length > 0)
  if (!typed) return
  try { sessionStorage.setItem(PENDING_AUTH_KEY, JSON.stringify({ t: Date.now(), role })) } catch {}
  if (authOutcomeTimer) clearTimeout(authOutcomeTimer)
  authOutcomeTimer = setTimeout(() => checkAuthOutcome(role), 800)
}

function clearPendingAuth(): void {
  try { sessionStorage.removeItem(PENDING_AUTH_KEY) } catch {}
}

// SPA path: form replaced or password cleared = success; inline error markers
// = failure. Full-page navigations are resolved by consumePendingAuth().
function checkAuthOutcome(role: 'login' | 'signup'): void {
  authOutcomeTimer = null
  const pws = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="password"]'))
  const stillFilled = pws.some(i => document.contains(i) && i.value.length > 0)
  clearPendingAuth()
  if (!stillFilled) {
    safeSend({ type: 'ACCOUNT_LOGGED_IN', domain: host(), role })
    return
  }
  if (document.querySelectorAll(ERROR_SELECTORS).length > 0) {
    safeSend({ type: 'ACCOUNT_LOGIN_FAILED', domain: host() })
  }
}

// Classic-login handoff: runs at page load after a submit navigation.
// Fresh marker + NO password field in the DOM anymore = success.
function consumePendingAuth(): void {
  let rec: { t?: number; role?: string } | null = null
  try { rec = JSON.parse(sessionStorage.getItem(PENDING_AUTH_KEY) || 'null') } catch {}
  clearPendingAuth()
  if (!rec || typeof rec.t !== 'number' || Date.now() - rec.t > 60000) return
  if (rec.role !== 'login' && rec.role !== 'signup') return
  // Error re-render keeps the password field — not a success.
  if (document.querySelector('input[type="password"]')) return
  safeSend({ type: 'ACCOUNT_LOGGED_IN', domain: host(), role: rec.role })
}

document.addEventListener('submit', (e: SubmitEvent) => {
  const form = e.target as HTMLFormElement
  const pw = form.querySelector?.<HTMLInputElement>('input[type="password"]')
  if (!pw) return
  ensureRoleForForm(form, pw)
  markAuthAttempt(pageAuthRole || 'login')
}, true)

// Formless submits fire no `submit` event — clicks near a password field and
// Enter-in-password count as attempts. The OUTCOME check is the real gate
// (a random nav click does not clear the password field), so over-triggering
// here is harmless.
document.addEventListener('click', (e: MouseEvent) => {
  const el = e.target as HTMLElement | null
  const btn = el?.closest?.('button, [role="button"], input[type="submit"]') as HTMLElement | null
  if (!btn) return
  let node: HTMLElement | null = btn.parentElement
  let near = btn.querySelector('input[type="password"]') !== null
  for (let i = 0; !near && node && i < 4; i++) {
    near = node.querySelector('input[type="password"]') !== null
    node = node.parentElement
  }
  if (near) markAuthAttempt(pageAuthRole || 'login')
}, true)

document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key !== 'Enter') return
  const t = e.target as HTMLElement | null
  if (t instanceof HTMLInputElement && t.type === 'password') markAuthAttempt(pageAuthRole || 'login')
}, true)

// SPA frameworks render login/signup forms long after the document_start scan
// — re-scan as the DOM changes so the account role actually gets reported.
let authObserver: MutationObserver | null = null
let authRescanTimer: ReturnType<typeof setTimeout> | null = null

function startAuthObserver(): void {
  if (authObserver) return
  authObserver = new MutationObserver(() => {
    if (authRescanTimer) return
    authRescanTimer = setTimeout(() => {
      authRescanTimer = null
      detectPasswordForms()
    }, 1000)
  })
  authObserver.observe(document.documentElement, { childList: true, subtree: true })
}

function stopAuthObserver(): void {
  if (authObserver) {
    authObserver.disconnect()
    authObserver = null
  }
  if (authRescanTimer) {
    clearTimeout(authRescanTimer)
    authRescanTimer = null
  }
}

export function isContextValid(): boolean {
  try { return Boolean(chrome.runtime?.id) } catch { return false }
}

export function safeSend(msg: any): void {
  if (!isContextValid()) return
  try {
    chrome.runtime.sendMessage(msg).catch(() => {
      // MV3 service worker may need time to wake up - retry once
      if (!msg._retry) {
        setTimeout(() => {
          try {
            if (isContextValid()) chrome.runtime.sendMessage({ ...msg, _retry: true }).catch(() => {})
          } catch {}
        }, 200)
      }
    })
  } catch { /* context invalidated mid-send; do not tear down the scan */ }
}

function cleanup(): void {
  if (authScanInterval !== null) { clearInterval(authScanInterval); authScanInterval = null }
  if (authOutcomeTimer) { clearTimeout(authOutcomeTimer); authOutcomeTimer = null }
  stopUrlCleaner()
  stopPolicyDetection()
  stopAuthObserver()
}

chrome.runtime.onMessage.addListener((msg: any, sender: any, sendResponse: any) => {
  if (sender?.id && sender.id !== chrome.runtime.id) return
  if (msg.type === 'SCAN_PASSWORD_FORMS') { resetAuthState(); detectPasswordForms(); if (sendResponse) sendResponse({ success: true }) }
  if (msg.type === 'SCAN_PAGE') { scanPage(); if (sendResponse) sendResponse({ success: true }) }
  if (msg.type === 'FIND_POLICY_LINKS') { handleFindPolicyLinks(msg.scrapeOnly); if (sendResponse) sendResponse({ success: true }) }
  if (msg.type === 'PROBE_POLICY') { probePolicyPaths(true).catch(() => {}); if (sendResponse) sendResponse({ success: true }) }
  if (msg.type === 'PROBE_POLICY_URL') { fetchPolicyUrlForProbe(msg.url).catch(() => {}); if (sendResponse) sendResponse({ success: true }) }
})

try {
  if (!isContextValid()) throw new Error('Extension context invalidated')

  detectPasswordForms()
  // Re-scan for login forms after DOM is fully loaded + on an interval,
  // so SPA-rendered forms (Google, etc.) that appear later are still caught.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { consumePendingAuth(); detectPasswordForms() }, { once: true })
  } else {
    setTimeout(() => { consumePendingAuth(); detectPasswordForms() }, 500)
  }
  authScanInterval = setInterval(detectPasswordForms, 10000)

  setTimeout(scanPage, 2000)

  // Reset auth detection state on SPA navigation so login-form pages
  // don't suppress logged-in detection on post-login dashboards.
  const origPush = window.history.pushState.bind(window.history)
  const origReplace = window.history.replaceState.bind(window.history)
  window.history.pushState = (data, unused, url) => { const r = origPush(data, unused, url); resetAuthState(); return r }
  window.history.replaceState = (data, unused, url) => { const r = origReplace(data, unused, url); resetAuthState(); return r }
  window.addEventListener('popstate', resetAuthState)

  initUrlCleaner()
  initPolicyDetection()
  startAuthObserver()

  // Injected at document_start — the DOM is empty, so link detection
  // would find nothing. Run once the DOM is ready (the background also
  // re-asks via FIND_POLICY_LINKS when the popup opens).
  const runLinkDetection = () => detectPolicyLinks()
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runLinkDetection, { once: true })
  } else {
    runLinkDetection()
  }
} catch { cleanup() }

window.addEventListener('beforeunload', cleanup)
