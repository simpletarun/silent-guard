import { RiskEvent, SecurityHeadersReport } from '../../types'
import { addCategoryEvent, getSecurityState, getSettings, hasRecentCategoryEvent, mutateSecurityState } from '../storage'
import { recalculateCategoryScore } from '../engine'

function normalizeHeaderName(h: string): string {
  return h.toLowerCase().replace(/-/g, '')
}

// OWASP recommends HSTS max-age >= 15552000 (180 days). Shorter values are
// trivially bypassable by a first-visit attacker.
const HSTS_MIN_MAX_AGE = 15552000

// Referrer-Policy values that actually restrict leakage. 'unsafe-url' (or an
// empty value) sends full URLs to every destination.
const SAFE_REFERRER_POLICIES = new Set([
  'no-referrer', 'no-referrer-when-downgrade', 'same-origin', 'strict-origin',
  'strict-origin-when-cross-origin', 'origin', 'origin-when-cross-origin',
])

export interface HeaderAuditResult {
  hasHsts: boolean
  hstsApplicable: boolean // false over plain http — HSTS cannot exist there
  hasCsp: boolean
  hasXfo: boolean
  hasXssProtection: boolean // deprecated header — detected for display, NOT scored
  hasReferrerPolicy: boolean
  hasPermissionsPolicy: boolean
  score: number
  missingHeaders: string[]
}

// Only a full document response reflects a site's real policy. Redirect hops
// carry weaker header sets, and 304 cache-revalidations / service-worker-served
// documents routinely omit security headers entirely — auditing those produced
// false all-fail rows (e.g. "HSTS ✗" on domains that always send it).
export function isAuditableStatus(statusCode?: number): boolean {
  return typeof statusCode === 'number' && statusCode >= 200 && statusCode < 300
}

function passedCount(r: Pick<HeaderAuditResult, 'hasCsp' | 'hasXfo' | 'hasReferrerPolicy' | 'hasPermissionsPolicy'> & { hstsApplicable?: boolean; hasHsts: boolean }): number {
  let n = 0
  if (r.hstsApplicable && r.hasHsts) n++
  if (r.hasCsp) n++
  if (r.hasXfo) n++
  if (r.hasReferrerPolicy) n++
  if (r.hasPermissionsPolicy) n++
  return n
}

// A later degraded sample (cache ping, odd path) must never erase a better
// audit of the same site — keep whichever row passed more checks; ties go to
// the newer observation so genuine policy changes still land.
export function pickBetterReport(existing: SecurityHeadersReport | undefined, incoming: SecurityHeadersReport): SecurityHeadersReport {
  if (!existing) return incoming
  // A plain-http sample scores out of 4 checks (HSTS cannot exist there),
  // so 4/4-http would beat 2/5-https on raw counts and erase the site's
  // measured HTTPS posture — http rows never displace https rows.
  if (existing.hstsApplicable !== false && incoming.hstsApplicable === false) return existing
  return passedCount(incoming) >= passedCount(existing) ? incoming : existing
}

const REAUDIT_AFTER_MS = 24 * 60 * 60 * 1000

// A stored row older than 24h (or from the legacy auditor — no auditedAt)
// must be re-audited on the next visit regardless of the 5-minute cooldown,
// or stale wrong verdicts would never self-correct.
export function needsReaudit(existingRow: { auditedAt?: number } | undefined): boolean {
  return !existingRow?.auditedAt || Date.now() - existingRow.auditedAt > REAUDIT_AFTER_MS
}

// One row per site: a fresh audit replaces the stored entry instead of
// stacking /, /about, /login variants beside it — but only if it passed at
// least as many checks (pickBetterReport). Pure so the storage mutex owns
// the only mutable copy.
export function mergeHeaderRow(list: SecurityHeadersReport[], hostname: string, report: SecurityHeadersReport): SecurityHeadersReport[] {
  const next = [...list]
  const idx = next.findIndex(r => auditHost(r.url) === hostname)
  if (idx >= 0) next[idx] = pickBetterReport(next[idx], report)
  else next.unshift(report)
  if (next.length > 50) next.length = 50
  return next
}

