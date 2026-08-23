import { isContextValid, safeSend } from './index'
import {
  COOKIE_URL_RE,
  POLICY_PATH_RE,
  PRIVACY_URL_RE,
  SITEMAP_VARIANTS,
  TERMS_URL_RE,
  extractLocs,
  isSitemapIndex,
  isSitemapXml,
  parseRobotsSitemaps,
  pickPolicyUrls,
} from '../policy/sitemap'

// Link TEXT matching — includes the non-English words footers actually use
// ("Datenschutz", "Privacidad", "Confidentialité", …). ASCII \b only, so
// compound-safe patterns stay unanchored.
const PRIVACY_RE = /\bprivacy\b|datenschutz|datenschutzerkl|privacidad|privacidade|confidentialit\u00e9|confidentialite|privacyverklaring|privacybeleid|polityka prywatno|personvern|personuppgifter|integritetspolic|tietosuoja|gizlilik|data.?protection|data.?policy|privacy.?(notice|statement|center|preferences?|practices?)|personal.?data|\bgdpr\b|\bccpa\b|\u043a\u043e\u043d\u0444\u0438\u0434\u0435\u043d\u0446\u0438\u0430\u043b\u044c\u043d|\u500b\u4eba\u60c5\u5831|\u4e2a\u4eba\u4fe1\u606f|\u9690\u79c1|\u500b\u4eba\u8cc7\u8a0a|\uac1c\uc778\uc815\ubcf4|\u0633\u064a\u0627\u0633\u0629 \u0627\u0644\u062e\u0635\u0648\u0635\u064a\u0629/i
// \btos\b etc. — unanchored, "Photos" used to classify as a terms link.
const TERMS_RE = /\bterms\b|\btos\b|\bconditions?\b|\buser.?agreement\b|\blegal\b|\bour.?policies\b/i
const COOKIE_RE = /cookie/i

