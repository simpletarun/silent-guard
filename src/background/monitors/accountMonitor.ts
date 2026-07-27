import { RiskEvent, AccountSite } from '../../types'
import { addAccount, addCategoryEvent, getSecurityState, loadState, saveState, updateSecurityState } from '../storage'
import { recalculateCategoryScore } from '../engine'

const LOGIN_COOKIE_PATTERNS = ['session', 'token', 'auth', 'login', 'logged_in', 'user_id', 'wp-login', 'wordpress_logged']

export async function detectAccountsFromCookies(): Promise<void> {
  try {
    const allCookies = await chrome.cookies.getAll({})
    const domainsWithSession = new Set<string>()

    for (const cookie of allCookies) {
      const match = LOGIN_COOKIE_PATTERNS.some(p => cookie.name.toLowerCase().includes(p))
      if (match) {
        let domain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain
        if (domain.startsWith('.')) domain = domain.substring(1)
        domainsWithSession.add(domain)
      }
    }

    const state = await getSecurityState()
    const existingDomains = new Set((state.accounts || []).map(a => a.domain))
    const dismissed = new Set(state.dismissedAccounts || [])

    for (const domain of domainsWithSession) {
      if (!existingDomains.has(domain) && !dismissed.has(domain)) {
        const name = domain.split('.')[0]
        const nameCapitalized = name.charAt(0).toUpperCase() + name.slice(1)
        const account: AccountSite = {
          domain,
          name: nameCapitalized,
          status: 'unverified',
          securityUrl: `https://${domain}`,
          lastChecked: Date.now(),
          hasSession: true,
        }
        await addAccount(account)
        verifyAccount(domain)

        const event: RiskEvent = {
          id: crypto.randomUUID(),
          type: 'login_activity',
          category: 'accounts',
          severity: 'low',
          title: `New account detected: ${nameCapitalized}`,
          description: `Active session found for ${domain}`,
          source: domain,
          timestamp: Date.now(),
          acknowledged: false,
        }
        await addCategoryEvent('accounts', event)
      }
    }
  } catch (e) {
    console.error('Account detection failed:', e)
  }
}

export async function verifyAccount(domain: string): Promise<void> {
  try {
    let state = await getSecurityState()
    let accounts = state.accounts || []
    let idx = accounts.findIndex(a => a.domain === domain)
    if (idx < 0) return

    const prev = accounts[idx]

    const resp = await fetch(`https://${domain}`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(8000),
    }).catch(() => null)

    state = await getSecurityState()
    accounts = state.accounts || []
    idx = accounts.findIndex(a => a.domain === domain)
    if (idx < 0) return

    const updated = { ...prev }
    if (!resp) {
      updated.status = 'unverified'
    } else {
      const hsts = resp.headers.get('strict-transport-security')
      if ((resp.status === 200 || resp.status < 400) && hsts) {
        updated.status = 'verified'
      } else {
        updated.status = 'unverified'
      }
    }
    updated.lastChecked = Date.now()

    const next = [...accounts]
    next[idx] = updated
    await updateSecurityState({ accounts: next })
    await recalculateCategoryScore('accounts')
  } catch (e) {
    console.error('Account verification failed:', e)
  }
}

export async function checkAllAccounts(): Promise<void> {
  const state = await getSecurityState()
  const accounts = state.accounts || []
  for (const acc of accounts) {
    verifyAccount(acc.domain).catch(() => {})
  }
}

export function startAccountMonitor(): void {
  detectAccountsFromCookies()
}

export async function handleAddAccount(domain: string, name: string): Promise<void> {
  const account: AccountSite = {
    domain,
    name,
    status: 'unverified',
    securityUrl: `https://${domain}`,
    loginActivityUrl: `https://${domain}/account`,
    lastChecked: Date.now(),
    hasSession: false,
  }
  await addAccount(account)
  verifyAccount(domain).catch(() => {})
  await recalculateCategoryScore('accounts')
}

export async function handleRemoveAccount(domain: string): Promise<void> {
  const data = await loadState()
  data.securityState.accounts = (data.securityState.accounts || []).filter(a => a.domain !== domain)
  const dismissed = new Set(data.securityState.dismissedAccounts || [])
  dismissed.add(domain)
  data.securityState.dismissedAccounts = [...dismissed]
  const cat = data.securityState.categories.accounts
  if (cat && cat.events) {
    cat.events = cat.events.filter(e => !(e.type === 'login_activity' && e.source === domain))
    data.securityState.categories.accounts = cat
  }
  if (data.eventHistory) {
    data.eventHistory = data.eventHistory.filter(e => !(e.category === 'accounts' && e.type === 'login_activity' && e.source === domain))
  }
  await saveState(data)
  await recalculateCategoryScore('accounts')
}
