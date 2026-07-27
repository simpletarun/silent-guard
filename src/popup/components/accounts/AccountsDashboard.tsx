import React from 'react'
import { CategoryState, AccountSite } from '../../../types'
import CategoryScore from '../shared/CategoryScore'
import CategoryEvents from '../shared/CategoryEvents'
import CategoryActions from '../shared/CategoryActions'
import { useToast, default as ToastBar } from '../shared/Toast'

const DOMAIN_RE = /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/

interface Props {
  category: CategoryState
  accounts: AccountSite[]
  onAcknowledge: (id: string) => void
  onAddAccount: (domain: string, name: string) => void
  onRemoveAccount: (domain: string) => void
}

export default function AccountsDashboard({ category, accounts, onAcknowledge, onAddAccount, onRemoveAccount }: Props) {
  const { toasts, show } = useToast()
  const cat = category || { id: 'accounts', label: 'Accounts', icon: '👤', enabled: true, score: { total: 50, maxScore: 100, factors: [] }, events: [], metrics: [], actions: [], settings: {}, lastScan: 0 }
  const [newDomain, setNewDomain] = React.useState('')
  const [newName, setNewName] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [debouncedSearch, setDebouncedSearch] = React.useState('')
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  React.useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

  const actions = [
    { id: 'google_security', label: 'Google Security', description: 'Open Google security checkup', icon: '🔒', action: 'open_url' as const, url: 'https://myaccount.google.com/security', severity: 'primary' as const },
    { id: 'google_devices', label: 'Device Activity', description: 'Review logged-in devices', icon: '📱', action: 'open_url' as const, url: 'https://myaccount.google.com/device-activity' },
  ]

  const q = debouncedSearch.toLowerCase()
  const filtered = q ? accounts.filter(a => a.domain.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)) : accounts

  const metrics = [
    { label: 'Tracked', value: `${filtered.length}`, icon: '👤', status: 'good' as const },
  ]

  const handleAdd = () => {
    if (!newDomain || !newName) return
    if (!DOMAIN_RE.test(newDomain)) {
      show('Invalid domain format', 'error')
      return
    }
    onAddAccount(newDomain, newName)
    setNewDomain('')
    setNewName('')
  }

  return (
    <div className="cat-dashboard">
      <ToastBar toasts={toasts} />
      <div className="card cat-header-card">
        <CategoryScore score={cat.score} size="medium" />
      </div>
      <div className="card">
        <div className="card-title">Account Status</div>
        <div className="cat-metrics-grid">
          {metrics.map((m, i) => (
            <div key={i} className={`cat-metric-item status-${m.status}`}>
              <span className="cat-metric-icon">{m.icon}</span>
              <div className="cat-metric-body">
                <span className="cat-metric-value">{m.value}</span>
                <span className="cat-metric-label">{m.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Tracked Accounts</div>
        <div className="acc-search-wrap">
          <input className="acc-search" placeholder="Search accounts…" value={search} onChange={e => {
            setSearch(e.target.value)
            if (debounceRef.current) clearTimeout(debounceRef.current)
            debounceRef.current = setTimeout(() => setDebouncedSearch(e.target.value), 150)
          }} />
          {filtered.length > 0 && (
            <button className="btn btn-outline btn-sm acc-open-all" onClick={() => {
              filtered.forEach(acc => {
                if (acc.securityUrl) chrome.tabs.create({ url: acc.securityUrl }).catch(() => {})
              })
            }}>
              Open All ({filtered.length})
            </button>
          )}
        </div>
        {filtered.length > 0 ? filtered.map(acc => (
          <div key={acc.domain} className="acc-item">
            <div className="acc-item-header">
              <div className="acc-item-info">
                <span className="acc-item-name">{acc.name}</span>
                <span className="acc-item-domain">{acc.domain}</span>
              </div>
            </div>
            <div className="acc-item-actions">
              {acc.securityUrl && (
                <button className="btn btn-outline btn-sm" onClick={() => chrome.tabs.create({ url: acc.securityUrl! }).catch(() => {})}>
                  Security
                </button>
              )}
              <button className="btn btn-outline btn-sm acc-remove" onClick={() => onRemoveAccount(acc.domain)}>
                Remove
              </button>
            </div>
          </div>
        )) : (
          <div className="cat-events-empty">
            <p className="cat-events-clean">{search ? 'No matching accounts' : 'No accounts added yet'}</p>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Add Account</div>
        <div className="add-account-form">
          <input className="breach-input" placeholder="Domain (e.g. twitter.com)" value={newDomain} onChange={e => setNewDomain(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && newName && handleAdd()} />
          <input className="breach-input" placeholder="Name (e.g. Twitter)" value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && newDomain && handleAdd()} />
          <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={!newDomain || !newName}>
            Add Account
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Recent Events</div>
        <CategoryEvents events={cat.events} onAcknowledge={onAcknowledge} compact />
      </div>
      <CategoryActions actions={actions} />
      <style>{`
        .acc-search-wrap { margin-bottom: 8px; display: flex; gap: 6px; align-items: center; }
        .acc-search {
          flex: 1; padding: 7px 10px; font-size: 12px;
          background: var(--bg-surface); border: 1px solid var(--border);
          border-radius: var(--radius); color: var(--text-primary);
          font-family: inherit; outline: none; transition: var(--transition);
          box-sizing: border-box;
        }
        .acc-search:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-glow); }
        .acc-search::placeholder { color: var(--text-muted); }
        .acc-open-all { white-space: nowrap; }
        .acc-item {
          padding: 10px 0; border-bottom: 1px solid var(--border);
          animation: slideUp 0.2s ease;
        }
        .acc-item:first-child { padding-top: 0; }
        .acc-item:last-child { border-bottom: none; padding-bottom: 0; }
        .acc-item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .acc-item-info { display: flex; flex-direction: column; gap: 1px; }
        .acc-item-name { font-size: 13px; font-weight: 600; }
        .acc-item-domain { font-size: 10px; color: var(--text-muted); }
        .acc-item-actions { display: flex; gap: 6px; flex-wrap: wrap; }
        .acc-remove { color: var(--danger) !important; border-color: transparent !important; }
        .acc-remove:hover { background: var(--danger-bg) !important; color: var(--danger) !important; border-color: var(--danger) !important; }
        .add-account-form { display: flex; flex-direction: column; gap: 8px; }
        .add-account-form input { font-size: 12px; }
        .btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .btn:disabled:active { transform: none; }
      `}</style>
    </div>
  )
}
