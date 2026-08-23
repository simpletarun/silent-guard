import { DangerousExtension, RiskEvent } from '../../types'
import { evaluateExtensionRisk } from '../../utils/extensionRisk'
import { addCategoryEvent, removeCategoryEvents, updateSecurityState, getSecurityState, getSettings } from '../storage'
import { recalculateCategoryScore } from '../engine'

let scanInFlight = false

export async function scanExtensions(): Promise<void> {
  if (scanInFlight) return
  scanInFlight = true
  try {
    const allExtensions = await chrome.management.getAll()
    const settings = await getSettings()
    const whitelist = new Set(settings.extensionWhitelist || [])
    const dangerousExtensions: DangerousExtension[] = []
    // Every installed extension, low-risk included — the dashboard lists them
    // all; `dangerousExtensions` stays the flagged subset that drives events.
    const installedExtensions: DangerousExtension[] = []

    for (const ext of allExtensions) {
      // Disabled extensions stay flagged: they are still installed, and
      // skipping them made a simple disable wipe their warning event.
      if (ext.type === 'extension' && !ext.isApp) {
        const risk = evaluateExtensionRisk(ext)
        // Full transparency: SilentGuard itself is evaluated and listed like
        // any other extension — real badge, real reasons, nothing skipped or
        // hidden. The score engine also counts it (no SELF_ID filter), so
        // the status card and score factor always agree. Only the alert
        // EVENT for self is suppressed (below) to avoid notification spam.
        installedExtensions.push(risk)
        if (whitelist.has(ext.id)) continue // user-whitelisted
        if (risk.riskLevel !== 'low') {
          dangerousExtensions.push(risk)
        }
      }
    }

    const state = await getSecurityState()
    const prevDangerous = state.dangerousExtensions || []
    const prevById = new Map(prevDangerous.map(e => [e.id, e]))

    await updateSecurityState({ dangerousExtensions, installedExtensions })

    const currentNames = new Set(dangerousExtensions.map(e => e.id))
    await removeCategoryEvents('extensions', e =>
      e.type === 'extension_installed' && e.source != null && !currentNames.has(e.source)
    )

    for (const ext of dangerousExtensions) {
      if (ext.id === chrome.runtime.id) continue // no self-alert spam
      const prev = prevById.get(ext.id)
      if (prev) {
        // Re-alert on escalation OR any permission change — an update that
        // swaps tabs for history keeps the same level but new capabilities.
        if (prev.riskLevel !== ext.riskLevel || (prev.reason || []).join('|') !== (ext.reason || []).join('|')) {
          await removeCategoryEvents('extensions', e => e.type === 'extension_installed' && e.source === ext.id)
        } else {
          continue
        }
      }
      const event: RiskEvent = {
        id: crypto.randomUUID(),
        type: 'extension_installed',
        category: 'extensions',
        severity: ext.riskLevel,
        title: `Dangerous extension detected: ${ext.name}${ext.enabled === false ? ' (disabled)' : ''}`,
        description: `Why: ${(ext.reason && ext.reason.join('; ')) || 'risky permissions'}`,
        source: ext.id,
        timestamp: Date.now(),
        acknowledged: false,
      }
      await addCategoryEvent('extensions', event)
    }

    await recalculateCategoryScore('extensions')
  } catch (e) {
    console.error('Extension scan failed:', e)
    // Surface the failure — swallowing it made SCAN_EXTENSIONS reply success
    // while the popup kept showing a stale extension list.
    throw e
  } finally {
    scanInFlight = false
  }
}

function maybeAutoScan(): void {
  getSettings().then(s => { if (s.autoScanExtensions) scanExtensions().catch(() => {}) }).catch(() => {})
}

// Management events fire on explicit user actions — never gate them behind
// the autoScanExtensions setting, or a fresh install goes invisible.
function scanNow(): void {
  scanExtensions().catch(() => {})
}

export function extInstalledHandler(ext: chrome.management.ExtensionInfo): void {
  if (ext.type === 'extension') scanNow()
}

export function extEnabledHandler(): void { scanNow() }
export function extDisabledHandler(): void { scanNow() }
export function extUninstalledHandler(): void { scanNow() }

export function startExtensionMonitor(): void {
  maybeAutoScan()
}
