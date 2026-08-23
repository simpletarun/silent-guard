import { PageScanResult } from '../types'

// Longest-suffix keys so subdomains (tr.snapchat.com) match their base.
const TRACKER_COMPANY_NAMES: Record<string, string> = {
  'google-analytics.com': 'Google', 'googletagmanager.com': 'Google', 'doubleclick.net': 'Google Ads',
  'googleadservices.com': 'Google Ads', 'googlesyndication.com': 'Google Ads', 'adservice.google.com': 'Google Ads',
  'googleoptimize.com': 'Google', 'optimize.google.com': 'Google', 'ampproject.org': 'Google AMP',
  'facebook.net': 'Meta (Facebook)', 'facebook.com': 'Meta (Facebook)',
  'twitter.com': 'X (Twitter)', 'ads-twitter.com': 'X (Twitter)',
  'scorecardresearch.com': 'Comscore', 'adsrvr.org': 'The Trade Desk', 'adnxs.com': 'Xandr (AppNexus)',
  'rubiconproject.com': 'Magnite (Rubicon)', 'criteo.com': 'Criteo', 'hotjar.com': 'Hotjar',
  'mixpanel.com': 'Mixpanel', 'mxpnl.com': 'Mixpanel', 'amplitude.com': 'Amplitude',
  'segment.io': 'Segment (Twilio)', 'optimizely.com': 'Optimizely', 'newrelic.com': 'New Relic',
  'datadoghq.com': 'Datadog', 'clarity.ms': 'Microsoft Clarity', 'bat.bing.com': 'Microsoft (Bing Ads)',
  'quantserve.com': 'Quantcast', 'linkedin.com': 'LinkedIn', 'licdn.com': 'LinkedIn',
  'snapchat.com': 'Snapchat', 'tiktok.com': 'TikTok', 'pinterest.com': 'Pinterest',
  'reddit.com': 'Reddit', 'redditstatic.com': 'Reddit',
  'outbrain.com': 'Outbrain', 'taboola.com': 'Taboola', 'media.net': 'Media.net',
  'casalemedia.com': 'Casalemedia', 'bidswitch.net': 'BidSwitch', 'openx.net': 'OpenX',
  'pubmatic.com': 'PubMatic', 'sharethrough.com': 'Sharethrough', 'indexww.com': 'Index Exchange',
  'sovrn.com': 'Sovrn', 'agkn.com': 'Agkn', 'contextweb.com': 'PulsePoint', 'mookie1.com': 'Media Innovation Group',
  'turn.com': 'Amobee (Turn)', 'mathtag.com': 'MediaMath', 'bluekai.com': 'Oracle (BlueKai)',
  'exelator.com': 'Nielsen (Exelate)', 'krxd.net': 'Salesforce (Krux)', 'rlcdn.com': 'LiveRamp',
  'demandbase.com': 'Demandbase', '6sc.co': '6Sense', 'sumo.com': 'Sumo', 'addthis.com': 'Oracle (AddThis)',
  'disqus.com': 'Disqus', 'youtube.com': 'YouTube (Google)', 'vimeo.com': 'Vimeo', 'wistia.net': 'Wistia',
  'crazyegg.com': 'Crazy Egg', 'mouseflow.com': 'Mouseflow', 'fullstory.com': 'FullStory',
  'luckyorange.com': 'Lucky Orange', 'sessioncam.com': 'SessionCam', 'smartlook.com': 'Smartlook',
  'heap.com': 'Heap', 'heapanalytics.com': 'Heap', 'posthog.com': 'PostHog',
  'piwik.org': 'Matomo', 'matomo.org': 'Matomo', 'plausible.io': 'Plausible',
  'simpleanalyticscdn.com': 'Simple Analytics', 'fomo.com': 'Fomo', 'pushcrew.com': 'PushCrew',
  'onesignal.com': 'OneSignal', 'intercom.io': 'Intercom', 'intercomcdn.com': 'Intercom',
  'drift.com': 'Drift', 'hubspot.com': 'HubSpot', 'hs-scripts.com': 'HubSpot',
  'salesforce.com': 'Salesforce', 'sfdc-studio.us': 'Salesforce', 'zendesk.com': 'Zendesk',
  'freshchat.com': 'Freshchat', 'tidio.co': 'Tidio', 'crisp.chat': 'Crisp', 'tawk.to': 'Tawk.to',
  'livechatinc.com': 'LiveChat', 'olark.com': 'Olark', 'pusher.com': 'Pusher',
  'socket.io': 'Socket.IO', 'firebaseio.com': 'Google Firebase', 'auth.firebase.com': 'Google Firebase',
  'algolia.net': 'Algolia', 'yahoo.com': 'Yahoo', 'unity3d.com': 'Unity',
  'demdex.net': 'Adobe (Audience Manager)',
}

const MULTI_LABEL_SUFFIXES = [
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.in', 'co.jp', 'com.br',
  'com.mx', 'co.za', 'com.sg', 'com.hk', 'com.tr', 'co.nz', 'com.my', 'com.ph', 'com.vn',
  'com.ua', 'co.id', 'com.tw', 'co.kr', 'com.pl',
]

const COMMON_SUBDOMAINS = new Set([
  'www', 'cdn', 'static', 'js', 'code', 'embed', 'connect', 'tr', 'ct', 'px', 'ads', 'analytics',
  'platform', 'bat', 'dpm', 'cm', 'tpc', 'partner', 'ssl', 'stats', 'amplify', 'trc', 'alb',
  'queue', 'client', 'assets', 'fast', 'player', 'pixel', 'snap', 'auth', 'd2xxq4l49t34gd',
])

