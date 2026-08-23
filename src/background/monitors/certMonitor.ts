import { timeoutSignal } from '../../utils/timeoutSignal'
import { RiskEvent, CertAnomaly } from '../../types'
import { addCategoryEvent, getSettings, mutateSecurityState, hasRecentCategoryEvent } from '../storage'
import { recalculateCategoryScore } from '../engine'

const HIGH_VALUE_DOMAINS = [
  'gmail.com', 'outlook.com', 'bankofamerica.com', 'chase.com', 'wellsfargo.com',
  'paypal.com', 'github.com', 'aws.amazon.com', 'apple.com', 'icloud.com',
  'facebook.com', 'twitter.com', 'linkedin.com', 'reddit.com', 'dropbox.com',
  'protonmail.com', 'capitalone.com', 'coinbase.com', 'cloudflare.com',
]

interface CrtshEntry {
  id: number
  issuer_name: string
  not_before: string
  not_after: string
  common_name?: string
  name_value?: string
}

const certCooldowns = new Map<string, number>()

export function resetAuditCaches(): void {
  certCooldowns.clear()
}
const CERT_COOLDOWN_MS = 300000
// Serialize result-list writes — concurrent checks for different domains
// read the same list and dropped each other's entries.

function isTimeoutError(e: unknown): boolean {
  return e instanceof DOMException
    ? e.name === 'TimeoutError'
    : /timed? ?out/i.test(String(e))
}

async function fetchCrtSh(domain: string): Promise<Response | null> {
  const url = `https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fetch(url, { signal: timeoutSignal(15000) })
    } catch (e) {
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, (attempt + 1) * 2000))
        continue
      }
      if (!isTimeoutError(e)) console.error('crt.sh fetch failed:', e)
      return null
    }
  }
  return null
}

export async function checkCert(domain: string): Promise<void> {
  const lastCheck = certCooldowns.get(domain)
  if (lastCheck && Date.now() - lastCheck < CERT_COOLDOWN_MS) return

  certCooldowns.set(domain, Date.now())
  if (certCooldowns.size > 100) {
    const oldest = [...certCooldowns.entries()].sort((a, b) => a[1] - b[1])[0]
    if (oldest) certCooldowns.delete(oldest[0])
  }

  try {
    const resp = await fetchCrtSh(domain)
    if (!resp || !resp.ok) return

    const raw = await resp.json()
    const entries: CrtshEntry[] = Array.isArray(raw) ? raw : []
    if (entries.length === 0) return

    const now = Date.now()
    const sorted = entries.sort((a, b) => new Date(b.not_before).getTime() - new Date(a.not_before).getTime())
    const latest = sorted[0]
    const issuedDate = new Date(latest.not_before).getTime()
    const daysAgo = (now - issuedDate) / 86400000

    const anomaly: CertAnomaly = {
      domain,
      issuedDaysAgo: Math.round(daysAgo),
      issuer: latest.issuer_name || 'unknown',
      severity: daysAgo <= 7 ? 'high' : 'low',
    }

    // Atomic append inside the storage write queue — the crt.sh fetch window
    // is long, and a whole-array replace computed before a CLEAR_ALL_DATA
    // would otherwise resurrect wiped entries when it finally lands.
    await mutateSecurityState(s => {
      s.certAnomalies = [anomaly, ...(s.certAnomalies || [])].slice(0, 50)
    })

    // Only alert when the domain has never had a cert before (new issuance),
    // not for routine renewals of long-standing certificates.
    const hasPriorCert = entries.some(e => {
      const t = new Date(e.not_before).getTime()
      return isFinite(t) && t < now - 30 * 86400000
    })
    if (daysAgo <= 7 && !hasPriorCert && HIGH_VALUE_DOMAINS.some(d => domain === d || domain.endsWith('.' + d))) {
      const event: RiskEvent = {
        id: crypto.randomUUID(),
        type: 'cert_anomaly',
        category: 'network',
        severity: 'high',
        title: `Recently issued certificate for ${domain}`,
        description: `Cert issued ${Math.round(daysAgo)} day(s) ago by ${latest.issuer_name || 'unknown'}`,
        source: domain,
        timestamp: Date.now(),
        acknowledged: false,
      }
      const exists = await hasRecentCategoryEvent('network', e => e.type === 'cert_anomaly' && e.source === domain, 12 * 3600000)
      if (!exists) {
        await addCategoryEvent('network', event)
        await recalculateCategoryScore('network')
      }
    }
  } catch (e) {
    if (!isTimeoutError(e)) console.error('Cert check failed:', e instanceof Error ? `${e.name}: ${e.message}` : String(e))
  }
}

export function certTabUpdatedHandler(_tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab): void {
  if (changeInfo.url && tab.url) {
    const url = tab.url
    getSettings().then(s => {
      if (!s.monitorCertificates) return
      try {
        const domain = new URL(url).hostname
        checkCert(domain)
      } catch {}
    }).catch(() => {})
  }
}

