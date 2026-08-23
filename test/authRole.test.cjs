const test = require('node:test')
const assert = require('node:assert/strict')

const { classifyAuthRole, classifyPasswordInput } = require('./build/src/utils/authRole.js')
const { classifyAuthFromForm } = require('./build/src/utils/authRole.js')

// --- classifyPasswordInput: bare password inputs without a <form> wrapper ---

test('classifyPasswordInput: current-password => login', () => {
  assert.equal(classifyPasswordInput({ autocomplete: 'current-password', contextText: '', hasUsernameField: false, path: '/' }), 'login')
})

test('classifyPasswordInput: new-password + email sibling => signup', () => {
  assert.equal(classifyPasswordInput({ autocomplete: 'new-password', contextText: '', hasUsernameField: true, path: '/signup' }), 'signup')
})

test('classifyPasswordInput: new-password without username => null (reset form)', () => {
  assert.equal(classifyPasswordInput({ autocomplete: 'new-password', contextText: 'Reset password', hasUsernameField: false, path: '/reset' }), null)
})

test('classifyPasswordInput: Create account button nearby => signup', () => {
  assert.equal(classifyPasswordInput({ autocomplete: '', contextText: 'Create account Join free', hasUsernameField: true, path: '/' }), 'signup')
})

test('classifyPasswordInput: signup text but no username field => null', () => {
  assert.equal(classifyPasswordInput({ autocomplete: '', contextText: 'Sign up for our newsletter list', hasUsernameField: false, path: '/' }), null)
})

test('classifyPasswordInput: login path fallback => login', () => {
  assert.equal(classifyPasswordInput({ autocomplete: '', contextText: '', hasUsernameField: false, path: '/users/sign_in' }), 'login')
})

test('classifyPasswordInput: settings page stays null', () => {
  assert.equal(classifyPasswordInput({ autocomplete: '', contextText: 'Change your password', hasUsernameField: false, path: '/settings/security' }), null)
})

test('classifies signup forms', () => {
  assert.equal(classifyAuthRole('Create your account Sign up'), 'signup')
  assert.equal(classifyAuthRole('Register now'), 'signup')
  assert.equal(classifyAuthRole('Join and get started today'), 'signup')
  assert.equal(classifyAuthRole('Create account'), 'signup')
})

test('classifies login forms', () => {
  assert.equal(classifyAuthRole('Sign in to your account'), 'login')
  assert.equal(classifyAuthRole('Log in'), 'login')
  assert.equal(classifyAuthRole('Welcome back, please login'), 'login')
})

test('unrelated text is null', () => {
  assert.equal(classifyAuthRole('Search for flights and hotels'), null)
  assert.equal(classifyAuthRole(''), null)
})

test('signup wins when both signals are present', () => {
  assert.equal(classifyAuthRole('Sign in or create an account'), 'signup')
  assert.equal(classifyAuthRole('Login / Register'), 'signup')
})

test('password change/reset forms are null (not login/signup)', () => {
  assert.equal(classifyAuthRole('Change your password'), null)
  assert.equal(classifyAuthRole('Reset password'), null)
  assert.equal(classifyAuthRole('New password'), null)
  assert.equal(classifyAuthRole('Enter your current password'), null)
})

test('form with password but no login/signup keywords is null', () => {
  assert.equal(classifyAuthRole('Enter a password to continue'), null)
  assert.equal(classifyAuthRole('Password settings'), null)
})

test('login + password is still classified as login', () => {
  assert.equal(classifyAuthRole('Login to your account password'), 'login')
})

test('signup + password is still classified as signup', () => {
  assert.equal(classifyAuthRole('Create account password'), 'signup')
})

// --- classifyAuthFromForm tests (stricter content-script detection) ---

test('classifyAuthFromForm: autocomplete current-password => login', () => {
  assert.equal(classifyAuthFromForm({ buttonText: '', formAction: '', autocomplete: 'current-password', hasUsernameField: false }), 'login')
})

  test('classifyAuthFromForm: autocomplete new-password WITH username field => signup', () => {
  assert.equal(classifyAuthFromForm({ buttonText: '', formAction: '', autocomplete: 'new-password', hasUsernameField: true }), 'signup')
})

