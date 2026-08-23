import { PolicyReport, PolicyLink, RiskEvent } from '../../types'
import { addCategoryEvent, getSecurityState, updateSecurityState, getSettings } from '../storage'
import { notifyRiskEvent } from '../notifications'
import { recalculateCategoryScore } from '../engine'
import { analyzePolicy, simpleHash } from '../../policy/analyzer'

const POLICY_COOLDOWN_MS = 300000
const MIN_POLICY_WORDS = 500
// Short-but-real policies (summary notices, small sites) pass when the text
// is dense with policy vocabulary — 4+ distinct signals lowers the floor.
const ADAPTIVE_MIN_POLICY_WORDS = 250
// DOM-scraped text is real rendered content (no markup, no nav shell), so it
// needs a lower floor than fetched HTML — used only on the source === 'dom'
// path; fetched pages keep MIN_POLICY_WORDS.
const DOM_MIN_POLICY_WORDS = 150
const MAX_POLICY_LINK_FETCHES = 3
// All policy fetching happens in the page context (content-script probing or
// the hidden-tab scrape): a service-worker fetch is CORS-blocked by sites
// that send no Access-Control-Allow-Origin, and probes a 30-path storm of
// CORS errors. Cross-site links can't be fetched in-page — scrape instead.
const PROBE_URL_TIMEOUT_MS = 8000
const PROBE_DOMAIN_TIMEOUT_MS = 20000
const JUNK_SIGNALS = [
  'just a moment', 'checking your browser', 'enable javascript',
  'enable js to continue', 'access denied', 'you have been blocked',
  'verify you are human', 'captcha', 'cf-chl', 'cloudflare ray id',
]
// A page is only analyzable as a policy if it actually talks about data
// practices — rejecting ToS/legal/FAQ pages without privacy vocabulary.
const POLICY_SIGNALS = [
  'privacy', 'personal information', 'personal data', 'data protection', 'gdpr',
  'ccpa', 'california consumer', 'cookie', 'opt out', 'opt-out', 'retain',
  'third-party', 'third party', 'consent', 'data subject', 'disclos', 'collect',
  // Non-English policies must clear the same bar as English ones.
  'datenschutz', 'personenbezogene daten', 'privacidad', 'datos personales',
  'confidentialit\u00e9', 'donn\u00e9es personnelles', 'privacyverklaring',
  'integritetspolicy', 'personuppgifter',
  '\u043a\u043e\u043d\u0444\u0438\u0434\u0435\u043d\u0446\u0438\u0430\u043b\u044c\u043d', '\u043f\u0435\u0440\u0441\u043e\u043d\u0430\u043b\u044c\u043d\u044b\u0445 \u0434\u0430\u043d\u043d\u044b\u0445',
  '\u500b\u4eba\u60c5\u5831', '\u9690\u79c1\u653f\u7b56', '\u4e2a\u4eba\u4fe1\u606f', '\uac1c\uc778\uc815\ubcf4',
]

// A bot-protection wall announces itself in the head of the document; real
// policies legitimately mention "captcha" or Cloudflare deep in the body.
const JUNK_HEAD_CHARS = 800

export function isLikelyPolicyText(text: string, minWords: number = MIN_POLICY_WORDS): boolean {
  const plain = text.replace(/<[^>]+>/g, ' ')
  const lower = plain.toLowerCase()
  if (JUNK_SIGNALS.some(s => lower.slice(0, JUNK_HEAD_CHARS).includes(s))) return false
  const words = plain.split(/\s+/).filter(w => w.length > 0).length
  const signals = POLICY_SIGNALS.filter(s => lower.includes(s))
  if (signals.length < 2) return false
  const floor = signals.length >= 4 ? Math.min(minWords, ADAPTIVE_MIN_POLICY_WORDS) : minWords
  return words >= floor
}

const domainCooldowns = new Map<string, number>()

// Every analysis attempt (link fetch, scrape, root-page scrape) is recorded
// here for ATTEMPT_TTL_MS — second-hop link cascades from scraped pages can
// then never ping-pong between two pages that link each other.
const ATTEMPT_TTL_MS = 600000
const recentAttempts = new Map<string, number>()

function attemptKey(url: string): string {
  return url.toLowerCase()
}

function wasAttemptedRecently(url: string): boolean {
  const t = recentAttempts.get(attemptKey(url))
  return typeof t === 'number' && Date.now() - t < ATTEMPT_TTL_MS
}

