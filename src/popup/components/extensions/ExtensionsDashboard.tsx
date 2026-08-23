import { useState } from 'react'
import { CategoryState, DangerousExtension } from '../../../types'
import CategoryScore from '../shared/CategoryScore'
import CategoryEvents from '../shared/CategoryEvents'

interface Props {
  category: CategoryState
  extensions: DangerousExtension[]
  flagged: DangerousExtension[]
  onAcknowledge: (id: string) => void
  onRemove: (id: string) => void
  onScan: () => Promise<unknown>
}

export default function ExtensionsDashboard({ category, extensions, flagged, onAcknowledge, onRemove, onScan }: Props) {
  const [scanning, setScanning] = useState(false)
  const cat = category || { id: 'extensions', label: 'Extensions', icon: '🧩', enabled: true, score: { total: 50, maxScore: 100, factors: [] }, events: [], metrics: [], actions: [], settings: {}, lastScan: 0 }

  // Scanning state follows the real background round-trip — the old fixed
  // 1.5s timer claimed a scan even when it had been rejected or dropped.
  const handleScan = async () => {
    setScanning(true)
    try {
      await onScan()
    } finally {
      setScanning(false)
    }
  }

const riskRank = (r: string) => r === 'critical' ? 3 : r === 'high' ? 2 : r === 'medium' ? 1 : 0
const flaggedIds = new Set(flagged.map(e => e.id))
// Worst first; same level → name order so the list is stable across scans.
const sorted = [...extensions].sort((a, b) =>
  riskRank(b.riskLevel) - riskRank(a.riskLevel) || a.name.localeCompare(b.name)
)

// Metrics describe RISK — count each flagged INSTALL individually. The old
// name-merge collapsed same-name twins (two "Temp Mail" builds) into one,
// so the tile showed fewer risky extensions than the list rows did.
const riskyCount = flagged.length
const critical = flagged.filter(e => e.riskLevel === 'critical').length
const high = flagged.filter(e => e.riskLevel === 'high').length
const medium = flagged.filter(e => e.riskLevel === 'medium').length

const metrics = [
  { label: 'Risky', value: `${riskyCount}`, icon: '⚠️', status: riskyCount > 0 ? 'warning' as const : 'good' as const },
  { label: 'Critical', value: `${critical}`, icon: '🔴', status: critical > 0 ? 'danger' as const : 'good' as const },
  { label: 'High Risk', value: `${high}`, icon: '🟠', status: high > 0 ? 'warning' as const : 'good' as const },
  { label: 'Medium Risk', value: `${medium}`, icon: '🟡', status: medium > 0 ? 'warning' as const : 'good' as const },
]

// Chrome host grants are match patterns — every one contains '://'
// ('https://a.com/*', '*://*.b.com/*', 'file:///*'). Bucketing on
// startsWith('http') missed scheme-wildcards and misfiled them as
// API permissions.
function isHostPattern(p: string): boolean {
  return p === '<all_urls>' || p.includes('://')
}

function hostsLabel(perms: string[]): string {
  const hosts = perms.filter(isHostPattern)
  if (hosts.length === 0) return 'no site access'
  const shown = hosts.map(h => h === '<all_urls>' || h === 'http://*/*' || h === 'https://*/*' ? 'all websites' : h)
  const all = shown.find(s => s === 'all websites')
  if (all) return 'all websites'
  return shown.slice(0, 4).join(', ') + (shown.length > 4 ? ` +${shown.length - 4} more` : '')
}

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
        <div className="card-title">All Installed Extensions ({sorted.length})</div>
        {sorted.length > 0 ? sorted.map(ext => {
          const isFlagged = flaggedIds.has(ext.id)
          return (
          <div key={ext.id} className="ext-item">
            <div className="ext-item-header">
              <span className="ext-item-name">{ext.name}{ext.version ? ` v${ext.version}` : ''}</span>
              <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                {ext.enabled === false && <span className="badge badge-unknown">disabled</span>}
                <span className={`badge ${isFlagged ? `badge-${ext.riskLevel}` : 'badge-safe'}`}>{isFlagged ? ext.riskLevel : 'safe'}</span>
              </span>
            </div>
            {isFlagged && ext.reason && ext.reason.length > 0 && (
              <div className="ext-item-perms">
                {ext.reason.map(r => <span key={r} className="ext-perm-badge">{r}</span>)}
              </div>
            )}
            <div className="ext-item-raw">
              <span className="ext-item-raw-lb">Sites:</span> {hostsLabel(ext.permissions)}
              <br />
              <span className="ext-item-raw-lb">Permissions:</span> {ext.permissions.filter(p => !isHostPattern(p)).join(', ') || 'none'}
            </div>
            {isFlagged && ext.id !== chrome.runtime.id && (
              <button className="btn btn-danger btn-sm" onClick={() => onRemove(ext.id)}>
                Uninstall
              </button>
            )}
          </div>
          )
        }) : (
          <div className="cat-events-empty">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" opacity="0.3">
              <rect x="4" y="4" width="16" height="16" rx="2" stroke="var(--text-muted)" strokeWidth="1.5" />
              <path d="M8 12h8M12 8v8" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <p className="cat-events-clean">No extensions installed</p>
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
        <CategoryEvents events={cat.events} onAcknowledge={onAcknowledge} lastScan={cat.lastScan} hint="Events appear when an extension with risky permissions is installed." />
      </div>
    </div>
  )
}
