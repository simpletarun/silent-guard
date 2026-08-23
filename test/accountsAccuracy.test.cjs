const test = require('node:test')
const assert = require('node:assert/strict')

// crypto.randomUUID for older Node
if (typeof globalThis.crypto?.randomUUID !== 'function') {
  Object.defineProperty(globalThis, 'crypto', { value: require('node:crypto').webcrypto, configurable: true })
}

// In-memory chrome mock — MUST be installed before requiring background modules.
const store = new Map()
globalThis.chrome = {
  runtime: { sendMessage: async () => {} },
  storage: {
    local: {
      get: async (keys) => {
        const all = Object.fromEntries(store)
        if (keys == null) return all
        if (typeof keys === 'string') return keys in all ? { [keys]: all[keys] } : {}
        return {}
      },
      set: async (objs) => { for (const [k, v] of Object.entries(objs)) store.set(k, v) },
      remove: async (keys) => { for (const k of [].concat(keys)) store.delete(k) },
    },
  },
}

const { findLogoutIndicator } = require('./build/src/utils/authRole.js')
const { inferAccountName } = require('./build/src/utils/domain.js')
const accountMonitor = require('./build/src/background/monitors/accountMonitor.js')
const { loadState } = require('./build/src/background/storage.js')

const findAcc = async (domain) =>
  (await loadState()).securityState.accounts?.find(a => a.domain === domain)

// --- Pure helpers -----------------------------------------------------------

test('findLogoutIndicator: visible text is the strongest signal', () => {
  const hit = findLogoutIndicator([{ text: ' Log out ', href: '' }], 'https://ex.com')
  assert.ok(hit, 'text "Log out" should match')
})

test('findLogoutIndicator: button text and class names count', () => {
  assert.ok(findLogoutIndicator([{ text: 'Sign out' }], 'https://ex.com'))
  assert.ok(findLogoutIndicator([{ text: '', className: 'btn-logout js-signout' }], 'https://ex.com'))
})

test('findLogoutIndicator: same-origin logout PATH segment matches', () => {
  assert.ok(findLogoutIndicator(
    [{ text: '', href: 'https://ex.com/users/sign_out' }],
    'https://ex.com'
  ), '/users/sign_out should match')
})

test('findLogoutIndicator: cross-origin logout links prove nothing', () => {
  assert.equal(findLogoutIndicator(
    [{ text: '', href: 'https://evil.example/logout' }],
    'https://ex.com'
  ), null)
})

test('findLogoutIndicator: article URLs and query strings are NOT logout controls', () => {
  assert.equal(findLogoutIndicator(
    [{ text: '', href: 'https://ex.com/blog/how-to-log-out-properly' }],
    'https://ex.com'
  ), null, 'article path must not match')
  assert.equal(findLogoutIndicator(
    [{ text: '', href: 'https://ex.com/?ref=logout' }],
    'https://ex.com'
  ), null, 'query string must not match')
  assert.equal(findLogoutIndicator(
    [{ text: '', href: 'https://ex.com/logout-now' }],
    'https://ex.com'
  ), null, 'partial segment must not match')
})

test('inferAccountName derives a clean brand from canonical domains', () => {
  assert.equal(inferAccountName('google.com'), 'Google')
  assert.equal(inferAccountName('x.com'), 'X')
  assert.equal(inferAccountName('bbc.co.uk'), 'Bbc')
  assert.equal(inferAccountName(''), 'Unknown')
})

// --- Behavioral semantics (in-memory chrome.storage) ------------------------

test('manual add creates an UNVERIFIED account with real security URL', async () => {
  await accountMonitor.handleAddAccount('github.com', 'GitHub')
  const acc = await findAcc('github.com')
  assert.ok(acc, 'account stored under canonical domain')
  assert.equal(acc.status, 'unverified')
  assert.equal(acc.hasSession, false)
  assert.equal(acc.securityUrl, 'https://github.com/settings/security', 'known provider gets real security page')
})

