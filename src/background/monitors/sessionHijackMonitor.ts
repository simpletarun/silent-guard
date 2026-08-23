import { RiskEvent } from '../../types'
import { addCategoryEvent, getSecurityState, getSettings, hasRecentCategoryEvent } from '../storage'
import { recalculateCategoryScore } from '../engine'
import { COOKIE_NAME_RE } from './cookieMonitor'

const HIGH_VALUE_DOMAINS = [
  'gmail.com', 'outlook.com', 'bankofamerica.com', 'chase.com', 'wellsfargo.com',
  'paypal.com', 'github.com', 'aws.amazon.com', 'apple.com', 'icloud.com',
  'facebook.com', 'twitter.com', 'linkedin.com', 'reddit.com', 'dropbox.com',
  'mail.yahoo.com', 'aol.com', 'protonmail.com', 'capitalone.com', 'usbank.com',
  'citi.com', 'schwab.com', 'ameritrade.com', 'coinbase.com', 'cloudflare.com',
]

// Event dedup already prevents repeat alerts, but the underlying check
// (state read + cookie loop) still ran on every navigation to a monitored
// domain — cooldown the work itself.
const CHECK_COOLDOWN_MS = 300000
const domainCooldowns = new Map<string, number>()

export function resetAuditCaches(): void {
  domainCooldowns.clear()
}

function cooldownPassed(domain: string): boolean {
  const now = Date.now()
  const last = domainCooldowns.get(domain)
  if (last && now - last < CHECK_COOLDOWN_MS) return false
  domainCooldowns.set(domain, now)
  return true
}

function isMonitoredDomain(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '')
    return HIGH_VALUE_DOMAINS.find(d => hostname === d || hostname.endsWith('.' + d)) || null
  } catch {
    return null
  }
}

async function checkCookiesForDomain(domain: string): Promise<void> {
  try {
    const cookies = await chrome.cookies.getAll({ domain })
    for (const cookie of cookies) {
      if (!COOKIE_NAME_RE.test(cookie.name)) continue
      if (!cookie.secure || !cookie.httpOnly) {
        const flags: string[] = []
        if (!cookie.secure) flags.push('secure')
        if (!cookie.httpOnly) flags.push('httpOnly')
        const event: RiskEvent = {
          id: crypto.randomUUID(),
          type: 'session_hijack',
          category: 'accounts',
          severity: 'medium',
          title: `Auth cookie weakened on ${domain}`,
          description: `Cookie "${cookie.name}" on ${domain} missing ${flags.join(', ')} flag`,
          source: domain,
          timestamp: Date.now(),
          acknowledged: false,
        }
        // Dedupe on the cookie name — a second weakened cookie on the same
        // domain within 6h is a separate finding, not the same one.
        const exists = await hasRecentCategoryEvent('accounts', e => e.type === 'session_hijack' && e.source === domain && e.description === event.description, 6 * 3600000)
        if (!exists) {
          await addCategoryEvent('accounts', event)
          await recalculateCategoryScore('accounts')
        }
      }
    }
  } catch (e) {
    console.error('Cookie check failed:', e)
  }
}

async function checkSessionForDomain(domain: string): Promise<void> {
  try {
    const settings = await getSettings()
    if (!settings.monitorSessionHijack) return
    const state = await getSecurityState()
    const net = state.network
    if (!net || !net.publicIp) return

    // The weakened-cookie audit must run on EVERY monitored navigation —
    // it used to sit behind the IP-transition gates below, so on a stable
    // connection older than 24h it never ran at all.
    checkCookiesForDomain(domain)

    // History stores transitions only (networkMonitor): last entry = current
    // IP, one before it = previous address. Require the transition itself to
    // be recent — filtering entries by age instead dropped the baseline when
    // the connection was stable for over 24h before changing.
    const ipHistory = net.ipHistory || []
    if (ipHistory.length < 2) return
    const latest = ipHistory[ipHistory.length - 1]
    if (!latest || Date.now() - latest.timestamp > 86400000) return

    const prevIp = ipHistory[ipHistory.length - 2]
    // IP rotation alone (DHCP renewal, ISP change, VPN toggle) is not a
    // hijack — report as medium, never critical.
    if (prevIp.ip !== net.publicIp && prevIp.ip) {
      const event: RiskEvent = {
        id: crypto.randomUUID(),
        type: 'session_hijack',
        category: 'accounts',
        severity: 'medium',
        title: `Possible session hijack on ${domain}`,
        description: `IP changed from ${prevIp.ip} to ${net.publicIp} within 24h while accessing ${domain}`,
        source: domain,
        timestamp: Date.now(),
        acknowledged: false,
      }
      const exists = await hasRecentCategoryEvent('accounts', e => e.type === 'session_hijack' && e.source === domain && e.description.includes(prevIp.ip), 24 * 3600000)
      if (!exists) {
        await addCategoryEvent('accounts', event)
        await recalculateCategoryScore('accounts')
      }
    }
  } catch (e) {
    console.error('Session hijack check failed:', e)
  }
}

export function sessionTabUpdatedHandler(_tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab): void {
  if (!changeInfo.url || !tab.url) return
  const domain = isMonitoredDomain(tab.url)
  if (domain && cooldownPassed(domain)) checkSessionForDomain(domain)
}

export async function sessionCookieChangedHandler(changeInfo: {
  cookie: chrome.cookies.Cookie
  cause: string
  removed: boolean
}): Promise<void> {
  try {
    const settings = await getSettings()
    if (!settings.monitorSessionHijack) return
    // A logout/expiry removes the cookie — flag checks are meaningless on a
    // dead cookie, and "Auth cookie weakened" would fire on every logout.
    if (changeInfo.removed) return
    const cookie = changeInfo.cookie
    let domain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain
    const monitored = HIGH_VALUE_DOMAINS.find(d => domain === d || domain.endsWith('.' + d))
    if (!monitored) return

    if (!COOKIE_NAME_RE.test(cookie.name)) return

    if (!cookie.secure || !cookie.httpOnly) {
      const flags: string[] = []
      if (!cookie.secure) flags.push('secure')
      if (!cookie.httpOnly) flags.push('httpOnly')
      const event: RiskEvent = {
        id: crypto.randomUUID(),
        type: 'session_hijack',
        category: 'accounts',
        severity: 'medium',
        title: `Auth cookie weakened on ${monitored}`,
        description: `Cookie "${cookie.name}" on ${monitored} missing ${flags.join(', ')} flag`,
        source: monitored,
        timestamp: Date.now(),
        acknowledged: false,
      }
      const exists = await hasRecentCategoryEvent('accounts', e => e.type === 'session_hijack' && e.source === monitored && e.description === event.description, 6 * 3600000)
      if (!exists) {
        await addCategoryEvent('accounts', event)
        await recalculateCategoryScore('accounts')
      }
    }
  } catch (e) {
    console.error('Cookie change handler failed:', e)
  }
}

