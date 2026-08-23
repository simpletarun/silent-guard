import { timeoutSignal } from '../../utils/timeoutSignal'
import { RiskEvent, ThreatIntelMatch } from '../../types'
import { addCategoryEvent, getSecurityState, getSettings, updateSecurityState } from '../storage'
import { recalculateCategoryScore } from '../engine'

// Domain → last-checked timestamp. A URLHaus listing can appear hours after
// the first visit, so recheck after a day instead of caching forever.
const checkedDomains = new Map<string, number>()

export function resetAuditCaches(): void {
  checkedDomains.clear()
}
const CHECKED_DOMAINS_MAX = 5000
const RECHECK_AFTER_MS = 24 * 60 * 60 * 1000

function shouldCheck(domain: string): boolean {
  const last = checkedDomains.get(domain)
  return last === undefined || Date.now() - last > RECHECK_AFTER_MS
}

function pruneCheckedDomains(): void {
  if (checkedDomains.size > CHECKED_DOMAINS_MAX) {
    const arr = Array.from(checkedDomains.entries())
    checkedDomains.clear()
    for (const [d, t] of arr.slice(arr.length - CHECKED_DOMAINS_MAX / 2)) checkedDomains.set(d, t)
  }
}

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

async function checkTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({})
  for (const tab of tabs) {
    if (!tab.url) continue
    const domain = extractDomain(tab.url)
    if (domain && shouldCheck(domain)) {
      checkedDomains.set(domain, Date.now())
      pruneCheckedDomains()
      checkIntelDomain(domain)
    }
  }
}

async function fetchWithRetry(url: string, options: RequestInit, retries = 3): Promise<Response | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(url, { ...options, signal: timeoutSignal(10000) })
      if (resp.status === 429) {
        await new Promise(r => setTimeout(r, (i + 1) * 2000))
        continue
      }
      return resp
    } catch {
      if (i === retries - 1) return null
      await new Promise(r => setTimeout(r, (i + 1) * 1000))
    }
  }
  return null
}

export function threatTabUpdatedHandler(_tabId: number, changeInfo: chrome.tabs.TabChangeInfo): void {
  if (!changeInfo.url) return
  const url = changeInfo.url
  getSettings().then(s => {
    if (!s.monitorThreatIntel) return
    const domain = extractDomain(url)
    if (domain && shouldCheck(domain)) {
      checkedDomains.set(domain, Date.now())
      pruneCheckedDomains()
      checkIntelDomain(domain)
    }
  }).catch(() => {})
}

export function startThreatIntelMonitor(): void {
  getSettings().then(s => {
    if (s.monitorThreatIntel) checkTabs()
  }).catch(() => {})
}

export async function checkIntelDomain(domain: string): Promise<void> {
  try {
    const resp = await fetchWithRetry('https://urlhaus-api.abuse.ch/v1/host/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `host=${encodeURIComponent(domain)}`,
    })
    if (!resp || !resp.ok) return
    const data = await resp.json()
    if (data?.query_status === 'ok' && data?.url_count > 0) {
      const match: ThreatIntelMatch = {
        ioc: domain,
        type: 'domain',
        feed: 'URLHaus',
        description: `Domain associated with ${data.url_count} malicious URL(s)`,
        severity: data.url_count > 10 ? 'critical' : 'high',
        matchedAt: Date.now(),
      }
      await storeThreatMatch(match)
    }
  } catch (e) {
    console.error('Threat intel domain check failed:', e)
  }
}

// Serialize concurrent match writes — two domains resolving simultaneously
// used to read the same matches array and drop one.
let matchQueue: Promise<unknown> = Promise.resolve()

function storeThreatMatch(match: ThreatIntelMatch): Promise<void> {
  matchQueue = matchQueue.then(async () => {
    const existing = (await getSecurityState()).threatIntelMatches || []
    // Re-checks run daily by design — a domain that stays listed must not
    // re-add its row or re-alert every day.
    const prior = existing.find(m => m.ioc === match.ioc && m.feed === match.feed)
    if (prior) return
    const matches = [match, ...existing].slice(0, 100)
    await updateSecurityState({ threatIntelMatches: matches })

    const severity = match.severity as string
    const eventSeverity = severity === 'critical' ? 'critical' : severity === 'high' ? 'high' : 'medium'
    const event: RiskEvent = {
      id: crypto.randomUUID(),
      type: 'threat_intel_match',
      category: 'network',
      severity: eventSeverity as 'low' | 'medium' | 'high' | 'critical',
      title: `Threat intel match: ${match.ioc}`,
      description: match.description,
      source: match.feed,
      timestamp: Date.now(),
      acknowledged: false,
    }
    await addCategoryEvent('network', event)
    await recalculateCategoryScore('network')
  }).catch(() => {})
  return matchQueue as Promise<void>
}