test('seeing a login form NEVER verifies or fabricates a session', async () => {
  await accountMonitor.recordAuthFormSeen('gist.github.com', 'login')
  const acc = await findAcc('github.com')
  assert.ok(acc, 'tracked account still present')
  assert.equal(acc.status, 'unverified', 'form sighting must not verify')
  assert.equal(acc.hasSession, false, 'form sighting must not claim a session')
  assert.ok(acc.lastChecked > 0, 'role-hint refresh recorded')
})

test('form sighting on unknown/dismissed sites adds nothing', async () => {
  await accountMonitor.recordAuthFormSeen('totally-unknown-site-xyz.dev', 'login')
  assert.equal(await findAcc('totally-unknown-site-xyz.dev'), undefined,
    'a login form alone must never auto-create an account')
})

test('real login evidence verifies the account and logs an event', async () => {
  await accountMonitor.recordAccountAuth('github.com', 'login')
  const acc = await findAcc('github.com')
  assert.equal(acc.status, 'verified')
  assert.equal(acc.hasSession, true)
  assert.ok((acc.lastActive || 0) > 0)

  const cat = (await loadState()).securityState.categories.accounts
  assert.ok(cat.events.some(e => e.type === 'login_activity' && e.source === 'github.com'),
    'login_activity event recorded')
  assert.ok(typeof cat.score?.total === 'number' && cat.score.total >= 0 && cat.score.total <= 100,
    'category score recalculated into range')
})

test('every monitor pass stamps lastScan (the "Last checked" heartbeat)', async () => {
  // recordAccountAuth ends with recalculateCategoryScore, which must now
  // stamp lastScan — previously NO code path ever wrote it.
  const before = (await loadState()).securityState.categories.accounts.lastScan || 0
  await new Promise(r => setTimeout(r, 5))
  await accountMonitor.recordAuthFormSeen('github.com', 'login')
  // form-seen doesn't recalc; force a real pass via a login event
  await accountMonitor.handleAddAccount('example.org', 'Example')
  const after = (await loadState()).securityState.categories.accounts.lastScan || 0
  assert.ok(after > before, `lastScan must advance on monitor passes (${before} -> ${after})`)
})

test('removed accounts stay removed until REAL login evidence returns', async () => {
  await accountMonitor.handleRemoveAccount('github.com')
  let data = await loadState()
  assert.equal(data.securityState.accounts.find(a => a.domain === 'github.com'), undefined)
  assert.ok(data.securityState.dismissedAccounts.includes('github.com'))

  // Form sighting must NOT resurrect it…
  await accountMonitor.recordAuthFormSeen('github.com', 'login')
  assert.equal(await findAcc('github.com'), undefined, 'dismissed + form seen → still gone')

  // …but an actual session proof does, and cleans up the dismissal.
  await accountMonitor.recordAccountAuth('github.com', 'login')
  const acc = await findAcc('github.com')
  assert.ok(acc && acc.status === 'verified', 'real login re-adds the account')
  data = await loadState()
  assert.equal(data.securityState.dismissedAccounts.includes('github.com'), false,
    'stale dismissal cleared on resurrection')
})

test('remove canonicalizes subdomains (accounts.google.com removes google.com)', async () => {
  await accountMonitor.handleAddAccount('mail.google.com', 'Gmail')
  assert.ok(await findAcc('google.com'), 'subdomain stored under canonical google.com')

  await accountMonitor.handleRemoveAccount('accounts.google.com')
  assert.equal(await findAcc('google.com'), undefined,
    'removal by subdomain must hit the canonical entry')
})

test('manual re-add clears the stale dismissal', async () => {
  const data = await loadState()
  assert.ok(data.securityState.dismissedAccounts.includes('google.com'),
    'precondition: google.com was dismissed by previous removal')

  await accountMonitor.handleAddAccount('google.com', 'Google')
  const acc = await findAcc('google.com')
  assert.ok(acc && acc.status === 'unverified', 're-added manually')
  assert.equal((await loadState()).securityState.dismissedAccounts.includes('google.com'), false,
    'dismissal cleared so future verification can happen')
})
