let listenerAttached = false

function injectApiHooks(): void {
  try {
    if (!chrome.runtime?.id) return
    const script = document.createElement('script')
    script.src = chrome.runtime.getURL('sensor-hooks.js')
    if (document.documentElement) {
      document.documentElement.appendChild(script)
      script.onload = () => script.remove()
    }
  } catch { }
}

function listenForReports(): void {
  if (listenerAttached) return
  listenerAttached = true
  window.addEventListener('message', (event) => {
    const d = event.data
    if (!d || d.source !== '__SG_SENSOR__') return
    try {
      if (!chrome.runtime?.id) return
      chrome.runtime.sendMessage({
        type: 'SENSOR_USAGE',
        data: {
          api: d.api,
          details: d.details || '',
          url: d.url || window.location.href,
          timestamp: d.time || Date.now(),
        },
      }).catch(() => {})
    } catch { }
  })
}

export function initPermissionMonitor(): void {
  injectApiHooks()
  listenForReports()
}
