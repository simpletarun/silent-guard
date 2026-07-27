import { RiskEvent, ThreatIntelMatch } from '../../types'
import { addCategoryEvent, getSecurityState, updateSecurityState } from '../storage'
import { recalculateCategoryScore } from '../engine'

const checkedDomains = new Set<string>()
const CHECKED_DOMAINS_MAX = 5000

function pruneCheckedDomains(): void {
  if (checkedDomains.size > CHECKED_DOMAINS_MAX) {
    const arr = Array.from(checkedDomains)
    checkedDomains.clear()
    for (const d of arr.slice(arr.length - CHECKED_DOMAINS_MAX / 2)) checkedDomains.add(d)
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
    if (domain && !checkedDomains.has(domain)) {
      checkedDomains.add(domain)
      checkIntelDomain(domain)
    }
  }
}

async function fetchWithRetry(url: string, options: RequestInit, retries = 3): Promise<Response | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) })
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
  const domain = extractDomain(changeInfo.url)
  if (domain && !checkedDomains.has(domain)) {
    checkedDomains.add(domain)
    pruneCheckedDomains()
    checkIntelDomain(domain)
  }
}

export function startThreatIntelMonitor(): void {
  checkTabs()
}

export async function checkIntelIp(ip: string): Promise<void> {
  try {
    const resp = await fetchWithRetry(`https://otx.alienvault.com/api/v1/indicators/IPv4/${ip}/general`, {})
    if (!resp || !resp.ok) return
    const data = await resp.json()
    if (data?.pulse_info?.count > 0 && data?.pulse_info?.pulses?.length > 0) {
      const match: ThreatIntelMatch = {
        ioc: ip,
        type: 'ip',
        feed: 'AlienVault OTX',
        description: `IP found in ${data.pulse_info.count} threat pulse(s)`,
        severity: data.pulse_info.count > 5 ? 'high' : 'medium',
        matchedAt: Date.now(),
      }
      await storeThreatMatch(match)
    }
  } catch (e) {
    console.error('Threat intel IP check failed:', e)
  }
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

async function storeThreatMatch(match: ThreatIntelMatch): Promise<void> {
  const existing = (await getSecurityState()).threatIntelMatches || []
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
}
