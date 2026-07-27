
import { CategoryState, BrowserFingerprint } from '../../../types'
import CategoryScore from '../shared/CategoryScore'
import CategoryEvents from '../shared/CategoryEvents'
import CategoryActions from '../shared/CategoryActions'

interface Props {
  category: CategoryState
  fingerprint: BrowserFingerprint | null
  onAcknowledge: (id: string) => void
}

export default function DeviceDashboard({ category, fingerprint, onAcknowledge }: Props) {
  const cat = category || { id: 'device', label: 'Device', icon: '💻', enabled: true, score: { total: 50, maxScore: 100, factors: [] }, events: [], metrics: [], actions: [], settings: {}, lastScan: 0 }
  const actions = [
    { id: 'check_browser', label: 'Browser Check', description: 'Check security settings', icon: '🔍', action: 'open_url' as const, url: 'chrome://settings/security', severity: 'primary' as const },
    { id: 'check_updates', label: 'Check Updates', description: 'Check for browser updates', icon: '📦', action: 'open_url' as const, url: 'chrome://settings/help' },
    { id: 'clear_data', label: 'Clear Data', description: 'Clear cookies and site data', icon: '🗑️', action: 'open_url' as const, url: 'chrome://settings/clearBrowserData' },
  ]

  const metrics = fingerprint ? [
    { label: 'Browser', value: `${fingerprint.browserName || 'Unknown'} ${fingerprint.browserVersion || ''}`, icon: '🌐', status: 'good' as const },
    { label: 'OS', value: fingerprint.osName || fingerprint.platform, icon: '💻', status: 'good' as const },
    { label: 'Screen', value: `${fingerprint.screenWidth}x${fingerprint.screenHeight}`, icon: '🖥️', status: 'good' as const },
    { label: 'Timezone', value: fingerprint.timezone, icon: '🕐', status: 'good' as const },
    { label: 'Language', value: fingerprint.language, icon: '🔤', status: 'good' as const },
    { label: 'CPU', value: `${fingerprint.hardwareConcurrency} cores`, icon: '⚡', status: 'good' as const },
  ] : [
    { label: 'Status', value: 'No data yet', icon: '⏳', status: 'warning' as const },
  ]

  return (
    <div className="cat-dashboard">
      <div className="card cat-header-card">
        <CategoryScore score={cat.score} size="medium" />
      </div>
      <div className="card">
        <div className="card-title">Device Fingerprint</div>
        <div className="cat-metrics-grid">
          {metrics.map((m, i) => (
            <div key={i} className={`cat-metric-item status-${m.status || 'good'}`}>
              <span className="cat-metric-icon">{m.icon}</span>
              <div className="cat-metric-body">
                <span className="cat-metric-value">{m.value}</span>
                <span className="cat-metric-label">{m.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      {fingerprint && (
        <div className="card">
          <div className="card-title">Browser Details</div>
          <div className="ua-grid">
            <div className="ua-item">
              <span className="ua-label">Browser</span>
              <span className="ua-value">{fingerprint.browserName || 'Unknown'} {fingerprint.browserVersion || ''}</span>
            </div>
            <div className="ua-item">
              <span className="ua-label">OS</span>
              <span className="ua-value">{fingerprint.osName || 'Unknown'}</span>
            </div>
            <div className="ua-item">
              <span className="ua-label">Platform</span>
              <span className="ua-value">{fingerprint.platform}</span>
            </div>
            <div className="ua-item">
              <span className="ua-label">Language</span>
              <span className="ua-value">{fingerprint.language}</span>
            </div>
            <div className="ua-item">
              <span className="ua-label">Timezone</span>
              <span className="ua-value">{fingerprint.timezone}</span>
            </div>
            <div className="ua-item">
              <span className="ua-label">Resolution</span>
              <span className="ua-value">{fingerprint.screenWidth}×{fingerprint.screenHeight} @{fingerprint.colorDepth}bit</span>
            </div>
            <div className="ua-item">
              <span className="ua-label">CPU</span>
              <span className="ua-value">{fingerprint.hardwareConcurrency} cores</span>
            </div>
            <div className="ua-item">
              <span className="ua-label">Memory</span>
              <span className="ua-value">{fingerprint.deviceMemory ? `${fingerprint.deviceMemory} GB` : 'N/A'}</span>
            </div>
            <div className="ua-item ua-item-full">
              <span className="ua-label">User Agent</span>
              <code className="ua-raw">{fingerprint.userAgent}</code>
            </div>
          </div>
        </div>
      )}
      <div className="card">
        <div className="card-title">Recent Events</div>
        <CategoryEvents events={cat.events} onAcknowledge={onAcknowledge} compact />
      </div>
      <CategoryActions actions={actions} />
      <style>{`
        .ua-grid { display: flex; flex-direction: column; gap: 0; }
        .ua-item {
          display: flex; justify-content: space-between; align-items: center;
          padding: 7px 0; border-bottom: 1px solid var(--border); font-size: 11px;
        }
        .ua-item:last-of-type:not(.ua-item-full) { border-bottom: none; }
        .ua-label { color: var(--text-secondary); font-size: 10px; font-weight: 500; }
        .ua-value { font-weight: 600; font-size: 11px; text-align: right; max-width: 55%; word-break: break-all; }
        .ua-item-full { flex-direction: column; align-items: flex-start; gap: 6px; border-bottom: none; padding-top: 8px; }
        .ua-raw {
          font-size: 9px; color: var(--text-muted); word-break: break-all;
          background: var(--bg-surface); padding: 8px; border-radius: var(--radius-sm);
          line-height: 1.5; max-height: 64px; overflow-y: auto; width: 100%;
          font-family: 'JetBrains Mono', monospace;
        }
      `}</style>
    </div>
  )
}
