import { useState, useEffect, useCallback, useRef } from 'react'
import { SecurityState, GlobalSettings, BackgroundMessage, PolicyReport } from '../../types'
import { showToast } from '../components/shared/Toast'

// Wake up the background service worker (MV3 non-persistent)
async function wakeBackground(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type: 'PING' })
  } catch {
    // Worker may be starting or shutting down — the real message retries below
  }
}

async function sendMessage<T>(message: BackgroundMessage): Promise<T | null> {
  // Warm the MV3 service worker in parallel — the real message wakes it anyway,
  // but sending PING concurrently (not awaited) avoids one full round trip of
  // latency on every message while keeping first-message wake reliable.
  wakeBackground()

  return new Promise<T | null>((resolve) => {
    // Two independent timer tracks: retries wait out the worker wake-up while
    // the hard deadline aborts them. Reusing one variable let the deadline
    // fire mid-retry (resolve null) and a later cleanup cancel a live retry.
    const timers = new Set<ReturnType<typeof setTimeout>>()
    let settled = false

    const clearTimers = () => {
      for (const t of timers) clearTimeout(t)
      timers.clear()
    }
    // First resolve wins; later calls are no-ops.
    const settle = (value: T | null) => {
      if (settled) return
      settled = true
      clearTimers()
      resolve(value)
    }

    const send = (attempt: number) => {
      if (settled) return
      try {
        chrome.runtime.sendMessage(message, (response: T) => {
          if (settled) return
          if (chrome.runtime.lastError) {
            const err = chrome.runtime.lastError.message || ''
            // Worker is between lifecycles — retry a few times with backoff
            if (attempt < 3 && /Receiving end does not exist/i.test(err)) {
              timers.add(setTimeout(() => send(attempt + 1), 300 * (attempt + 1)))
              return
            }
            console.warn('sendMessage error:', message.type, err)
            settle(null)
          } else if (response && (response as any).success === false) {
            console.warn('sendMessage warning:', message.type, response)
            // Pass the full payload through — callers read resp.error on failure
            settle(response as T)
          } else {
            settle(response as T)
          }
        })
      } catch (e) {
        console.error('sendMessage failed:', message.type, e)
        settle(null)
      }
    }

    send(0)

    // Hard deadline: abort retries and give up after 5s.
    timers.add(setTimeout(() => {
      if (!settled) console.warn('sendMessage timeout:', message.type)
      settle(null)
    }, 5000))
  })
}

export function useSecurityState() {
  const [state, setState] = useState<SecurityState | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const resp = await sendMessage<{ success: boolean; state?: SecurityState }>({ type: 'GET_STATE' })
      if (resp?.success && resp.state) {
        setState(resp.state)
      }
    } catch { }
    setLoading(false)
  }, [])

  useEffect(() => {
    let mounted = true

    // Restore from chrome.storage for instant loading
    chrome.storage.local.get(['silent_guard_state']).then((result) => {
      if (!mounted) return
      const data = result.silent_guard_state as { securityState?: SecurityState }
      if (data?.securityState) {
        setState(data.securityState)
        setLoading(false)
      } else {
        // No cache - fetch from background
        sendMessage<{ success: boolean; state?: SecurityState }>({ type: 'GET_STATE' })
          .then(resp => {
            if (!mounted) return
            if (resp?.success && resp.state) {
              setState(resp.state)
            }
            setLoading(false)
          })
          .catch(() => setLoading(false))
      }
    }).catch(() => { if (mounted) setLoading(false) })

    // Debounce STATE_UPDATED broadcasts — the background saves state often
    // during scans, so re-render at most every 250ms instead of per-save.
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const handler = (msg: any) => {
      if (msg?.type !== 'STATE_UPDATED') return
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => refresh(), 250)
    }
    chrome.runtime.onMessage.addListener(handler)

    return () => {
      mounted = false
      if (debounceTimer) clearTimeout(debounceTimer)
      chrome.runtime.onMessage.removeListener(handler)
    }
  }, [refresh])

  const removeAccount = useCallback(async (domain: string) => {
    const resp = await sendMessage<{ success: boolean }>({ type: 'REMOVE_ACCOUNT', domain })
    if (!resp?.success) {
      showToast(`Failed to remove account: ${domain}`, 'error')
    }
    refresh()
  }, [refresh])

  return { state, loading, refresh, removeAccount }
}

