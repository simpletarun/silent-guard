import { StorageData, SecurityState, GlobalSettings, DEFAULT_GLOBAL_SETTINGS, RiskEvent, CategoryState, createInitialState, SecurityCategory } from '../types'

const STORAGE_KEY = 'silent_guard_state'
const DATA_VERSION = 3
const EVENT_HISTORY_MAX_AGE_MS = 7 * 86400000

let stateCache: StorageData | null = null
// Dedupe concurrent initial loads — parallel chrome.storage.get calls (one
// per handler waking at once) each built a separate state object, and
// interleaved saves silently overwrote each other's changes.
let loadPromise: Promise<StorageData> | null = null

// Single write mutex for the whole state object. Every mutator below
// read-modify-writes the SAME cached object; without this, two monitors
// (e.g. downloads + threat intel) firing at once interleaved at the
// chrome.storage.set await and dropped each other's updates. Per-monitor
// queues can't fix cross-monitor races — one lock here covers all.
let writeQueue: Promise<unknown> = Promise.resolve()

function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn)
  writeQueue = run.then(() => undefined, () => undefined)
  return run
}

function pruneEventHistory(events: RiskEvent[]): RiskEvent[] {
  const cutoff = Date.now() - EVENT_HISTORY_MAX_AGE_MS
  return events.filter(e => e.timestamp > cutoff).slice(0, 500)
}

export function loadState(): Promise<StorageData> {
  if (stateCache) return Promise.resolve(stateCache)
  if (!loadPromise) {
    loadPromise = (async () => {
      const result = await chrome.storage.local.get(STORAGE_KEY)
      const data = result[STORAGE_KEY] as StorageData | undefined
      if (data) {
        stateCache = migrateState(data)
        stateCache.eventHistory = pruneEventHistory(stateCache.eventHistory || [])
        return stateCache
      }
      stateCache = {
        securityState: createInitialState(),
        settings: { ...DEFAULT_GLOBAL_SETTINGS },
        eventHistory: [],
      }
      return stateCache
    })().finally(() => { loadPromise = null })
  }
  // A failed read must NOT return fresh defaults — the next saveState would
  // then overwrite the user's real data with an empty state.
  return loadPromise.catch((e: Error) => {
    console.error('loadState failed:', e)
    throw e
  })
}

export function migrateState(data: StorageData): StorageData {
  const ss: SecurityState = data.securityState || ({} as SecurityState)
  if ((data as any).dataVersion === DATA_VERSION) {
    // Report schema is not tied to the state version — normalize every load.
    // Header rows without auditedAt predate the fixed auditor and can carry
    // impossible verdicts (e.g. HSTS ✗ on Google) — drop them once here;
    // every row written today is stamped, so this is a no-op afterwards.
    const reports = Array.isArray(ss.policyReports) ? ss.policyReports : []
    return {
      ...data,
      securityState: {
        ...ss,
        panicState: ss.panicState || { active: false, startedAt: 0, snapshotId: '', lockdownUntil: 0 },
        policyReports: reports.filter(r => r && typeof r === 'object').map(normalizePolicyReport),
        lastPolicyProbes: ss.lastPolicyProbes || [],
        installedExtensions: ss.installedExtensions || [],
        securityHeaders: (Array.isArray(ss.securityHeaders) ? ss.securityHeaders : []).filter(r => r && typeof r.auditedAt === 'number'),
      },
    }
  }
  const fresh = createInitialState()
  const oldSettings: Partial<GlobalSettings> = data.settings || {}
  const out: StorageData = {
    securityState: {
      ...ss,
      categories: ss.categories || { ...fresh.categories },
      accounts: ss.accounts || [...fresh.accounts],
      dismissedAccounts: ss.dismissedAccounts || [],
      dangerousExtensions: ss.dangerousExtensions || [...fresh.dangerousExtensions],
      installedExtensions: ss.installedExtensions || [],
      network: ss.network || fresh.network,
      pageScans: ss.pageScans || [],
      sensorUsage: ss.sensorUsage || [...fresh.sensorUsage],

      phishingResults: ss.phishingResults || [],
      downloadScans: ss.downloadScans || [],
      passwordStrengths: ss.passwordStrengths || [],
      certAnomalies: ss.certAnomalies || [],
      dnsChecks: ss.dnsChecks || [],
      securityHeaders: ss.securityHeaders || [],
      threatIntelMatches: ss.threatIntelMatches || [],
      anomalyScores: ss.anomalyScores || [],
      correlatedIncidents: ss.correlatedIncidents || [],
      correlatedEventIds: ss.correlatedEventIds || [],
      forensicSnapshots: ss.forensicSnapshots || [],
      panicState: ss.panicState || { active: false, startedAt: 0, snapshotId: '', lockdownUntil: 0 },
      timeline: ss.timeline || [],
      weeklyDigests: ss.weeklyDigests || [],
      policyReports: (Array.isArray(ss.policyReports) ? ss.policyReports : []).filter(r => r && typeof r === 'object').map(normalizePolicyReport),
      lastPolicyHash: ss.lastPolicyHash || '',
      lastPolicyProbes: ss.lastPolicyProbes || [],
    },
    settings: {
      ...DEFAULT_GLOBAL_SETTINGS,
      ...oldSettings,
      extensionWhitelist: oldSettings.extensionWhitelist || [],
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

// Stale-schema cached reports crash the popup renderer (PolicyReportDetail
// reads nested arrays directly) — default every field before it reaches React.
function normalizePolicyReport(r: any): any {
  const arr = (f: any) => (Array.isArray(f) ? f : [])
  return {
    ...r,
    id: String(r.id || ''),
    domain: String(r.domain || ''),
    policyUrl: String(r.policyUrl || ''),
    analyzedAt: typeof r.analyzedAt === 'number' ? r.analyzedAt : 0,
    privacyScore: typeof r.privacyScore === 'number' ? r.privacyScore : 50,
    transparencyScore: typeof r.transparencyScore === 'number' ? r.transparencyScore : 0,
    wordCount: typeof r.wordCount === 'number' ? r.wordCount : 0,
    riskLevel: r.riskLevel || 'medium',
    recommendation: String(r.recommendation || ''),
    policyHash: String(r.policyHash || ''),
    sections: arr(r.sections),
    collectedData: arr(r.collectedData),
    thirdParties: arr(r.thirdParties),
    cookies: arr(r.cookies),
    userRights: arr(r.userRights),
    securityPractices: arr(r.securityPractices),
    dangerousClauses: arr(r.dangerousClauses),
    matchedRules: arr(r.matchedRules),
    retention: r.retention && typeof r.retention === 'object'
      ? { period: 'unknown', rawText: '', isExcessive: false, ...r.retention }
      : { period: 'unknown', rawText: '', isExcessive: false },
  }
}

export async function saveState(data: StorageData): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: data })
    stateCache = data
  } catch (e) {
    // Memory must never drift from disk — force a re-read on the next load.
    stateCache = null
    throw e
  }
  chrome.runtime.sendMessage({ type: 'STATE_UPDATED' }).catch(() => {})
}

