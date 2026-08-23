const test = require('node:test')
const assert = require('assert')
const {
  POLICY_PATH_RE,
  SITEMAP_VARIANTS,
  extractLocs,
  isSitemapIndex,
  isSitemapXml,
  parseRobotsSitemaps,
  pickPolicyUrls,
} = require('./build/src/policy/sitemap')

test('isSitemapXml distinguishes sitemaps from junk', () => {
  assert.strictEqual(isSitemapXml('<?xml version="1.0"?><urlset xmlns="..."><url/></urlset>'), true)
  assert.strictEqual(isSitemapXml('<sitemapindex><sitemap/></sitemapindex>'), true)
  assert.strictEqual(isSitemapXml('<html><body>404 not found</body></html>'), false)
  assert.strictEqual(isSitemapXml(''), false)
})

test('isSitemapIndex detects index vs urlset', () => {
  assert.strictEqual(isSitemapIndex('<sitemapindex><sitemap><loc>https://x.com/sm.xml</loc></sitemap></sitemapindex>'), true)
  assert.strictEqual(isSitemapIndex('<urlset><url><loc>https://x.com/a</loc></url></urlset>'), false)
})

test('extractLocs pulls and unescapes loc entries', () => {
  const locs = extractLocs('<url><loc>https://x.com/a?b=1&amp;c=2</loc></url><url><loc> https://x.com/b </loc></url>')
  assert.deepStrictEqual(locs, ['https://x.com/a?b=1&c=2', 'https://x.com/b'])
  assert.deepStrictEqual(extractLocs('no locs here'), [])
})

test('pickPolicyUrls keeps only same-origin policy paths', () => {
  const origin = 'https://example.com'
  const locs = [
    'https://example.com/privacy-policy',
    'https://other.com/privacy-policy',          // foreign origin
    'https://example.com/blog/privacy-tips',     // policy-ish but NOT a policy page
    'https://example.com/about/team',            // unrelated
    'https://example.com/legal/terms-of-service',
    'not a url',
    'https://example.com/privacy-policy#section' // duplicate target
  ]
  const picked = pickPolicyUrls(locs, origin)
  assert.ok(picked.includes('https://example.com/privacy-policy'))
  assert.ok(picked.includes('https://example.com/legal/terms-of-service'))
  assert.strictEqual(picked.length, 2)
})

test('pickPolicyUrls respects the limit', () => {
  const locs = ['https://x.com/privacy', 'https://x.com/legal/terms', 'https://x.com/cookies']
  assert.strictEqual(pickPolicyUrls(locs, 'https://x.com', 2).length, 2)
})

test('pickPolicyUrls accepts sibling subdomains but not lookalikes', () => {
  const origin = 'https://www.example.com'
  const locs = [
    'https://policies.example.com/privacy',  // corporate policy subdomain
    'https://evil-example.com/privacy',      // lookalike — NOT a subdomain
    'https://notexample.com/privacy',        // suffix collision
  ]
  assert.deepStrictEqual(pickPolicyUrls(locs, origin), ['https://policies.example.com/privacy'])
})

test('policy path regex matches Nordic/Slavic/Hungarian slugs', () => {
  assert.strictEqual(POLICY_PATH_RE.test('/integritetspolicy'), true)
  assert.strictEqual(POLICY_PATH_RE.test('/privatlivspolitik'), true)
  assert.strictEqual(POLICY_PATH_RE.test('/politika-privatnosti'), true)
  assert.strictEqual(POLICY_PATH_RE.test('/adatvedelmi'), true)
  assert.strictEqual(POLICY_PATH_RE.test('/tietosuojaseloste'), true)
})

test('POLICY_PATH_RE accepts real slugs and rejects blog posts', () => {
  for (const p of ['/privacy-policy', '/legal/privacy-policy/', '/policies/privacy-policy', '/privacy-notice', '/cookie-policy', '/terms', '/legal', '/gdpr']) {
    assert.ok(POLICY_PATH_RE.test(p), p)
  }
  for (const p of ['/blog/privacy-tips', '/products', '/', '/privacy-is-overrated']) {
    assert.ok(!POLICY_PATH_RE.test(p), p)
  }
})

test('POLICY_PATH_RE and PRIVACY_URL_RE accept international policy slugs', () => {
  const { PRIVACY_URL_RE } = require('./build/src/policy/sitemap')
  for (const p of [
    '/datenschutz', '/datenschutzerklaerung', '/datenschutz/',
    '/privacidad', '/politica-de-privacidad',
    '/confidentialite', '/politique-de-confidentialite',
    '/privacyverklaring', '/politica-de-privacidade',
    '/informativa', '/personvern', '/tietosuoja',
    '/pl/polityka-prywatnosci', '/tr/gizlilik-politikasi',
  ]) {
    assert.ok(POLICY_PATH_RE.test(p), p)
    assert.ok(PRIVACY_URL_RE.test(p), `PRIVACY_URL_RE: ${p}`)
  }
  // Non-policy pages in those languages must still be rejected.
  for (const p of ['/datenschutz-blog', '/produkte', '/privacidad-de-otros-usuarios', '/impressum']) {
    assert.ok(!POLICY_PATH_RE.test(p), p)
  }
})

test('parseRobotsSitemaps reads Sitemap: lines, dedupes, caps', () => {
  const robots = [
    'User-agent: *',
    'Disallow: /admin',
    'sitemap: https://example.com/sitemap_index.xml',
    'SITEMAP: https://example.com/sitemap_index.xml',   // dup, different case
    'Sitemap: https://example.com/wp-sitemap.xml',
    '', ''
  ].join('\n')
  assert.deepStrictEqual(parseRobotsSitemaps(robots), [
    'https://example.com/sitemap_index.xml',
    'https://example.com/wp-sitemap.xml'
  ])
  const many = Array.from({ length: 9 }, (_, i) => `Sitemap: https://example.com/s${i}.xml`).join('\n')
  assert.strictEqual(parseRobotsSitemaps(many).length, 5)
  assert.deepStrictEqual(parseRobotsSitemaps(''), [])
})

test('sitemap variants cover WordPress and index conventions', () => {
  assert.ok(SITEMAP_VARIANTS.includes('/sitemap.xml'))
  assert.ok(SITEMAP_VARIANTS.includes('/wp-sitemap.xml'))
})