function markAttempted(url: string): void {
  const now = Date.now()
  recentAttempts.set(attemptKey(url), now)
  if (recentAttempts.size > 100) {
    for (const [k, t] of recentAttempts) {
      if (now - t > ATTEMPT_TTL_MS) recentAttempts.delete(k)
    }
    if (recentAttempts.size > 100) {
      const oldest = [...recentAttempts.entries()].sort((a, b) => a[1] - b[1])[0]
      if (oldest) recentAttempts.delete(oldest[0])
    }
  }
}

// Explicit user action ("Analyze again" button) must not be swallowed by the
// cooldown or the attempt-TTL — clear both for this domain.
export function clearAnalysisHistory(domain: string): void {
  domainCooldowns.delete(domain)
  for (const key of [...recentAttempts.keys()]) {
    if (key.includes('://' + domain + '/') || key.includes('.' + domain + '/') || key.includes('://' + domain)) {
      recentAttempts.delete(key)
    }
  }
}

export function resetAuditCaches(): void {
  // Only cooldowns — pendingProbes/pendingScrapes hold in-flight callbacks.
  domainCooldowns.clear()
}

export function getPolicyDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return undefined
  }
}

function shouldAnalyzeDomain(domain: string): boolean {
  const now = Date.now()
  const last = domainCooldowns.get(domain)
  if (last && now - last < POLICY_COOLDOWN_MS) return false
  domainCooldowns.set(domain, now)
  if (domainCooldowns.size > 200) {
    const oldest = [...domainCooldowns.entries()].sort((a, b) => a[1] - b[1])[0]
    if (oldest) domainCooldowns.delete(oldest[0])
  }
  return true
}

const POLICY_LINK_TYPE_RANK: Record<PolicyLink['type'], number> = { privacy: 0, terms: 1, cookies: 2 }

// Tabs opened by the hidden-tab scrape fallback — POLICY_TEXT messages
// arriving from them bypass the domain cooldown (the cooldown was already
// paid by the fetch attempt that triggered the scrape).
const pendingScrapeTabs = new Set<number>()

// Which site domain each scrape tab was opened for — the scrape tab's own
// host is the POLICY host (docs.github.com), but the report must land under
// the SITE (github.com) so the matrix can find it.
const scrapeSiteDomains = new Map<number, string>()

export function isScrapeTab(tabId: number | undefined): boolean {
  return typeof tabId === 'number' && pendingScrapeTabs.has(tabId)
}

export function getScrapeSiteDomain(tabId: number | undefined): string | undefined {
  return typeof tabId === 'number' ? scrapeSiteDomains.get(tabId) : undefined
}

export async function handlePolicyLinks(domain: string, links: PolicyLink[], fromScrapeTab = false): Promise<void> {
  try {
    const settings = await getSettings()
    if (!settings.monitorPolicy) return

    // Found links are higher-signal than URL probing (SPA footers can land
    // AFTER the popup's 2.5s fallback already claimed the cooldown) — so
    // when links exist, they win: bypass the cooldown and refresh it so the
    // probing loop can't race a second analysis in.
    if (!(links || []).length) {
      if (!shouldAnalyzeDomain(domain)) return
    } else {
      shouldAnalyzeDomain(domain)
    }
    // Let listeners know an analysis cycle started (popup refreshes probes).
    chrome.runtime.sendMessage({ type: 'STATE_UPDATED' }).catch(() => {})

    // Prefer the site's own links. But many companies host their policy on a
    // corporate domain — chatgpt.com links to openai.com/policies/privacy-policy,
    // google sites to policies.google.com. A strict same-site filter threw
    // those away, so those sites reported "no policy" forever. Cross-site
    // links are trusted only when the link TEXT itself says it is a privacy
    // policy (classifyLink already demands privacy vocabulary in text or
    // path), and the fetched page must still pass isLikelyPolicyText.
    const bySite = (links || []).filter(l => sameSite(l.url, domain))
    const crossSitePrivacy = (links || []).filter(l => !sameSite(l.url, domain) && l.type === 'privacy')
    let ordered = [
      ...bySite.sort((a, b) => POLICY_LINK_TYPE_RANK[a.type] - POLICY_LINK_TYPE_RANK[b.type]),
      ...crossSitePrivacy,
    ].slice(0, MAX_POLICY_LINK_FETCHES)
    // Second-hop guard: links harvested FROM a scraped page may point back at
    // URLs we already tried (A↔B ping-pong). Each URL gets one attempt per TTL.
    if (fromScrapeTab) ordered = ordered.filter(l => !wasAttemptedRecently(l.url))

    if (ordered.length > 0) {
      for (const link of ordered) {
        if (await analyzePolicyUrl(domain, link.url)) break
      }
    } else if (!fromScrapeTab) {
      const probed = await tryCommonUrls(domain)
      // Last resort when probing found nothing (page without a content
      // script, SPA shell): render the site ROOT in a hidden tab and harvest
      // its real footer links there. Guarded by the same attempt-TTL.
      if (!probed && !wasAttemptedRecently(`https://${domain}/`)) {
        markAttempted(`https://${domain}/`)
        await scrapePolicyTab(domain, `https://${domain}/`)
      }
    } else {
      await tryCommonUrls(domain)
    }
  } catch (e) {
    console.error('handlePolicyLinks failed:', e)
  }
}

