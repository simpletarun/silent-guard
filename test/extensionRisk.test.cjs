const test = require('node:test')
const assert = require('node:assert/strict')

const { evaluateExtensionRisk } = require('./build/src/utils/extensionRisk.js')

function ext(perms = [], hostPerms = [], enabled = true) {
  return { id: 'x', name: 'X', version: '1.0', enabled, permissions: perms, hostPermissions: hostPerms }
}
const level = (perms, hostPerms) => evaluateExtensionRisk(ext(perms, hostPerms)).riskLevel

test('benign extension scores low', () => {
  assert.equal(level(['storage', 'activeTab']), 'low')
})

test('notifications alone never flags an extension', () => {
  const r = evaluateExtensionRisk(ext(['notifications']))
  assert.equal(r.riskLevel, 'low')
  assert.ok(r.reason.some(t => t.includes('notifications')), 'reason still explains it')
})

test('single sensitive permission flags medium (history was invisible before)', () => {
  assert.equal(level(['tabs']), 'medium')
  assert.equal(level(['history']), 'medium')
  assert.equal(level(['clipboardRead']), 'medium')
  assert.equal(level(['proxy']), 'medium')
})

test('debugger and nativeMessaging are critical — full takeover capability', () => {
  assert.equal(level(['debugger']), 'critical')
  assert.equal(level(['nativeMessaging']), 'critical')
})

test('all-urls combinations calibrate correctly', () => {
  assert.equal(level([], ['<all_urls>']), 'medium')
  assert.equal(level(['scripting'], ['<all_urls>']), 'high')
  assert.equal(level(['webRequest'], ['<all_urls>']), 'high')
  assert.equal(level(['cookies'], ['<all_urls>']), 'critical')
})

test('declarativeNetRequest rewrites requests like webRequest — same rung', () => {
  // MV3 ad blockers use rules instead of webRequest; capability is identical.
  assert.equal(level(['declarativeNetRequest'], ['<all_urls>']), 'high')
  assert.equal(level(['declarativeNetRequestWithHostAccess'], ['<all_urls>']), 'high')
  const r = evaluateExtensionRisk(ext(['declarativeNetRequest'], ['<all_urls>']))
  assert.ok(r.reason.some(t => t.includes('block or rewrite')), 'reason explains the capability')
})

test('http+https wildcard pair counts as all-urls', () => {
  assert.equal(level(['webRequest'], ['http://*/*', 'https://*/*']), 'high')
  assert.equal(level(['cookies'], ['http://*/*', 'https://*/*']), 'critical')
})

test('specific-site host permissions appear capped in the reason text', () => {
  const r = evaluateExtensionRisk(ext(['tabs'], ['https://a.com/*', 'https://b.com/*', 'https://c.com/*', 'https://d.com/*', 'https://e.com/*']))
  assert.match(r.reason.join(' '), /reads data on specific sites/)
  assert.ok(!r.reason.join(' ').includes('e.com'), 'host list is capped at 4')
})

test('disabled flag is preserved so events can mark it', () => {
  const r = evaluateExtensionRisk(ext(['tabs'], [], false))
  assert.equal(r.enabled, false)
})
