import { timeoutSignal } from '../../utils/timeoutSignal'
import { RiskEvent, PhishingResult } from '../../types'
import { addCategoryEvent, getSecurityState, getSettings, hasRecentCategoryEvent, updateSecurityState } from '../storage'
import { recalculateCategoryScore } from '../engine'

let cachedDomains: { domains: string[]; fetchedAt: number } = { domains: [], fetchedAt: 0 }

async function fetchOpenPhishFeed(): Promise<string[]> {
  const now = Date.now()
  if (cachedDomains.domains.length > 0 && now - cachedDomains.fetchedAt < 300000) {
    return cachedDomains.domains
  }
  try {
    const resp = await fetch('https://openphish.com/feed.txt', { headers: { 'User-Agent': 'Session-Guardian/1.0' }, signal: timeoutSignal(10000) })
    if (!resp.ok) return []
    const text = await resp.text()
    const urls = text.split('\n').filter(Boolean).map(line => line.trim())
    const domains = [...new Set(urls.map(u => { try { return new URL(u).hostname } catch { return '' } }).filter(Boolean))]
    cachedDomains = { domains, fetchedAt: now }
    return domains
  } catch {
    return cachedDomains.domains
  }
}

let phishTankLastCall = 0

// Serialize result-list writes — concurrent checks for different tabs read
// the same list and dropped each other's entries.
let phishQueue: Promise<unknown> = Promise.resolve()

async function checkPhishTank(url: string): Promise<{ isPhishing: boolean; confidence: number }> {
  // Backpressure instead of drop: when the 2s window is active, wait for it
  // rather than silently skipping the check the caller asked for.
  const wait = Math.max(0, phishTankLastCall + 2000 - Date.now())
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  phishTankLastCall = Date.now()
  try {
    const resp = await fetch('https://checkurl.phishtank.com/checkurl/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `url=${encodeURIComponent(url)}&format=json`,
      signal: timeoutSignal(10000),
    })
    if (!resp.ok) return { isPhishing: false, confidence: 0 }
    const data = await resp.json()
    return { isPhishing: data.in_phish_tank === true, confidence: data.phish_detail_page ? 90 : 70 }
  } catch {
    return { isPhishing: false, confidence: 0 }
  }
}

function domainVariants(domain: string): string[] {
  const variants = [domain]
  // IDN lookalikes (éxample.com, кириллица) are stored punycode-encoded in
  // the feed — compare both forms so a homograph isn't missed.
  try {
    const ascii = (globalThis as any).URL?.domainToASCII?.(domain)
    if (ascii && ascii !== domain) variants.push(ascii)
    const utf8 = (globalThis as any).URL?.domainToUnicode?.(domain)
    if (utf8 && utf8 !== domain) variants.push(utf8)
  } catch {}
  return variants
}

async function checkPhishing(url: string): Promise<void> {
  try {
    let domain = ''
    let safeUrl = url
    try {
      const u = new URL(url)
      domain = u.hostname
      safeUrl = u.origin
    } catch { return }

    const phishingDomains = await fetchOpenPhishFeed()
    const variants = domainVariants(domain)
    const inOpenPhish = phishingDomains.some(d => variants.some(v => d === v || v.endsWith('.' + d)))

    let isPhishing = inOpenPhish
    let confidence = inOpenPhish ? 70 : 0
    let source = inOpenPhish ? 'openphish' : ''

    if (!inOpenPhish) {
      const tank = await checkPhishTank(safeUrl)
      if (tank.isPhishing) {
        isPhishing = true
        confidence = tank.confidence
        source = 'phishtank'
      }
    }

    const result: PhishingResult = {
      url: safeUrl,
      domain,
      isPhishing,
      confidence,
      source,
      checkedAt: Date.now(),
    }

    phishQueue = phishQueue.then(async () => {
      const existing = (await getSecurityState()).phishingResults || []
      // Dedupe per domain — tab updates re-fire checkPhishing for the same
      // page; a fresh entry per navigation flooded the list and PhishTank.
      const withoutDomain = existing.filter(r => r.domain !== domain)
      const results = [result, ...withoutDomain].slice(0, 50)
      await updateSecurityState({ phishingResults: results })

      if (isPhishing) {
        // Same-domain re-visits must not re-alert on every navigation.
        const dup = await hasRecentCategoryEvent('privacy', e => e.type === 'phishing_detected' && e.source === domain, 6 * 3600000)
        if (dup) return
        const event: RiskEvent = {
          id: crypto.randomUUID(),
          type: 'phishing_detected',
          category: 'privacy',
          severity: 'high',
          title: `Phishing site detected: ${domain}`,
          description: `${domain} flagged as phishing by ${source} (${confidence}% confidence)`,
          source: domain,
          timestamp: Date.now(),
          acknowledged: false,
        }
        await addCategoryEvent('privacy', event)
        await recalculateCategoryScore('privacy')
      }
    }).catch(() => {})
    await phishQueue
  } catch (e) {
    console.error('Phishing check failed:', e)
  }
}

// Rolling budget: at most 50 tab-triggered checks per 5 minutes. The old
// counter froze checks entirely once 50 were spent — a long session then
// went unmonitored until the single reset timer fired.
let phishCheckTimes: number[] = []

function phishBudgetAvailable(): boolean {
  const now = Date.now()
  phishCheckTimes = phishCheckTimes.filter(t => now - t < 300000)
  if (phishCheckTimes.length >= 50) return false
  phishCheckTimes.push(now)
  return true
}

export function phishingTabUpdatedHandler(_tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab): void {
  if (!changeInfo.url || !tab.url || tab.status !== 'complete') return
  const url = tab.url
  getSettings().then(s => {
    if (!s.monitorPhishing || !phishBudgetAvailable()) return
    checkPhishing(url)
  }).catch(() => {})
}

export function startPhishingMonitor(): void {
  // Budget is time-windowed; nothing to start.
}
