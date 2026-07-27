import { useState } from 'react'
import { CategoryState, DangerousExtension } from '../../../types'
import CategoryScore from '../shared/CategoryScore'
import CategoryEvents from '../shared/CategoryEvents'

interface Props {
  category: CategoryState
  extensions: DangerousExtension[]
  onAcknowledge: (id: string) => void
  onRemove: (id: string) => void
  onScan: () => void
}

export default function ExtensionsDashboard({ category, extensions, onAcknowledge, onRemove, onScan }: Props) {
  const [scanning, setScanning] = useState(false)
  const cat = category || { id: 'extensions', label: 'Extensions', icon: '🧩', enabled: true, score: { total: 50, maxScore: 100, factors: [] }, events: [], metrics: [], actions: [], settings: {}, lastScan: 0 }

  const handleScan = () => {
    setScanning(true)
    onScan()
    setTimeout(() => setScanning(false), 1500)
  }

  const critical = extensions.filter(e => e.riskLevel === 'critical').length
  const high = extensions.filter(e => e.riskLevel === 'high').length
  const medium = extensions.filter(e => e.riskLevel === 'medium').length

  const metrics = [
    { label: 'Risky Extensions', value: `${extensions.length}`, icon: '🧩', status: extensions.length > 0 ? 'warning' as const : 'good' as const },
    { label: 'Critical', value: `${critical}`, icon: '🔴', status: critical > 0 ? 'danger' as const : 'good' as const },
    { label: 'High Risk', value: `${high}`, icon: '🟠', status: high > 0 ? 'warning' as const : 'good' as const },
    { label: 'Medium Risk', value: `${medium}`, icon: '🟡', status: medium > 0 ? 'warning' as const : 'good' as const },
  ]

  const linkActions = [
    { id: 'manage_exts', label: 'Manage', description: 'Open extension manager', icon: '⚙️', action: 'open_url' as const, url: 'chrome://extensions' },
  ]

  return (
    <div className="cat-dashboard">
      <div className="card cat-header-card">
        <CategoryScore score={cat.score} size="medium" />
      </div>
      <div className="card">
        <div className="card-title">Extension Status</div>
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
        <div className="card-title">Dangerous Extensions</div>
        {extensions.length > 0 ? extensions.map(ext => (
          <div key={ext.id} className="ext-item">
            <div className="ext-item-header">
              <span className="ext-item-name">{ext.name}</span>
              <span className={`badge badge-${ext.riskLevel}`}>{ext.riskLevel}</span>
            </div>
            <div className="ext-item-perms">
              {ext.canAccessAllUrls && <span className="ext-perm-badge">all_urls</span>}
              {ext.canReadCookies && <span className="ext-perm-badge">cookies</span>}
              {ext.canUseWebRequest && <span className="ext-perm-badge">webRequest</span>}
            </div>
            <button className="btn btn-danger btn-sm" onClick={() => onRemove(ext.id)}>
              Remove
            </button>
          </div>
        )) : (
          <div className="cat-events-empty">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" opacity="0.3">
              <rect x="4" y="4" width="16" height="16" rx="2" stroke="var(--text-muted)" strokeWidth="1.5" />
              <path d="M8 12h8M12 8v8" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <p className="cat-events-clean">No dangerous extensions found</p>
          </div>
        )}
      </div>
      <div className="cat-actions-section">
        <div className="cat-actions-label">Quick Actions</div>
        <div className="cat-actions-grid">
          <button className="cat-action-btn cat-action-primary" onClick={handleScan} disabled={scanning}>
            {scanning ? (
              <><span className="cat-action-spinner" /><span className="cat-action-text">Scanning…</span></>
            ) : (
              <><span className="cat-action-icon">🔍</span><span className="cat-action-text">Scan Now</span></>
            )}
          </button>
          <button className="cat-action-btn cat-action-default" onClick={() => chrome.tabs.create({ url: 'chrome://extensions' }).catch(() => {})}>
            <span className="cat-action-icon">⚙️</span><span className="cat-action-text">Manage</span>
          </button>
        </div>
      </div>
      <div className="card">
        <div className="card-title">Recent Events</div>
        <CategoryEvents events={cat.events} onAcknowledge={onAcknowledge} compact />
      </div>
      <style>{`
        .ext-item {
          padding: 10px 0; border-bottom: 1px solid var(--border);
          animation: slideUp 0.2s ease;
        }
        .ext-item:first-child { padding-top: 0; }
        .ext-item:last-child { border-bottom: none; padding-bottom: 0; }
        .ext-item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }
        .ext-item-name { font-size: 12px; font-weight: 600; }
        .ext-item-perms { display: flex; gap: 4px; margin-bottom: 8px; flex-wrap: wrap; }
        .ext-perm-badge {
          font-size: 8px; padding: 2px 7px; border-radius: 4px;
          background: var(--danger-bg); color: var(--danger);
          font-family: 'JetBrains Mono', monospace; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.3px;
        }
      `}</style>
    </div>
  )
}
