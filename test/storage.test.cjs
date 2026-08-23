const test = require('node:test')
const assert = require('node:assert/strict')

const { migrateState } = require('./build/src/background/storage.js')
const { DEFAULT_GLOBAL_SETTINGS } = require('./build/src/types/index.js')

test('migrateState fills defaults and version for legacy data', () => {
  const legacy = {
    securityState: { categories: {}, accounts: [] },
    settings: { monitorCookies: false },
    eventHistory: [],
  }
  const out = migrateState(legacy)
  assert.equal(out.dataVersion, 3)
  assert.equal(out.settings.monitorCookies, false, 'user value preserved')
  assert.equal(out.settings.monitorDns, DEFAULT_GLOBAL_SETTINGS.monitorDns, 'new key gets default')
  assert.equal(out.settings.autoKillSessions, false, 'defaults never enable destructive actions')
  assert.ok(out.securityState.categories.overview, 'categories backfilled')
  assert.ok(Array.isArray(out.securityState.accounts))
})

test('tracker blocking is fully removed from defaults', () => {
  for (const key of ['blockTrackers', 'trackerBlocklist', 'customBlockedDomains']) {
    assert.ok(!(key in DEFAULT_GLOBAL_SETTINGS), `${key} must not exist`)
  }
})

test('migrateState is idempotent', () => {
  const legacy = {
    securityState: { categories: {}, accounts: [{ domain: 'x.com', name: 'X', status: 'unverified', securityUrl: 'https://x.com', hasSession: true, lastChecked: 0 }] },
    settings: { monitorDns: false },
    eventHistory: [1],
  }
  const once = migrateState(legacy)
  const twice = migrateState(once)
  assert.deepEqual(twice.securityState, once.securityState)
  assert.equal(twice.settings.monitorDns, false)
  assert.equal(twice.securityState.accounts.length, 1)
})

test('migrateState never drops existing categories', () => {
  const out = migrateState({ securityState: {}, settings: {}, eventHistory: [] })
  const expected = ['overview', 'network', 'device', 'extensions', 'passwords', 'privacy', 'accounts', 'policy']
  for (const c of expected) assert.ok(out.securityState.categories[c], `category ${c} present`)
})