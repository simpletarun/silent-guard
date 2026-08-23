// Pure sitemap/robots helpers for policy discovery — no chrome/* or DOM
// access here so they unit-test directly. All fetching happens in the
// content script (same-origin only, no CORS pain).

// URL matches need the path segment to BE policy-ish: "/blog/privacy-tips"
// is not a policy page and must not match. Segment alternations include the
// non-English slugs real sites ship (datenschutz, privacidad,
// politique-de-confidentialite, privacyverklaring, …) — EU sites almost
// never use "/privacy".
const PRIVACY_SEG = '(?:privacy[-_ ]?(?:policy|notice|statement|center|centre|preferences?|practices?)?|data[-_ ]?(?:protection|policy)|personal[-_ ]?data|gdpr|ccpa|datenschutz(?:informationen|erkl(?:ae|a|\u00e4)rung)?|politica[-_ ]?de[-_ ]?(?:privacidad|privacidade)|privacidad|privacidade|politique[-_ ]?de[-_ ]?confidentialite|confidentialite|privacyverklaring|privacybeleid|informativa|polityka[-_ ]?prywatnosci|personvern|persondata|tietosuoja(?:seloste)?|gizlilik(?:[-_ ]?politika(?:si)?)?|integritetspolicy|integritetspolitik|privatlivspolitik|politika[-_ ]?(?:privatnosti|konfidencialnosti)|adatv[e\u00e9]delmi)'
const TERMS_SEG = '(?:terms[-_ ]?(?:of[-_ ]?(?:service|use))?|tos|conditions|user[-_ ]?agreement|legal)'
const COOKIE_SEG = '(?:cookies?|cookie[-_ ]?(?:policy|notice))'

export const PRIVACY_URL_RE = new RegExp(`(^|/)${PRIVACY_SEG}(/|#|$)`, 'i')
export const TERMS_URL_RE = new RegExp(`(^|/)${TERMS_SEG}(/|#|$)`, 'i')
export const COOKIE_URL_RE = new RegExp(`(^|/)${COOKIE_SEG}(/|#|$)`, 'i')
export const POLICY_PATH_RE = new RegExp(`(^|/)(?:${PRIVACY_SEG}|${TERMS_SEG}|${COOKIE_SEG})(/|#|$)`, 'i')

// Common sitemap locations — WordPress ships /wp-sitemap.xml, many static
// generators /sitemap_index.xml.
export const SITEMAP_VARIANTS = ['/sitemap.xml', '/sitemap_index.xml', '/sitemap-index.xml', '/wp-sitemap.xml']

export function isSitemapXml(xml: string): boolean {
  return /<urlset|<sitemapindex/i.test(xml)
}

export function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex/i.test(xml)
}

export function extractLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map(m =>
    m[1].trim().replace(/&amp;/g, '&')
  )
}

// Loc entries whose path looks like a policy page. Hosts on the site's own
// registrable domain count — many companies host policies on a subdomain
// (policies.example.com for example.com); unrelated lookalikes
// (evil-example.com) are still rejected.
export function pickPolicyUrls(locs: string[], origin: string, limit = 10): string[] {
  let base = ''
  try { base = new URL(origin).hostname.replace(/^www\./, '').toLowerCase() } catch { return [] }
  const out: string[] = []
  for (const loc of locs) {
    let u: URL
    try { u = new URL(loc) } catch { continue }
    const host = u.hostname.replace(/^www\./, '').toLowerCase()
    if (!(host === base || host.endsWith('.' + base))) continue
    if (!POLICY_PATH_RE.test(u.pathname)) continue
    u.hash = '' // /privacy-policy#contact is the same page
    if (!out.includes(u.href)) out.push(u.href)
    if (out.length >= limit) break
  }
  return out
}

// robots.txt "Sitemap:" lines (absolute URLs per spec), deduped, capped.
export function parseRobotsSitemaps(robotsTxt: string, cap = 5): string[] {
  const out: string[] = []
  for (const line of (robotsTxt || '').split(/\r?\n/)) {
    const m = line.match(/^\s*sitemap:\s*(\S+)/i)
    if (m) {
      const candidate = m[1].replace(/&amp;/g, '&')
      if (!out.includes(candidate)) out.push(candidate)
    }
  }
  return out.slice(0, cap)
}
