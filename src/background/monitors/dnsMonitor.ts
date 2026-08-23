import { timeoutSignal } from '../../utils/timeoutSignal'
import { RiskEvent, DnsCheckResult } from '../../types'
import { addCategoryEvent, getSettings, mutateSecurityState } from '../storage'
import { recalculateCategoryScore } from '../engine'

const RESOLVERS = [
  { name: 'cloudflare', url: (d: string) => `https://cloudflare-dns.com/dns-query?name=${d}&type=A` },
  { name: 'google', url: (d: string) => `https://dns.google/resolve?name=${d}&type=A` },
  { name: 'dohli', url: (d: string) => `https://doh.li/dns-query?name=${d}&type=A` },
]

const dnsCache: Map<string, { result: DnsCheckResult; cachedAt: number }> = new Map()

export function resetAuditCaches(): void {
  // inFlight promises are transient — clearing them would orphan callbacks.
  dnsCache.clear()
}
const DNS_CACHE_MAX = 200
const inFlight = new Map<string, Promise<void>>()
// Serialize result-list writes — concurrent checks for different domains
// read the same list and dropped each other's entries.

async function queryResolver(_name: string, url: string): Promise<string[]> {
  try {
    const headers: Record<string, string> = { accept: 'application/dns-json' }
    const resp = await fetch(url, { headers, signal: timeoutSignal(5000) })
    if (!resp.ok) return []
    const data = await resp.json()
    const answers = data.Answer || data.answer || []
    return answers
      .filter((a: any) => a.type === 1 || a.type === 'A')
      .map((a: any) => a.data || a.rdata || a.ipv4 || '')
      .filter(Boolean)
  } catch {
    return []
  }
}

export function checkDns(domain: string): Promise<void> {
  const pending = inFlight.get(domain)
  if (pending) return pending
  const p = doCheck(domain)
  inFlight.set(domain, p)
  return p
}

async function doCheck(domain: string): Promise<void> {
  try {
    const cached = dnsCache.get(domain)
    if (cached && Date.now() - cached.cachedAt < 300000) return

    const queries = RESOLVERS.map(r => queryResolver(r.name, r.url(domain)))
    const results = await Promise.all(queries)

    const resolverResults = RESOLVERS.map((r, i) => ({
      resolver: r.name,
      ips: results[i],
      matched: true,
    }))

    const withResults = resolverResults.filter(r => r.ips.length > 0)
    // Fewer than 2 resolvers answering is a resolver outage, not evidence of
    // poisoning. Geo-DNS / round-robin legitimately return different-but-
    // overlapping sets per resolver — that is NOT poisoning either. Only a
    // total disagreement (every pair of answer sets shares zero IPs) is.
    const isConsistent = withResults.length < 2 || withResults.some((a, i) =>
      withResults.some((b, j) => i !== j && a.ips.some(ip => b.ips.includes(ip)))
    )

    for (const r of resolverResults) {
      r.matched = withResults.length === 0 || r.ips.some(ip => withResults[0].ips.includes(ip))
    }

    const result: DnsCheckResult = {
      domain,
      expectedIps: [...new Set(results.flat())],
      resolverResults,
      isConsistent,
      checkedAt: Date.now(),
    }

    // Only cache a check that actually got answers — a full outage should
    // be retried on the next visit, not suppressed for 5 minutes.
    if (results.some(r => r.length > 0)) {
      if (dnsCache.size >= DNS_CACHE_MAX) {
        const oldest = dnsCache.entries().next().value
        if (oldest) dnsCache.delete(oldest[0])
      }
      dnsCache.set(domain, { result, cachedAt: Date.now() })
    }

    // Atomic append inside the storage write queue — a read-then-replace
    // here let a check computed during a long DoH window resurrect wiped
    // data if CLEAR_ALL_DATA landed in between.
    await mutateSecurityState(s => {
      s.dnsChecks = [result, ...(s.dnsChecks || [])].slice(0, 50)
    })

    if (!isConsistent) {
      const describe = (name: string) => {
        const r = resolverResults.find(x => x.resolver === name)
        return r && r.ips.length > 0 ? r.ips.join(', ') : 'no answer'
      }
      const event: RiskEvent = {
        id: crypto.randomUUID(),
        type: 'dns_poison',
        category: 'network',
        severity: 'high',
        title: `DNS inconsistency detected for ${domain}`,
        description: `Resolvers disagree — Cloudflare → ${describe('cloudflare')}, Google → ${describe('google')}, doh.li → ${describe('dohli')}`,
        source: domain,
        timestamp: Date.now(),
        acknowledged: false,
      }
      await addCategoryEvent('network', event)
      await recalculateCategoryScore('network')
    }
  } catch (e) {
    console.error('DNS check failed:', e)
  } finally {
    inFlight.delete(domain)
  }
}

export function dnsTabUpdatedHandler(_tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab): void {
  if (changeInfo.url && tab.url) {
    const url = tab.url
    // chrome://newtab / about:blank yield hostnames "newtab"/"blank" — never
    // query DoH servers with garbage names.
    if (!url.startsWith('http://') && !url.startsWith('https://')) return
    getSettings().then(s => {
      if (!s.monitorDns) return
      try {
        const domain = new URL(url).hostname
        // Dot-less names (localhost, dev boxes) are not public DNS — querying
        // public resolvers for them is junk traffic and always NXDOMAIN.
        if (!domain.includes('.')) return
        checkDns(domain).catch(() => {})
      } catch {}
    }).catch(() => {})
  }
}

