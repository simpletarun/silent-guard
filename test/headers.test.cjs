const test = require('node:test')
const assert = require('node:assert/strict')

const { evaluateSecurityHeaders, isAuditableStatus, pickBetterReport, needsReaudit, mergeHeaderRow } = require('./build/src/background/monitors/headersMonitor.js')
const { migrateState } = require('./build/src/background/storage.js')

const full = [
  { name: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
  { name: 'Content-Security-Policy', value: "default-src 'self'" },
  { name: 'X-Frame-Options', value: 'DENY' },
  { name: 'X-XSS-Protection', value: '0' },
  { name: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { name: 'Permissions-Policy', value: 'geolocation=()' },
]

test('all valid headers score 100 with nothing missing', () => {
  const r = evaluateSecurityHeaders(full)
  assert.equal(r.score, 100)
  assert.deepEqual(r.missingHeaders, [])
  assert.ok(r.hasHsts && r.hasCsp && r.hasXfo && r.hasXssProtection && r.hasReferrerPolicy && r.hasPermissionsPolicy)
})

test('no headers scores 0 with all scored checks missing', () => {
  const r = evaluateSecurityHeaders([{ name: 'Content-Type', value: 'text/html' }])
  assert.equal(r.score, 0)
  assert.equal(r.missingHeaders.length, 5, 'legacy X-XSS is not in the missing list')
  assert.equal(r.hasHsts, false)
})

test('header name casing is irrelevant and scoring deterministic', () => {
  const a = evaluateSecurityHeaders([
    { name: 'strict-transport-security', value: 'MAX-AGE=15552000' },
    { name: 'CONTENT-security-POLICY', value: 'default-src *' },
  ])
  const b = evaluateSecurityHeaders([
    { name: 'STRICT-TRANSPORT-SECURITY', value: 'max-age=15552000' },
    { name: 'Content-Security-Policy', value: 'default-src *' },
  ])
  assert.deepEqual(a, b, 'same headers in different case must score identically')
  assert.equal(a.score, Math.round((2 / 5) * 100))
  assert.deepEqual(a.missingHeaders, ['X-Frame-Options', 'Referrer-Policy', 'Permissions-Policy'])
})

test('useless header VALUES fail even though the names are present', () => {
  const r = evaluateSecurityHeaders([
    { name: 'Strict-Transport-Security', value: 'max-age=0' },        // HSTS disabled
    { name: 'Content-Security-Policy', value: '' },                   // empty policy
    { name: 'X-Frame-Options', value: 'ALLOW-FROM https://x.com' },   // removed from browsers
    { name: 'Referrer-Policy', value: 'unsafe-url' },                 // leaks full URLs
    { name: 'Permissions-Policy', value: '' },
  ])
  assert.equal(r.hasHsts, false)
  assert.equal(r.hasCsp, false)
  assert.equal(r.hasXfo, false)
  assert.equal(r.hasReferrerPolicy, false)
  assert.equal(r.hasPermissionsPolicy, false)
  assert.equal(r.score, 0)
})

test('HSTS below the OWASP 180-day minimum fails; missing max-age fails', () => {
  assert.equal(evaluateSecurityHeaders([{ name: 'Strict-Transport-Security', value: 'max-age=86400' }]).hasHsts, false)
  assert.equal(evaluateSecurityHeaders([{ name: 'Strict-Transport-Security', value: 'includeSubDomains' }]).hasHsts, false)
  assert.equal(evaluateSecurityHeaders([{ name: 'Strict-Transport-Security', value: 'max-age=15552000' }]).hasHsts, true)
})

test('CSP served only as Report-Only does not count as enforced', () => {
  const r = evaluateSecurityHeaders([{ name: 'Content-Security-Policy-Report-Only', value: 'default-src *' }])
  assert.equal(r.hasCsp, false)
})

test('multi-value Referrer-Policy passes if ANY token is safe', () => {
  assert.equal(evaluateSecurityHeaders([{ name: 'Referrer-Policy', value: 'no-referrer, unsafe-url' }]).hasReferrerPolicy, true)
  assert.equal(evaluateSecurityHeaders([{ name: 'Referrer-Policy', value: 'unsafe-url' }]).hasReferrerPolicy, false)
})

test('SAMEORIGIN X-Frame-Options passes case-insensitively', () => {
  assert.equal(evaluateSecurityHeaders([{ name: 'X-Frame-Options', value: 'sameorigin' }]).hasXfo, true)
})

test('X-XSS-Protection is legacy: detected but excluded from the score', () => {
  const without = evaluateSecurityHeaders(full.filter(h => h.name !== 'X-XSS-Protection'))
  const withIt = evaluateSecurityHeaders(full)
  assert.equal(without.score, withIt.score, 'legacy header must not change the score')
  assert.equal(withIt.hasXssProtection, true)
  assert.equal(without.hasXssProtection, false)
})

test('over plain HTTP HSTS is N/A — neither scored nor listed missing', () => {
  const noHsts = full.filter(h => h.name !== 'Strict-Transport-Security')
  const http = evaluateSecurityHeaders(noHsts, { isHttps: false })
  const https = evaluateSecurityHeaders(noHsts)
  assert.equal(http.hstsApplicable, false)
  assert.equal(http.hasHsts, false)
  assert.equal(https.score, 80, 'https site IS penalized for missing HSTS')
  assert.equal(http.score, 100, 'http site NOT penalized for impossible HSTS')
  assert.ok(!http.missingHeaders.includes('Strict-Transport-Security'))
})

// --- degraded-sample guards (false all-fail rows root cause) ---

test('only full 2xx document responses are auditable', () => {
  assert.equal(isAuditableStatus(200), true)
  assert.equal(isAuditableStatus(204), true)
  assert.equal(isAuditableStatus(299), true)
  assert.equal(isAuditableStatus(301), false, 'redirect hop')
  assert.equal(isAuditableStatus(304), false, 'cache revalidation — headers stripped')
  assert.equal(isAuditableStatus(500), false, 'error page')
  assert.equal(isAuditableStatus(undefined), false, 'unknown status')
})

function rep(passing) {
  return {
    url: 'https://x.com/',
    hasHsts: passing.includes('hsts'),
    hstsApplicable: !passing.includes('http'),
    hasCsp: passing.includes('csp'),
    hasXfo: passing.includes('xfo'),
    hasXssProtection: false,
    hasReferrerPolicy: passing.includes('rp'),
    hasPermissionsPolicy: passing.includes('pp'),
    score: 0,
    missingHeaders: [],
  }
}

test('a degraded later sample never erases a better stored audit', () => {
  const good = pickBetterReport(rep(['hsts', 'csp', 'xfo']), rep([]))
  assert.equal(good.hasHsts && good.hasCsp && good.hasXfo, true, 'weak incoming sample rejected')
  const better = pickBetterReport(rep(['csp']), rep(['csp', 'xfo']))
  assert.equal(better.hasXfo, true, 'stronger incoming sample wins')
  assert.equal(pickBetterReport(undefined, rep(['csp'])).hasCsp, true, 'first audit always stored')
})

test('a plain-http sample never displaces a measured HTTPS row', () => {
  // http scores out of 4 checks — raw counts would let 4/4-http erase the
  // https row's measured HSTS gap.
  const existing = { ...rep([]), hstsApplicable: true }  // weak 1/5 https audit
  const httpHit = { ...rep(['csp', 'xfo', 'rp', 'pp']), hstsApplicable: false } // 4/4 http
  const kept = pickBetterReport(existing, httpHit)
  assert.equal(kept.hstsApplicable, true, 'https row retained')
})

test('stale or legacy rows must be re-audited despite the cooldown', () => {
  assert.equal(needsReaudit(undefined), true)
  assert.equal(needsReaudit({}), true, 'legacy row without auditedAt is poison')
  assert.equal(needsReaudit({ auditedAt: Date.now() - 25 * 60 * 60 * 1000 }), true, 'older than 24h')
  assert.equal(needsReaudit({ auditedAt: Date.now() - 60000 }), false, 'fresh row keeps cooldown')
})

test('mergeHeaderRow updates one site without touching the rest', () => {
  const a = { ...rep(['hsts']), url: 'https://a.com/' }
  const b = { ...rep(['hsts', 'csp', 'xfo']), url: 'https://b.com/' }
  const merged = mergeHeaderRow([a, b], 'b.com', rep(['hsts']))
  assert.equal(merged[0].url, 'https://a.com/', 'unrelated row untouched')
  assert.equal(merged[1].hasXfo, true, 'weaker sample for same host rejected')

  const upgraded = mergeHeaderRow([a, b], 'a.com', { ...rep(['hsts', 'csp', 'xfo', 'rp', 'pp']), score: 80 })
  assert.equal(upgraded.length, 2)
  assert.equal(upgraded[0].hasPermissionsPolicy, true, 'stronger sample replaces same host')

  const added = mergeHeaderRow([a, b], 'c.com', rep(['hsts']))
  assert.equal(added.length, 3)
  assert.equal(added[0].url, 'https://x.com/', 'new host lands first')

  let big = []
  for (let i = 0; i < 55; i++) big.push({ ...rep(['hsts']), url: `https://s${i}.com/` })
  assert.equal(mergeHeaderRow(big, 'zz.com', rep(['hsts'])).length, 50, 'cap holds')
})

test('legacy header rows without auditedAt are dropped at load', () => {
  const out = migrateState({
    dataVersion: 3,
    securityState: {
      securityHeaders: [
        { url: 'https://old-poison.com/', hasHsts: false },
        { url: 'https://fresh.com/', auditedAt: 123456, hasHsts: true },
      ],
    },
  })
  const kept = out.securityState.securityHeaders
  assert.equal(kept.length, 1, 'poison row removed')
  assert.equal(kept[0].url, 'https://fresh.com/')
})
