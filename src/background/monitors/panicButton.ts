import { RiskEvent, ForensicSnapshot } from '../../types'
import { addCategoryEvent, getSecurityState, mutateSecurityState, updateSecurityState } from '../storage'
import { notifyRiskEvent } from '../notifications'
import { recalculateCategoryScore } from '../engine'
import { updateBadge } from '../badge'
import { autoKillSessions } from './autoResponse'

let menusCreated = false

// MV3 cannot block requests from webRequest ({cancel:true} needs
// webRequestBlocking, unavailable here) — the old listener silently blocked
// NOTHING. Session-scoped declarativeNetRequest rules are the supported way,
// they survive service-worker suspension, and they never touch
// chrome-extension:// pages so our own popup keeps working.
const LOCKDOWN_RULE_ID = 9001

async function setNetworkLockdown(active: boolean): Promise<void> {
  try {
    if (active) {
      await chrome.declarativeNetRequest.updateSessionRules({
        addRules: [{
          id: LOCKDOWN_RULE_ID,
          priority: 1,
          action: { type: 'block' as chrome.declarativeNetRequest.RuleActionType },
          condition: {
            urlFilter: '*',
            resourceTypes: [
              'main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font',
              'object', 'xmlhttprequest', 'ping', 'media', 'websocket', 'other',
            ] as chrome.declarativeNetRequest.ResourceType[],
          },
        }],
      })
    } else {
      await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [LOCKDOWN_RULE_ID] })
    }
  } catch (e) {
    console.error('Panic network lockdown switch failed:', e)
  }
}

// Registered at the top level so a cold-start Ctrl+Shift+9 that itself woke
// the service worker still lands — late registration dropped those events.
chrome.commands.onCommand.addListener(command => {
  if (command === 'panic') executePanic().catch(() => {})
})
chrome.contextMenus.onClicked.addListener(info => {
  if (info.menuItemId === 'panic') executePanic().catch(() => {})
})
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name !== 'panicLockdownEnd') return
  setNetworkLockdown(false)
  getSecurityState().then(state => {
    const p = state.panicState || { active: false, startedAt: 0, snapshotId: '', lockdownUntil: 0 }
    return updateSecurityState({ panicState: { ...p, lockdownUntil: 0 } })
  }).catch(() => {})
})

export function startPanicListeners(): void {
  if (menusCreated) return
  menusCreated = true
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'panic', title: '🚨 Panic — log out of everything', contexts: ['page', 'link'] })
  })
}

export async function executePanic(): Promise<void> {
  let snapshotId = ''
  const until = Date.now() + 60000

  try {
    const windows = await chrome.windows.getAll({ populate: true })
    const screenshots: string[] = []
    for (const win of windows.slice(0, 5)) {
      if (typeof win.id !== 'number') continue
      try {
        const shot = await chrome.tabs.captureVisibleTab(win.id, { format: 'png' })
        screenshots.push(shot)
      } catch { /* per-window capture can fail — skip */ }
    }
    const state = await getSecurityState()
    const tabs = await chrome.tabs.query({})
    const extensions = await chrome.management.getAll()
    const cookies = await chrome.cookies.getAll({})
    const snapshot: ForensicSnapshot = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      trigger: 'panic-button',
      openTabs: tabs.map(t => ({ url: t.url || '', title: t.title || '' })),
      extensions: extensions.map(e => ({ id: e.id, name: e.name, enabled: e.enabled })),
      cookies: cookies.map(c => ({ domain: c.domain, name: c.name, secure: c.secure || false })).slice(0, 100),
      networkState: {
        publicIp: state.network?.publicIp || 'unknown',
        isVpn: state.network?.isVpn || false,
      },
      screenshots,
    }
    snapshotId = snapshot.id
    // Atomic under the write mutex — a second panic firing inside the
    // evidence-capture window used to clobber the first snapshot.
    await mutateSecurityState(s => {
      const arr = s.forensicSnapshots || []
      arr.unshift(snapshot)
      if (arr.length > 10) arr.length = 10
      s.forensicSnapshots = arr
    })
    chrome.storage.local.set({ [`forensic_${snapshot.id}`]: JSON.stringify(snapshot) }).catch(() => {})
  } catch (e) {
    console.error('Panic evidence capture failed:', e)
  }

  try {
    const all = await chrome.cookies.getAll({})
    for (let i = 0; i < all.length; i += 100) {
      const chunk = all.slice(i, i + 100)
      for (const cookie of chunk) {
        const host = cookie.domain.replace(/^\./, '')
        await chrome.cookies.remove({ url: `${cookie.secure ? 'https' : 'http'}://${host}${cookie.path || '/'}`, name: cookie.name }).catch(() => {})
        if (!cookie.secure) {
          await chrome.cookies.remove({ url: `https://${host}${cookie.path || '/'}`, name: cookie.name }).catch(() => {})
        }
      }
      await new Promise(r => setTimeout(r, 0))
    }
  } catch (e) {
    console.error('Panic cookie purge failed:', e)
  }

  try {
    const state = await getSecurityState()
    const domains = (state.accounts || []).map(a => a.domain)
    if (domains.length > 0) await autoKillSessions(domains)
  } catch (e) {
    console.error('Panic session kill failed:', e)
  }

  try {
    const inProgress = await chrome.downloads.search({ state: 'in_progress' })
    for (const d of inProgress) {
      await chrome.downloads.cancel(d.id).catch(() => {})
    }
  } catch (e) {
    console.error('Panic download cancel failed:', e)
  }

  const disabledIds: string[] = []
  try {
    const extensions = await chrome.management.getAll()
    for (const ext of extensions) {
      if (ext.id === chrome.runtime.id) continue
      if (ext.enabled && ext.type === 'extension') {
        const riskyPerms = ['cookies', 'webRequest', 'tabs', '<all_urls>']
        const hasRisky = (ext.permissions || []).some(p => riskyPerms.includes(p))
        if (hasRisky) {
          await chrome.management.setEnabled(ext.id, false).catch(() => {})
          disabledIds.push(ext.id)
        }
      }
    }
    if (disabledIds.length > 0) {
      chrome.storage.session.set({ sg_panic_disabled: disabledIds }).catch(() => {})
    }
  } catch (e) {
    console.error('Panic extension disable failed:', e)
  }

  try {
    const tabs = await chrome.tabs.query({})
    const ids = tabs.map(t => t.id).filter((id): id is number => typeof id === 'number')
    for (let i = 0; i < ids.length; i += 50) {
      await chrome.tabs.remove(ids.slice(i, i + 50)).catch(() => {})
      await new Promise(r => setTimeout(r, 0))
    }
  } catch (e) {
    console.error('Panic tab close failed:', e)
  }

  try {
    await setNetworkLockdown(true)
    await updateSecurityState({ panicState: { active: true, startedAt: Date.now(), snapshotId, lockdownUntil: until } })
    chrome.alarms.create('panicLockdownEnd', { when: until })
  } catch (e) {
    console.error('Panic lockdown arm failed:', e)
  }

  try {
    await chrome.browsingData.remove({ since: Date.now() - 86400000 }, {
      history: true,
      cache: true,
      cookies: true,
      localStorage: true,
      indexedDB: true,
      webSQL: true,
      fileSystems: true,
      formData: true,
      serviceWorkers: true,
      downloads: true,
      cacheStorage: true,
    })
  } catch (e) {
    console.error('Panic browsing data purge failed:', e)
  }

  try {
    const event: RiskEvent = {
      id: crypto.randomUUID(),
      type: 'panic_triggered',
      category: 'overview',
      severity: 'high',
      title: 'Panic mode activated',
      description: 'All cookies cleared, sessions killed, downloads cancelled, risky extensions disabled, all tabs closed, network locked down for 60 seconds, 24h of browsing data purged',
      source: 'panic-button',
      timestamp: Date.now(),
      acknowledged: false,
    }
    await addCategoryEvent('overview', event)
    await notifyRiskEvent(event)
  } catch (e) {
    console.error('Panic event logging failed:', e)
  }
  await recalculateCategoryScore('overview').catch(() => {})
  await updateBadge().catch(() => {})
}