function sameSite(url: string, domain: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase()
    const d = domain.toLowerCase()
    return host === d || host.endsWith('.' + d)
  } catch {
    return false
  }
}

// Page-context probe results (POLICY_TEXT with source 'probe') resolve these
// pending waits — analyzePolicyUrl / tryCommonUrls block until the content
// script reports back or the timeout fires.
const pendingProbes = new Map<string, (result: boolean) => void>()

export function notifyProbeComplete(url: string): void {
  const finish = pendingProbes.get(url)
  if (finish) {
    pendingProbes.delete(url)
    finish(true)
  }
  const domain = getPolicyDomain(url)
  if (domain) {
    const domainFinish = pendingProbes.get('domain:' + domain)
    if (domainFinish) {
      pendingProbes.delete('domain:' + domain)
      domainFinish(true)
    }
  }
}

function waitForProbe(key: string, timeoutMs: number): Promise<boolean> {
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      if (pendingProbes.delete(key)) resolve(false)
    }, timeoutMs)
    pendingProbes.set(key, result => {
      clearTimeout(timer)
      resolve(result)
    })
  })
}

async function askActiveTabToFetch(url: string): Promise<boolean> {
  try {
    // The content script may have already probed this URL (its own probe run
    // dedupes re-sends) — don't wait out a timeout for a report that exists.
    const domain = getPolicyDomain(url)
    if (domain && (await getPolicyReport(domain))) return true
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    const tab = tabs[0]
    if (typeof tab?.id !== 'number' || !tab.url) return false
    // The content script can only fetch same-origin URLs — verify the active
    // tab is actually on the target origin before asking.
    if (new URL(tab.url).origin !== new URL(url).origin) return false
    await chrome.tabs.sendMessage(tab.id, { type: 'PROBE_POLICY_URL', url })
    return waitForProbe(url, PROBE_URL_TIMEOUT_MS)
  } catch {
    return false
  }
}

// Fallback for policy pages that only render in a browser (JS frameworks
// serve fetch() an empty shell): open the page in a hidden tab, ask the
// content script to scrape the rendered text (POLICY_TEXT message), close
// the tab. Bounded: one at a time, watchdog 12s, only reached when the
// fetch above found nothing, only for explicitly found links — never for
// the 30-path probing loop.
const SCRAPE_WATCHDOG_MS = 12000
let scrapePromise: Promise<boolean> | null = null
const pendingScrapes = new Map<number, (result: boolean) => void>()

// The scrape tab's rendered text just arrived (POLICY_TEXT) — resolve the
// scrape promise so handlePolicyLinks stops (no cascade into more 12s tabs)
// and the tab is closed immediately instead of waiting out the watchdog.
export function notifyScrapeComplete(tabId: number | undefined): void {
  if (typeof tabId !== 'number') return
  const finish = pendingScrapes.get(tabId)
  if (finish) finish(true)
}

