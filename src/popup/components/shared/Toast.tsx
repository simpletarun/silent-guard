import React from 'react'

interface ToastMessage {
  id: string
  text: string
  type?: 'success' | 'error' | 'info'
}

export function showToast(text: string, type?: 'success' | 'error' | 'info') {
  window.dispatchEvent(new CustomEvent('sg-toast', { detail: { text, type } }))
}

export function useToast() {
  const [toasts, setToasts] = React.useState<ToastMessage[]>([])
  const timersRef = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const show = React.useCallback((text: string, type?: 'success' | 'error' | 'info') => {
    const id = crypto.randomUUID()
    setToasts(prev => [...prev, { id, text, type }])
    const timer = setTimeout(() => {
      timersRef.current.delete(id)
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 2500)
    timersRef.current.set(id, timer)
  }, [])

  React.useEffect(() => {
    const handler = (e: Event) => {
      const { text, type } = (e as CustomEvent).detail
      show(text, type)
    }
    window.addEventListener('sg-toast', handler)
    return () => {
      window.removeEventListener('sg-toast', handler)
      for (const timer of timersRef.current.values()) clearTimeout(timer)
      timersRef.current.clear()
    }
  }, [show])

  return { toasts, show }
}

export default function ToastBar({ toasts }: { toasts: ToastMessage[] }) {
  if (toasts.length === 0) return null
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type || 'info'}`}>
          <span className="toast-icon">
            {t.type === 'success' ? '✓' : t.type === 'error' ? '✗' : 'ℹ'}
          </span>
          <span className="toast-text">{t.text}</span>
        </div>
      ))}
      <style>{`
        .toast-container {
          position: fixed; top: 8px; left: 8px; right: 8px;
          display: flex; flex-direction: column; gap: 4px;
          z-index: 9999; pointer-events: none;
        }
        .toast {
          display: flex; align-items: center; gap: 6px;
          padding: 8px 12px; border-radius: var(--radius-sm);
          font-size: 11px; font-weight: 600;
          animation: toastIn 0.25s ease;
          pointer-events: auto;
          backdrop-filter: blur(8px);
        }
        .toast-info { background: var(--bg-card); border: 1px solid var(--border); color: var(--text-primary); }
        .toast-success { background: var(--success-bg); border: 1px solid var(--success); color: var(--success); }
        .toast-error { background: var(--danger-bg); border: 1px solid var(--danger); color: var(--danger); }
        .toast-icon { font-size: 13px; font-weight: 700; flex-shrink: 0; }
        .toast-text { flex: 1; }
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(-12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
