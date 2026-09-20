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

    let isp: string | undefined
    let country: string | undefined
    let city: string | undefined
    let org: string | undefined
    let asnText = ''
    let isVpn = false
    let isProxy = false
    let isTor = false
    const signals: ConnectionSignals = { vpn: false, proxy: false, tor: false, hosting: false }

    // VPN/proxy/TOR detection - using ipwho.is (HTTPS) as primary source.
    // ipwho.is provides proxy, hosting, and ASN information.
    // IP 171.61.27.161 appears to be a CDN/IP with limited geolocation data.
    try {
      const whoResp = await fetch(`https://ipwho.is/${ip}?fields=status,country,city,isp,org,asn,proxy,hosting`, { signal: timeoutSignal(15000) })
      if (whoResp.ok) {
        const geo = await whoResp.json()
        if (geo.success) {
          org = geo.org || geo.isp
          isp = geo.isp
          asnText = `${geo.asn || ''}`
          signals.proxy = geo.proxy === true
          signals.hosting = geo.hosting === true
          country = country ?? geo.country
          city = city ?? geo.city
        } else {
          dbg('ipwho.is returned unsuccessful for', ip, geo)
        }
      } else {
        dbg('ipwho.is request failed for', ip, whoResp.status)
      }
    } catch (e) {
      dbg('ipwho.is error for', ip, e)
    }

    // Fallback to ipapi.co if ISP/org still missing
    if (!org || !isp) {
      try {
        const geoResp = await fetch(`https://ipapi.co/${ip}/json/`, { signal: timeoutSignal(15000) })
        if (geoResp.ok) {
          const geo = await geoResp.json()
          org = org || geo.org || geo.isp
          isp = isp || geo.org || geo.isp
          signals.proxy = geo.proxy === true
          country = country ?? geo.country_name
          city = city ?? geo.city
          dbg('ipapi.co fallback for', ip, { org: geo.org, isp: geo.isp, country: geo.country_name, city: geo.city })
        }
      } catch (e) {
        dbg('ipapi.co error for', ip, e)
      }
    }

    const verdict = classifyConnection(org, isp, signals, asnText)
    isVpn = verdict.isVpn
    isProxy = verdict.isProxy
    isTor = verdict.isTor

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
    console.error('IP check failed:', e)
  } finally {
    ipCheckInFlight = false
  }
}

export function startNetworkMonitor(): void {
  checkPublicIp().catch(() => {})
}
