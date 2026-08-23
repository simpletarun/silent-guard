// [-\s_]? covers "sign up", "sign-up" AND Rails/Devise's "sign_up".
const LOGIN_RE = /\b(sign[-\s_]?in|log[-\s_]?in|login|welcome\s+back|returning)\b/i
const SIGNUP_RE = /\b(sign[-\s_]?up|create\s+(an?\s+)?account|register|join|get\s+started|start\s+free)\b/i

export function classifyAuthRole(text: string): 'login' | 'signup' | null {
  const signup = SIGNUP_RE.test(text)
  if (signup && !LOGIN_RE.test(text)) return 'signup'
  if (LOGIN_RE.test(text) && !signup) return 'login'
  return signup ? 'signup' : null
}

const AUTH_ACTION_RE = /\/(login|signin|signup|register|sign-up|sign-in|create-?account|join|new-?account)(\b|\/|$)/i
export const USERNAME_INPUT_SELECTORS = 'input[type="email"], input[name*="user" i], input[name*="email" i], input[id*="user" i], input[id*="email" i]'

// Known autocomplete values that signal auth forms
const LOGIN_AUTOCOMPLETE = ['current-password', 'username', 'email']
const SIGNUP_AUTOCOMPLETE = ['new-password']

interface FormAuthSignals {
  buttonText: string
  formAction: string
  autocomplete: string
  hasUsernameField: boolean
}

export function classifyAuthFromForm(signals: FormAuthSignals): 'login' | 'signup' | null {
  const { buttonText, formAction, autocomplete, hasUsernameField } = signals

  // Strongest signal: the password field's autocomplete attribute
  // current-password = definite login (works for two-step logins like Google)
  if (LOGIN_AUTOCOMPLETE.includes(autocomplete)) return 'login'

  // new-password = signup, but requires a username field too — password-reset
  // forms also use new-password, so we need the extra check.
  if (SIGNUP_AUTOCOMPLETE.includes(autocomplete)) {
    return hasUsernameField ? 'signup' : null
  }

  // Build targeted text — button text + form action only, NOT all form text.
  // Using all form text caused false positives: a newsletter form with a
  // "Sign in" link in the page layout would classify as login.
  const targetedText = `${buttonText} ${formAction}`
  const role = classifyAuthRole(targetedText)

  // If the text alone can't decide, fall back to form action path
  if (!role && AUTH_ACTION_RE.test(formAction)) {
    if (LOGIN_RE.test(formAction)) return 'login'
    if (SIGNUP_RE.test(formAction)) return hasUsernameField ? 'signup' : null
  }

  // Signup via text requires a username field too — prevents false positives
  // from forms that merely mention "Sign in" in a sidebar link or button.
  if (role === 'signup' && !hasUsernameField) return null

  return role
}

export function hasUsernameField(form: HTMLFormElement): boolean {
  return Boolean(form.querySelector(USERNAME_INPUT_SELECTORS))
}

// --- Formless password inputs ----------------------------------------------
// Google, X and most SPAs render bare `input[type=password]` with NO <form>
// wrapper — the form-based classifier never sees them.

export interface PasswordInputSignals {
  autocomplete: string
  contextText: string
  hasUsernameField: boolean
  path: string
}

// Same evidence ladder as classifyAuthFromForm: autocomplete > nearby
// button/heading text > URL path. Signup still requires a username-ish field
// in the surrounding container.
export function classifyPasswordInput(signals: PasswordInputSignals): 'login' | 'signup' | null {
  const { autocomplete, contextText, hasUsernameField, path } = signals
  if ((LOGIN_AUTOCOMPLETE as string[]).includes(autocomplete)) return 'login'
  if ((SIGNUP_AUTOCOMPLETE as string[]).includes(autocomplete)) {
    return hasUsernameField ? 'signup' : null
  }
  const role = classifyAuthRole(`${contextText} ${path}`)
  if (!role && AUTH_ACTION_RE.test(path)) {
    if (LOGIN_RE.test(path)) return 'login'
    if (SIGNUP_RE.test(path)) return hasUsernameField ? 'signup' : null
  }
  if (role === 'signup' && !hasUsernameField) return null
  return role
}

export function getFormSignals(form: HTMLFormElement, passwordInput: HTMLInputElement): FormAuthSignals {
  const buttonText = Array.from(form.querySelectorAll('button[type="submit"], button, input[type="submit"]'))
    .map(b => (b as HTMLElement).textContent || (b as HTMLInputElement).value || '')
    .join(' ')
  const formAction = form.action || ''
  const autocomplete = passwordInput.getAttribute('autocomplete') || ''
  return { buttonText, formAction, autocomplete, hasUsernameField: hasUsernameField(form) }
}

// --- Logged-in detection ---------------------------------------------------
// A "Log out" control is the strongest client-side proof that a session
// exists. Matching must be precise: a blog article at /how-to-log-out must
// NOT mark the site as an account.

const LOGOUT_TEXT_RE = /\b(log[-\s]?out|log[-\s]?off|sign[-\s]?out)\b/i
const LOGOUT_CLASS_RE = /\b(logout|log_out|log-out|logoff|log-off|signout|sign_out|sign-out)\b/i
// Path-SEGMENT match only: "/users/sign_out" hits, "/how-to-log-out" and
// "/?ref=logout" do not.
const LOGOUT_PATH_RE = /\/(logout|log_out|log-out|logoff|log-off|signout|sign_out|sign-out)(\/|$)/i

export interface LogoutCandidate {
  text?: string
  className?: string
  href?: string // absolute URL; relative hrefs are resolved by the caller
}

// Returns the first candidate that proves a logged-in state, or null.
export function findLogoutIndicator(candidates: LogoutCandidate[], currentOrigin: string): LogoutCandidate | null {
  for (const c of candidates) {
    const text = (c.text || '').trim()
    // Real logout CONTROLS have short labels ("Log out"). Long text matching
    // the words is editorial content ("How to log out of every device") and
    // must not mark the site logged-in.
    if (text && text.length <= 30 && LOGOUT_TEXT_RE.test(text)) return c
    if (c.className && LOGOUT_CLASS_RE.test(c.className)) return c
    if (c.href) {
      try {
        const u = new URL(c.href)
        // Cross-origin logout links prove nothing about THIS site.
        if (u.origin === currentOrigin && LOGOUT_PATH_RE.test(u.pathname)) return c
      } catch { /* unparseable href — ignore */ }
    }
  }
  return null
}
