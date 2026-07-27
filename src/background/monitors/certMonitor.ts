import { RiskEvent, CertAnomaly } from '../../types'
import { addCategoryEvent, getSecurityState, updateSecurityState } from '../storage'
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
const CERT_COOLDOWN_MS = 300000

export async function checkCert(domain: string): Promise<void> {
  const lastCheck = certCooldowns.get(domain)
  if (lastCheck && Date.now() - lastCheck < CERT_COOLDOWN_MS) return

  certCooldowns.set(domain, Date.now())
  if (certCooldowns.size > 100) {
    const oldest = [...certCooldowns.entries()].sort((a, b) => a[1] - b[1])[0]
    if (oldest) certCooldowns.delete(oldest[0])
  }

  try {
    const resp = await fetch(`https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`, {
      signal: AbortSignal.timeout(15000),
    })
    if (!resp.ok) return

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

    const state = await getSecurityState()
    const anomalies = [anomaly, ...(state.certAnomalies || [])].slice(0, 50)
    await updateSecurityState({ certAnomalies: anomalies })

    if (daysAgo <= 7 && HIGH_VALUE_DOMAINS.some(d => domain === d || domain.endsWith('.' + d))) {
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
      await addCategoryEvent('network', event)
      await recalculateCategoryScore('network')
    }
  } catch (e) {
    console.error('Cert check failed:', e instanceof Error ? `${e.name}: ${e.message}` : String(e))
  }
}

export function certTabUpdatedHandler(_tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab): void {
  if (changeInfo.url && tab.url) {
    try {
      const domain = new URL(tab.url).hostname
      checkCert(domain)
    } catch {}
  }
}