const ONCLICK_NAV_RE = /(?:window\.open\(\s*['"]|location(?:\.href)?\s*=\s*['"])([^'"]+)/
const CANDIDATE_SELECTOR = 'a[href], [role="link"], button, [onclick]'
const MAX_LINKS = 10

const POLICY_BODY_KEYWORDS = ['privacy', 'personal data', 'collect', 'cookies', 'terms', 'gdpr', 'ccpa', 'data protection', 'datenschutz', 'privacidad', 'confidentialit\u00e9', 'dados pessoais', 'datos personales', 'donn\u00e9es personnelles', 'personuppgifter', 'integritetspolicy', '\u043a\u043e\u043d\u0444\u0438\u0434\u0435\u043d\u0446\u0438\u0430\u043b\u044c\u043d', '\u500b\u4eba\u60c5\u5831', '\u9690\u79c1', '\uac1c\uc778\uc815\ubcf4']
const POLICY_BODY_MIN_CHARS = 800
const POLICY_TEXT_MAX_CHARS = 120000
const POLICY_TEXT_MIN_CHARS = 500

const OBSERVER_DEBOUNCE_MS = 2000
const OBSERVER_MAX_RUNS = 10
const OBSERVER_MAX_LIFETIME_MS = 30000

const sentLinkUrls = new Set<string>()
const sentPolicyTextUrls = new Set<string>()

// Probing runs in the page context: same-origin fetches have no CORS, while
// a service-worker fetch is rejected by sites that send no
// Access-Control-Allow-Origin (chromewebstore.google.com, …). This is the
// ONLY place policy pages are fetched.
const PROBE_PATHS = [
  '/privacy', '/privacy/', '/privacy-policy', '/privacy-policy/', '/privacy-policy.html', '/legal/privacy',
  // Non-English slugs — most EU sites never use "/privacy".
  '/datenschutz', '/datenschutz/', '/datenschutzerklaerung', '/datenschutz-informationen',
  '/privacidad', '/politica-de-privacidad', '/confidentialite', '/politique-de-confidentialite',
  '/privacyverklaring', '/politica-de-privacidade', '/personvern', '/gizlilik-politikasi',
  '/privacy-policy.php', '/privacy.html', '/privacy.php', '/privacy/en', '/privacy/en/',
  '/en/privacy', '/en/privacy-policy', '/about/privacy', '/about/privacy-policy',
  '/company/privacy', '/privacy/center', '/privacy-center', '/data-privacy',
  '/privacy-info', '/privacy-notice', '/privacy-notice/', '/privacy-statement', '/privacy-preferences',
  '/privacy-and-cookie-policy', '/privacy-and-cookies', '/privacypolicy', '/gdpr',
  '/policies/privacy-policy', '/policies/privacy', '/policies/privacy/',
  '/legal', '/legal/', '/legal/privacy-policy', '/legal/privacy-policy.html', '/legal/privacy-notice', '/legal/terms',
  '/terms', '/terms/', '/terms-of-service', '/terms.html', '/tos', '/terms-and-conditions', '/terms-conditions',
  '/cookies', '/cookie-policy', '/cookie-policy/', '/cookies-policy', '/legal/cookies',
  '/policies/terms', '/policies/cookies',
  '/page/privacy-policy', '/pages/privacy-policy', '/content/privacy-policy', '/help/privacy-policy',
  '/company/privacy-policy', '/docs/privacy', '/about/legal/privacy-policy', '/site/privacy',
  '/website-privacy-policy', '/data-privacy-policy', '/data-protection', '/en-us/privacy-policy',
  '/legal-notice', '/privacy-policy-en',
  // Second tier — still common, checked after sitemap discovery.
  '/privacy_policy', '/privacy_statement', '/privacy_centre', '/legal/privacy-statement',
  '/help/privacy', '/cookie-notice', '/data-protection-notice', '/legal/data-protection',
  '/en-us/privacy', '/corporate/privacy-policy', '/informativa', '/tietosuoja',
  // Long-tail tier: CMS quirks, Nordic/Slavic/Hungarian slugs, deep corporate
  // paths real footers point at.
  '/integritetspolicy', '/integritetspolitik', '/privatlivspolitik', '/politika-privatnosti',
  '/politika-konfidencialnosti', '/adatvedelmi', '/privacy-policy.aspx', '/privacypolicy.aspx',
  '/site/privacy-policy', '/site/privacy-policy/', '/company/legal/privacy-policy',
  '/home/privacy', '/info/privacy', '/footer/privacy', '/privacy-policy/en',
]
// Highest-yield slugs (English core + international) — tried before the
// (slower) sitemap discovery pass.
const PRIORITY_PROBE_COUNT = 18
const PROBE_TIMEOUT_MS = 6000
const PROBE_BATCH_SIZE = 12
const PROBE_MIN_CHARS = 500
const PROBE_MAX_CHARS = 120000
const PROBE_JUNK_SIGNALS = ['just a moment', 'checking your browser', 'captcha', 'access denied', 'verify you are human']
const PROBE_KEYWORDS = ['privacy', 'personal data', 'personal information', 'gdpr', 'ccpa', 'cookie', 'consent', 'data protection', 'third-party', 'opt out', 'datenschutz', 'datos personales', 'donn\u00e9es personnelles', 'dados pessoais', 'personuppgifter', 'integritetspolicy', '\u043a\u043e\u043d\u0444\u0438\u0434\u0435\u043d\u0446\u0438\u0430\u043b\u044c\u043d', '\u500b\u4eba\u60c5\u5831', '\u9690\u79c1', '\uac1c\uc778\uc815\ubcf4']

let probed = false
let linkEverFound = false

function looksLikePolicyText(text: string): boolean {
  if (text.length < PROBE_MIN_CHARS) return false
  const lower = text.toLowerCase()
  // A bot-protection wall announces itself in the head of the document — but
  // real policies legitimately mention "captcha" or "access denied" deep in
  // the body, so junk signals are only checked against the first 800 chars.
  const head = lower.slice(0, 800)
  if (PROBE_JUNK_SIGNALS.some(s => head.includes(s))) return false
  return PROBE_KEYWORDS.filter(k => lower.includes(k)).length >= 2
}

async function fetchRaw(url: string, maxChars = PROBE_MAX_CHARS): Promise<{ text: string; finalUrl: string } | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
    try {
      const resp = await fetch(url, { credentials: 'same-origin', redirect: 'follow', signal: controller.signal })
      if (!resp.ok) return null
      let text: string
      // Many sites gzip their sitemaps (sitemap.xml.gz) — decompress before
      // the XML sniffing sees binary garbage.
      const gz = /\.gz($|\?)/i.test(url) || /gzip/i.test(resp.headers.get('content-type') || '')
      if (gz && resp.body && typeof DecompressionStream !== 'undefined') {
        try {
          text = await new Response(resp.body.pipeThrough(new DecompressionStream('gzip'))).text()
        } catch { return null }
      } else {
        text = await resp.text()
      }
      return { text: text.slice(0, maxChars), finalUrl: resp.url || url }
    } finally { clearTimeout(timer) }
  } catch { return null }
}

