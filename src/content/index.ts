import { initUrlCleaner, stopUrlCleaner } from './urlCleaner'
import { initPermissionMonitor } from './permissionMonitor'
import { collectFingerprint } from '../utils/fingerprint'

let fpInterval: ReturnType<typeof setInterval> | null = null
let fingerprintingCount = 0
let canvasAttempts = 0
let audioAttempts = 0
let beaconCalls = 0
let webRTCDetected = false

const TRACKER_DOMAINS_LIST = [
  'google-analytics.com', 'googletagmanager.com', 'doubleclick.net',
  'facebook.net', 'facebook.com', 'connect.facebook.net',
  'scorecardresearch.com', 'adsrvr.org', 'adnxs.com',
  'rubiconproject.com', 'criteo.com', 'hotjar.com',
  'mixpanel.com', 'amplitude.com', 'segment.io',
  'optimizely.com', 'newrelic.com', 'datadoghq.com',
  'cdn.ampproject.org', 'platform.twitter.com',
  'bat.bing.com', 'pixel.quantserve.com',
  'adservice.google.com', 'pagead2.googlesyndication.com',
  'analytics.twitter.com', 'ads.linkedin.com',
  'snap.licdn.com', 'static.ads-twitter.com',
  'www.google-analytics.com', 'ssl.google-analytics.com',
  'stats.g.doubleclick.net', 'www.googletagmanager.com',
  'cdn.segment.com', 'cdn.mxpnl.com',
  'dpm.demdex.net', 'ads.yahoo.com',
  'advertising.yahoo.com', 'analytics.yahoo.com',
  'cdp.cloud.unity3d.com', 'www.googleadservices.com',
  'googleads.g.doubleclick.net', 'tpc.googlesyndication.com',
  'cm.g.doubleclick.net', 'partner.googleadservices.com',
  'px.ads.linkedin.com', 'www.linkedin.com/px',
  'snapchat.com', 'tr.snapchat.com',
  'ads.tiktok.com', 'analytics.tiktok.com',
  'pinterest.com', 'ct.pinterest.com',
  'redditstatic.com', 'alb.reddit.com',
  'outbrain.com', 'amplify.outbrain.com',
  'taboola.com', 'trc.taboola.com',
  'media.net', 'adsrvmedia.net',
  'casalemedia.com', 'bidswitch.net',
  'openx.net', 'pubmatic.com',
  'sharethrough.com', 'indexww.com',
  'sovrn.com', 'agkn.com',
  'contextweb.com', 'mookie1.com',
  'turn.com', 'mathtag.com',
  'bluekai.com', 'exelator.com',
  'krxd.net', 'rlcdn.com',
  'demandbase.com', '6sc.co',
  'sumo.com', 'addthis.com',
  'disqus.com', 'youtube.com/embed',
  'vimeo.com', 'player.vimeo.com',
  'wistia.net', 'fast.wistia.net',
  'crazyegg.com', 'mouseflow.com',
  'fullstory.com', 'luckyorange.com',
  'sessioncam.com', 'smartlook.com',
  'clarity.ms', 'www.clarity.ms',
  'heap.com', 'd2xxq4l49t34gd.cloudfront.net',
  'cdn.heapanalytics.com', 'posthog.com',
  'piwik.org', 'matomo.org',
  'plausible.io', 'cdn.plausible.io',
  'simpleanalyticscdn.com', 'queue.simpleanalyticscdn.com',
  'fomo.com', 'pushcrew.com',
  'onesignal.com', 'cdn.onesignal.com',
  'intercom.io', 'js.intercomcdn.com',
  'drift.com', 'cdn.drift.com',
  'hubspot.com', 'js.hs-scripts.com',
  'salesforce.com', 'sfdc-studio.us',
  'zendesk.com', 'assets.zendesk.com',
  'freshchat.com', 'connect.freshchat.com',
  'tidio.co', 'code.tidio.co',
  'crisp.chat', 'client.crisp.chat',
  'tawk.to', 'embed.tawk.to',
  'livechatinc.com', 'cdn.livechatinc.com',
  'olark.com', 'static.olark.com',
  'pusher.com', 'js.pusher.com',
  'socket.io', 'cdn.socket.io',
  'firebaseio.com', 'auth.firebase.com',
  'algolia.net', 'cdn.algolia.net',
  'optimize.google.com', 'www.googleoptimize.com',
]

