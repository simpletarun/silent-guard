
import { useState } from 'react'
import { CategoryState, NetworkInfo } from '../../../types'
import CategoryScore from '../shared/CategoryScore'
import SpeedGauge from './SpeedGauge'
import { useSpeedTest } from './useSpeedTest'

interface Props {
  category: CategoryState
  network: NetworkInfo | null
}

type Metric = { label: string; value: string; icon: string; trend?: 'up' | 'down' | 'stable'; status?: 'good' | 'warning' | 'danger'; onClick?: () => void }

export default function NetworkDashboard({ category, network }: Props) {
  const cat = category || { id: 'network', label: 'Network', icon: '🌐', enabled: true, score: { total: 50, maxScore: 100, factors: [] }, events: [], metrics: [], actions: [], settings: {}, lastScan: 0 }
  const speed = useSpeedTest()
  const [showTest, setShowTest] = useState(false)

  const toggleTest = () => {
    const next = !showTest
    setShowTest(next)
    if (next) void speed.run()
  }

  const testingPhase = ['ping', 'download', 'upload'].includes(speed.phase)

  const baseMetrics: Metric[] = cat.metrics.length > 0 ? cat.metrics : network ? [
    { label: 'Public IP', value: network.publicIp, icon: '🌐', status: 'good' as const },
    { label: 'ISP', value: network.isp || (network.asn ? `AS${network.asn}` : 'Unknown'), icon: '🏢', status: 'good' as const },
    { label: 'Location', value: [network.city, network.country].filter(Boolean).join(', ') || (network.isVpn || network.isProxy ? 'Cloud/Proxy location limited' : 'Unknown'), icon: '📍', status: 'good' as const },
  ] : [
    { label: 'Status', value: 'No data yet', icon: '⏳', status: 'warning' as const },
  ]
  const metrics = [...baseMetrics, {
    label: 'Speed',
    value: testingPhase
      ? (speed.phase === 'ping' ? `${speed.pingMs ?? '…'} ms` : `${speed.liveMbps}`)
      : speed.downMbps != null ? `${speed.downMbps}` : '—',
    icon: '⚡',
    status: 'good' as const,
    onClick: toggleTest,
  }]

  return (
    <div className="cat-dashboard">
      <div className="card cat-header-card">
        <CategoryScore score={cat.score} size="medium" />
      </div>
      <div className="card">
        <div className="card-title">Network Metrics</div>
        <div className="cat-metrics-grid">
          {metrics.map((m, i) => (
            <div key={i} className={`cat-metric-item status-${m.status || 'good'}${m.onClick ? ' clickable' : ''}`} onClick={m.onClick}>
              <span className="cat-metric-icon">{m.icon}</span>
              <div className="cat-metric-body">
                <span className="cat-metric-value">{m.value}</span>
                <span className="cat-metric-label">{m.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      {showTest && (
        <div className="card speed-test-card">
          <div className="card-title">
            Speed Test
            <span
              className="speed-test-close"
              onClick={() => setShowTest(false)}
              role="button"
              aria-label="Close speed test"
            >✕</span>
          </div>
          <SpeedGauge value={speed.liveMbps || speed.downMbps || 0} phase={speed.phase} />
          <div className="speed-results">
            <div className="speed-result">
              <span className="speed-result-value">{speed.downMbps != null ? `${speed.downMbps}` : '—'}</span>
              <span className="speed-result-label">↓ Mbps</span>
            </div>
            <div className="speed-result">
              <span className="speed-result-value">{speed.upMbps != null ? `${speed.upMbps}` : '—'}</span>
              <span className="speed-result-label">↑ Mbps</span>
            </div>
            <div className="speed-result">
              <span className="speed-result-value">{speed.pingMs != null ? `${speed.pingMs}` : '—'}</span>
              <span className="speed-result-label">ms ping</span>
            </div>
          </div>
        </div>
      )}
      {network && (network.ipHistory || []).length >= 1 && (
        <div className="card">
          <div className="card-title">IP History (last {Math.min(network.ipHistory.length, 5)})</div>
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
        </div>
      </div>
      <style>{`
        .cat-metric-item.clickable { cursor: pointer; }
        .speed-test-close { float: right; cursor: pointer; color: var(--text-muted); }
        .speed-test-card { text-align: center; }
        .speed-phases { display: flex; justify-content: center; gap: 14px; margin-bottom: 4px; }
        .speed-phase {
          font-size: 9px; letter-spacing: 1px; color: var(--text-muted);
          padding: 2px 8px; border-radius: 999px;
        }
        .speed-phase.active { color: var(--accent); background: var(--accent-bg); font-weight: 700; }
        .speed-phase.done { color: var(--success); }
        .speed-svg { width: 100%; max-width: 240px; }
        .speed-value { fill: var(--text-primary); font-size: 26px; font-weight: 800; }
        .speed-unit { fill: var(--text-muted); font-size: 9px; }
        .speed-results { display: flex; justify-content: center; gap: 22px; margin-top: 6px; }
        .speed-result { display: flex; flex-direction: column; align-items: center; gap: 1px; }
        .speed-result-value { font-weight: 700; font-size: 14px; color: var(--text-primary); }
        .speed-result-label { font-size: 9px; color: var(--text-muted); }
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