// Pure scoring core — same input must always yield the same verdict.
// VALUES matter: a header with a useless value protects nothing.
// - HSTS: needs max-age >= 180 days (OWASP minimum)
// - X-Frame-Options: modern browsers honor only DENY / SAMEORIGIN
//   (ALLOW-FROM was removed everywhere)
// - Referrer-Policy: at least one safe token among the comma-separated list;
//   bare 'unsafe-url' fails
// - CSP: any non-empty enforced policy ('...-Report-Only' is a different
//   header name and never matches)
// - X-XSS-Protection: ignored by every modern browser (auditor removed in
//   Chrome 78) — detected and displayed as legacy, excluded from the score
export function evaluateSecurityHeaders(
  headers: { name: string; value?: string }[],
  opts: { isHttps?: boolean } = {},
): HeaderAuditResult {
  const byName = new Map<string, string>()
  for (const h of headers) byName.set(normalizeHeaderName(h.name), (h.value ?? '').trim())

  const hstsApplicable = opts.isHttps !== false
  let hasHsts = false
  if (hstsApplicable) {
    const m = /max-age\s*=\s*(\d+)/i.exec(byName.get('stricttransportsecurity') || '')
    hasHsts = !!m && Number(m[1]) >= HSTS_MIN_MAX_AGE
  }

  const hasCsp = (byName.get('contentsecuritypolicy') || '').length > 0

  const xfo = (byName.get('xframeoptions') || '').toUpperCase()
  const hasXfo = xfo === 'DENY' || xfo === 'SAMEORIGIN'

  const rp = (byName.get('referrerpolicy') || '').toLowerCase()
  const hasReferrerPolicy = rp.split(',').some(t => SAFE_REFERRER_POLICIES.has(t.trim()))

  const hasPermissionsPolicy = (byName.get('permissionspolicy') || '').length > 0

  const hasXssProtection = (byName.get('xxssprotection') || '').length > 0

  // [name, passed, scored] — scored=false rows are excluded from the denominator.
  const checks: [string, boolean, boolean][] = [
    ['Strict-Transport-Security', hasHsts, hstsApplicable],
    ['Content-Security-Policy', hasCsp, true],
    ['X-Frame-Options', hasXfo, true],
    ['Referrer-Policy', hasReferrerPolicy, true],
    ['Permissions-Policy', hasPermissionsPolicy, true],
  ]
  const applicable = checks.filter(c => c[2])
  const score = Math.round((applicable.filter(c => c[1]).length / Math.max(1, applicable.length)) * 100)
  return {
    hasHsts,
    hstsApplicable,
    hasCsp,
    hasXfo,
    hasXssProtection,
    hasReferrerPolicy,
    hasPermissionsPolicy,
    score,
    missingHeaders: checks.filter(c => c[2] && !c[1]).map(c => c[0]),
  }
}

// Canonical site key: www. and case variants are the same site — auditing
// example.com and WWW.example.com separately produced two conflicting rows.
function auditHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase() || null
  } catch {
    return null
  }
}

// Re-auditing the same hostname on every main-frame load (back/forward,
// refreshes, tab restores) churned the report list and STATE_UPDATED spam.
const AUDIT_COOLDOWN_MS = 300000
const hostCooldowns = new Map<string, number>()

// Module-level cooldowns survive CLEAR_ALL_DATA in SW memory — without a
// reset, re-audits stay silently skipped after a data wipe.
export function resetAuditCaches(): void {
  hostCooldowns.clear()
}

