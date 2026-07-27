import { StorageData, SecurityState, GlobalSettings, DEFAULT_GLOBAL_SETTINGS, RiskEvent, AccountSite, CategoryState, createInitialState, SecurityCategory } from '../types'

const STORAGE_KEY = 'silent_guard_state'
const DATA_VERSION = 2
const EVENT_HISTORY_MAX_AGE_MS = 7 * 86400000

let stateCache: StorageData | null = null

function pruneEventHistory(events: RiskEvent[]): RiskEvent[] {
  const cutoff = Date.now() - EVENT_HISTORY_MAX_AGE_MS
  return events.filter(e => e.timestamp > cutoff).slice(0, 500)
}

export async function loadState(): Promise<StorageData> {
  if (stateCache) return stateCache
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    const data = result[STORAGE_KEY] as StorageData | undefined
    if (data) {
      stateCache = migrateState(data)
      stateCache.eventHistory = pruneEventHistory(stateCache.eventHistory || [])
      return stateCache
    }
  } catch (e) {
    console.error('loadState failed:', e)
  }
  stateCache = {
    securityState: createInitialState(),
    settings: { ...DEFAULT_GLOBAL_SETTINGS },
    eventHistory: [],
  }
  return stateCache
}

function migrateState(data: StorageData): StorageData {
  if ((data as any).dataVersion === DATA_VERSION) return data
  const fresh = createInitialState()
  const ss = data.securityState
  const out: StorageData = {
    securityState: {
      ...ss,
      categories: ss.categories || { ...fresh.categories },
      accounts: ss.accounts || [...fresh.accounts],
      dismissedAccounts: ss.dismissedAccounts || [],
      dangerousExtensions: ss.dangerousExtensions || [...fresh.dangerousExtensions],
      network: ss.network || fresh.network,
      pageScans: ss.pageScans || [],
      fingerprint: ss.fingerprint || fresh.fingerprint,
      lastFullScan: ss.lastFullScan ?? fresh.lastFullScan,

      httpsSites: ss.httpsSites ?? fresh.httpsSites,
      totalSites: ss.totalSites ?? fresh.totalSites,
      sensorUsage: ss.sensorUsage || [...fresh.sensorUsage],

      phishingResults: ss.phishingResults || [],
      passwordStrengths: ss.passwordStrengths || [],
      certAnomalies: ss.certAnomalies || [],
      dnsChecks: ss.dnsChecks || [],
      securityHeaders: ss.securityHeaders || [],
      threatIntelMatches: ss.threatIntelMatches || [],
      anomalyScores: ss.anomalyScores || [],
      correlatedIncidents: ss.correlatedIncidents || [],
      forensicSnapshots: ss.forensicSnapshots || [],
      timeline: ss.timeline || [],
      weeklyDigests: ss.weeklyDigests || [],
    },
    settings: {
      ...data.settings,
      extensionWhitelist: data.settings.extensionWhitelist || [],
      trackerBlocklist: data.settings.trackerBlocklist || [],
    },
    eventHistory: data.eventHistory || [],
  }
  for (const cid of Object.keys(fresh.categories)) {
    if (!out.securityState.categories[cid]) {
      out.securityState.categories[cid] = { ...fresh.categories[cid] }
    }
  }
  ;(out as any).dataVersion = DATA_VERSION
  return out
}

export async function saveState(data: StorageData): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: data })
    stateCache = data
    chrome.runtime.sendMessage({ type: 'STATE_UPDATED' }).catch(() => {})
  } catch (e) {
    console.error('saveState failed:', e)
  }
}

export async function getSecurityState(): Promise<SecurityState> {
  const data = await loadState()
  return data.securityState
}

export async function updateSecurityState(updates: Partial<SecurityState>): Promise<SecurityState> {
  const data = await loadState()
  data.securityState = { ...data.securityState, ...updates }
  await saveState(data)
  return data.securityState
}

export async function getCategoryState(categoryId: SecurityCategory): Promise<CategoryState> {
  const state = await getSecurityState()
  return (state.categories[categoryId]) || createInitialState().categories[categoryId]
}

export async function updateCategoryState(categoryId: SecurityCategory, updates: Partial<CategoryState>): Promise<CategoryState> {
  const data = await loadState()
  const current = data.securityState.categories[categoryId] || createInitialState().categories[categoryId]
  data.securityState.categories[categoryId] = { ...current, ...updates }
  await saveState(data)
  return data.securityState.categories[categoryId]
}

export async function addCategoryEvent(categoryId: SecurityCategory, event: RiskEvent): Promise<void> {
  const data = await loadState()
  let cat = data.securityState.categories[categoryId]
  if (!cat || !cat.events) cat = createInitialState().categories[categoryId]
  cat.events = [event, ...(cat.events || [])].slice(0, 50)
  data.securityState.categories[categoryId] = cat
  const history = data.eventHistory || []
  data.eventHistory = pruneEventHistory([event, ...history])
  await saveState(data)
}

export async function getSettings(): Promise<GlobalSettings> {
  const data = await loadState()
  return data.settings
}

export async function updateSettings(updates: Partial<GlobalSettings>): Promise<GlobalSettings> {
  const data = await loadState()
  data.settings = { ...data.settings, ...updates }
  await saveState(data)
  return data.settings
}

export async function addAccount(account: AccountSite): Promise<void> {
  const data = await loadState()
  const accounts = data.securityState.accounts || []
  const existing = accounts.findIndex(a => a.domain === account.domain)
  if (existing >= 0) {
    accounts[existing] = account
  } else {
    accounts.push(account)
  }
  data.securityState.accounts = accounts
  await saveState(data)
}

export async function acknowledgeEvent(eventId: string): Promise<void> {
  const data = await loadState()
  for (const catId of Object.keys(data.securityState.categories)) {
    const cat = data.securityState.categories[catId]
    if (!cat || !cat.events) continue
    const event = cat.events.find(e => e.id === eventId)
    if (event) event.acknowledged = true
  }
  const history = data.eventHistory || []
  const historyEvent = history.find(e => e.id === eventId)
  if (historyEvent) historyEvent.acknowledged = true
  await saveState(data)
}

export async function clearEvents(): Promise<void> {
  const data = await loadState()
  for (const catId of Object.keys(data.securityState.categories)) {
    const cat = data.securityState.categories[catId]
    if (cat) cat.events = []
  }
  await saveState(data)
}

export async function removeCategoryEvents(categoryId: SecurityCategory, predicate: (e: RiskEvent) => boolean): Promise<void> {
  const data = await loadState()
  const cat = data.securityState.categories[categoryId]
  if (cat && cat.events) {
    cat.events = cat.events.filter(e => !predicate(e))
    data.securityState.categories[categoryId] = cat
  }
  if (data.eventHistory) {
    data.eventHistory = data.eventHistory.filter(e => !(e.category === categoryId && predicate(e)))
  }
  await saveState(data)
}

