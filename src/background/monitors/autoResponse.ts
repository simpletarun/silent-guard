import { RiskEvent, ForensicSnapshot } from '../../types'
import { addCategoryEvent, getSecurityState, getSettings, updateSecurityState } from '../storage'
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

  const newVal = stateChange.newValue as { securityState?: { correlatedIncidents?: any[] } } | undefined
  const oldVal = stateChange.oldValue as { securityState?: { correlatedIncidents?: any[] } } | undefined
  const newIncidents = newVal?.securityState?.correlatedIncidents || []
  const oldIncidents = oldVal?.securityState?.correlatedIncidents || []

  if (newIncidents.length <= oldIncidents.length) return

  getSettings().then(settings => {
    if (!settings.autoKillSessions && !settings.autoRotateCredentials) return
    getSecurityState().then(state => {
      const accDomains = (state.accounts || []).map(a => a.domain)
      incidentQueue.push({ domains: settings.autoKillSessions ? accDomains : [], breached: [] })
      processIncidentQueue()
    }).catch(() => {})
  }).catch(() => {})
}

export async function autoKillSessions(domains: string[]): Promise<void> {
  for (const domain of domains) {
    try {
      try {
        const cookies = await chrome.cookies.getAll({ domain })
        for (const cookie of cookies) {
          chrome.cookies.remove({ url: `https://${domain}${cookie.path}`, name: cookie.name }).catch(() => {})
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

export async function autoRotateCredentials(accounts: string[]): Promise<void> {
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

export async function isolateNetwork(): Promise<void> {
  try {
    const extensions = await chrome.management.getAll()
    for (const ext of extensions) {
      if (ext.id === chrome.runtime.id) continue
      if (ext.enabled && ext.type === 'extension') {
        const riskyPerms = ['cookies', 'webRequest', 'tabs', '<all_urls>']
        const hasRisky = (ext.permissions || []).some(p => riskyPerms.includes(p))
        if (hasRisky) {
          await chrome.management.setEnabled(ext.id, false).catch(() => {})
        }
      }
    }
  } catch { /* management API not available */ }

  try {
    await chrome.browsingData.remove({ since: Date.now() - 86400000 }, {
      localStorage: true,
      cookies: true,
      cacheStorage: true,
    })
  } catch { /* browsingData not available */ }

  const event: RiskEvent = {
    id: crypto.randomUUID(),
    type: 'network_change',
    category: 'network',
    severity: 'critical',
    title: 'Network isolation activated',
    description: 'Non-essential extensions disabled, browsing data cleared',
    source: 'silent-guard',
    timestamp: Date.now(),
    acknowledged: false,
  }
  await addCategoryEvent('network', event)
  await notifyRiskEvent(event)
  await recalculateCategoryScore('network').catch(() => {})
}

export async function takeForensicSnapshot(trigger: string): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({})
    const extensions = await chrome.management.getAll()
    const cookies = await chrome.cookies.getAll({})
    const state = await getSecurityState()

    const snapshot: ForensicSnapshot = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      trigger,
      openTabs: tabs.map(t => ({ url: t.url || '', title: t.title || '' })),
      extensions: extensions.map(e => ({ id: e.id, name: e.name, enabled: e.enabled })),
      cookies: cookies.map(c => ({ domain: c.domain, name: c.name, secure: c.secure || false })).slice(0, 100),
      networkState: {
        publicIp: state.network?.publicIp || 'unknown',
        isVpn: state.network?.isVpn || false,
      },
      fingerprint: state.fingerprint,
    }

    const snapshots = state.forensicSnapshots || []
    snapshots.unshift(snapshot)
    if (snapshots.length > 10) snapshots.length = 10
    await updateSecurityState({ forensicSnapshots: snapshots })

    chrome.storage.local.set({ [`forensic_${snapshot.id}`]: JSON.stringify(snapshot) }).catch(() => {})

    const event: RiskEvent = {
      id: crypto.randomUUID(),
      type: 'forensic_snapshot',
      category: 'overview',
      severity: 'medium',
      title: `Forensic snapshot: ${trigger}`,
      description: `${snapshot.openTabs.length} tabs, ${snapshot.extensions.length} extensions captured`,
      source: trigger,
      timestamp: Date.now(),
      acknowledged: false,
    }
    await addCategoryEvent('overview', event)
    await recalculateCategoryScore('overview')
  } catch (e) {
    console.error('Forensic snapshot failed:', e)
  }
}
