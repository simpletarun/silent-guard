export const TRACKER_DOMAINS_LIST = [
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
  'ssl.google-analytics.com',
  'stats.g.doubleclick.net',
  'cdn.segment.com', 'cdn.mxpnl.com',
  'dpm.demdex.net', 'ads.yahoo.com',
  'advertising.yahoo.com', 'analytics.yahoo.com',
  'cdp.cloud.unity3d.com', 'www.googleadservices.com',
  'googleads.g.doubleclick.net', 'tpc.googlesyndication.com',
  'cm.g.doubleclick.net', 'partner.googleadservices.com',
  'px.ads.linkedin.com',
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
  // Content platforms (youtube/vimeo embeds are media, not tracking) were
  // removed here — they produced the loudest false positives.
  'disqus.com',
  'wistia.net', 'fast.wistia.net',
  'crazyegg.com', 'mouseflow.com',
  'fullstory.com', 'luckyorange.com',
  'sessioncam.com', 'smartlook.com',
  'clarity.ms',
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
  // App-infrastructure backends (pusher/socket/firebase) power the site's
  // OWN realtime features — flagging them reported every Firebase app as
  // "tracked". Removed.
  'algolia.net', 'cdn.algolia.net',
  'optimize.google.com', 'www.googleoptimize.com',
]

export function normalizeTrackerDomain(entry: string): string {
  try {
    return new URL(entry.startsWith('http') ? entry : `https://${entry}`).hostname
  } catch {
    return entry
  }
}
