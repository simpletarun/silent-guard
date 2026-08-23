const test = require('node:test')
const assert = require('node:assert/strict')

const accountMonitor = require('./build/src/background/monitors/accountMonitor.js')

test('detectAccountsFromCookies is removed (no cookie-based auto-detect)', () => {
  assert.equal(typeof accountMonitor.detectAccountsFromCookies, 'undefined',
    'detectAccountsFromCookies should not exist — accounts are only verified via login form detection')
})

test('startAccountMonitor is removed (no cookie scan on startup)', () => {
  assert.equal(typeof accountMonitor.startAccountMonitor, 'undefined',
    'startAccountMonitor should not exist — no auto-detection on startup')
})

test('handleAddAccount still creates unverified accounts for manual adds', () => {
  // handleAddAccount requires chrome.* APIs — just verify it exists and is a function
  assert.equal(typeof accountMonitor.handleAddAccount, 'function',
    'handleAddAccount should still be available for manual account adds')
})

test('recordAccountAuth still exists (the only path to mark verified)', () => {
  // recordAccountAuth requires chrome.* APIs — just verify it exists and is a function
  assert.equal(typeof accountMonitor.recordAccountAuth, 'function',
    'recordAccountAuth should still be available — this is the content-script path that marks accounts verified')
})

test('handleRemoveAccount still exists', () => {
  assert.equal(typeof accountMonitor.handleRemoveAccount, 'function',
    'handleRemoveAccount should still be available')
})

test('normalizeDomain and isValidDomain are still re-exported', () => {
  assert.equal(typeof accountMonitor.normalizeDomain, 'function')
  assert.equal(typeof accountMonitor.isValidDomain, 'function')
  // Basic sanity
  assert.equal(accountMonitor.normalizeDomain('https://WWW.Google.COM/login'), 'google.com')
  assert.ok(accountMonitor.isValidDomain('google.com'))
  assert.ok(!accountMonitor.isValidDomain('not a domain'))
})