async function fetchAsText(url: string): Promise<{ text: string; finalUrl: string } | null> {
  const raw = await fetchRaw(url)
  if (!raw || !looksLikePolicyText(raw.text)) return null
  return raw
}

function sendProbeText(url: string, text: string, probed: string[]): void {
  if (sentPolicyTextUrls.has(url)) return
  sentPolicyTextUrls.add(url)
  safeSend({
    type: 'POLICY_TEXT',
    url,
    text,
    source: 'probe',
    probed,
    // The report must be stored under the SITE domain (github.com), not the
    // policy page host (docs.github.com) — the matrix looks up by site.
    siteDomain: window.location.hostname.replace(/^www\./, ''),
  })
}

// force: the background asked explicitly (PROBE_POLICY) after link discovery
// failed or the report went stale — that must re-run even if this page's
// first opportunistic pass already tried (and missed) common paths.
export async function probePolicyPaths(force = false): Promise<void> {
  if (!isContextValid()) return
  if ((probed || linkEverFound) && !force) return
  probed = true
  const origin = window.location.origin
  const probedUrls: string[] = []

  const tryBatch = async (paths: string[]): Promise<boolean> => {
    probedUrls.push(...paths.map(path => `${origin}${path}`))
    const results = await Promise.all(paths.map(path => fetchAsText(`${origin}${path}`)))
    for (let j = 0; j < results.length; j++) {
      if (results[j]) {
        // Report the FINAL url — /privacy often redirects to the real page.
        sendProbeText(results[j]!.finalUrl, results[j]!.text, probedUrls)
        return true
      }
    }
    return false
  }

  // Highest-yield slugs first…
  if (await tryBatch(PROBE_PATHS.slice(0, PRIORITY_PROBE_COUNT))) return
  // …then the site's own declared structure (sitemap beats guessing the
  // long tail), then the long tail itself.
  await probeSitemap(origin)
  if (sentPolicyTextUrls.size > 0) return
  for (let i = PRIORITY_PROBE_COUNT; i < PROBE_PATHS.length; i += PROBE_BATCH_SIZE) {
    if (await tryBatch(PROBE_PATHS.slice(i, i + PROBE_BATCH_SIZE))) return
  }
}

// Sitemap discovery: /sitemap.xml variants plus any "Sitemap:" lines in
// robots.txt. Index sitemaps (<sitemapindex>) point at child sitemaps —
// follow ONE level of those (large sites split URLs across
// sitemap-pages.xml etc.). All fetches are same-origin page-context fetches;
// bounded at ~5 sitemap fetches + 5 candidate pages, and every wave is
// fetched in parallel so a miss costs one timeout, not five.
// Host belongs to the site's own registrable domain (example.com,
// policies.example.com) — sibling subdomains host corporate policies.
function hostOnSite(url: string, base: string): boolean {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '').toLowerCase()
    return h === base || h.endsWith('.' + base)
  } catch { return false }
}

