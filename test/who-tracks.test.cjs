const test = require('node:test')
const assert = require('node:assert/strict')

const { companyNameForTracker, aggregateWhoTracksMe, currentPageTrackers, normalizeScanUrl, isNoiseTracker, trackerTypeLabel } = require('./build/src/utils/whoTracksMe.js')

function scan(domain, url, trackers) {
  return {
    url, domain, scannedAt: 0, trackers,
    fingerprintingAttempts: 0, canvasAttempts: 0, audioAttempts: 0,
    hasTrackingPixels: false, hasHiddenIframes: false,
    beaconCalls: 0, suspiciousInlineScripts: 0, webRTCLeakDetected: false,
    thirdPartyRequests: 0, totalCookies: 0, localStorageItems: 0, sessionStorageItems: 0,
  }
}

const fb = { domain: 'connect.facebook.net', source: 'script', type: 'script', category: 'social' }
const ga = { domain: 'google-analytics.com', source: 'script', type: 'script', category: 'analytics' }
const pixel = { domain: 'doubleclick.net', source: 'img', type: 'pixel', category: 'tracking', details: 'Tracking pixel' }
const inline = { domain: 'policies.google.com', source: 'gtag(', type: 'inline', category: 'analytics', details: 'gtag(' }
const gtm = { domain: 'googletagmanager.com', source: 'js', type: 'script', category: 'analytics' }

test('company name maps known tracker domains via suffix match', () => {
  assert.equal(companyNameForTracker('connect.facebook.net'), 'Meta (Facebook)')
  assert.equal(companyNameForTracker('tr.snapchat.com'), 'Snapchat')
  assert.equal(companyNameForTracker('clarity.ms'), 'Microsoft Clarity')
  assert.equal(companyNameForTracker('www.google-analytics.com'), 'Google')
})

test('company name fallback humanizes unknown domains', () => {
  assert.equal(companyNameForTracker('evil-tracker.example.com'), 'Example')
  assert.equal(companyNameForTracker('weird-tools.io'), 'Weird tools')
  assert.equal(companyNameForTracker(''), 'Unknown')
})

test('aggregation dedupes per site and ranks by site count', () => {
  const scans = [
    scan('sitea.com', 'https://sitea.com/', [fb, ga, pixel, inline, gtm]),
    scan('sitea.com', 'https://sitea.com/page2', [fb]),
    scan('siteb.com', 'https://siteb.com/', [fb]),
  ]
  const rows = aggregateWhoTracksMe(scans)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].company, 'Meta (Facebook)')
  assert.equal(rows[0].siteCount, 2)
  assert.deepEqual(rows[0].sites, ['sitea.com', 'siteb.com'])
  assert.equal(rows[1].company, 'Google')
  assert.equal(rows[1].siteCount, 1)
})

test('noise trackers are filtered from aggregation and right-now chips', () => {
  assert.ok(isNoiseTracker(pixel))
  assert.ok(isNoiseTracker(inline))
  assert.ok(isNoiseTracker(gtm))
  assert.ok(!isNoiseTracker(fb))
  const scans = [scan('sitea.com', 'https://sitea.com/path', [fb, ga, pixel, inline, gtm])]
  assert.deepEqual(aggregateWhoTracksMe(scans).map(r => r.company), ['Google', 'Meta (Facebook)'])
  assert.deepEqual(currentPageTrackers(scans, 'https://sitea.com/path'), [
    { company: 'Google', domain: 'google-analytics.com' },
    { company: 'Meta (Facebook)', domain: 'connect.facebook.net' },
  ])
})

test('tracker type labels are human readable', () => {
  assert.equal(trackerTypeLabel('script'), 'Script')
  assert.equal(trackerTypeLabel('pixel'), 'Pixel')
  assert.equal(trackerTypeLabel('hidden'), 'Hidden Iframe')
  assert.equal(trackerTypeLabel('mystery'), 'mystery')
})

test('aggregation stays empty with no scans', () => {
  assert.deepEqual(aggregateWhoTracksMe([]), [])
})

test('current page trackers match normalized URL, fall back to domain', () => {
  const scans = [scan('sitea.com', 'https://sitea.com/path', [fb, ga])]
  assert.deepEqual(currentPageTrackers(scans, 'https://sitea.com/path?utm_source=x#top'), [
    { company: 'Google', domain: 'google-analytics.com' },
    { company: 'Meta (Facebook)', domain: 'connect.facebook.net' },
  ])
  assert.deepEqual(currentPageTrackers(scans, 'https://sitea.com/elsewhere'), [
    { company: 'Google', domain: 'google-analytics.com' },
    { company: 'Meta (Facebook)', domain: 'connect.facebook.net' },
  ])
  assert.equal(currentPageTrackers(scans, 'https://other.com/'), null)
  assert.equal(currentPageTrackers(scans, undefined), null)
})

test('normalizeScanUrl strips query and hash', () => {
  assert.equal(normalizeScanUrl('https://a.com/p?q=1#x'), 'https://a.com/p')
})

test('humanize keeps the brand label for multi-suffix TLDs', () => {
  assert.equal(companyNameForTracker('shop.now.co.uk'), 'Now')
  assert.equal(companyNameForTracker('cdn.serve.com.au'), 'Serve')
})

test('aggregation falls back to URL hostname for scans missing domain', () => {
  const legacy = { url: 'https://legacy-site.com/page', trackers: [{ ...fb }] }
  const rows = aggregateWhoTracksMe([legacy])
  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0].sites, ['legacy-site.com'])
})

test('legacy scans without a trackers array must not crash aggregation', () => {
  const broken = { url: 'https://broken-site.com/', domain: 'broken-site.com' }
  assert.doesNotThrow(() => aggregateWhoTracksMe([broken]))
  assert.deepEqual(aggregateWhoTracksMe([broken]), [])
  assert.deepEqual(currentPageTrackers([broken], 'https://broken-site.com/'), [])
})