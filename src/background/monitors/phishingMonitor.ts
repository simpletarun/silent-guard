import { RiskEvent, PhishingResult } from '../../types'
import { addCategoryEvent, getSecurityState, updateSecurityState } from '../storage'
import { recalculateCategoryScore } from '../engine'

let cachedDomains: { domains: string[]; fetchedAt: number } = { domains: [], fetchedAt: 0 }

async function fetchOpenPhishFeed(): Promise<string[]> {
  const now = Date.now()
  if (cachedDomains.domains.length > 0 && now - cachedDomains.fetchedAt < 300000) {
    return cachedDomains.domains
  }
  try {
    const resp = await fetch('https://openphish.com/feed.txt', { headers: { 'User-Agent': 'Session-Guardian/1.0' }, signal: AbortSignal.timeout(10000) })
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

async function checkPhishTank(url: string): Promise<{ isPhishing: boolean; confidence: number }> {
  const now = Date.now()
  if (now - phishTankLastCall < 2000) return { isPhishing: false, confidence: 0 }
  phishTankLastCall = now
  try {
    const resp = await fetch('https://checkurl.phishtank.com/checkurl/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `url=${encodeURIComponent(url)}&format=json`,
      signal: AbortSignal.timeout(10000),
    })
    if (!resp.ok) return { isPhishing: false, confidence: 0 }
    const data = await resp.json()
    return { isPhishing: data.in_phish_tank === true, confidence: data.phish_detail_page ? 90 : 0 }
  } catch {
    return { isPhishing: false, confidence: 0 }
  }
}

export async function checkPhishing(url: string): Promise<void> {
  try {
    let domain = ''
    try { domain = new URL(url).hostname } catch { return }

    const phishingDomains = await fetchOpenPhishFeed()
    const inOpenPhish = phishingDomains.some(d => domain === d || domain.endsWith('.' + d))

    let isPhishing = inOpenPhish
    let confidence = inOpenPhish ? 70 : 0
    let source = inOpenPhish ? 'openphish' : ''

    if (!inOpenPhish) {
      const tank = await checkPhishTank(url)
      if (tank.isPhishing) {
        isPhishing = true
        confidence = tank.confidence
        source = 'phishtank'
      }
    }

    const result: PhishingResult = {
      url,
      domain,
      isPhishing,
      confidence,
      source,
      checkedAt: Date.now(),
    }

    const existing = (await getSecurityState()).phishingResults || []
    const results = [result, ...existing].slice(0, 50)
    await updateSecurityState({ phishingResults: results })

    if (isPhishing) {
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
  } catch (e) {
    console.error('Phishing check failed:', e)
  }
}

let phishTabCheckCount = 0

export function phishingTabUpdatedHandler(_tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab): void {
  if (changeInfo.url && tab.url && tab.status === 'complete') {
    phishTabCheckCount++
    if (phishTabCheckCount > 50) return
    checkPhishing(tab.url)
  }
}

export function startPhishingMonitor(): void {
  setTimeout(() => { phishTabCheckCount = 0 }, 300000)
}
