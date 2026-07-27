import { RiskEvent, NetworkInfo } from '../../types'
import { addCategoryEvent, updateSecurityState, getSecurityState } from '../storage'
import { recalculateCategoryScore } from '../engine'

const VPN_KEYWORDS = ['vpn', 'proxy', 'datacenter', 'hosting', 'cloud', 'aws', 'gcp', 'azure', 'digitalocean', 'hetzner', 'ovh', 'linode']
const TOR_ASNS = [9009, 50472, 12876]

let failureCount = 0
let pendingBackoff: ReturnType<typeof setTimeout> | null = null

export function cancelPendingIpCheck(): void {
  if (pendingBackoff !== null) {
    clearTimeout(pendingBackoff)
    pendingBackoff = null
  }
}

async function fetchIp(): Promise<string> {
  const services = [
    async () => { const r = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(8000) }); const d = await r.json(); return d.ip },
    async () => { const r = await fetch('https://api.ip.sb/geoip', { signal: AbortSignal.timeout(8000) }); const d = await r.json(); return d.ip },
    async () => { const r = await fetch('https://icanhazip.com', { signal: AbortSignal.timeout(8000) }); return (await r.text()).trim() },
  ]
  for (const svc of services) {
    try { const ip = await svc(); if (ip) return ip } catch { }
  }
  return ''
}

export async function checkPublicIp(): Promise<void> {
  try {
    const ip = await fetchIp()
    if (!ip) {
      failureCount++
      const backoff = Math.min(60000 * Math.pow(2, failureCount), 300000)
      cancelPendingIpCheck()
      pendingBackoff = setTimeout(() => {
        pendingBackoff = null
        checkPublicIp().catch(() => {})
      }, backoff)
      return
    }
    failureCount = 0
    cancelPendingIpCheck()

    const state = await getSecurityState()
    const prev = state.network

    let isp: string | undefined
    let country: string | undefined
    let city: string | undefined
    let org: string | undefined
    let isVpn = false
    let isProxy = false
    let isTor = false

    try {
      const geoResp = await fetch(`https://ipapi.co/${ip}/json/`, { signal: AbortSignal.timeout(8000) })
      if (geoResp.ok) {
        const geo = await geoResp.json()
        isp = geo.org || geo.isp
        country = geo.country_name
        city = geo.city
        org = geo.org
      }
    } catch {
      try {
        const fallbackResp = await fetch(`https://ipwho.is/${ip}`, { signal: AbortSignal.timeout(8000) })
        if (fallbackResp.ok) {
          const geo = await fallbackResp.json()
          if (geo.success) {
            isp = geo.connection?.isp || geo.org
            country = geo.country
            city = geo.city
            org = geo.connection?.org
          }
        }
      } catch {}
    }

    if (!isp && !city && !country) {
      try {
        const fb2 = await fetch(`https://ip-api.com/json/${ip}`, { signal: AbortSignal.timeout(8000) })
        if (fb2.ok) {
          const geo = await fb2.json()
          if (geo.status === 'success') {
            isp = geo.isp || geo.org
            country = geo.country
            city = geo.city
            org = geo.org
          }
        }
      } catch {}
    }

    if (org || isp) {
      const searchText = ((org || '') + ' ' + (isp || '')).toLowerCase()
      isVpn = VPN_KEYWORDS.some(k => searchText.includes(k))
      isTor = searchText.includes('tor')
      if (!isTor && org) {
        try {
          const asnMatch = /AS(\d+)/i.exec(org)
          if (asnMatch) isTor = TOR_ASNS.includes(parseInt(asnMatch[1], 10))
        } catch {}
      }
    }

    if (prev && prev.publicIp !== ip) {
      const prevInfo = prev.country && country && prev.country !== country ? ` (country: ${prev.country} \u2192 ${country})` : ''
      const event: RiskEvent = {
        id: crypto.randomUUID(),
        type: 'ip_change',
        category: 'network',
        severity: 'medium',
        title: 'Public IP address changed',
        description: `IP changed from ${prev.publicIp} to ${ip}${prevInfo}`,
        source: 'network',
        timestamp: Date.now(),
        acknowledged: false,
      }
      await addCategoryEvent('network', event)
    }

    const recentIps = (prev?.ipHistory || []).concat({ ip, timestamp: Date.now() }).filter(h => Date.now() - h.timestamp < 86400000 * 30)
    if (recentIps.length > 10) recentIps.shift()

    const network: NetworkInfo = {
      publicIp: ip,
      isp,
      country,
      city,
      isVpn,
      isProxy,
      isTor,
      isDoHEnabled: false,
      lastChecked: Date.now(),
      ipHistory: recentIps,
    }

    await updateSecurityState({ network })
    await recalculateCategoryScore('network')
  } catch (e) {
    console.error('IP check failed:', e)
  }
}

export function startNetworkMonitor(): void {
  checkPublicIp().catch(() => {})
}
