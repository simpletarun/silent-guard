import { RiskEvent, CorrelatedIncident } from '../../types'
import { addCategoryEvent, getSecurityState, getSettings } from '../storage'
import { notifyRiskEvent } from '../notifications'
import { recalculateCategoryScore } from '../engine'

const LOGOUT_URLS: Record<string, string> = {
  'google.com': 'https://myaccount.google.com/signinoptions',
  'facebook.com': 'https://www.facebook.com/logout',
  'twitter.com': 'https://twitter.com/logout',
  'github.com': 'https://github.com/logout',
  'reddit.com': 'https://www.reddit.com/logout',
}

const CHANGE_PASSWORD_URLS: Record<string, string> = {
  'google.com': 'https://myaccount.google.com/security',
  'facebook.com': 'https://www.facebook.com/settings?tab=security',
  'github.com': 'https://github.com/settings/security',
  'microsoft.com': 'https://account.microsoft.com/security',
  'apple.com': 'https://appleid.apple.com/account/manage',
}

const incidentQueue: Array<{ domains: string[]; breached: string[] }> = []
let processingIncidents = false

async function processIncidentQueue(): Promise<void> {
  if (processingIncidents) return
  processingIncidents = true
  while (incidentQueue.length > 0) {
    const item = incidentQueue.shift()
    if (!item) continue
    try {
      if (item.domains.length > 0) {
        await autoKillSessions(item.domains)
      }
      if (item.breached.length > 0) {
        await autoRotateCredentials(item.breached)
      }
    } catch (e) {
      console.error('Auto-response failed:', e)
    }
  }
  processingIncidents = false
}

export function storageChangedHandler(changes: { [key: string]: chrome.storage.StorageChange }, area: string): void {
  if (area !== 'local') return
  const stateChange = changes['silent_guard_state']
  if (!stateChange) return

  const newVal = stateChange.newValue as { securityState?: { correlatedIncidents?: CorrelatedIncident[] } } | undefined
  const oldVal = stateChange.oldValue as { securityState?: { correlatedIncidents?: CorrelatedIncident[] } } | undefined
  const newIncidents = newVal?.securityState?.correlatedIncidents || []
  const oldIncidents = oldVal?.securityState?.correlatedIncidents || []

  // Incidents are prepended (correlationEngine), so compare by ID — a plain
  // slice by length acted on the stale tail and never hit the new incident.
  const oldIds = new Set(oldIncidents.map(i => i.id))
  const freshIncidents = newIncidents.filter(i => !oldIds.has(i.id))
  if (freshIncidents.length === 0) return

  getSettings().then(async settings => {
    if (!settings.autoKillSessions && !settings.autoRotateCredentials) return

    const state = await getSecurityState().catch(() => null)
    if (!state) return
    const tracked = new Set((state.accounts || []).map(a => a.domain))

    for (const incident of freshIncidents) {
      const domains = (incident.domains || []).filter(d => tracked.has(d))
      if (domains.length === 0) continue
      incidentQueue.push({
        domains: settings.autoKillSessions ? domains : [],
        breached: settings.autoRotateCredentials ? domains : [],
      })
    }
    if (incidentQueue.length > 0) processIncidentQueue()
  }).catch(() => {})
}

export async function autoKillSessions(domains: string[]): Promise<void> {
  for (const domain of domains) {
    try {
      try {
        // Enumerate every cookie store and include partitioned (CHIPS)
        // cookies — the default getAll misses them, so "kill sessions"
        // silently left live session cookies on CHIPS-enabled sites.
        const stores = await chrome.cookies.getAllCookieStores()
        const seen = new Set<string>()
        for (const store of stores) {
          const cookies = await chrome.cookies.getAll({ domain, partitionKey: {} as chrome.cookies.CookiePartitionKey, storeId: store.id })
          for (const cookie of cookies) {
            // Subdomain-scoped cookies (Domain=.accounts.example.com) must be
            // removed with their own domain, not the apex one.
            const cookieDomain = cookie.domain.replace(/^\./, '')
            const key = `${store.id}|${cookie.domain}|${cookie.path}|${cookie.name}`
            if (seen.has(key)) continue
            seen.add(key)
            chrome.cookies.remove({
              url: `https://${cookieDomain}${cookie.path}`,
              name: cookie.name,
              storeId: store.id,
              partitionKey: cookie.partitionKey,
            }).catch(() => {})
          }
        }
      } catch { /* skip domain */ }

      const logoutUrl = LOGOUT_URLS[domain] || `https://${domain}/logout`
      chrome.tabs.create({ url: logoutUrl, active: false }).catch(() => {})

      const event: RiskEvent = {
        id: crypto.randomUUID(),
        type: 'session_expiry',
        category: 'accounts',
        severity: 'high',
        title: `Sessions killed for ${domain}`,
        description: `All cookies cleared and logout initiated for ${domain}`,
        source: domain,
        timestamp: Date.now(),
        acknowledged: false,
      }
      await addCategoryEvent('accounts', event)
      await notifyRiskEvent(event)
      await recalculateCategoryScore('accounts').catch(() => {})
    } catch { /* skip domain */ }
  }
}

async function autoRotateCredentials(accounts: string[]): Promise<void> {
  for (const account of accounts) {
    const changeUrl = CHANGE_PASSWORD_URLS[account] || `https://${account}/account/security`
    await chrome.tabs.create({ url: changeUrl, active: true }).catch(() => {})

    const event: RiskEvent = {
      id: crypto.randomUUID(),
      type: 'account_breach',
      category: 'accounts',
      severity: 'high',
      title: `Credential rotation needed for ${account}`,
      description: `Automated password change page opened for ${account}`,
      source: account,
      timestamp: Date.now(),
      acknowledged: false,
    }
    await addCategoryEvent('accounts', event)
    await notifyRiskEvent(event)
    await recalculateCategoryScore('accounts').catch(() => {})
  }
}

