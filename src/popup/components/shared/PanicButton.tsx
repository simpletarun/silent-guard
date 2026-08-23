
import { useEffect, useRef, useState } from 'react'
import { SecurityState } from '../../../types'

const HOLD_MS = 2000
const COUNTDOWN_SECONDS = 3

interface Props {
  state: SecurityState
}

export default function PanicButton({ state }: Props) {
  const [localActive, setLocalActive] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS)
  const [holding, setHolding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const holdTimer = useRef<number | null>(null)

  const panicActive = !!state?.panicState?.active || localActive

  const clearHold = () => {
    if (holdTimer.current) {
      window.clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
    setHolding(false)
  }

  const startHold = () => {
    if (panicActive) return
    setError('')
    setHolding(true)
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null
      setHolding(false)
      setCountdown(COUNTDOWN_SECONDS)
      setConfirmOpen(true)
    }, HOLD_MS)
  }

  useEffect(() => () => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current)
  }, [])

  useEffect(() => {
    if (!confirmOpen) return
    const id = window.setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          window.clearInterval(id)
          return 0
        }
        return c - 1
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [confirmOpen])

  useEffect(() => {
    if (!confirmOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmOpen])

  const closeModal = () => {
    setConfirmOpen(false)
    setCountdown(COUNTDOWN_SECONDS)
    setError('')
  }

  const confirmPanic = async () => {
    setBusy(true)
    setError('')
    if (navigator.clipboard) navigator.clipboard.writeText('').catch(() => {})
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'PANIC' })
      if (resp && resp.success) {
        setLocalActive(true)
        closeModal()
      } else {
        setError('Panic failed to execute. Try again.')
      }
    } catch {
      setError('Could not reach the security core. Try again.')
    }
    setBusy(false)
  }

  const undoPanic = async () => {
    setBusy(true)
    setError('')
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'PANIC_RECOVER' })
      if (resp && resp.success) {
        setLocalActive(false)
      } else {
        setError('Recovery failed. Try again.')
      }
    } catch {
      setError('Could not reach the security core. Try again.')
    }
    setBusy(false)
  }

  const exportReport = () => {
    try {
      const payload = JSON.stringify(
        { panicState: state?.panicState || null, snapshot: state?.forensicSnapshots?.[0] || null },
        null,
        2
      )
      const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }))
      chrome.downloads.download({ url, filename: 'silentguard-panic-report.json' }, () => {
        if (chrome.runtime.lastError) setError('Report export failed.')
        URL.revokeObjectURL(url)
      })
    } catch {
      setError('Report export failed.')
    }
  }

  return (
    <>
      <button
        type="button"
        className="panic-btn"
        title="Panic"
        aria-label="Panic"
        onPointerDown={startHold}
        onPointerUp={clearHold}
        onPointerLeave={clearHold}
        onPointerCancel={clearHold}
      >
        {holding && <span className="panic-ring" />}
        <span className="panic-icon">⚠</span>
      </button>

      {confirmOpen && (
        <div className="panic-overlay" onClick={closeModal}>
          <div className="panic-modal" role="alertdialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <h2 className="panic-modal-title">Log out of EVERYTHING?</h2>
            <p className="panic-modal-text">
              All cookies deleted — you'll be logged out of every site. All tabs closed, downloads
              cancelled, risky extensions disabled, 60s network lockdown, 24h of browsing data
              purged. This cannot be undone.
            </p>
            {countdown > 0 && <div className="panic-countdown">Confirm in {countdown}…</div>}
            <div className="panic-modal-actions">
              <button
                type="button"
                className="panic-confirm-btn"
                disabled={countdown > 0 || busy}
                onClick={confirmPanic}
              >
                Confirm panic
              </button>
              <button type="button" className="panic-cancel-btn" onClick={closeModal}>
                Cancel
              </button>
            </div>
            {error && <div className="panic-error">{error}</div>}
          </div>
        </div>
      )}

      {panicActive && (
        <div className="panic-banner" role="alert">
          <div className="panic-banner-title">🚨 Panic mode active — everything was wiped.</div>
          <ul className="panic-checklist">
            <li>🔑 Change passwords for your important accounts (panic can't clear saved passwords)</li>
            <li>📱 Sign out of browser sync on other devices — cleared data can re-sync</li>
            <li>📄 Export the audit report below for your records</li>
          </ul>
          <div className="panic-actions">
            <button type="button" className="panic-action-btn" disabled={busy} onClick={undoPanic}>
              Undo — restore tabs & extensions
            </button>
            <button type="button" className="panic-action-btn" disabled={busy} onClick={exportReport}>
              Export report
            </button>
          </div>
          {error && <div className="panic-error">{error}</div>}
        </div>
      )}
    </>
  )
}
