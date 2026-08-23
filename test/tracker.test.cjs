const test = require('node:test')
const assert = require('node:assert/strict')

const { TRACKER_DOMAINS_LIST, normalizeTrackerDomain } = require('./build/src/utils/trackerDomains.js')
const { getDownloadRiskExt, getDownloadDomain, evaluateDownloadRisk } = require('./build/src/background/monitors/downloadMonitor.js')

test('tracker list is sane', () => {
  const domains = TRACKER_DOMAINS_LIST
  assert.ok(domains.length >= 120, `expected >=120 domains, got ${domains.length}`)
  assert.equal(new Set(domains).size, domains.length, 'domains must be unique')
  for (const d of domains) {
    assert.ok(d.length > 0, 'no empty domain')
    assert.ok(!d.includes('://'), `domain must not contain scheme: ${d}`)
  }
})

test('tracker blocking was removed — detection only', () => {
  const td = require('./build/src/utils/trackerDomains.js')
  assert.equal(typeof td.getBlockableTrackerDomains, 'undefined', 'blocker getter must be gone')
})

test('normalizeTrackerDomain strips protocol/path', () => {
  assert.equal(normalizeTrackerDomain('https://doubleclick.net/path'), 'doubleclick.net')
  assert.equal(normalizeTrackerDomain('www.example.com'), 'www.example.com')
})

test('download extension extraction', () => {
  assert.equal(getDownloadRiskExt('setup.exe'), 'exe')
  assert.equal(getDownloadRiskExt('setup.exe?spam=1'), 'exe')
  assert.equal(getDownloadRiskExt('archive.tar.gz'), 'gz')
  assert.equal(getDownloadRiskExt('noextension'), '')
})

test('download domain extraction', () => {
  assert.equal(getDownloadDomain('https://www.github.com/x/y'), 'github.com')
  assert.equal(getDownloadDomain('not-a-url'), '')
})

test('risky executable from unknown domain is high risk', () => {
  const r = evaluateDownloadRisk('install.exe', 'https://suspicious.example/file.exe', false)
  assert.notEqual(r.riskLevel, 'low')
  assert.ok(r.reason.length > 0)
})

test('trusted domain defuses executable risk', () => {
  const r = evaluateDownloadRisk('install.exe', 'https://github.com/repo/file.exe', false)
  assert.equal(r.riskLevel, 'low')
})

test('trusted domain does NOT defuse a Chrome dangerous-download verdict', () => {
  const r = evaluateDownloadRisk('installer.exe', 'https://github.com/repo/installer.exe', true)
  assert.ok(r.riskLevel === 'high' || r.riskLevel === 'critical', `expected high/critical, got ${r.riskLevel}`)
})

test('insecure http escalates risk', () => {
  const plain = evaluateDownloadRisk('file.exe', 'https://cdn.host/file.exe', false)
  const insecure = evaluateDownloadRisk('file.exe', 'http://cdn.host/file.exe', false)
  const order = ['low', 'medium', 'high', 'critical']
  assert.ok(order.indexOf(insecure.riskLevel) > order.indexOf(plain.riskLevel), 'http should rank above https')
})

test('chrome-dangerous flag escalates to high/critical', () => {
  const r = evaluateDownloadRisk('file.exe', 'https://unknown.example/file.exe', true)
  assert.ok(r.riskLevel === 'high' || r.riskLevel === 'critical')
})