function scrapePolicyTab(domain: string, url: string): Promise<boolean> {
  if (scrapePromise) return scrapePromise
  scrapePromise = new Promise<boolean>(resolve => {
    let tabId: number | undefined
    let done = false
    const finish = (result: boolean) => {
      if (done) return
      done = true
      clearTimeout(watchdog)
      chrome.tabs.onUpdated.removeListener(onUpdated)
      chrome.tabs.onRemoved.removeListener(onRemoved)
      if (typeof tabId === 'number') {
        pendingScrapeTabs.delete(tabId)
        pendingScrapes.delete(tabId)
        scrapeSiteDomains.delete(tabId)
        chrome.tabs.remove(tabId).catch(() => {})
        tabId = undefined
      }
      setTimeout(() => { scrapePromise = null }, 1000)
      resolve(result)
    }
    const onUpdated = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && info.status === 'complete' && typeof tabId === 'number') {
        // Trigger the scrape; POLICY_TEXT arrives via the message router.
        chrome.tabs.sendMessage(tabId, { type: 'FIND_POLICY_LINKS', scrapeOnly: true }).catch(() => finish(false))
      }
    }
    const onRemoved = (id: number) => { if (id === tabId) finish(false) }
    const watchdog = setTimeout(() => finish(false), SCRAPE_WATCHDOG_MS)
    chrome.tabs.onUpdated.addListener(onUpdated)
    chrome.tabs.onRemoved.addListener(onRemoved)
    chrome.tabs.create({ url, active: false }).then(tab => {
      const id = tab.id
      if (typeof id !== 'number') { finish(false); return }
      tabId = id
      pendingScrapeTabs.add(id)
      pendingScrapes.set(id, finish)
      scrapeSiteDomains.set(id, domain)
      // The tab may have loaded before the listener attached — check status.
      chrome.tabs.get(id).then(t => {
        if (t.status === 'complete') {
          chrome.tabs.sendMessage(id, { type: 'FIND_POLICY_LINKS', scrapeOnly: true }).catch(() => finish(false))
        }
      }).catch(() => finish(false))
    }).catch(() => finish(false))
  })
  return scrapePromise
}

export async function analyzePolicyUrl(domain: string, policyUrl: string): Promise<boolean> {
  try {
    markAttempted(policyUrl)
    // Same-site policies fetch cleanly from the page's own context (a
    // service-worker fetch is CORS-blocked by most sites). Cross-site links
    // (chatgpt.com → openai.com) can't be fetched in-page — the hidden-tab
    // scrape covers those, rendering like a real browser (no CORS at all).
    if (sameSite(policyUrl, domain)) {
      if (await askActiveTabToFetch(policyUrl)) return true
    }
    return await scrapePolicyTab(domain, policyUrl)
  } catch (e) {
    console.error('analyzePolicyUrl failed:', e)
    return false
  }
}

// Raw innerText scraped from a rendered page the user is viewing — real
// content, so it gets the lower DOM word floor (junk-wall heuristics apply
// to both paths). The report keeps the real page URL so "Open Policy" works.
// skipCooldown: scrape-tab results — the fetch attempt that spawned the tab
// already paid the domain cooldown.
export async function handlePolicyText(domain: string, url: string, text: string, skipCooldown = false): Promise<boolean> {
  try {
    const settings = await getSettings()
    if (!settings.monitorPolicy) return false
    if (!skipCooldown && !shouldAnalyzeDomain(domain)) return false
    if (!isLikelyPolicyText(text, DOM_MIN_POLICY_WORDS)) return false

    const contentHash = simpleHash(text)
    const state = await getSecurityState()
    const existingReport = (state.policyReports || []).find(r => r.domain === domain && r.policyHash === contentHash)
    if (existingReport) return false

    return await performAnalysis(domain, text, url, contentHash, DOM_MIN_POLICY_WORDS)
  } catch (e) {
    console.error('handlePolicyText failed:', e)
    return false
  }
}

export async function tryCommonUrls(domain: string): Promise<boolean> {
  try {
    if (await getPolicyReport(domain)) return true
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    const tab = tabs[0]
    if (typeof tab?.id !== 'number' || !tab.url) return false
    // Probing happens in the page context (same-origin fetches — the only
    // CORS-free path), so the active tab must BE on the target domain.
    if (getPolicyDomain(tab.url) !== domain) return false
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'PROBE_POLICY' })
    } catch {
      return false
    }
    return waitForProbe('domain:' + domain, PROBE_DOMAIN_TIMEOUT_MS)
  } catch (e) {
    console.error('tryCommonUrls failed:', e)
    return false
  }
}

// Serialize analysis writes: POPUP_OPENED + a tab update can both trigger
// analyses for different domains — concurrent reports read-modify-write
// used to drop one domain's report.
let analysisQueue: Promise<unknown> = Promise.resolve()

