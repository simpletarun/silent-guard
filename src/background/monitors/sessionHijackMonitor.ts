import { RiskEvent } from '../../types'
import { addCategoryEvent, getSecurityState } from '../storage'
import { recalculateCategoryScore } from '../engine'

const HIGH_VALUE_DOMAINS = [
  'gmail.com', 'outlook.com', 'bankofamerica.com', 'chase.com', 'wellsfargo.com',
  'paypal.com', 'github.com', 'aws.amazon.com', 'apple.com', 'icloud.com',
  'facebook.com', 'twitter.com', 'linkedin.com', 'reddit.com', 'dropbox.com',
  'mail.yahoo.com', 'aol.com', 'protonmail.com', 'capitalone.com', 'usbank.com',
  'citi.com', 'schwab.com', 'ameritrade.com', 'coinbase.com', 'cloudflare.com',
]

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
      if (!/session|token|auth|login|sid/i.test(cookie.name)) continue
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
        await addCategoryEvent('accounts', event)
        await recalculateCategoryScore('accounts')
      }
    }
  } catch (e) {
    console.error('Cookie check failed:', e)
  }
}

async function checkSessionForDomain(domain: string): Promise<void> {
  try {
    const state = await getSecurityState()
    const net = state.network
    if (!net || !net.publicIp) return

    const ipHistory = net.ipHistory || []
    const recentIps = ipHistory.filter(h => Date.now() - h.timestamp < 86400000)
    if (recentIps.length < 2) return

    const prevIp = recentIps[recentIps.length - 2]
    if (prevIp.ip !== net.publicIp && net.country && prevIp.ip) {
      const event: RiskEvent = {
        id: crypto.randomUUID(),
        type: 'session_hijack',
        category: 'accounts',
        severity: 'critical',
        title: `Possible session hijack on ${domain}`,
        description: `IP changed from ${prevIp.ip} to ${net.publicIp} (${net.country}) within 24h while accessing ${domain}`,
        source: domain,
        timestamp: Date.now(),
        acknowledged: false,
      }
      await addCategoryEvent('accounts', event)
      await recalculateCategoryScore('accounts')
      checkCookiesForDomain(domain)
    }
  } catch (e) {
    console.error('Session hijack check failed:', e)
  }
}

export function sessionTabUpdatedHandler(_tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab): void {
  if (!changeInfo.url || !tab.url) return
  const domain = isMonitoredDomain(tab.url)
  if (domain) checkSessionForDomain(domain)
}

export async function sessionCookieChangedHandler(changeInfo: {
  cookie: chrome.cookies.Cookie
  cause: string
  removed: boolean
}): Promise<void> {
  try {
    const cookie = changeInfo.cookie
    let domain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain
    if (domain.startsWith('.')) domain = domain.substring(1)
    const monitored = HIGH_VALUE_DOMAINS.find(d => domain === d || domain.endsWith('.' + d))
    if (!monitored) return

    if (!/session|token|auth|login|sid/i.test(cookie.name)) return

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
      await addCategoryEvent('accounts', event)
      await recalculateCategoryScore('accounts')
    }
  } catch (e) {
    console.error('Cookie change handler failed:', e)
  }
}

