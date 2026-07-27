import { RiskEvent } from '../../types'
import { addCategoryEvent } from '../storage'
import { recalculateCategoryScore } from '../engine'

const COOKIE_KEYWORDS = ['session', 'token', 'auth', 'sid', 'jwt', 'refresh', 'access_token', 'login']
let lastCookieRecalc = 0
const domainCooldowns = new Map<string, number>()
const DOMAIN_COOLDOWN_MS = 60000

function isAuthCookie(name: string): boolean {
  return COOKIE_KEYWORDS.some(k => name.toLowerCase().includes(k))
}

function getCookieRiskLevel(
  cookieName: string,
  domain: string,
  isSecure: boolean,
  sameSite?: chrome.cookies.SameSiteStatus
): 'low' | 'medium' | 'high' {
  let risk: 'low' | 'medium' | 'high' = 'low'
  if (isAuthCookie(cookieName)) risk = 'medium'
  if (isAuthCookie(cookieName) && !isSecure) risk = 'high'
  if (isAuthCookie(cookieName) && sameSite === 'no_restriction') risk = 'high'
  return risk
}

export async function cookieChangeHandler(changeInfo: {
  cookie: chrome.cookies.Cookie
  cause: string
  removed: boolean
}): Promise<void> {
  const { cookie, cause, removed } = changeInfo
  if (!isAuthCookie(cookie.name)) return

  const now = Date.now()
  const lastEvent = domainCooldowns.get(cookie.domain)
  if (lastEvent && now - lastEvent < DOMAIN_COOLDOWN_MS) return
  domainCooldowns.set(cookie.domain, now)
  if (domainCooldowns.size > 100) {
    const oldest = [...domainCooldowns.entries()].sort((a, b) => a[1] - b[1])[0]
    if (oldest) domainCooldowns.delete(oldest[0])
  }

  const riskLevel = getCookieRiskLevel(cookie.name, cookie.domain, cookie.secure, cookie.sameSite)

  const causeLabels: Record<string, string> = {
    explicit: 'User action',
    overwrite: 'Updated by website',
    expired: 'Cookie expired',
    evicted: 'Evicted by browser',
    insert: 'New cookie set',
  }

  const event: RiskEvent = {
    id: crypto.randomUUID(),
    type: 'cookie_change',
    category: 'accounts',
    severity: riskLevel === 'high' ? 'high' : riskLevel === 'medium' ? 'medium' : 'low',
    title: removed ? 'Authentication cookie removed' : 'Authentication cookie changed',
    description: `Cookie "${cookie.name}" on ${cookie.domain} - ${causeLabels[cause] || cause}`,
    source: cookie.domain,
    timestamp: Date.now(),
    acknowledged: false,
  }

  await addCategoryEvent('accounts', event)
  if (now - lastCookieRecalc > 10000) {
    lastCookieRecalc = now
    await recalculateCategoryScore('accounts')
  }
}

