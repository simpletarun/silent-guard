const test = require('node:test')
const assert = require('node:assert/strict')

const { computeScore } = require('./build/src/background/engine.js')
const { createInitialState } = require('./build/src/types/index.js')

function stateWith(overrides) {
  const s = createInitialState()
  return { ...s, ...overrides }
}

test('privacy score: trackers reduce score', () => {
  const clean = computeScore('privacy', stateWith({ pageScans: [{ trackers: [], canvasAttempts: 0, audioAttempts: 0, beaconCalls: 0, suspiciousInlineScripts: 0, thirdPartyRequests: 0, totalCookies: 0, hasTrackingPixels: false, webRTCLeakDetected: false, fingerprintingAttempts: 0 }] }))
  const dirty = computeScore('privacy', stateWith({ pageScans: [{ trackers: [1, 2, 3, 4, 5, 6].map(i => ({ domain: `t${i}.x`, type: 'script' })), canvasAttempts: 0, audioAttempts: 0, beaconCalls: 0, suspiciousInlineScripts: 0, thirdPartyRequests: 0, totalCookies: 0, hasTrackingPixels: false, webRTCLeakDetected: false, fingerprintingAttempts: 0 }] }))
  assert.ok(dirty.total < clean.total, `expected dirty(${dirty.total}) < clean(${clean.total})`)
})

function scanWith(trackers) {
  return { url: 'https://s.com/', domain: 's.com', scannedAt: 0, trackers, fingerprintingAttempts: 0, canvasAttempts: 0, audioAttempts: 0, beaconCalls: 0, suspiciousInlineScripts: 0, thirdPartyRequests: 0, totalCookies: 0, hasTrackingPixels: false, webRTCLeakDetected: false }
}

test('privacy score: noise entries (GTM/inline self/pixel) do NOT count as trackers', () => {
  const noise = [
    { domain: 'googletagmanager.com', type: 'script' },
    { domain: 's.com', type: 'inline' },
    { domain: 'doubleclick.net', type: 'pixel' },
  ]
  const withNoise = computeScore('privacy', stateWith({ pageScans: [scanWith(noise)] }))
  const clean = computeScore('privacy', stateWith({ pageScans: [scanWith([])] }))
  assert.equal(withNoise.total, clean.total, 'noise must not penalize')
})

test('privacy score: tracker penalty grows gradually, not in a cliff', () => {
  const few = computeScore('privacy', stateWith({ pageScans: [scanWith([1, 2, 3, 4].map(i => ({ domain: `t${i}.x`, type: 'script' })))] }))
  const some = computeScore('privacy', stateWith({ pageScans: [scanWith([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(i => ({ domain: `t${i}.x`, type: 'script' })))] }))
  assert.ok(some.total < few.total, `12 trackers (${some.total}) must score below 4 (${few.total})`)
})

test('network score: stable ip raises score, frequent changes lower it', () => {
  const clean = computeScore('network', stateWith({ network: { publicIp: '1.2.3.4', isVpn: false, isProxy: false, isDoHEnabled: true, ipHistory: [], lastChecked: 0 } }))
  const churn = computeScore('network', stateWith({ network: { publicIp: '1.2.3.4', isVpn: true, isProxy: false, isDoHEnabled: false, ipHistory: [{ ip: '5.6.7.8', timestamp: Date.now() }, { ip: '9.9.9.9', timestamp: Date.now() }], lastChecked: 0 } }))
  assert.ok(churn.total < clean.total, `expected churn(${churn.total}) < clean(${clean.total})`)
})

test('scores stay within 0..100', () => {
  for (const cat of ['overview', 'network', 'device', 'extensions', 'passwords', 'privacy', 'accounts', 'policy']) {
    const s = computeScore(cat, stateWith({}))
    assert.ok(s.total >= 0 && s.total <= 100, `${cat} score ${s.total}`)
  }
})

test('device score: unresolved device alerts lower the score', () => {
  const clean = computeScore('device', stateWith({ categories: (() => { const s = createInitialState(); s.categories.device.events = []; return s.categories })() }))
  const alerted = computeScore('device', stateWith({
    categories: (() => { const s = createInitialState(); s.categories.device.events = [{ id: 'e1', type: 'sensor_access', category: 'device', severity: 'medium', title: 'sensor accessed', description: '', source: 'device', timestamp: Date.now(), acknowledged: false }]; return s.categories })(),
  }))
  assert.ok(alerted.total < clean.total, `expected alerted(${alerted.total}) < clean(${clean.total})`)
})

test('policy score: reports without a privacyScore do NOT drag the average to 0', () => {
  const mk = (privacyScore) => ({ domain: 'd.com', url: 'https://d.com', analyzedAt: Date.now(), riskLevel: 'safe', privacyScore, dangerousClauses: [], collectedData: [], thirdParties: [], recommendation: '' })
  const allScored = computeScore('policy', stateWith({ policyReports: [mk(90), mk(80)] }))
  const mixedUnscored = computeScore('policy', stateWith({ policyReports: [mk(90), mk(80), mk(undefined)] }))
  assert.equal(mixedUnscored.total, allScored.total, 'unscored report must be excluded from the average, not counted as 0')
})

test('policy score: one dangerous policy with clauses + unresolved alert cannot pin to 0', () => {
  // The old math stacked avg(-15) + dangerous(-20) + clauses(3x-5) + alert(-10)
  // = -60 against a +50 base — guaranteed 0 for any single bad policy.
  const mk = (privacyScore, riskLevel) => ({ domain: 'd.com', url: 'https://d.com', analyzedAt: Date.now(), riskLevel, privacyScore, dangerousClauses: [{ text: 'a', reason: 'r', severity: 'high' }, { text: 'b', reason: 'r', severity: 'high' }, { text: 'c', reason: 'r', severity: 'high' }], collectedData: [], thirdParties: [], recommendation: '' })
  const cats = createInitialState().categories
  cats.policy.events = [{ id: 'e1', type: 'policy_risk', category: 'policy', severity: 'high', title: 't', description: '', source: 'd.com', timestamp: Date.now(), acknowledged: false }]
  const worst = computeScore('policy', stateWith({ policyReports: [mk(35, 'dangerous')], categories: cats }))
  assert.ok(worst.total >= 20, `worst-case single bad policy scored ${worst.total}, expected >= 20`)
  const good = computeScore('policy', stateWith({ policyReports: [mk(90, 'safe')] }))
  assert.ok(good.total > worst.total, 'good policy must outscore the bad one')
})