const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const { classifyAuthFromForm } = require('./build/src/utils/authRole.js')

const accountMonitorSrc = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'background', 'monitors', 'accountMonitor.ts'),
  'utf8'
)

const backgroundSrc = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'background', 'index.ts'),
  'utf8'
)

test('classifyAuthFromForm: login without username still detected (two-step login)', () => {
  assert.equal(classifyAuthFromForm({
    buttonText: 'Sign in', formAction: '', autocomplete: '', hasUsernameField: false
  }), 'login')
})

test('classifyAuthFromForm: signup always requires username field', () => {
  assert.equal(classifyAuthFromForm({
    buttonText: 'Create account', formAction: '/signup', autocomplete: 'new-password', hasUsernameField: false
  }), null)

  assert.equal(classifyAuthFromForm({
    buttonText: 'Create account', formAction: '/signup', autocomplete: 'new-password', hasUsernameField: true
  }), 'signup')
})

test('classifyAuthFromForm: current-password always means login (even without username)', () => {
  assert.equal(classifyAuthFromForm({
    buttonText: '', formAction: '', autocomplete: 'current-password', hasUsernameField: false
  }), 'login')
})

test('classifyAuthFromForm: signup button on no-username form => null (Pinterest case)', () => {
  assert.equal(classifyAuthFromForm({
    buttonText: 'Create account', formAction: '', autocomplete: '', hasUsernameField: false
  }), null)
})

test('handleRemoveAccount marks domain as previously tracked (dismissed.add)', () => {
  // When an account is removed, the domain is added to dismissedAccounts
  // so ACCOUNT_LOGGED_IN can re-create it if the user logs in again.
  assert.ok(
    accountMonitorSrc.includes('dismissed.add(clean)'),
    'handleRemoveAccount must call dismissed.add(clean) to mark as previously tracked'
  )
})

test('recordAccountAuth has NO dismissedAccounts gate (always creates accounts)', () => {
  // recordAccountAuth should NOT block creation when dismissedAccounts has the domain.
  // Form detection should always re-create accounts so users can re-login after removal.
  assert.ok(
    !accountMonitorSrc.includes('if (!force && dismissed.has'),
    'recordAccountAuth must NOT have a force-gated dismissedAccounts check'
  )
  // But it should still clear dismissedAccounts as a side-effect cleanup
  assert.ok(
    accountMonitorSrc.includes('dismissed.delete(canonical)') ||
      accountMonitorSrc.includes("dismissedAccounts.filter(d => d !== canonical)"),
    'recordAccountAuth must clear dismissedAccounts when creating accounts'
  )
})

test('ACCOUNT_LOGGED_IN handler re-creates previously-removed accounts', () => {
  // Only the logout-link path (ACCOUNT_LOGGED_IN) checks dismissedAccounts —
  // it re-creates accounts only if the domain was previously tracked.
  assert.ok(
    backgroundSrc.includes('dismissed.has(canonical)'),
    'ACCOUNT_LOGGED_IN must check dismissedAccounts for re-creation'
  )
  assert.ok(
    !/\bif\s*\(\s*!acc\s*\)\s*\{?\s*sendResponse\(\{success:false\}\);?\s*return/.test(backgroundSrc),
    'ACCOUNT_LOGGED_IN must NOT block re-creation — must allow account re-creation after removal'
  )
})

test('removeAccount does NOT trigger content script re-scan (prevents immediate re-creation)', () => {
  // If removeAccount sends SCAN_PASSWORD_FORMS, the content script re-scans
  // the current page, detects the same login form, and immediately re-creates
  // the account — defeating the removal.
  const hookSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'popup', 'hooks', 'useSecurityEngine.ts'), 'utf8'
  )
  const removeSnippet = hookSrc.slice(
    hookSrc.indexOf('const removeAccount = useCallback'),
    hookSrc.indexOf('}, [refresh])', hookSrc.indexOf('const removeAccount'))
  )
  assert.ok(
    !removeSnippet.includes('SCAN_PASSWORD_FORMS'),
    'removeAccount must NOT send SCAN_PASSWORD_FORMS — this causes the account to reappear immediately'
  )
})

test('SCAN_PASSWORD_FORMS handler resets pageAuthRole cache before re-scanning', () => {
  const contentSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'content', 'index.ts'), 'utf8'
  )
  const line = contentSrc.split('\n').find(l => l.includes('SCAN_PASSWORD_FORMS'))
  assert.ok(line, 'SCAN_PASSWORD_FORMS handler must exist')
  const resetIdx = line.indexOf('resetAuthState()')
  const detectIdx = line.indexOf('detectPasswordForms()')
  assert.ok(resetIdx >= 0, 'SCAN_PASSWORD_FORMS must call resetAuthState()')
  assert.ok(detectIdx > resetIdx, 'resetAuthState() must execute BEFORE detectPasswordForms()')
})