export async function recoverFromPanic(): Promise<void> {
  // Lift the network lockdown FIRST — restored tabs must be able to load.
  await setNetworkLockdown(false)
  try {
    await chrome.alarms.clear('panicLockdownEnd')
  } catch { /* alarm may not exist */ }

  try {
    const state = await getSecurityState()
    const panic = state.panicState || { active: false, startedAt: 0, snapshotId: '', lockdownUntil: 0 }
    const snapshot = (state.forensicSnapshots || []).find(s => s.id === panic.snapshotId)
    if (snapshot) {
      const urls: string[] = []
      for (const t of snapshot.openTabs) {
        const url = (t.url || '').trim()
        if (/^https?:\/\//i.test(url) && !urls.includes(url) && urls.length < 30) {
          urls.push(url)
        }
      }
      for (let i = 0; i < urls.length; i += 10) {
        for (const url of urls.slice(i, i + 10)) {
          await chrome.tabs.create({ url, active: false }).catch(() => {})
        }
        await new Promise(r => setTimeout(r, 0))
      }
    }
  } catch (e) {
    console.error('Panic tab restore failed:', e)
  }

  try {
    const stored = await chrome.storage.session.get('sg_panic_disabled')
    const ids: string[] = stored.sg_panic_disabled || []
    for (const id of ids) {
      await chrome.management.setEnabled(id, true).catch(() => {})
    }
    await chrome.storage.session.remove('sg_panic_disabled')
  } catch { /* session storage unavailable */ }

  try {
    await updateSecurityState({ panicState: { active: false, startedAt: 0, snapshotId: '', lockdownUntil: 0 } })
    const event: RiskEvent = {
      id: crypto.randomUUID(),
      type: 'panic_recovered',
      category: 'overview',
      severity: 'medium',
      title: 'Panic mode cleared',
      description: 'Tabs restored and extensions re-enabled',
      source: 'panic-button',
      timestamp: Date.now(),
      acknowledged: false,
    }
    await addCategoryEvent('overview', event)
  } catch (e) {
    console.error('Panic recovery logging failed:', e)
  }
  await recalculateCategoryScore('overview').catch(() => {})
  await updateBadge().catch(() => {})
}

export async function restoreLockdownState(): Promise<void> {
  try {
    const state = await getSecurityState()
    const panic = state.panicState
    if (panic && panic.active && panic.lockdownUntil > Date.now()) {
      await setNetworkLockdown(true)
      chrome.alarms.create('panicLockdownEnd', { when: panic.lockdownUntil })
    }
  } catch (e) {
    console.error('restoreLockdownState failed:', e)
  }
}
