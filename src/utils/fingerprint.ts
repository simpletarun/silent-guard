import { BrowserFingerprint } from '../types'

export function collectFingerprint(): BrowserFingerprint {
  const ua = navigator.userAgent
  let browserName = 'Chrome'
  let browserVersion = ''
  let osName = 'Unknown'

  if (ua.includes('Edg')) {
    browserName = 'Edge'
    const m = ua.match(/Edg\/([\d.]+)/)
    if (m) browserVersion = m[1]
  } else if (ua.includes('Firefox')) {
    browserName = 'Firefox'
    const m = ua.match(/Firefox\/([\d.]+)/)
    if (m) browserVersion = m[1]
  } else {
    const m = ua.match(/Chrome\/([\d.]+)/)
    if (m) browserVersion = m[1]
  }

  if (ua.includes('Windows')) osName = 'Windows'
  else if (ua.includes('Mac OS')) osName = 'macOS'
  else if (ua.includes('Linux')) osName = 'Linux'
  else if (ua.includes('Android')) osName = 'Android'
  else if (ua.includes('iPhone') || ua.includes('iPad')) osName = 'iOS'

  return {
    screenWidth: screen.width,
    screenHeight: screen.height,
    colorDepth: screen.colorDepth,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
    platform: navigator.platform,
    userAgent: ua,
    hardwareConcurrency: navigator.hardwareConcurrency || 0,
    deviceMemory: (navigator as any).deviceMemory || undefined,
    browserName,
    browserVersion,
    osName,
  }
}
