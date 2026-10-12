import { timeoutSignal } from '../../utils/timeoutSignal'
import { RiskEvent, NetworkInfo } from '../../types'
import { addCategoryEvent, updateSecurityState, getSecurityState } from '../storage'
import { recalculateCategoryScore } from '../engine'
import { dbg } from '../../utils/debug'

export interface ConnectionSignals {
  vpn: boolean
  proxy: boolean
  tor: boolean
  hosting: boolean
}

const VPN_KEYWORDS = [
  'vpn', 'proxy', 'datacenter', 'hosting', 'cloud', 'aws', 'gcp', 'azure',
  'digitalocean', 'hetzner', 'ovh', 'linode', 'nordvpn', 'expressvpn',
  'mullvad', 'datacamp', 'surfshark', 'cyberghost', 'purevpn',
  'private internet access', 'tor exit', 'wireguard', 'ipredator',
]
const TOR_ASNS = [9009, 50472, 12876]

// Pure verdict logic so detection is testable without the network.
export function classifyConnection(org: string | undefined, isp: string | undefined, s: ConnectionSignals, extraText = ''): { isVpn: boolean; isProxy: boolean; isTor: boolean } {
  const searchText = ((org || '') + ' ' + (isp || '') + ' ' + extraText).toLowerCase()
  const isProxy = s.proxy
  let isVpn = s.vpn || s.hosting
  let isTor = s.tor
  // No flags — fall back to provider keywords in the ISP/org/ASN text.
  if (!s.proxy && !s.hosting && !s.vpn && !s.tor) {
    // Word-boundary matching: unanchored substrings flagged "Toronto",
    // "Motorola" and ordinary org names containing "cloud"/"hosting".
    const wordHit = (k: string) => new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(searchText)
    isVpn = VPN_KEYWORDS.some(wordHit)
    isTor = wordHit('tor') || wordHit('tor exit')
    if (!isTor) {
      const asnMatch = /AS(\d+)/i.exec(searchText)
      if (asnMatch) isTor = TOR_ASNS.includes(parseInt(asnMatch[1], 10))
    }
  }
  return { isVpn, isProxy, isTor }
}

let failureCount = 0
let pendingBackoff: ReturnType<typeof setTimeout> | null = null
// Startup + alarm can both fire checkPublicIp — two concurrent runs double
// the ip_change event and race the ipHistory read-modify-write.
let ipCheckInFlight = false

function cancelPendingIpCheck(): void {
  if (pendingBackoff !== null) {
    clearTimeout(pendingBackoff)
    pendingBackoff = null
  }
}

async function fetchIp(): Promise<string> {
  const services = [
    async () => { const r = await fetch('https://api.ipify.org?format=json', { signal: timeoutSignal(8000) }); const d = await r.json(); return d.ip },
    async () => { const r = await fetch('https://api.ip.sb/geoip', { signal: timeoutSignal(8000) }); const d = await r.json(); return d.ip },
    async () => { const r = await fetch('https://icanhazip.com', { signal: timeoutSignal(8000) }); return (await r.text()).trim() },
  ]
  for (const svc of services) {
    try { const ip = await svc(); if (ip) return ip } catch { }
  }
  return ''
}

// Free, keyless HTTPS geo providers, tried in order. Earlier failures are
// silent — a dead provider must never spam the service-worker console — and
// later providers fill only the fields earlier ones left empty.
interface GeoData {
  isp?: string
  org?: string
  country?: string
  countryCode?: string
  city?: string
  asn?: string
  proxy?: boolean
  hosting?: boolean
}

