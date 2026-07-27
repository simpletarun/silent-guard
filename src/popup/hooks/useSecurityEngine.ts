import { useState, useEffect, useCallback, useRef } from 'react'
import { SecurityState, GlobalSettings, BackgroundMessage } from '../../types'
import { showToast } from '../components/shared/Toast'

async function sendMessage<T>(message: BackgroundMessage): Promise<T | null> {
  try {
    return await chrome.runtime.sendMessage(message)
  } catch (e) {
    console.error('sendMessage failed:', message.type, e)
    showToast(`${message.type} failed: connection error`, 'error')
    return null as unknown as T
  }
}

export function useSecurityState() {
  const [state, setState] = useState<SecurityState | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const s = await sendMessage<SecurityState>({ type: 'GET_STATE' })
      if (s) setState(s)
    } catch { }
    setLoading(false)
  }, [])

  const removeAccount = useCallback(async (domain: string) => {
    const resp = await sendMessage<{ success: boolean }>({ type: 'REMOVE_ACCOUNT', domain })
    if (!resp?.success) {
      showToast(`Failed to remove account: ${domain}`, 'error')
    }
    refresh()
  }, [refresh])

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

  return { state, loading, refresh, removeAccount }
}

export function useSettings() {
  const [settings, setSettings] = useState<GlobalSettings | null>(null)

  const refresh = useCallback(async () => {
    const s = await sendMessage<GlobalSettings>({ type: 'GET_SETTINGS' })
    if (s) setSettings(s)
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
    await sendMessage({ type: 'UPDATE_SETTINGS', settings: updates })
    setSettings(prev => prev ? { ...prev, ...updates } : prev)
  }, [])

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

  const clearEvents = useCallback(async () => {
    const resp = await sendMessage<{ success: boolean }>({ type: 'CLEAR_EVENTS' })
    if (!resp?.success) showToast('Failed to clear events', 'error')
    onDoneRef.current?.()
  }, [])

  const scanExtensions = useCallback(async () => {
    const resp = await sendMessage<{ success: boolean }>({ type: 'SCAN_EXTENSIONS' })
    if (!resp?.success) showToast('Failed to scan extensions', 'error')
    onDoneRef.current?.()
  }, [])

  const checkIp = useCallback(async () => {
    const resp = await sendMessage<{ success: boolean }>({ type: 'CHECK_IP' })
    if (!resp?.success) showToast('Failed to check IP', 'error')
    onDoneRef.current?.()
  }, [])

  const addAccount = useCallback(async (domain: string, name: string) => {
    const resp = await sendMessage<{ success: boolean }>({ type: 'ADD_ACCOUNT', domain, name })
    if (!resp?.success) showToast(`Failed to add account: ${domain}`, 'error')
    onDoneRef.current?.()
  }, [])

  const removeExtension = useCallback(async (extensionId: string) => {
    const resp = await sendMessage<{ success: boolean }>({ type: 'REMOVE_EXTENSION', extensionId })
    if (!resp?.success) showToast('Failed to remove extension', 'error')
    onDoneRef.current?.()
  }, [])

  return {
    acknowledgeEvent, clearEvents,
    scanExtensions, checkIp,
    addAccount, removeExtension,
  }
}
