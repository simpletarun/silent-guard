import { DangerousExtension } from '../types'

// What each permission actually lets an extension do — shown as the "why".
const PERMISSION_REASONS: Record<string, string> = {
  '<all_urls>': 'can access all websites',
  cookies: 'can read your cookies (logins, sessions)',
  webRequest: 'can intercept and modify web requests',
  webRequestBlocking: 'can block or rewrite web requests',
  // MV3 ad blockers (Ghostery, uBlock) block/rewrite via rules, not
  // webRequest — same capability, must land on the same rung.
  declarativeNetRequest: 'can block or rewrite web requests',
  declarativeNetRequestWithHostAccess: 'can block or rewrite web requests',
  tabs: 'can read your open tabs and URLs',
  scripting: 'can inject scripts into any page',
  history: 'can read your browsing history',
  clipboardRead: 'can read your clipboard',
  debugger: 'can attach the debugger and watch everything',
  nativeMessaging: 'can run native programs on your PC',
  proxy: 'can route your traffic through a proxy',
  downloads: 'can read your downloads',
  bookmarks: 'can read your bookmarks',
  geolocation: 'can read your location',
  notifications: 'can send notifications',
}

// Permissions that justify flagging an extension. notifications is explained
// when present but never flags on its own — nearly every benign extension
// requests it.
const FLAGGING_PERMS = Object.keys(PERMISSION_REASONS).filter(p => p !== 'notifications')

export function evaluateExtensionRisk(ext: chrome.management.ExtensionInfo): DangerousExtension {
  const perms = ext.permissions || []
  const hostPerms = ext.hostPermissions || []
  // http://*/* + https://*/* together functionally equal <all_urls> — the
  // common pattern for adblockers/password managers must not slip through.
  const allUrls = hostPerms.includes('<all_urls>') || (hostPerms.includes('http://*/*') && hostPerms.includes('https://*/*'))
  const hasCookies = perms.includes('cookies')
  const hasWebRequest = perms.includes('webRequest') || perms.includes('declarativeNetRequest') || perms.includes('declarativeNetRequestWithHostAccess')
  const hasScripting = perms.includes('scripting')
  const hasDebugging = perms.includes('debugger') || perms.includes('nativeMessaging')

  // Ladder reflects real capability:
  //  critical — full data theft (cookies everywhere) or machine/page takeover
  //  high     — script injection or request rewriting across every site
  //  medium   — broad access or any flagged permission
  let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low'

  if ((allUrls && hasCookies) || hasDebugging) riskLevel = 'critical'
  else if (allUrls && (hasWebRequest || hasScripting)) riskLevel = 'high'
  else if (allUrls) riskLevel = 'medium'
  else if (perms.some(p => FLAGGING_PERMS.includes(p))) riskLevel = 'medium'

  const reasons: string[] = []
  for (const [perm, text] of Object.entries(PERMISSION_REASONS)) {
    if (perms.includes(perm) || (perm === '<all_urls>' && allUrls)) {
      if (!reasons.includes(text)) reasons.push(text)
    }
  }
  const otherHosts = hostPerms.filter(h => h !== '<all_urls>' && h !== 'http://*/*' && h !== 'https://*/*')
  if (otherHosts.length > 0) {
    reasons.push(`reads data on specific sites (${otherHosts.slice(0, 4).join(', ')})`)
  }

  return {
    id: ext.id,
    name: ext.name,
    permissions: [...perms, ...hostPerms],
    riskLevel,
    canAccessAllUrls: allUrls,
    canReadCookies: hasCookies,
    canUseWebRequest: hasWebRequest,
    reason: reasons,
    version: ext.version,
    enabled: ext.enabled,
  }
}