const INLINE_TRACKING_PATTERNS = [
  /google-analytics/gi, /gtag\s*\(/gi, /ga\s*\(/gi,
  /fbq\s*\(/gi, /facebook.*pixel/gi, /connect\.facebook/gi,
  /doubleclick/gi, /gtm\.js/gi, /googletagmanager/gi,
  /piwik\s*\(/gi, /_paq\.push/gi, /matomo/gi,
  /hotjar/gi, /clarity/gi, /msclarity/gi,
  /amplitude/gi, /mixpanel/gi, /segment\.io/gi,
  /analytics\.tiktok/gi, /pinterest.*pixel/gi,
  /linkedin.*insight/gi, /_linkedin/gi,
  /twq\s*\(/gi, /twitter.*pixel/gi,
  /snap.*pixel/gi, /snaptr/gi,
  /reddit.*pixel/gi, /rdt\s*\(/gi,
  /outbrain/gi, /taboola/gi,
  /fullstory/gi, /crazyegg/gi,
  /mouseflow/gi, /luckyorange/gi,
  /intercom/gi, /drift/gi,
  /hubspot/gi, /salesforce/gi,
  /zendesk/gi, /freshchat/gi,
  /tidio/gi, /crisp/gi,
  /tawk/gi, /olark/gi,
]

const STORAGE_TRACKER_KEYS = [
  '_ga', '_gid', '_gat', '_fbp', '_fbc',
  'ajs_user_id', 'ajs_anonymous_id', 'amplitude_id',
  'mp_name_tag', 'mp_identity', 'hubspotutk',
  '__hstc', '__hssc', '__hsfp',
  'intercom_id', 'intercom_device_id',
  'drift_aid', 'drift_session',
  'gclid', 'gclsrc', 'dclid',
  'fbclid', 'ttclid', 'li_fat_id',
  'optimizely', 'optimizely_uuid',
  '_uetsid', '_uetvid', 'pin_audiolib',
  '_pin_unauth', '_pinterest_ct_ua',
  'mako_browser', 'visitor_id',
  '_gaexp', '_gaexperiment',
]

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

function categorizeTracker(domain: string): 'analytics' | 'advertising' | 'social' | 'fingerprinting' | 'tracking' {
  if (['doubleclick', 'adsrvr', 'adnxs', 'rubiconproject', 'criteo', 'bat.bing', 'pixel.quantserve', 'demdex', 'ads.yahoo', 'adservice.google', 'pagead2', 'taboola', 'outbrain', 'pubmatic', 'openx', 'casalemedia', 'bidswitch', 'sharethrough', 'indexww', 'sovrn', 'media.net', 'turn.com', 'mathtag', 'bluekai', 'exelator', 'krxd', 'rlcdn'].some(a => domain.includes(a))) return 'advertising'
  if (['facebook', 'twitter', 'linkedin', 'snapchat', 'pinterest', 'tiktok', 'reddit'].some(s => domain.includes(s))) return 'social'
  if (['fullstory', 'crazyegg', 'mouseflow', 'luckyorange', 'sessioncam', 'smartlook', 'clarity', 'heap', 'posthog', 'hotjar'].some(f => domain.includes(f))) return 'fingerprinting'
  return 'analytics'
}

function isTrackerDomain(domain: string): boolean {
  return TRACKER_DOMAINS_LIST.some(td => domain === td || domain.endsWith('.' + td))
}

function scanForTrackers() {
  const trackers: { domain: string; source: string; type: any; category: any; details?: string }[] = []
  let trackingPixels = false
  let hiddenIframes = false
  let hiddenElementsFound = 0

  document.querySelectorAll<HTMLScriptElement>('script[src]').forEach(script => {
    const src = script.src
    const domain = extractDomain(src)
    if (isTrackerDomain(domain)) {
      trackers.push({ domain, source: src, type: 'script', category: categorizeTracker(domain) })
    }
  })

  document.querySelectorAll<HTMLScriptElement>('script:not([src])').forEach(script => {
    const text = script.textContent || ''
    for (const pattern of INLINE_TRACKING_PATTERNS) {
      if (pattern.test(text)) {
        const match = text.match(pattern)
        trackers.push({
          domain: window.location.hostname,
          source: match ? match[0].substring(0, 40) : 'inline tracking script',
          type: 'inline',
          category: categorizeTracker(window.location.hostname),
          details: match ? match[0].substring(0, 60) : 'tracking code detected',
        })
        break
      }
    }
  })

  document.querySelectorAll<HTMLImageElement>('img').forEach(img => {
    if (img.width <= 1 && img.height <= 1 && img.src) {
      const domain = extractDomain(img.src)
      trackers.push({ domain, source: img.src, type: 'pixel', category: 'tracking', details: 'Tracking pixel' })
      trackingPixels = true
    }
  })

  document.querySelectorAll<HTMLIFrameElement>('iframe').forEach(iframe => {
    const src = iframe.src
    if (src) {
      const domain = extractDomain(src)
      if (isTrackerDomain(domain)) {
        trackers.push({ domain, source: src, type: 'iframe', category: categorizeTracker(domain) })
        hiddenIframes = true
      }
      const iframeRect = iframe.getBoundingClientRect()
      if (iframeRect.width <= 1 || iframeRect.height <= 1 || iframe.style.display === 'none' || iframe.style.visibility === 'hidden') {
        const domain = extractDomain(src)
        trackers.push({ domain, source: src, type: 'hidden', category: 'tracking', details: 'Hidden iframe' })
        hiddenIframes = true
        hiddenElementsFound++
      }
    }
  })

  const HIDDEN_TAGS = new Set(['A', 'IMG', 'DIV', 'SPAN', 'INPUT', 'BUTTON', 'CANVAS', 'OBJECT', 'EMBED', 'P', 'LI', 'TD'])
  const MAX_HIDDEN_SCAN = 3000
  let hiddenScanCount = 0
  for (const el of document.querySelectorAll('*')) {
    if (++hiddenScanCount > MAX_HIDDEN_SCAN) break
    const tag = (el as HTMLElement).tagName
    if (tag === 'IFRAME' || tag === 'SCRIPT' || !HIDDEN_TAGS.has(tag)) continue
    const h = el as HTMLElement
    if (h.offsetParent === null || h.offsetWidth <= 1 || h.offsetHeight <= 1) {
      hiddenElementsFound++
    }
  }

  const entries = performance.getEntriesByType('resource')
  for (const entry of entries) {
    const domain = extractDomain((entry as PerformanceResourceTiming).name)
    if (isTrackerDomain(domain) && !trackers.some(t => t.source === (entry as PerformanceResourceTiming).name)) {
      trackers.push({
        domain,
        source: (entry as PerformanceResourceTiming).name,
        type: 'script',
        category: categorizeTracker(domain),
        details: `Loaded in ${Math.round((entry as PerformanceResourceTiming).duration)}ms`,
      })
    }
  }

  const totalCookies = document.cookie ? document.cookie.split(';').length : 0

  let localStorageItems = 0
  try {
    if (window.localStorage) localStorageItems = window.localStorage.length
  } catch {}

  let sessionStorageItems = 0
  try {
    if (window.sessionStorage) sessionStorageItems = window.sessionStorage.length
  } catch {}

  return {
    trackers,
    trackingPixels,
    hiddenIframes,
    hiddenElementsFound,
    totalCookies,
    localStorageItems,
    sessionStorageItems,
  }
}

function scanThirdPartyRequests(): number {
  try {
    const entries = performance.getEntriesByType('resource')
    const currentDomain = window.location.hostname
    let count = 0
    for (const entry of entries) {
      try {
        const url = new URL((entry as PerformanceResourceTiming).name)
        if (url.hostname !== currentDomain) count++
      } catch {}
    }
    return count
  } catch { return 0 }
}

function isTrackingStorageKey(key: string): boolean {
  return STORAGE_TRACKER_KEYS.some(tk => key.startsWith(tk) || key.toLowerCase().includes(tk.toLowerCase()))
}

function scanStorage(): { localStorageItems: number; sessionStorageItems: number; trackingKeys: number } {
  let lsItems = 0
  let ssItems = 0
  let trackingKeys = 0
  try {
    if (window.localStorage) {
      lsItems = window.localStorage.length
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i)
        if (k && isTrackingStorageKey(k)) trackingKeys++
      }
    }
  } catch {}
  try {
    if (window.sessionStorage) {
      ssItems = window.sessionStorage.length
    }
  } catch {}
  return { localStorageItems: lsItems, sessionStorageItems: ssItems, trackingKeys }
}

function scanPage() {
  const trackerResult = scanForTrackers()
  const storageResult = scanStorage()
  const thirdParty = scanThirdPartyRequests()

  const result = {
    url: window.location.href,
    domain: window.location.hostname.replace(/^www\./, ''),
    scannedAt: Date.now(),
    trackers: trackerResult.trackers,
    fingerprintingAttempts: fingerprintingCount,
    canvasAttempts,
    audioAttempts,
    hasTrackingPixels: trackerResult.trackingPixels,
    hasHiddenIframes: trackerResult.hiddenIframes,
    hiddenElements: trackerResult.hiddenElementsFound,
    beaconCalls,
    suspiciousInlineScripts: trackerResult.trackers.filter(t => t.type === 'inline').length,
    webRTCLeakDetected: webRTCDetected,
    thirdPartyRequests: thirdParty,
    totalCookies: trackerResult.totalCookies,
    localStorageItems: storageResult.localStorageItems,
    sessionStorageItems: storageResult.sessionStorageItems,
  }

  safeSend({ type: 'PAGE_SCAN_RESULT', result })
}

function hookAPIs() {
  const origToDataURL = HTMLCanvasElement.prototype.toDataURL
  HTMLCanvasElement.prototype.toDataURL = function (this: HTMLCanvasElement) {
    fingerprintingCount++
    canvasAttempts++
    return origToDataURL.apply(this, arguments as unknown as [string | undefined, number | undefined])
  }

  const origGetImageData = CanvasRenderingContext2D.prototype.getImageData
  CanvasRenderingContext2D.prototype.getImageData = function (this: CanvasRenderingContext2D) {
    fingerprintingCount++
    canvasAttempts++
    return origGetImageData.apply(this, arguments as unknown as [number, number, number, number, ImageDataSettings | undefined])
  }

  const origSendBeacon = navigator.sendBeacon
  navigator.sendBeacon = function (this: Navigator) {
    beaconCalls++
    return origSendBeacon.apply(this, arguments as unknown as [string, BodyInit | undefined])
  }

  const OrigAudioContext = (window as any).AudioContext || (window as any).webkitAudioContext
  if (OrigAudioContext) {
    const AudioContextProxy = function (this: any, ...args: any[]) {
      audioAttempts++
      fingerprintingCount++
      return new OrigAudioContext(...args)
    } as any
    AudioContextProxy.prototype = OrigAudioContext.prototype
    ;(window as any).AudioContext = AudioContextProxy
    if ((window as any).webkitAudioContext) {
      ;(window as any).webkitAudioContext = AudioContextProxy
    }
  }

  try {
    const OrigRTCPeerConnection = (window as any).RTCPeerConnection || (window as any).webkitRTCPeerConnection
    if (OrigRTCPeerConnection) {
      const RTCPeerConnectionProxy = function (this: any, ...args: any[]) {
        webRTCDetected = true
        return new OrigRTCPeerConnection(...args)
      } as any
      RTCPeerConnectionProxy.prototype = OrigRTCPeerConnection.prototype
      ;(window as any).RTCPeerConnection = RTCPeerConnectionProxy
      if ((window as any).webkitRTCPeerConnection) {
        ;(window as any).webkitRTCPeerConnection = RTCPeerConnectionProxy
      }
    }
  } catch {}
}

function sendFingerprint(): void {
  if (!isContextValid()) { cleanup(); return }
  safeSend({ type: 'FINGERPRINT_REPORT', fingerprint: collectFingerprint() })
}

function trackHttps(): void {
  safeSend({
    type: 'HTTPS_UPDATE',
    isHttps: window.location.protocol === 'https:',
  })
}

function detectPasswordForms(): void {
  const forms = document.querySelectorAll('form')
  for (const form of forms) {
    const passwordInput = form.querySelector('input[type="password"]')
    if (passwordInput) {
      safeSend({
        type: 'PASSWORD_FORM_DETECTED',
        url: window.location.href,
        hasPasswordField: true,
        isOverHttp: window.location.protocol !== 'https:',
        formAction: (form as HTMLFormElement).action || '',
        autocomplete: passwordInput.getAttribute('autocomplete') || '',
      })
    }
  }
}

function isContextValid(): boolean {
  try { return Boolean(chrome.runtime?.id) } catch { return false }
}

function safeSend(msg: any): void {
  try {
    if (!chrome.runtime?.id) { console.warn('safeSend: extension context invalidated'); return }
    chrome.runtime.sendMessage(msg).catch(e => console.warn('safeSend failed:', msg.type, e))
  } catch (e) { console.warn('safeSend error:', e); cleanup() }
}

function cleanup(): void {
  if (fpInterval !== null) { clearInterval(fpInterval); fpInterval = null }
  window.removeEventListener('resize', sendFingerprint)
  stopUrlCleaner()
}

chrome.runtime.onMessage.addListener((msg: any, _sender: any, sendResponse: any) => {
  if (msg.type === 'SCAN_PASSWORD_FORMS') { detectPasswordForms(); if (sendResponse) sendResponse({ success: true }) }
  if (msg.type === 'SCAN_PAGE') { scanPage(); if (sendResponse) sendResponse({ success: true }) }
})

try {
  if (!isContextValid()) throw new Error('Extension context invalidated')

  hookAPIs()
  sendFingerprint()
  trackHttps()
  detectPasswordForms()

  setTimeout(scanPage, 2000)

  window.addEventListener('resize', sendFingerprint)
  fpInterval = setInterval(sendFingerprint, 60000)

  initUrlCleaner()
  initPermissionMonitor()
} catch { cleanup() }

window.addEventListener('beforeunload', cleanup)