async function probeSitemap(origin: string): Promise<void> {
  type Xml = { url: string; xml: string }
  const siteBase = window.location.hostname.replace(/^www\./, '')
  const fetchXml = async (url: string): Promise<Xml | null> => {
    const raw = await fetchRaw(url, 300000)
    const xml = raw ? raw.text : ''
    return isSitemapXml(xml) ? { url, xml } : null
  }
  try {
    const seen = new Set<string>()
    const robots = await fetchRaw(`${origin}/robots.txt`, 20000)
    const declared = robots ? parseRobotsSitemaps(robots.text).filter(u => hostOnSite(u, siteBase)) : []

    let xmls = (await Promise.all(
      [...declared, ...SITEMAP_VARIANTS.map(v => `${origin}${v}`)]
        .filter(u => !seen.has(u)).slice(0, 7)
        .map(u => { seen.add(u); return fetchXml(u) })
    )).filter((x): x is Xml => !!x)

    // One expansion pass for index sitemaps.
    const children = [...new Set(xmls
      .filter(x => isSitemapIndex(x.xml))
      .flatMap(x => extractLocs(x.xml).filter(l => hostOnSite(l, siteBase)).slice(0, 4)))]
      .filter(u => !seen.has(u)).slice(0, Math.max(0, 7 - seen.size))
    if (children.length > 0) {
      children.forEach(u => seen.add(u))
      const more = (await Promise.all(children.map(fetchXml))).filter((x): x is Xml => !!x)
      xmls = [...xmls.filter(x => !isSitemapIndex(x.xml)), ...more]
    }

    const pageLocs = xmls.flatMap(x => extractLocs(x.xml))

    const candidates = pickPolicyUrls(pageLocs, origin, 6)
    const hits = await Promise.all(candidates.map(url => fetchAsText(url)))
    const hit = hits.find(Boolean)
    if (hit) sendProbeText(hit.finalUrl, hit.text, [...seen])
  } catch {}
}

export async function fetchPolicyUrlForProbe(url: string): Promise<void> {
  try {
    const target = new URL(url)
    // Never use the page context as a cross-origin fetcher.
    if (target.origin !== window.location.origin) return
    const hit = await fetchAsText(url)
    if (hit) sendProbeText(hit.finalUrl, hit.text, [url])
  } catch {}
}

let observer: MutationObserver | null = null
let observerTimer: number | null = null
let observerRuns = 0
const observerStart = Date.now()

type LinkType = 'privacy' | 'terms' | 'cookies'

function classifyLink(text: string, fullUrl: string): LinkType | null {
  if (PRIVACY_RE.test(text) || PRIVACY_URL_RE.test(fullUrl)) return 'privacy'
  if (TERMS_RE.test(text) || TERMS_URL_RE.test(fullUrl)) return 'terms'
  if (COOKIE_RE.test(text) || COOKIE_URL_RE.test(fullUrl)) return 'cookies'
  return null
}

function navTargetOf(el: Element): string | null {
  const href = el.getAttribute('href')
  if (href && href.trim() && !/^javascript:/i.test(href.trim())) return href
  const onclick = el.getAttribute('onclick') || ''
  const m = onclick.match(ONCLICK_NAV_RE)
  return m ? m[1] : null
}

// querySelectorAll never sees inside shadow roots — modern sites render
// their footer (where the policy link lives) inside web components. Walk
// open shadow roots depth-first. ponytail: open roots only; closed roots
// are unreachable from content scripts by design.
function* deepCandidates(scope: Document | ShadowRoot | Element): Generator<Element> {
  for (const el of Array.from(scope.querySelectorAll('*'))) {
    if (el.matches(CANDIDATE_SELECTOR)) yield el
    if (el.shadowRoot) yield* deepCandidates(el.shadowRoot)
  }
}

