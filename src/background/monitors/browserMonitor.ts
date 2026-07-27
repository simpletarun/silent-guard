import { BrowserFingerprint, RiskEvent, FINGERPRINT_CHANGE_THRESHOLD_MS } from '../../types'
import { addCategoryEvent, updateSecurityState, getSecurityState } from '../storage'
import { recalculateCategoryScore } from '../engine'

let lastFingerprintCheck = 0

export async function handleFingerprintReport(fingerprint: BrowserFingerprint): Promise<void> {
  const now = Date.now()
  if (now - lastFingerprintCheck < FINGERPRINT_CHANGE_THRESHOLD_MS) return
  lastFingerprintCheck = now

  try {
    const state = await getSecurityState()
    const previous = state.fingerprint

    if (previous && !fingerprintsEqual(previous, fingerprint)) {
      const changes: string[] = []
      if (previous.screenWidth !== fingerprint.screenWidth) changes.push('screen resolution')
      if (previous.timezone !== fingerprint.timezone) changes.push(`timezone (${fingerprint.timezone})`)
      if (previous.language !== fingerprint.language) changes.push(`language (${fingerprint.language})`)
      if (previous.platform !== fingerprint.platform) changes.push('platform')
      if (previous.userAgent !== fingerprint.userAgent) changes.push('user agent')

      const event: RiskEvent = {
        id: crypto.randomUUID(),
        type: 'fingerprint_change',
        category: 'device',
        severity: 'medium',
        title: 'Browser fingerprint changed',
        description: `Detected changes: ${changes.join(', ') || 'unknown'}`,
        timestamp: Date.now(),
        acknowledged: false,
      }
      await addCategoryEvent('device', event)
    }

    await updateSecurityState({ fingerprint })
    await recalculateCategoryScore('device')
  } catch (e) {
    console.error('Fingerprint handler failed:', e)
  }
}

function fingerprintsEqual(a: BrowserFingerprint, b: BrowserFingerprint): boolean {
  return (
    a.screenWidth === b.screenWidth &&
    a.screenHeight === b.screenHeight &&
    a.colorDepth === b.colorDepth &&
    a.timezone === b.timezone &&
    a.language === b.language &&
    a.platform === b.platform &&
    a.userAgent === b.userAgent
  )
}
