import { RiskEvent, AccountSite, AccountAuthRole } from '../../types'
import { addCategoryEvent, hasRecentCategoryEvent, mutateSecurityState, removeCategoryEvents } from '../storage'
import { recalculateCategoryScore } from '../engine'
import { normalizeDomain, isValidDomain, canonicalAccountDomain, inferAccountName } from '../../utils/domain'

// Verification semantics (accuracy rules):
// - Seeing a login/signup FORM proves nothing — recordAuthFormSeen only
//   refreshes the role hint on already-tracked accounts and never verifies.
// - A logout control on the site or a successful password-form submit
//   (ACCOUNT_LOGGED_IN) IS proof of a session → recordAccountAuth verifies.
// - Manual adds stay "unverified" until real login evidence arrives.

// Real security-checkup pages for major providers; everything else falls
// back to the site root.
const SECURITY_URLS: Record<string, string> = {
  'google.com': 'https://myaccount.google.com/security-checkup',
  'facebook.com': 'https://www.facebook.com/settings?tab=security',
  'instagram.com': 'https://www.instagram.com/accounts/password/change/',
  'github.com': 'https://github.com/settings/security',
  'x.com': 'https://x.com/settings/account',
  'microsoft.com': 'https://account.microsoft.com/security',
  'apple.com': 'https://account.apple.com/account/manage',
  'reddit.com': 'https://www.reddit.com/settings/',
  'linkedin.com': 'https://www.linkedin.com/my-network/',
  'amazon.com': 'https://www.amazon.com/ap/cvf',
  'netflix.com': 'https://www.netflix.com/account/getextra',
  'spotify.com': 'https://www.spotify.com/account/security/',
  'discord.com': 'https://discord.com/channels/@me',
  'tiktok.com': 'https://www.tiktok.com/profile',
  'paypal.com': 'https://www.paypal.com/myaccount/security/',
}

function securityUrlFor(canonical: string): string {
  return SECURITY_URLS[canonical] || `https://${canonical}`
}

// The popup debounce-refreshes on this — without it account changes only
// appear after reopening the popup.
function broadcastStateUpdated(): void {
  chrome.runtime.sendMessage({ type: 'STATE_UPDATED' }).catch(() => {})
}

// Per-canonical in-memory dedupe for login_activity events (see
// recordAccountAuth) — advisory, resets with the service worker.
const lastAuthEventAt = new Map<string, number>()

export async function recordAccountAuth(domain: string, role: AccountAuthRole): Promise<void> {
  try {
    const canonical = canonicalAccountDomain(normalizeDomain(domain))
    if (!isValidDomain(canonical)) return
    const now = Date.now()

    // Atomic read-modify-write under the storage mutex — two tabs logging in
    // concurrently must not lose each other's updates.
    let account!: AccountSite
    await mutateSecurityState(state => {
      const accounts = state.accounts || []
      const idx = accounts.findIndex(a => a.domain === canonical)
      if (idx >= 0) {
        account = { ...accounts[idx], role, lastAuthAt: now, lastActive: now, hasSession: true, status: 'verified' }
        accounts[idx] = account
      } else {
        // Real login evidence on an unknown site — track it. Also clear any
        // stale dismissal (the user is demonstrably using this account again).
        account = {
          domain: canonical,
          name: inferAccountName(canonical),
          status: 'verified',
          securityUrl: securityUrlFor(canonical),
          loginActivityUrl: `https://${canonical}/account`,
          lastChecked: now,
          hasSession: true,
          role,
          lastAuthAt: now,
          lastActive: now,
        }
        accounts.push(account)
      }
      state.accounts = accounts
      if (state.dismissedAccounts?.includes(canonical)) {
        state.dismissedAccounts = state.dismissedAccounts.filter(d => d !== canonical)
      }
    })
    broadcastStateUpdated()

    const dup = await hasRecentCategoryEvent('accounts', e => e.type === 'login_activity' && e.source === canonical, 60000)
    // Advisory second gate set synchronously: two near-simultaneous logins
    // could both pass the storage-backed dedupe above before either's event
    // row exists.
    if (!dup && Date.now() - (lastAuthEventAt.get(canonical) || 0) < 60000) return
    lastAuthEventAt.set(canonical, Date.now())
    if (dup) return
    const event: RiskEvent = {
      id: crypto.randomUUID(),
      type: 'login_activity',
      category: 'accounts',
      severity: 'low',
      title: role === 'signup' ? `Account created: ${account.name}` : `Signed in to ${account.name}`,
      description: role === 'signup' ? `New account created on ${canonical}` : `Login detected on ${canonical}`,
      source: canonical,
      timestamp: now,
      acknowledged: false,
    }
    await addCategoryEvent('accounts', event)
    await recalculateCategoryScore('accounts')
    broadcastStateUpdated()
  } catch (e) {
    console.error('recordAccountAuth failed:', e)
  }
}

