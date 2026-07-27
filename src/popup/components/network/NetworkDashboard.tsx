
import { CategoryState, NetworkInfo } from '../../../types'
import CategoryScore from '../shared/CategoryScore'
import CategoryEvents from '../shared/CategoryEvents'

interface Props {
  category: CategoryState
  network: NetworkInfo | null
  onAcknowledge: (id: string) => void
}

export default function NetworkDashboard({ category, network, onAcknowledge }: Props) {
  const cat = category || { id: 'network', label: 'Network', icon: '🌐', enabled: true, score: { total: 50, maxScore: 100, factors: [] }, events: [], metrics: [], actions: [], settings: {}, lastScan: 0 }

  const metrics = cat.metrics.length > 0 ? cat.metrics : network ? [
    { label: 'Public IP', value: network.publicIp, icon: '🌐', status: 'good' as const },
    { label: 'ISP', value: network.isp || 'Unknown', icon: '🏢', status: 'good' as const },
    { label: 'Location', value: [network.city, network.country].filter(Boolean).join(', ') || 'Unknown', icon: '📍', status: 'good' as const },
    { label: 'VPN', value: network.isVpn ? 'Active' : 'None', icon: '🔒', status: network.isVpn ? 'warning' as const : 'good' as const },
    { label: 'Proxy', value: network.isProxy ? 'Detected' : 'None', icon: '🔗', status: network.isProxy ? 'warning' as const : 'good' as const },
    { label: 'DoH', value: network.isDoHEnabled ? 'Enabled' : 'Disabled', icon: '📡', status: network.isDoHEnabled ? 'good' as const : 'warning' as const },
  ] : [
    { label: 'Status', value: 'No data yet', icon: '⏳', status: 'warning' as const },
  ]

  return (
    <div className="cat-dashboard">
      <div className="card cat-header-card">
        <CategoryScore score={cat.score} size="medium" />
      </div>
      <div className="card">
        <div className="card-title">Network Metrics</div>
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
      {network && network.ipHistory.length > 1 && (
        <div className="card">
          <div className="card-title">IP History (last {network.ipHistory.length})</div>
          <div className="ip-history">
            {network.ipHistory.slice(-5).reverse().map((h, i) => (
              <div key={i} className="ip-history-item">
                <span className="ip-history-ip">{h.ip}</span>
                <span className="ip-history-time">{new Date(h.timestamp).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="cat-actions-section">
        <div className="cat-actions-label">Quick Actions</div>
        <div className="cat-actions-grid">
          <button className="cat-action-btn cat-action-default" onClick={() => chrome.tabs.create({ url: 'chrome://settings/security' }).catch(() => {})}>
            <span className="cat-action-icon">⚙️</span><span className="cat-action-text">DNS Settings</span>
          </button>
          <button className="cat-action-btn cat-action-default" onClick={() => chrome.tabs.create({ url: 'https://ipleak.net' }).catch(() => {})}>
            <span className="cat-action-icon">🔒</span><span className="cat-action-text">VPN Test</span>
          </button>
        </div>
      </div>
      <div className="card">
        <div className="card-title">Recent Events</div>
        <CategoryEvents events={cat.events} onAcknowledge={onAcknowledge} compact />
      </div>
      <style>{`
        .ip-history { display: flex; flex-direction: column; gap: 4px; }
        .ip-history-item {
          display: flex; justify-content: space-between; align-items: center;
          font-size: 11px; padding: 5px 8px;
          background: var(--bg-surface); border-radius: var(--radius-sm);
        }
        .ip-history-ip { font-weight: 600; font-family: 'JetBrains Mono', monospace; font-size: 10px; }
        .ip-history-time { color: var(--text-muted); font-size: 9px; }
      `}</style>
    </div>
  )
}