test('classifyAuthFromForm: autocomplete new-password WITHOUT username field => null (not signup)', () => {
  // new-password without username could be a password-reset form, not a real signup
  assert.equal(classifyAuthFromForm({ buttonText: 'Reset password', formAction: '/reset', autocomplete: 'new-password', hasUsernameField: false }), null)
})

test('classifyAuthFromForm: autocomplete new-password on a real signup form (has username) => signup', () => {
  assert.equal(classifyAuthFromForm({ buttonText: 'Create account', formAction: '/signup', autocomplete: 'new-password', hasUsernameField: true }), 'signup')
})

test('classifyAuthFromForm: button text + username field => login', () => {
  assert.equal(classifyAuthFromForm({ buttonText: 'Sign in', formAction: '', autocomplete: '', hasUsernameField: true }), 'login')
})

test('classifyAuthFromForm: button text + username field => signup', () => {
  assert.equal(classifyAuthFromForm({ buttonText: 'Create account', formAction: '', autocomplete: '', hasUsernameField: true }), 'signup')
})

test('classifyAuthFromForm: form action /login with username field => login', () => {
  assert.equal(classifyAuthFromForm({ buttonText: '', formAction: 'https://example.com/login', autocomplete: '', hasUsernameField: true }), 'login')
})

test('classifyAuthFromForm: form action /register with username field => signup', () => {
  assert.equal(classifyAuthFromForm({ buttonText: '', formAction: 'https://example.com/register', autocomplete: '', hasUsernameField: true }), 'signup')
})

 test('classifyAuthFromForm: password-only form (no username field) with "Sign in" submit button => login', () => {
  // Fixed: "Sign in" on a SUBMIT button (not a link in form text) is a real signal.
  // The old false-positive case was form.textContent capturing "Sign in" links;
  // getFormSignals now only reads submit buttons, so this is safe.
  assert.equal(classifyAuthFromForm({ buttonText: 'Sign in', formAction: '', autocomplete: '', hasUsernameField: false }), 'login')
 })

test('classifyAuthFromForm: newsletter form with password field, no username => null', () => {
  assert.equal(classifyAuthFromForm({ buttonText: 'Subscribe', formAction: '/subscribe', autocomplete: '', hasUsernameField: false }), null)
})

 test('classifyAuthFromForm: password reset form with new-password autocomplete, no username => null', () => {
  // new-password without username field could be a password-reset form; we don't classify as signup
  assert.equal(classifyAuthFromForm({ buttonText: 'Reset password', formAction: '/reset', autocomplete: 'new-password', hasUsernameField: false }), null)
})

test('classifyAuthFromForm: empty signals => null', () => {
  assert.equal(classifyAuthFromForm({ buttonText: '', formAction: '', autocomplete: '', hasUsernameField: false }), null)
})

 test('classifyAuthFromForm: submit button with auth keyword, no username field, no autocomplete => login', () => {
  // A submit button saying "Login" is a valid signal — it's not a link in page text.
  assert.equal(classifyAuthFromForm({ buttonText: 'Login', formAction: '', autocomplete: '', hasUsernameField: false }), 'login')
 })

test('classifyAuthFromForm: both login and signup keywords in button text, has username, no autocomplete => signup', () => {
  assert.equal(classifyAuthFromForm({ buttonText: 'Sign in or Create account', formAction: '', autocomplete: '', hasUsernameField: true }), 'signup')
})

test('classifyAuthFromForm: signup button text but NO username field => null (prevents false positives)', () => {
  // A "Create account" button on a form without username/email field is likely
  // not a real signup form (e.g., a page with a password field and a link button)
  assert.equal(classifyAuthFromForm({ buttonText: 'Create account', formAction: '', autocomplete: '', hasUsernameField: false }), null)
})

test('classifyAuthFromForm: form action /register WITHOUT username field => null', () => {
  // Signup form action without username field is not a real signup form
  assert.equal(classifyAuthFromForm({ buttonText: '', formAction: 'https://example.com/register', autocomplete: '', hasUsernameField: false }), null)
})

test('classifyAuthFromForm: login with no username field still works (two-step login)', () => {
  // A password-only form with "Sign in" is a valid login (Google two-step)
  assert.equal(classifyAuthFromForm({ buttonText: 'Sign in', formAction: '', autocomplete: '', hasUsernameField: false }), 'login')
})