export function useSettings() {
  const [settings, setSettings] = useState<GlobalSettings | null>(null)

  const refresh = useCallback(async () => {
    const resp = await sendMessage<{ success: boolean; settings?: GlobalSettings }>({ type: 'GET_SETTINGS' })
    if (resp?.success && resp.settings) setSettings(resp.settings)
  }, [])

  useEffect(() => {
    refresh()
    const handler = (msg: any) => {
      if (msg?.type === 'STATE_UPDATED') refresh()
    }
    chrome.runtime.onMessage.addListener(handler)
    return () => {
      chrome.runtime.onMessage.removeListener(handler)
    }
  }, [refresh])

  const update = useCallback(async (updates: Partial<GlobalSettings>) => {
    const resp = await sendMessage<{ success: boolean }>({ type: 'UPDATE_SETTINGS', settings: updates })
    if (!resp?.success) {
      showToast('Failed to update settings', 'error')
      refresh()
      return
    }
    setSettings(prev => prev ? { ...prev, ...updates } : prev)
  }, [refresh])

  return { settings, update }
}

export function useActions(onDone?: () => void) {
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  const acknowledgeEvent = useCallback(async (eventId: string) => {
    const resp = await sendMessage<{ success: boolean }>({ type: 'ACKNOWLEDGE_EVENT', eventId })
    if (!resp?.success) showToast('Failed to acknowledge event', 'error')
    onDoneRef.current?.()
  }, [])

  const scanExtensions = useCallback(async () => {
    const resp = await sendMessage<{ success: boolean }>({ type: 'SCAN_EXTENSIONS' })
    if (!resp?.success) showToast('Failed to scan extensions', 'error')
  }, [])

  const addAccount = useCallback(async (domain: string, name: string) => {
    const resp = await sendMessage<{ success: boolean }>({ type: 'ADD_ACCOUNT', domain, name })
    if (!resp?.success) showToast(`Failed to add account: ${domain}`, 'error')
    onDoneRef.current?.()
  }, [])

  const removeExtension = useCallback((extensionId: string) => {
    // Must run in the popup: chrome.management.uninstall requires a live user
    // gesture, which does not survive the message hop to the service worker.
    chrome.management.uninstall(extensionId, () => {
      if (chrome.runtime.lastError) {
        showToast(chrome.runtime.lastError.message || 'Failed to remove extension', 'error')
      }
      // Success: background's management.onUninstalled listener rescans + broadcasts
    })
  }, [])

  return {
    acknowledgeEvent,
    scanExtensions,
    addAccount, removeExtension,
  }
}

export function usePolicyReports() {
  const [reports, setReports] = useState<PolicyReport[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const r = await sendMessage<{ success: boolean; reports?: PolicyReport[] }>({ type: 'GET_POLICY_REPORTS' })
      if (r?.success && r.reports) {
        setReports(r.reports)
      }
    } catch { }
    setLoading(false)
  }, [])

  const analyze = useCallback(async (domain: string, policyUrl?: string) => {
    try {
      const resp = await sendMessage<{ success: boolean }>({ type: 'ANALYZE_POLICY', domain, policyUrl })
      if (resp?.success) {
        // Refresh after analysis completes (background will send STATE_UPDATED)
        setTimeout(refresh, 2000)
      } else if (resp && resp.success === false) {
        showToast('Analysis failed — try again', 'error')
      }
      // resp undefined = the 45s deadline hit; its own timeout toast covers it
    } catch {
      showToast('Analysis failed — try again', 'error')
    }
  }, [refresh])

  useEffect(() => {
    let mounted = true

    // Restore from chrome.storage for instant loading
    chrome.storage.local.get(['silent_guard_state']).then((result) => {
      if (!mounted) return

      const data = result.silent_guard_state as { securityState?: { policyReports?: PolicyReport[] } }

      // Restore from cache if available
      const cachedReports = data?.securityState?.policyReports
      if (cachedReports && cachedReports.length > 0) {
        setReports(cachedReports)
        setLoading(false)

        // Update from background in background
        sendMessage<{ success: boolean; reports?: PolicyReport[] }>({ type: 'GET_POLICY_REPORTS' })
          .then(r => {
            if (!mounted) return
            if (r?.success && r.reports) {
              setReports(r.reports)
            }
          }).catch(() => {})
        return
      }

      // No cache - fetch from background with wait
      const timeout = setTimeout(() => {
        if (mounted) setLoading(false)
      }, 5000)

      sendMessage<{ success: boolean; reports?: PolicyReport[] }>({ type: 'GET_POLICY_REPORTS' })
        .then(r => {
          if (!mounted) return
          clearTimeout(timeout)
          if (r?.success && r.reports) {
            setReports(r.reports)
          }
          setLoading(false)
        }).catch(() => {
          clearTimeout(timeout)
          if (mounted) setLoading(false)
        })
    }).catch(() => { if (mounted) setLoading(false) })

    const handler = (msg: any) => {
      if (msg?.type === 'STATE_UPDATED') refresh()
    }
    chrome.runtime.onMessage.addListener(handler)

    return () => {
      mounted = false
      chrome.runtime.onMessage.removeListener(handler)
    }
  }, [refresh])

  return { reports, loading, refresh, analyze }
}