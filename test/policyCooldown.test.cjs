const test = require('node:test')
const assert = require('node:assert/strict')

// crypto.randomUUID for older Node
if (typeof globalThis.crypto?.randomUUID !== 'function') {
  Object.defineProperty(globalThis, 'crypto', { value: require('node:crypto').webcrypto, configurable: true })
}

// In-memory chrome mock — MUST be installed before requiring background modules.
// Both local (state) and session (cooldowns) areas need implementations.
const localStore = new Map()
const sessionStore = new Map()
const readKeys = (keys, store) => {
  const all = Object.fromEntries(store)
  if (keys == null) return all
  if (typeof keys === 'string') return keys in all ? { [keys]: all[keys] } : {}
  const out = {}
  for (const k of [].concat(keys)) if (k in all) out[k] = all[k]
  return out
}
globalThis.chrome = {
  runtime: { sendMessage: async () => {} },
  storage: {
    local: {
      get: async (keys) => readKeys(keys, localStore),
      set: async (objs) => { for (const [k, v] of Object.entries(objs)) localStore.set(k, v) },
      remove: async (keys) => { for (const k of [].concat(keys)) localStore.delete(k) },
    },
    session: {
      get: async (keys) => readKeys(keys, sessionStore),
      set: async (objs) => { for (const [k, v] of Object.entries(objs)) sessionStore.set(k, v) },
      remove: async (keys) => { for (const k of [].concat(keys)) sessionStore.delete(k) },
    },
  },
}

const POLICY_MONITOR = './build/src/background/monitors/policyMonitor.js'

// Simulated MV3 service-worker restart: the module is reloaded with empty
// in-memory Maps, exactly as a freshly-woken worker would see them.
function freshPolicyMonitor() {
  delete require.cache[require.resolve(POLICY_MONITOR)]
  return require(POLICY_MONITOR)
}

const REAL_POLICY = `We respect your privacy. This privacy policy explains how we collect, use and share your
personal information. When you visit our services we may collect your name, email address and
usage data. We use cookies to improve your experience. You may delete your account at any time by
contacting our data protection officer. We implement industry standard encryption (TLS) and take
security measures including access control. We do not sell your personal data to third parties.
Data retention: we keep your information only as long as necessary. Your rights include data
portability, the right to object to processing, and the right to withdraw consent. Please contact
support if you have any questions. This policy may change from time to time and we will notify
you of material changes. `.repeat(15)

test('a live cooldown in session storage blocks re-analysis right after a worker restart', async () => {
  sessionStore.clear()
  // The user visited ex.com earlier; the cooldown was persisted, then the SW
  // was suspended. A memory-only map would have lost this and re-scraped.
  sessionStore.set('policyCooldowns', { domains: { 'ex.com': Date.now() }, attempts: {} })
  const pm = freshPolicyMonitor()
  const result = await pm.handlePolicyText('ex.com', 'https://ex.com/privacy', REAL_POLICY, false)
  assert.equal(result, false, 'a domain with a live cooldown must not be re-analyzed')
  // The restart must not leave the cooldown "still loading" — a second call
  // within the same cooldown also refuses.
  assert.equal(await pm.handlePolicyText('ex.com', 'https://ex.com/privacy', REAL_POLICY, false), false)
})

test('a domain never analyzed before still analyzes normally after a restart', async () => {
  sessionStore.clear()
  const pm = freshPolicyMonitor()
  const result = await pm.handlePolicyText('never.example', 'https://never.example/privacy', REAL_POLICY, false)
  assert.equal(result, true, 'a fresh domain must analyze')
})

test('an expired cooldown is not replayed from session storage', async () => {
  sessionStore.clear()
  sessionStore.set('policyCooldowns', { domains: { 'old.example': Date.now() - 10 * 60 * 1000 }, attempts: {} })
  const pm = freshPolicyMonitor()
  const result = await pm.handlePolicyText('old.example', 'https://old.example/privacy', REAL_POLICY, false)
  assert.equal(result, true, 'an expired cooldown must not block analysis')
})

test('clearAnalysisHistory persists the wipe across a restart', async () => {
  sessionStore.clear()
  sessionStore.set('policyCooldowns', { domains: { 'ex.com': Date.now() }, attempts: {} })
  let pm = freshPolicyMonitor()
  await pm.clearAnalysisHistory('ex.com')
  // Restart again — the wipe must have been persisted, so the explicit
  // "analyze again" is not blocked by the old cooldown.
  pm = freshPolicyMonitor()
  const result = await pm.handlePolicyText('ex.com', 'https://ex.com/privacy', REAL_POLICY, false)
  assert.equal(result, true, 'an explicitly cleared cooldown must not block the retry')
})