async function auditHeaders(url: string, headers: chrome.webRequest.HttpHeader[], statusCode?: number): Promise<void> {
  // Serialize: a multi-tab session fires one audit per main-frame load —
  // concurrent read-modify-writes used to drop reports.
  headersQueue = headersQueue.then(() => doAudit(url, headers, statusCode)).catch(() => {})
  return headersQueue as Promise<void>
}

let headersQueue: Promise<unknown> = Promise.resolve()

async function doAudit(url: string, headers: chrome.webRequest.HttpHeader[], statusCode?: number): Promise<void> {
  try {
    // Redirect hops (http→https, apex→www) fire onHeadersReceived as
    // main_frame too, but carry their own weaker header sets — HSTS is not
    // even possible over plain http. Auditing them made the same site flip
    // scores between visits depending on which hop won the cooldown. Only
    // the final 2xx document response reflects the site's real policy.
    if (!isAuditableStatus(statusCode)) return

    const settings = await getSettings()
    if (!settings.monitorHeaders) return
    let hostname = url
    let safeUrl = url
    let isHttps = true
    try {
      const u = new URL(url)
      hostname = auditHost(url) || u.hostname
      safeUrl = u.origin + u.pathname
      isHttps = u.protocol === 'https:'
    } catch {}
    const now = Date.now()
    // Legacy rows (no auditedAt) are poison from the old auditor — they
    // could mark HSTS-present sites as failing and lived forever. Treat a
    // stale (>24h) or legacy row as expired so this visit re-audits it;
    // pickBetterReport then swaps in real data.
    const existingRow = ((await getSecurityState()).securityHeaders || []).find(r => auditHost(r.url) === hostname)
    if (!needsReaudit(existingRow)) {
      const lastAudit = hostCooldowns.get(hostname)
      if (lastAudit && now - lastAudit < AUDIT_COOLDOWN_MS) return
    }
    hostCooldowns.set(hostname, now)
    if (hostCooldowns.size > 200) {
      const oldest = [...hostCooldowns.entries()].sort((a, b) => a[1] - b[1])[0]
      if (oldest) hostCooldowns.delete(oldest[0])
    }

    const result = evaluateSecurityHeaders(
      (headers || []).map(h => ({ name: h.name, value: h.value || '' })),
      { isHttps },
    )
    const { score, missingHeaders } = result

    const report: SecurityHeadersReport = {
      url: safeUrl,
      auditedAt: now,
      ...result,
    }

    // Atomic merge inside the storage write queue — computing the new list
    // outside it let two concurrent audits (multi-tab, session restore) both
    // start from the same stale snapshot and erase each other's results.
    await mutateSecurityState(ss => {
      ss.securityHeaders = mergeHeaderRow(ss.securityHeaders || [], hostname, report)
    })

    if (score < 50) {
      const recentlyReported = await hasRecentCategoryEvent(
        'privacy',
        e => e.type === 'missing_security_header' && e.source === hostname,
        3600000,
      )
      if (recentlyReported) return
      // Missing HSTS or CSP is materially worse than missing the rest.
      const criticalMissing = missingHeaders.includes('Strict-Transport-Security') ||
        missingHeaders.includes('Content-Security-Policy')
      const event: RiskEvent = {
        id: crypto.randomUUID(),
        type: 'missing_security_header',
        category: 'privacy',
        severity: criticalMissing ? 'high' : 'medium',
        title: `Missing security headers on ${hostname}`,
        description: `Score ${score}/100 — missing: ${missingHeaders.join(', ')}`,
        source: hostname,
        timestamp: Date.now(),
        acknowledged: false,
      }
      await addCategoryEvent('privacy', event)
      await recalculateCategoryScore('privacy')
    }
  } catch (e) {
    console.error('Headers audit failed:', e)
  }
}

export function headersReceivedHandler(details: chrome.webRequest.WebResponseHeadersDetails): void {
  if (details.type !== 'main_frame') return
  if (details.responseHeaders && details.url) {
    auditHeaders(details.url, details.responseHeaders, details.statusCode)
  }
}