const GEO_SOURCES: Array<(ip: string) => Promise<GeoData>> = [
  // ipwho.is — richest free source (ISP, org, ASN, city, country name,
  // proxy/hosting flags). ~1.5k requests/day free.
  async ip => {
    const r = await fetch(`https://ipwho.is/${ip}?fields=success,country,city,isp,org,asn,proxy,hosting`, { signal: timeoutSignal(10000) })
    if (!r.ok) return {}
    const d = await r.json()
    if (!d || d.success === false) return {}
    return { isp: d.isp, org: d.org || d.isp, country: d.country, city: d.city, asn: d.asn != null ? String(d.asn) : undefined, proxy: d.proxy === true, hosting: d.hosting === true }
  },
  // ipapi.co — backup (~1k requests/day free, no key).
  async ip => {
    const r = await fetch(`https://ipapi.co/${ip}/json/`, { signal: timeoutSignal(10000) })
    if (!r.ok) return {}
    const d = await r.json()
    if (!d || d.error) return {}
    return { isp: d.isp || d.org, org: d.org, country: d.country_name, city: d.city, asn: d.asn ? String(d.asn).replace(/^AS/i, '') : undefined, proxy: d.proxy === true, hosting: d.hosting === true }
  },
  // api.ip.sb — backup (already used for the IP lookup itself).
  async ip => {
    const r = await fetch(`https://api.ip.sb/geoip/${ip}`, { signal: timeoutSignal(10000) })
    if (!r.ok) return {}
    const d = await r.json()
    if (!d) return {}
    return { isp: d.isp, org: d.organization || d.org, country: d.country, countryCode: d.country_code, city: d.city, asn: d.asn != null ? String(d.asn).replace(/^AS/i, '') : undefined }
  },
  // ipinfo.io — last resort (no ISP field, country is a 2-letter code,
  // ~50 requests/day without a token).
  async ip => {
    const r = await fetch(`https://ipinfo.io/${ip}/json`, { signal: timeoutSignal(10000) })
    if (!r.ok) return {}
    const d = await r.json()
    if (!d || d.bogon) return {}
    const m = /AS(\d+)/i.exec(d.org || '')
    return { org: d.org, countryCode: d.country, city: d.city, asn: m ? m[1] : undefined }
  },
]

async function fetchGeoData(ip: string): Promise<GeoData> {
  const merged: GeoData = {}
  for (const source of GEO_SOURCES) {
    try {
      const part = await source(ip)
      merged.isp = merged.isp || part.isp
      merged.org = merged.org || part.org
      merged.country = merged.country || part.country
      merged.countryCode = merged.countryCode || part.countryCode
      merged.city = merged.city || part.city
      merged.asn = merged.asn || part.asn
      merged.proxy = merged.proxy || part.proxy
      merged.hosting = merged.hosting || part.hosting
      if (merged.isp && merged.country && merged.city && merged.asn) break
    } catch { /* provider unreachable/blocked — try the next one */ }
  }
  // A 2-letter country code (ipinfo.io / ip.sb) beats "Unknown".
  if (!merged.country && merged.countryCode) merged.country = merged.countryCode
  return merged
}

export async function checkPublicIp(): Promise<void> {
  if (ipCheckInFlight) return
  ipCheckInFlight = true
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

    // Free geo APIs rate-limit hard (ipwho.is ~1.5k/day, ipapi.co 1k/day) and
    // the ipCheck alarm fires every 5 min — blindly re-fetching drained them
    // and left ISP/Location permanently "Unknown". Re-fetch only when the IP
    // changed, the stored data is missing, or the data is stale (>6h).
    const needGeo = !prev || prev.publicIp !== ip || !(prev.isp && (prev.country || prev.city)) || Date.now() - (prev.lastChecked || 0) > 6 * 60 * 60 * 1000

    let isp = prev?.isp
    let country = prev?.country
    let city = prev?.city
    let asnText = prev?.asn || ''
    let isVpn = prev?.isVpn || false
    let isProxy = prev?.isProxy || false
    let isTor = prev?.isTor || false

    if (needGeo) {
      const geo = await fetchGeoData(ip)
      isp = geo.isp
      country = geo.country
      city = geo.city
      asnText = geo.asn || ''
      const signals: ConnectionSignals = { vpn: false, proxy: !!geo.proxy, tor: false, hosting: !!geo.hosting }
      const verdict = classifyConnection(geo.org || geo.isp, geo.isp, signals, asnText)
      isVpn = verdict.isVpn
      isProxy = verdict.isProxy
      isTor = verdict.isTor
      if (!isp && !country) dbg('geo lookup returned nothing for', ip)
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

    // Record transitions only — appending every check filled the history
    // with same-IP rows (the ipCheck alarm runs every 5 minutes), so the
    // popup showed the same address twice and real changes fell out of
    // the 10-entry cap.
    const recentIps = (prev?.ipHistory || []).filter(h => Date.now() - h.timestamp < 86400000 * 30)
    const lastEntry = recentIps[recentIps.length - 1]
    if (!lastEntry || lastEntry.ip !== ip) recentIps.push({ ip, timestamp: Date.now() })
    if (recentIps.length > 10) recentIps.shift()

    const network: NetworkInfo = {
      publicIp: ip,
      isp,
      country,
      city,
      asn: asnText || undefined,
      isVpn,
      isProxy,
      isTor,
      lastChecked: Date.now(),
      ipHistory: recentIps,
    }

    await updateSecurityState({ network })
    await recalculateCategoryScore('network')
  } catch (e) {
    dbg('IP check failed:', e)
  } finally {
    ipCheckInFlight = false
  }
}

export function startNetworkMonitor(): void {
  checkPublicIp().catch(() => {})
}