async function performAnalysis(domain: string, text: string, policyUrl: string, contentHash?: string, minWords: number = MIN_POLICY_WORDS): Promise<boolean> {
  analysisQueue = analysisQueue.then(() => doPerformAnalysis(domain, text, policyUrl, contentHash, minWords)).catch(() => false)
  return analysisQueue as Promise<boolean>
}

async function doPerformAnalysis(domain: string, text: string, policyUrl: string, contentHash?: string, minWords: number = MIN_POLICY_WORDS): Promise<boolean> {
  try {
    if (!isLikelyPolicyText(text, minWords)) return false
    const report = analyzePolicy(domain, text, policyUrl)
    // Ensure hash is set (in case not passed)
    report.policyHash = contentHash || report.policyHash

    const state = await getSecurityState()
    let reports = [...(state.policyReports || [])]
    const existingIdx = reports.findIndex(r => r.domain === domain)
    const previous = existingIdx >= 0 ? reports[existingIdx] : undefined
    if (existingIdx >= 0) {
      reports[existingIdx] = report
    } else {
      reports.unshift(report)
    }
    if (reports.length > 20) reports = reports.slice(0, 20)

    await updateSecurityState({
      policyReports: reports,
      lastPolicyHash: report.policyHash,
    })

    // An identical re-analysis (same domain, same risk level) is not a new
    // signal — tab-hopping back to the page re-ran this and spammed events.
    const riskChanged = !previous || previous.riskLevel !== report.riskLevel

    if (riskChanged) {
      const event: RiskEvent = {
        id: crypto.randomUUID(),
        type: 'policy_risk',
        category: 'policy',
        severity: report.riskLevel === 'dangerous' ? 'high' : report.riskLevel === 'risky' ? 'medium' : 'low',
        title: `Policy analysis: ${report.riskLevel} (${report.privacyScore}/100)`,
        description: `Privacy score for ${domain}: ${report.privacyScore}/100 — ${report.matchedRules.filter(r => r.riskDelta > 0).length} risk factor(s) found`,
        source: domain,
        timestamp: Date.now(),
        acknowledged: false,
      }
      await addCategoryEvent('policy', event)

      if (report.riskLevel === 'dangerous' || report.riskLevel === 'risky') {
        await notifyRiskEvent(event)
      }
    }

    await recalculateCategoryScore('policy')

    // Notify popup and other listeners that state has been updated
    await chrome.runtime.sendMessage({ type: 'STATE_UPDATED' }).catch(() => {})
    return true
  } catch (e) {
    console.error('performAnalysis failed:', e)
    return false
  }
}

export async function analyzeCurrentTab(domain?: string, policyUrl?: string): Promise<void> {
  try {
    if (!domain) {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tabs[0]?.url) return
      domain = getPolicyDomain(tabs[0].url)
      if (!domain) return
    }
    if (!shouldAnalyzeDomain(domain)) return
    if (policyUrl) {
      await analyzePolicyUrl(domain, policyUrl)
    } else {
      await tryCommonUrls(domain)
    }
  } catch (e) {
    console.error('analyzeCurrentTab failed:', e)
  }
}

function isValidReport(r: PolicyReport): boolean {
  // Display-only gate: 500 words pre-extraction is enforced at fetch time
  // (isLikelyPolicyText); a legit policy whose extracted text dips below
  // that was analyzed, stored, then hidden forever. The policy URL may
  // legitimately live on a corporate host (chatgpt.com → openai.com), so
  // only sanity-check it parses as http(s).
  if (r.wordCount < 50) return false
  try {
    const u = new URL(r.policyUrl)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

export async function getPolicyReport(domain: string): Promise<PolicyReport | null> {
  const state = await getSecurityState()
  return (state.policyReports || []).find(r => r.domain === domain && isValidReport(r)) || null
}

export async function getPolicyReports(): Promise<PolicyReport[]> {
  const state = await getSecurityState()
  // Drop stale/junk reports (a home page analyzed as a policy, or a policy
  // fetched from a different domain) so they never surface until a real
  // analysis replaces them.
  return (state.policyReports || []).filter(isValidReport)
}

export function startPolicyMonitor(): void {
  // Intentionally empty — analysis is triggered on-demand via POPUP_OPENED
}