// Noise entries the card hides: inline scripts label the page's own
// hostname (the "gtag(" noise — not a tracker company), tracking pixels
// are counted by hasTrackingPixels, and GTM/consent infra domains appear
// on nearly every site without tracking anyone.
const NOISE_DOMAINS = new Set(['googletagmanager.com', 'policies.google.com', 'consent.google.com'])
const NOISE_TYPES = new Set(['inline', 'pixel'])

export function isNoiseTracker(t: { domain: string; type: string }): boolean {
  return NOISE_TYPES.has(t.type) || NOISE_DOMAINS.has(t.domain.toLowerCase())
}

export function trackerTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    script: 'Script', inline: 'Inline Script', pixel: 'Pixel', iframe: 'Iframe',
    hidden: 'Hidden Iframe', image: 'Image', beacon: 'Beacon', cookie: 'Cookie',
  }
  return labels[type] || type
}

export function companyNameForTracker(domain: string): string {
  const d = (domain || '').toLowerCase()
  if (!d) return 'Unknown'
  let best: string | null = null
  for (const key of Object.keys(TRACKER_COMPANY_NAMES)) {
    if (d === key || d.endsWith('.' + key)) {
      if (!best || key.length > best.length) best = key
    }
  }
  if (best) return TRACKER_COMPANY_NAMES[best]
  return humanize(d)
}

function stripPublicSuffix(base: string): string {
  for (const suf of MULTI_LABEL_SUFFIXES) {
    if (base.endsWith('.' + suf)) return base.slice(0, -suf.length - 1)
  }
  return base.replace(/\.[a-z]{2,12}$/, '')
}

function humanize(d: string): string {
  const labels = d.split('.')
  if (labels.length > 1 && COMMON_SUBDOMAINS.has(labels[0])) labels.shift()
  // Keep the third label when the trailing two form a public suffix
  // (shop.now.co.uk -> "Now", not "Co").
  let base = labels.join('.')
  if (labels.length > 2) {
    const last2 = labels.slice(-2).join('.')
    base = MULTI_LABEL_SUFFIXES.includes(last2) ? labels.slice(-3).join('.') : last2
  } else {
    base = labels.join('.')
  }
  const name = stripPublicSuffix(base).replace(/[-_]/g, ' ')
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : 'Unknown'
}

export interface WhoTracksRow {
  company: string
  domain: string
  category: string
  sites: string[]
  types: string[]
  siteCount: number
}

// Legacy scans may miss `domain` — fall back to the URL hostname.
function siteOf(scan: PageScanResult): string {
  if (typeof scan.domain === 'string' && scan.domain) return scan.domain
  try { return new URL(scan.url).hostname.replace(/^www\./, '') } catch { return 'unknown' }
}

export function aggregateWhoTracksMe(pageScans: PageScanResult[]): WhoTracksRow[] {
  const map = new Map<string, { company: string; domain: string; category: string; sites: Set<string>; types: Set<string> }>()
  for (const scan of pageScans) {
    // Legacy scans may miss `trackers` entirely — iterating undefined here
    // would crash the whole Privacy tab (engine.ts already defends).
    for (const t of Array.isArray(scan.trackers) ? scan.trackers : []) {
      if (isNoiseTracker(t)) continue
      const key = t.domain.toLowerCase()
      let row = map.get(key)
      if (!row) {
        row = { company: companyNameForTracker(key), domain: key, category: t.category || 'tracking', sites: new Set(), types: new Set() }
        map.set(key, row)
      }
      row.sites.add(siteOf(scan))
      row.types.add(t.type)
    }
  }
  return [...map.values()]
    .map(r => ({
      company: r.company, domain: r.domain, category: r.category,
      sites: [...r.sites].sort(), types: [...r.types], siteCount: r.sites.size,
    }))
    .sort((a, b) => b.siteCount - a.siteCount || a.company.localeCompare(b.company))
}

export function normalizeScanUrl(url: string): string {
  try {
    const u = new URL(url)
    return u.origin + u.pathname
  } catch { return url }
}

// Trackers on the active tab, most sightings first; null when no scan of
// that tab exists yet (the popup triggers a fresh one on open).
export interface CurrentSiteTracker {
  company: string
  domain: string
}

export function currentPageTrackers(pageScans: PageScanResult[], tabUrl: string | undefined): CurrentSiteTracker[] | null {
  if (!tabUrl) return null
  const normalized = normalizeScanUrl(tabUrl)
  let scan = pageScans.find(s => s.url === normalized)
  if (!scan) {
    try {
      const host = new URL(tabUrl).hostname.replace(/^www\./, '')
      scan = pageScans.find(s => s.domain === host)
    } catch {}
  }
  if (!scan) return null
  const counts = new Map<string, { company: string; domain: string; count: number }>()
  for (const t of Array.isArray(scan.trackers) ? scan.trackers : []) {
    if (isNoiseTracker(t)) continue
    const domain = t.domain.toLowerCase()
    const row = counts.get(domain)
    if (row) row.count++
    else counts.set(domain, { company: companyNameForTracker(domain), domain, count: 1 })
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.company.localeCompare(b.company))
    .map(({ company, domain }) => ({ company, domain }))
}