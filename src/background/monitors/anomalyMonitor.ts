import { RiskEvent, AnomalyScore } from '../../types'
import { addCategoryEvent, mutateSecurityState } from '../storage'
import { recalculateCategoryScore } from '../engine'

interface DomainInfo {
  count: number
  firstSeen: number
  lastSeen: number
}

interface BrowsingProfile {
  domainsVisited: Record<string, DomainInfo>
  tabCountHistory: number[]
  activeHours: number[]
  startTime: number
}

const PROFILE_KEY = 'anomaly_profile'
const TAB_SPIKE_COOLDOWN_MS = 1800000
// Same reasoning as the tab spike — the burst condition persists across the
// 10-minute alarm while the user browses, so gate it too.
const NEW_DOMAINS_COOLDOWN_MS = 1800000
let lastTabSpikeTime = 0
let lastNewDomainsAlert = 0
// The 10-minute alarm re-ran this check all hour long — one alert per
// unusual hour is the signal, not one per scan.
let lastUnusualHourReported = -1

async function getProfile(): Promise<BrowsingProfile> {
  const result = await chrome.storage.local.get(PROFILE_KEY)
  if (result[PROFILE_KEY]) return result[PROFILE_KEY] as BrowsingProfile
  const fresh: BrowsingProfile = {
    domainsVisited: {},
    tabCountHistory: [],
    activeHours: [],
    startTime: Date.now(),
  }
  await chrome.storage.local.set({ [PROFILE_KEY]: fresh })
  return fresh
}

async function saveProfile(profile: BrowsingProfile): Promise<void> {
  await chrome.storage.local.set({ [PROFILE_KEY]: profile })
}

let tabCount = 0
// Serialize profile read-modify-write: many tabs navigating at once used to
// interleave getProfile → mutate → saveProfile and lose updates.
let profileQueue: Promise<unknown> = Promise.resolve()

export function tabCreatedHandler(): void { tabCount++ }

export function tabRemovedHandler(): void { tabCount = Math.max(0, tabCount - 1) }

export function tabUpdatedHandler(_tabId: number, changeInfo: chrome.tabs.TabChangeInfo, _tab: chrome.tabs.Tab): void {
  // Only a URL change is a navigation — status/title/favIconUrl updates fire
  // with the same tab.url and used to inflate visit counters ~3x.
  if (!changeInfo.url) return
  try {
    const url = changeInfo.url
    if (!url || url.startsWith('chrome')) return
    const domain = new URL(url).hostname
    const hour = new Date().getHours()
    profileQueue = profileQueue.then(async () => {
      const profile = await getProfile()
      if (!profile.domainsVisited[domain]) {
        profile.domainsVisited[domain] = { count: 0, firstSeen: Date.now(), lastSeen: Date.now() }
      }
      const d = profile.domainsVisited[domain]
      d.count++
      d.lastSeen = Date.now()
      if (!profile.activeHours.includes(hour)) profile.activeHours.push(hour)
      await saveProfile(profile)
    }).catch(() => {})
  } catch {}
}

export function startAnomalyMonitor(): void {
  chrome.tabs.query({}).then(tabs => { tabCount = tabs.length }).catch(() => {})
  detectAnomalies()
}

const PROFILE_WINDOW_DAYS = 30

function pruneProfile(profile: BrowsingProfile): void {
  const cutoff = Date.now() - PROFILE_WINDOW_DAYS * 24 * 60 * 60 * 1000
  for (const domain of Object.keys(profile.domainsVisited)) {
    const d = profile.domainsVisited[domain]
    if (d.lastSeen < cutoff) {
      delete profile.domainsVisited[domain]
    }
  }
}

export async function detectAnomalies(): Promise<void> {
  try {
    // Re-query: tabCreated/Removed events are missed while the service
    // worker was suspended, so the running counter drifts.
    const openTabs = await chrome.tabs.query({}).then(tabs => tabs.length).catch(() => tabCount)
    tabCount = openTabs

    const hour = new Date().getHours()
    const scores: AnomalyScore[] = []
    const anomalies: RiskEvent[] = []

    // Read-mutate-save under the same queue as tabUpdatedHandler — an
    // unqueued writer here saved a stale copy over the profile and dropped
    // the activity samples the tab handler had just recorded.
    const task = profileQueue.then(async () => {
      const profile = await getProfile()
      pruneProfile(profile)
      profile.tabCountHistory.push(tabCount)
      if (profile.tabCountHistory.length > 20) profile.tabCountHistory.shift()
      await saveProfile(profile)
      return profile
    })
    profileQueue = task.catch(() => {})
    const profile = await task.catch(() => null)
    if (!profile) return

    const hasSufficientData = profile.activeHours.length >= 3 && profile.tabCountHistory.length >= 10

    if (profile.activeHours.length > 0 && !profile.activeHours.includes(hour) && hasSufficientData && hour !== lastUnusualHourReported) {
      lastUnusualHourReported = hour
      scores.push({ metric: 'unusual_hour', value: hour, baseline: profile.activeHours[0], deviation: 1, severity: 'low' })
      anomalies.push({
        id: crypto.randomUUID(), type: 'anomaly_detected', category: 'device', severity: 'low',
        title: 'Activity during unusual hour', description: `Browsing at hour ${hour} when normally inactive`,
        timestamp: Date.now(), acknowledged: false,
      })
    }

    if (profile.tabCountHistory.length > 5) {
      const avg = profile.tabCountHistory.reduce((a, b) => a + b, 0) / profile.tabCountHistory.length
      const variance = profile.tabCountHistory.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / profile.tabCountHistory.length
      const stdDev = Math.sqrt(variance) || 1
      const now = Date.now()
      if (tabCount > avg + 5 * stdDev && now - lastTabSpikeTime > TAB_SPIKE_COOLDOWN_MS) {
        lastTabSpikeTime = now
        scores.push({ metric: 'tab_spike', value: tabCount, baseline: Math.round(avg), deviation: (tabCount - avg) / stdDev, severity: 'low' })
        anomalies.push({
          id: crypto.randomUUID(), type: 'anomaly_detected', category: 'device', severity: 'low',
          title: 'Tab count spike detected', description: `${tabCount} tabs open vs baseline ${Math.round(avg)}`,
          timestamp: Date.now(), acknowledged: false,
        })
      }
    }

    const recentNewDomains = Object.values(profile.domainsVisited).filter(d => Date.now() - d.firstSeen < 60000).length
    const now = Date.now()
    if (recentNewDomains > 5 && hasSufficientData && now - lastNewDomainsAlert > NEW_DOMAINS_COOLDOWN_MS) {
      lastNewDomainsAlert = now
      scores.push({ metric: 'new_domains_burst', value: recentNewDomains, baseline: 0, deviation: recentNewDomains, severity: 'medium' })
      anomalies.push({
        id: crypto.randomUUID(), type: 'anomaly_detected', category: 'device', severity: 'medium',
        title: 'Multiple new domains in short time', description: `${recentNewDomains} new domain(s) visited in the last minute`,
        timestamp: Date.now(), acknowledged: false,
      })
    }

    if (scores.length === 0) return

    // Write under the storage mutex — a whole-array replace from outside it
    // dropped scores rows when the alarm overlapped another writer.
    await mutateSecurityState(state => {
      state.anomalyScores = [...scores, ...(state.anomalyScores || [])].slice(0, 50)
    })

    for (const evt of anomalies) {
      await addCategoryEvent('device', evt)
    }
    await recalculateCategoryScore('device')
  } catch (e) {
    console.error('Anomaly detection failed:', e)
  }
}