export function detectPolicyLinks(): void {
  try {
    if (!isContextValid()) return
    const domain = window.location.hostname.replace(/^www\./, '')
    if (!domain || !/^https?:$/.test(window.location.protocol)) return

    const links: { url: string; text: string; type: LinkType }[] = []
    const seenInPass = new Set<string>()

    // Same-origin iframes too — cookie widgets and embedded footers render
    // their policy links there. Cross-origin frames are unreachable by design.
    const scopes: (Document | Element)[] = [document]
    for (const frame of document.querySelectorAll('iframe')) {
      try {
        const doc = frame.contentDocument
        if (doc) scopes.push(doc)
      } catch {}
    }

    for (const scope of scopes) {
      for (const el of deepCandidates(scope)) {
      const navUrl = navTargetOf(el)
      if (!navUrl) continue
      let fullUrl: string
      try {
        fullUrl = new URL(navUrl, window.location.href).href
      } catch { continue }

      const rawText = (el.textContent || '').trim()
      const linkType = classifyLink(rawText.toLowerCase(), fullUrl)
      if (!linkType) continue

      // Dedupe per url+text within this pass; re-runs (load, MutationObserver)
      // must not re-send links already reported by url.
      const key = fullUrl + '\u0000' + rawText
      if (seenInPass.has(key)) continue
      seenInPass.add(key)
      links.push({ url: fullUrl, text: rawText, type: linkType })
      }
    }

    const fresh = links.slice(0, MAX_LINKS).filter(l => !sentLinkUrls.has(l.url))
    if (fresh.length > 0) {
      linkEverFound = true
      fresh.forEach(l => sentLinkUrls.add(l.url))
      safeSend({ type: 'POLICY_LINKS_FOUND', domain, links: fresh })
    }
  } catch {}
}

function stopObserver(): void {
  if (observerTimer !== null) { window.clearTimeout(observerTimer); observerTimer = null }
  if (observer) { observer.disconnect(); observer = null }
}

function onWindowLoad(): void {
  detectPolicyLinks()
}

export function initPolicyDetection(): void {
  window.addEventListener('load', onWindowLoad, { once: true })
  if (typeof MutationObserver === 'undefined' || !document.documentElement) return
  observer = new MutationObserver(() => {
    if (observerTimer !== null || !isContextValid()) return
    observerTimer = window.setTimeout(() => {
      observerTimer = null
      observerRuns++
      detectPolicyLinks()
      // ponytail: hard caps (10 runs / 30s) so a churny SPA can never loop forever
      if (observerRuns >= OBSERVER_MAX_RUNS || Date.now() - observerStart >= OBSERVER_MAX_LIFETIME_MS) stopObserver()
    }, OBSERVER_DEBOUNCE_MS)
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
}

export function stopPolicyDetection(): void {
  window.removeEventListener('load', onWindowLoad)
  stopObserver()
}

function isPolicyTextUrl(url: string): boolean {
  if (/^chrome:\/\//.test(url) || /^about:/.test(url)) return false
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false
  } catch { return false }
  return true
}

export function maybeSendPolicyText(): void {
  try {
    const url = window.location.href
    if (sentPolicyTextUrls.has(url) || !isPolicyTextUrl(url) || !document.body) return

    const innerText = document.body.innerText || ''
    const bodyLooksPolicy = innerText.trim().length >= POLICY_BODY_MIN_CHARS &&
      POLICY_BODY_KEYWORDS.filter(k => innerText.toLowerCase().includes(k)).length >= 2
    const pathLooksPolicy = POLICY_PATH_RE.test(new URL(url).pathname)
    if (!pathLooksPolicy && !bodyLooksPolicy) return

    const text = innerText.slice(0, POLICY_TEXT_MAX_CHARS)
    if (text.trim().length < POLICY_TEXT_MIN_CHARS) return

    sentPolicyTextUrls.add(url)
    safeSend({
      type: 'POLICY_TEXT',
      url,
      text,
      source: 'dom',
      siteDomain: window.location.hostname.replace(/^www\./, ''),
    })
  } catch {}
}

export function handleFindPolicyLinks(scrapeOnly?: boolean): void {
  // Scrape tabs harvest links too: a terms page opened by the hidden-tab
  // fallback often links the privacy page we actually want (second hop).
  // The background attributes scrape-tab links to the site being analyzed.
  detectPolicyLinks()
  if (!scrapeOnly) {
    // No links on the page → probe common paths in the page context
    // (same-origin fetches only — the CORS-free way to reach policy pages).
    probePolicyPaths().catch(() => {})
  }
  maybeSendPolicyText()
}