export async function getSecurityState(): Promise<SecurityState> {
  const data = await loadState()
  return data.securityState
}

export function updateSecurityState(updates: Partial<SecurityState>): Promise<SecurityState> {
  return enqueueWrite(async () => {
    const data = await loadState()
    data.securityState = { ...data.securityState, ...updates }
    await saveState(data)
    return data.securityState
  })
}

// Read-modify-write under the same mutex: callers that must derive new state
// from the current one (append to a capped list) read INSIDE the queue, so
// concurrent mutations can't overwrite each other's entries.
export function mutateSecurityState(mutate: (state: SecurityState) => void): Promise<SecurityState> {
  return enqueueWrite(async () => {
    const data = await loadState()
    mutate(data.securityState)
    await saveState(data)
    return data.securityState
  })
}

export function updateCategoryState(categoryId: SecurityCategory, updates: Partial<CategoryState>): Promise<CategoryState> {
  return enqueueWrite(async () => {
    const data = await loadState()
    const current = data.securityState.categories[categoryId] || createInitialState().categories[categoryId]
    data.securityState.categories[categoryId] = { ...current, ...updates }
    await saveState(data)
    return data.securityState.categories[categoryId]
  })
}

export function addCategoryEvent(categoryId: SecurityCategory, event: RiskEvent): Promise<void> {
  return enqueueWrite(async () => {
    const data = await loadState()
    let cat = data.securityState.categories[categoryId]
    if (!cat || !cat.events) cat = createInitialState().categories[categoryId]
    cat.events = [event, ...(cat.events || [])].slice(0, 50)
    data.securityState.categories[categoryId] = cat
    const history = data.eventHistory || []
    data.eventHistory = pruneEventHistory([event, ...history])
    await saveState(data)
  })
}

export async function hasRecentCategoryEvent(
  categoryId: SecurityCategory,
  matches: (e: RiskEvent) => boolean,
  windowMs: number,
): Promise<boolean> {
  const data = await loadState()
  const cat = data.securityState.categories[categoryId]
  if (!cat || !cat.events) return false
  const cutoff = Date.now() - windowMs
  return cat.events.some(e => e.timestamp > cutoff && matches(e))
}

export async function getSettings(): Promise<GlobalSettings> {
  const data = await loadState()
  return { ...DEFAULT_GLOBAL_SETTINGS, ...data.settings }
}

export function updateSettings(updates: Partial<GlobalSettings>): Promise<GlobalSettings> {
  return enqueueWrite(async () => {
    const data = await loadState()
    data.settings = { ...data.settings, ...updates }
    await saveState(data)
    return data.settings
  })
}

export function acknowledgeEvent(eventId: string): Promise<void> {
  return enqueueWrite(async () => {
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
  })
}

export function clearAllData(): Promise<void> {
  return enqueueWrite(async () => {
    const data = await loadState()
    data.securityState = createInitialState()
    data.eventHistory = []
    await saveState(data)
    await pruneForensicSnapshots(0)
    // Weekly-digest cadence and the anomaly browsing profile must not
    // survive a full wipe — the profile holds the user's site history.
    await chrome.storage.local.remove(['digest_start_week', 'last_digest_week', 'anomaly_profile']).catch(() => {})
  })
}

// Internal: only clearAllData calls this.
async function pruneForensicSnapshots(keep = 10): Promise<void> {
  const all = await chrome.storage.local.get()
  const keys: { key: string; timestamp: number }[] = []
  for (const k of Object.keys(all).filter(k => k.startsWith('forensic_'))) {
    try {
      const parsed = JSON.parse(all[k] as string)
      keys.push({ key: k, timestamp: typeof parsed?.timestamp === 'number' ? parsed.timestamp : 0 })
    } catch {
      // Malformed forensic entry — drop it rather than break the whole prune.
      keys.push({ key: k, timestamp: 0 })
    }
  }
  keys.sort((a, b) => b.timestamp - a.timestamp)
  const toDelete = keys.slice(keep).map(k => k.key)
  if (toDelete.length > 0) await chrome.storage.local.remove(toDelete)
}

export function removeCategoryEvents(categoryId: SecurityCategory, predicate: (e: RiskEvent) => boolean): Promise<void> {
  return enqueueWrite(async () => {
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
  })
}

