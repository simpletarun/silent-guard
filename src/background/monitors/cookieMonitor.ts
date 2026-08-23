import { RiskEvent } from '../../types'
import { addCategoryEvent, getSettings } from '../storage'
import { recalculateCategoryScore } from '../engine'

const DOMAIN_COOLDOWN_MS = 60000
export const COOKIE_NAME_RE = /^([a-z0-9]*[._-])?(phpsessid|sessionid|sessid|session|sid|token|auth|login|logged_in|jwt|refresh|access_token)([._-].*)?$/i
let lastCookieRecalc = 0
const domainCooldowns = new Map<string, number>()

export function resetAuditCaches(): void {
  domainCooldowns.clear()
  lastCookieRecalc = 0
}

function isAuthCookie(name: string): boolean {
  // Anchored token match — "residence_id" or "loginwall_timestamp" contain
  // the substrings "sid"/"login" but are not auth cookies.
  return COOKIE_NAME_RE.test(name.trim())
}

function getCookieRiskLevel(
  cookieName: string,
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
  try {
    const settings = await getSettings()
    if (!settings.monitorCookies) return
    const { cookie, cause, removed } = changeInfo
    if (!isAuthCookie(cookie.name)) return

    const now = Date.now()

    // Only insert/overwrite are security signals. Expired/evicted/explicit
    // removals are logout/normal browser churn — they fired a "low" event
    // on every logout and buried real cookie changes.
    if (cause !== 'insert' && cause !== 'overwrite') return
    // A session-cookie refresh fires TWO events: removed+overwrite for the
    // old cookie, then the real insert. The phantom removal used to claim
    // the cooldown and log "cookie removed" on every refresh.
    if (removed) return

    const lastEvent = domainCooldowns.get(cookie.domain)
    if (lastEvent && now - lastEvent < DOMAIN_COOLDOWN_MS) return
    domainCooldowns.set(cookie.domain, now)
    if (domainCooldowns.size > 100) {
      const oldest = [...domainCooldowns.entries()].sort((a, b) => a[1] - b[1])[0]
      if (oldest) domainCooldowns.delete(oldest[0])
    }

    // A removed/overwritten cookie is scored by its own flags, not by
    // security flags of the now-dead cookie — logouts would fire "high".
    const severity = getCookieRiskLevel(cookie.name, cookie.secure, cookie.sameSite)

    // Only insert/overwrite reach this point (see guard above) — expired/
    // evicted/explicit labels are unreachable by construction.
    const causeLabels: Record<string, string> = {
      overwrite: 'Updated by website',
      insert: 'New cookie set',
    }

    const event: RiskEvent = {
      id: crypto.randomUUID(),
      type: 'cookie_change',
      category: 'accounts',
      severity,
      title: 'Authentication cookie changed',
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
  } catch (e) {
    console.error('cookieChangeHandler failed:', e)
  }
}