// A login/signup form was SEEN on an already-tracked account. This is weak
// evidence: never verify, never set hasSession/lastActive, never auto-add
// unknown sites (that used to mark every visited login page as an account).
export async function recordAuthFormSeen(domain: string, role: AccountAuthRole): Promise<void> {
  try {
    const canonical = canonicalAccountDomain(normalizeDomain(domain))
    if (!isValidDomain(canonical)) return
    await mutateSecurityState(state => {
      const accounts = state.accounts || []
      const idx = accounts.findIndex(a => a.domain === canonical)
      if (idx < 0) return // unknown or dismissed site — ignore entirely
      const acc = accounts[idx]
      accounts[idx] = {
        ...acc,
        role: acc.status === 'verified' ? acc.role : role,
        lastChecked: Date.now(),
      }
      state.accounts = accounts
    })
    broadcastStateUpdated()
  } catch (e) {
    console.error('recordAuthFormSeen failed:', e)
  }
}

export { normalizeDomain, isValidDomain } from '../../utils/domain'

export async function handleAddAccount(domain: string, name: string): Promise<void> {
  const cleanDomain = normalizeDomain(domain)
  if (!isValidDomain(cleanDomain)) {
    throw new Error(`Invalid domain: "${domain}"`)
  }
  const canonical = canonicalAccountDomain(cleanDomain)
  // Single atomic mutation: dedupe + add + clear any stale dismissal so the
  // re-added account can be verified again later.
  await mutateSecurityState(state => {
    const accounts = state.accounts || []
    if (accounts.some(a => a.domain === canonical)) return
    accounts.push({
      domain: canonical,
      name,
      status: 'unverified',
      securityUrl: securityUrlFor(canonical),
      loginActivityUrl: `https://${canonical}/account`,
      lastChecked: 0, // 0 → not throttled
      hasSession: false,
    })
    state.accounts = accounts
    if (state.dismissedAccounts?.includes(canonical)) {
      state.dismissedAccounts = state.dismissedAccounts.filter(d => d !== canonical)
    }
  })
  await recalculateCategoryScore('accounts')
  broadcastStateUpdated()
}

export async function handleRemoveAccount(domain: string): Promise<void> {
  // Stored domains are canonicalized — canonicalize the request too, or
  // "accounts.google.com" would fail to remove the tracked "google.com".
  const clean = canonicalAccountDomain(normalizeDomain(domain))
  // Atomic under the write mutex: a raw loadState/saveState here raced
  // queued writers whenever stateCache was stale (failed save, SW restart).
  await mutateSecurityState(state => {
    state.accounts = (state.accounts || []).filter(a => a.domain !== clean)
    const dismissed = new Set(state.dismissedAccounts || [])
    dismissed.add(clean)
    state.dismissedAccounts = [...dismissed]
  })
  // removeCategoryEvents clears both the category feed and eventHistory
  // under the same mutex (SecurityState itself has no eventHistory field).
  await removeCategoryEvents('accounts', e => e.type === 'login_activity' && e.source === clean)
  await recalculateCategoryScore('accounts')
  broadcastStateUpdated()
}
