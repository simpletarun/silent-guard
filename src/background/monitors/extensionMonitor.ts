import { DangerousExtension, RiskEvent, HIGH_RISK_PERMISSIONS } from '../../types'
import { addCategoryEvent, removeCategoryEvents, updateSecurityState, getSecurityState } from '../storage'
import { recalculateCategoryScore } from '../engine'

function evaluateExtensionRisk(ext: chrome.management.ExtensionInfo): DangerousExtension {
  const perms = ext.permissions || []
  const hostPerms = ext.hostPermissions || []
  const allUrls = hostPerms.includes('<all_urls>')
  const hasCookies = perms.includes('cookies')
  const hasWebRequest = perms.includes('webRequest')

  let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low'
  const dangerousPerms = perms.filter(p => HIGH_RISK_PERMISSIONS.includes(p))

  if (allUrls && hasCookies) riskLevel = 'critical'
  else if (allUrls && hasWebRequest) riskLevel = 'high'
  else if (allUrls) riskLevel = 'medium'
  else if (dangerousPerms.length > 0) riskLevel = 'medium'

  return {
    id: ext.id,
    name: ext.name,
    permissions: [...perms, ...hostPerms],
    riskLevel,
    canAccessAllUrls: allUrls,
    canReadCookies: hasCookies,
    canUseWebRequest: hasWebRequest,
  }
}

export async function scanExtensions(): Promise<void> {
  const allExtensions = await chrome.management.getAll()
  const dangerousExtensions: DangerousExtension[] = []

  for (const ext of allExtensions) {
    if (ext.type === 'extension' && ext.enabled && !ext.isApp) {
      const risk = evaluateExtensionRisk(ext)
      if (risk.riskLevel !== 'low') {
        dangerousExtensions.push(risk)
      }
    }
  }

  const state = await getSecurityState()
  const prevDangerous = state.dangerousExtensions || []
  const prevNames = new Set(prevDangerous.map(e => e.id))

  await updateSecurityState({ dangerousExtensions })

  const currentNames = new Set(dangerousExtensions.map(e => e.id))
  await removeCategoryEvents('extensions', e =>
    e.type === 'extension_installed' && e.source != null && !currentNames.has(e.source)
  )

  for (const ext of dangerousExtensions) {
    if (prevNames.has(ext.id)) continue
    const event: RiskEvent = {
      id: crypto.randomUUID(),
      type: 'extension_installed',
      category: 'extensions',
      severity: ext.riskLevel === 'critical' ? 'critical' : ext.riskLevel,
      title: `Dangerous extension detected: ${ext.name}`,
      description: `${ext.name} can ${ext.canReadCookies ? 'read cookies, ' : ''}${ext.canAccessAllUrls ? 'access all websites, ' : ''}${ext.canUseWebRequest ? 'monitor web requests' : ''}`.replace(/, $/, ''),
      source: ext.name,
      timestamp: Date.now(),
      acknowledged: false,
    }
    await addCategoryEvent('extensions', event)
  }

  await recalculateCategoryScore('extensions')
}

export function extInstalledHandler(ext: chrome.management.ExtensionInfo): void {
  if (ext.type === 'extension') {
    scanExtensions()
  }
}

export function extEnabledHandler(): void { scanExtensions() }
export function extDisabledHandler(): void { scanExtensions() }
export function extUninstalledHandler(): void { scanExtensions() }

export function startExtensionMonitor(): void {
  scanExtensions()
}
