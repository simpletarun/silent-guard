const test = require('node:test')
const assert = require('node:assert/strict')

const { normalizeDomain, isValidDomain } = require('./build/src/background/monitors/accountMonitor.js')
const { collectIncidentDomains } = require('./build/src/background/monitors/correlationEngine.js')
const { baseDomain, canonicalAccountDomain } = require('./build/src/utils/domain.js')

test('normalizeDomain strips scheme, www, path', () => {
  assert.equal(normalizeDomain('https://WWW.Google.COM/login'), 'google.com')
  assert.equal(normalizeDomain('http://x.com/'), 'x.com')
  assert.equal(normalizeDomain('.facebook.com'), 'facebook.com')
  assert.equal(normalizeDomain('  GITHUB.COM  '), 'github.com')
})

test('isValidDomain accepts hostnames, rejects garbage', () => {
  assert.ok(isValidDomain('google.com'))
  assert.ok(isValidDomain('sub.domain.co.uk'))
  assert.ok(!isValidDomain(''))
  assert.ok(!isValidDomain('javascript:alert(1)'))
  assert.ok(!isValidDomain('a'))
  assert.ok(!isValidDomain('has space.com'))
  assert.ok(!isValidDomain('x.com<script>'))
})

test('baseDomain keeps eTLD+1, multi-label suffixes keep three labels', () => {
  assert.equal(baseDomain('accounts.google.com'), 'google.com')
  assert.equal(baseDomain('www.example.co.uk'), 'example.co.uk')
  assert.equal(baseDomain('google.in'), 'google.in')
  assert.equal(baseDomain('a.b.c'), 'b.c')
})

test('canonicalAccountDomain collapses one-company domains', () => {
  assert.equal(canonicalAccountDomain('google.com'), 'google.com')
  assert.equal(canonicalAccountDomain('google.in'), 'google.com')
  assert.equal(canonicalAccountDomain('www.googlr.com'), 'google.com')
  assert.equal(canonicalAccountDomain('accounts.google.co.in'), 'google.com')
  assert.equal(canonicalAccountDomain('twitter.com'), 'twitter.com')
})

test('collectIncidentDomains only keeps domain-like sources', () => {
  const events = [
    { source: 'google.com' },
    { source: '203.0.113.5' },
    { source: undefined },
    { source: 'device-fingerprint-hash' },
    { source: 'facebook.com' },
  ]
  const domains = collectIncidentDomains(events.map(e => e.source))
  assert.deepEqual(domains, ['google.com', 'facebook.com'])
})