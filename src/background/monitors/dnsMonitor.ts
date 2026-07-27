import { RiskEvent, DnsCheckResult } from '../../types'
import { addCategoryEvent, getSecurityState, updateSecurityState } from '../storage'
import { recalculateCategoryScore } from '../engine'

const RESOLVERS = [
  { name: 'cloudflare', url: (d: string) => `https://cloudflare-dns.com/dns-query?name=${d}&type=A` },
  { name: 'google', url: (d: string) => `https://dns.google/resolve?name=${d}&type=A` },
  { name: 'dohli', url: (d: string) => `https://doh.li/dns-query?name=${d}&type=A` },
]

const dnsCache: Map<string, { result: DnsCheckResult; cachedAt: number }> = new Map()
const DNS_CACHE_MAX = 200

async function queryResolver(name: string, url: string): Promise<string[]> {
  try {
    const headers: Record<string, string> = { accept: 'application/dns-json' }
    const resp = await fetch(url, { headers, signal: AbortSignal.timeout(5000) })
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

export async function checkDns(domain: string): Promise<void> {
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

    const allIps = [...new Set(results.flat())]
    const isConsistent = resolverResults.every(r => r.ips.length > 0) &&
      resolverResults.slice(1).every(r =>
        r.ips.length === resolverResults[0].ips.length &&
        r.ips.every(ip => resolverResults[0].ips.includes(ip))
      )

    for (const r of resolverResults) {
      r.matched = isConsistent || r.ips.some(ip => resolverResults[0].ips.includes(ip))
    }

    const result: DnsCheckResult = {
      domain,
      expectedIps: allIps,
      resolverResults,
      isConsistent,
      checkedAt: Date.now(),
    }

    if (dnsCache.size >= DNS_CACHE_MAX) {
      const oldest = dnsCache.entries().next().value
      if (oldest) dnsCache.delete(oldest[0])
    }
    dnsCache.set(domain, { result, cachedAt: Date.now() })

    const existing = (await getSecurityState()).dnsChecks || []
    const checks = [result, ...existing].slice(0, 50)
    await updateSecurityState({ dnsChecks: checks })

    if (!isConsistent) {
      const event: RiskEvent = {
        id: crypto.randomUUID(),
        type: 'dns_poison',
        category: 'network',
        severity: 'high',
        title: `DNS inconsistency detected for ${domain}`,
        description: `Resolvers returned different IPs: ${resolverResults.map(r => `${r.resolver}=[${r.ips.join(',')}]`).join(', ')}`,
        source: domain,
        timestamp: Date.now(),
        acknowledged: false,
      }
      await addCategoryEvent('network', event)
      await recalculateCategoryScore('network')
    }
  } catch (e) {
    console.error('DNS check failed:', e)
  }
}

export function dnsTabUpdatedHandler(_tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab): void {
  if (changeInfo.url && tab.url) {
    try {
      const domain = new URL(tab.url).hostname
      checkDns(domain)
    } catch {}
  }
}

