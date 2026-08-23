const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
  'fbclid', 'gclid', 'gclsrc', 'dclid', 'msclkid',
  // No bare 'ref': GitHub ?ref=branch, docs deep-links and CMS refs are
  // functional, not tracking. Genuine ad-click params below are safe to strip.
  'si', 'yclid', '_openstat', 'wickedid', '_ga', '_gl',
  'mc_cid', 'mc_eid', 'oly_anon_id', 'oly_enc_id',
  '_bta_tid', 'trk_contact', 'trk_msg', 'trk_module', 'trk_sid',
  'mtm_source', 'mtm_medium', 'mtm_campaign', 'mtm_keyword', 'mtm_content',
  'pk_source', 'pk_medium', 'pk_campaign', 'pk_keyword', 'pk_content',
  'srsltid', 'gbraid', 'wbraid', 'twclid', 'igshid', 'mkt_tok', 'li_fat_id', 'zanpid',
])

function cleanUrl(url: string): string {
  try {
    // Resolve relative hrefs against <base href> — window.location.origin
    // mangles links on pages that declare a different document base.
    const parsed = new URL(url, document.baseURI || window.location.origin)
    let changed = false
    // Snapshot the keys first — URLSearchParams.keys() is a live iterator,
    // so deleting while iterating skips every other parameter.
    for (const rawKey of [...parsed.searchParams.keys()]) {
      const key = rawKey.toLowerCase()
      if (TRACKING_PARAMS.has(key)) {
        parsed.searchParams.delete(rawKey)
        changed = true
      }
    }
    if (changed) {
      const result = parsed.toString()
      return result.endsWith('?') ? result.slice(0, -1) : result
    }
  } catch { }
  return url
}

function cleanLink(a: HTMLAnchorElement): void {
  try {
    const href = a.getAttribute('href')
    if (!href) return
    const cleaned = cleanUrl(href)
    if (cleaned !== href) {
      a.setAttribute('href', cleaned)
    }
  } catch { }
}

function cleanAllLinks(): void {
  const links = document.querySelectorAll<HTMLAnchorElement>('a[href]')
  for (let i = 0; i < links.length; i++) {
    cleanLink(links[i])
  }
}

function cleanCurrentUrl(): void {
  try {
    const cleaned = cleanUrl(window.location.href)
    if (cleaned !== window.location.href) {
      window.history.replaceState({}, '', cleaned)
    }
  } catch { }
}

let observer: MutationObserver | null = null
let cleanerActive = false

function startObserver(): void {
  if (cleanerActive) return
  cleanerActive = true
  if (observer) observer.disconnect()
  observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'childList') {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1) {
            const el = node as HTMLElement
            if (el.tagName === 'A') {
              cleanLink(el as HTMLAnchorElement)
            }
            if (el.querySelectorAll) {
              const nested = el.querySelectorAll<HTMLAnchorElement>('a[href]')
              for (let i = 0; i < nested.length; i++) {
                cleanLink(nested[i])
              }
            }
          }
        }
      }
    }
  })
  observer.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true,
  })
}

export function stopUrlCleaner(): void {
  if (observer) {
    observer.disconnect()
    observer = null
  }
  cleanerActive = false
}

export function initUrlCleaner(): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      cleanCurrentUrl()
      cleanAllLinks()
      startObserver()
    })
  } else {
    cleanCurrentUrl()
    cleanAllLinks()
    startObserver()
  }
  window.addEventListener('beforeunload', stopUrlCleaner)
  window.addEventListener('popstate', () => {
    cleanCurrentUrl()
    cleanAllLinks()
    startObserver()
  })
  // SPA navigations never fire popstate — track pushState/replaceState too.
  const origPush = window.history.pushState.bind(window.history)
  const origReplace = window.history.replaceState.bind(window.history)
  window.history.pushState = (data, unused, url) => {
    const r = origPush(data, unused, url)
    cleanCurrentUrl()
    return r
  }
  window.history.replaceState = (data, unused, url) => {
    const r = origReplace(data, unused, url)
    cleanCurrentUrl()
    return r
  }
}
