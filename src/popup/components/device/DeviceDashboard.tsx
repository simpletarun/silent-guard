
import { CategoryState } from '../../../types'
import CategoryScore from '../shared/CategoryScore'
import CategoryActions from '../shared/CategoryActions'

interface Props {
  category: CategoryState
}

// Display-only: read once in the popup for rendering. Nothing here is
// persisted, messaged to the background, or monitored for changes.
function readBrowserInfo() {
  const ua = navigator.userAgent || ''
  const edg = ua.match(/Edg\/([\d.]+)/)
  const opr = ua.match(/OPR\/([\d.]+)/)
  const chrome = ua.match(/Chrome\/([\d.]+)/)
  const firefox = ua.match(/Firefox\/([\d.]+)/)
  const safari = ua.match(/Version\/([\d.]+).*Safari/)
  let browserName = 'Unknown'
  let browserVersion = ''
  if (edg) { browserName = 'Edge'; browserVersion = edg[1] }
  else if (opr) { browserName = 'Opera'; browserVersion = opr[1] }
  else if (firefox) { browserName = 'Firefox'; browserVersion = firefox[1] }
  else if (safari && !chrome) { browserName = 'Safari'; browserVersion = safari[1] }
  else if (chrome) { browserName = 'Chrome'; browserVersion = chrome[1] }

  let osName = 'Unknown'
  if (/Windows NT 10/.test(ua)) osName = 'Windows'
  else if (/Windows/.test(ua)) osName = 'Windows (older)'
  else if (/Mac OS X/.test(ua)) osName = 'macOS'
  else if (/Android/.test(ua)) osName = 'Android'
  else if (/iPhone|iPad/.test(ua)) osName = 'iOS'
  else if (/Linux/.test(ua)) osName = 'Linux'
  else if (/CrOS/.test(ua)) osName = 'ChromeOS'

  let timezone = 'Unknown'
  try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown' } catch {}

  return {
    browserName,
    browserVersion,
    osName,
    platform: (navigator as any).platform || osName,
    language: navigator.language || 'Unknown',
    timezone,
    screenWidth: window.screen?.width || 0,
    screenHeight: window.screen?.height || 0,
    colorDepth: window.screen?.colorDepth || 0,
    hardwareConcurrency: navigator.hardwareConcurrency || 0,
    deviceMemory: (navigator as any).deviceMemory,
    userAgent: ua,
  }
}

export default function DeviceDashboard({ category }: Props) {
  const cat = category || { id: 'device', label: 'Device', icon: '💻', enabled: true, score: { total: 50, maxScore: 100, factors: [] }, events: [], metrics: [], actions: [], settings: {}, lastScan: 0 }
  const actions = [
    { id: 'check_updates', label: 'Check Updates', description: 'Check for browser updates', icon: '📦', action: 'open_url' as const, url: 'chrome://settings/help' },
    { id: 'clear_data', label: 'Clear Data', description: 'Clear cookies and site data', icon: '🗑️', action: 'open_url' as const, url: 'chrome://settings/clearBrowserData' },
  ]

  const fp = readBrowserInfo()
  const metrics = [
    { label: 'Browser', value: `${fp.browserName} ${fp.browserVersion}`, icon: '🌐', status: 'good' },
    { label: 'OS', value: fp.osName !== 'Unknown' ? fp.osName : fp.platform, icon: '💻', status: 'good' },
    { label: 'Screen', value: `${fp.screenWidth}x${fp.screenHeight}`, icon: '🖥️', status: 'good' },
    { label: 'Timezone', value: fp.timezone, icon: '🕐', status: 'good' },
    { label: 'Language', value: fp.language, icon: '🔤', status: 'good' },
    { label: 'CPU', value: `${fp.hardwareConcurrency} cores`, icon: '⚡', status: 'good' },
  ]

  return (
    <div className="cat-dashboard">
      <div className="card cat-header-card">
        <CategoryScore score={cat.score} size="medium" />
      </div>
      <div className="card">
        <div className="card-title">Device Info</div>
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
        <div className="card-title">Browser Details</div>
        <div className="ua-grid">
          <div className="ua-item">
            <span className="ua-label">Browser</span>
            <span className="ua-value">{fp.browserName} {fp.browserVersion}</span>
          </div>
          <div className="ua-item">
            <span className="ua-label">OS</span>
            <span className="ua-value">{fp.osName}</span>
          </div>
          <div className="ua-item">
            <span className="ua-label">Platform</span>
            <span className="ua-value">{fp.platform}</span>
          </div>
          <div className="ua-item">
            <span className="ua-label">Language</span>
            <span className="ua-value">{fp.language}</span>
          </div>
          <div className="ua-item">
            <span className="ua-label">Timezone</span>
            <span className="ua-value">{fp.timezone}</span>
          </div>
          <div className="ua-item">
            <span className="ua-label">Resolution</span>
            <span className="ua-value">{fp.screenWidth}×{fp.screenHeight} @{fp.colorDepth}bit</span>
          </div>
          <div className="ua-item">
            <span className="ua-label">CPU</span>
            <span className="ua-value">{fp.hardwareConcurrency} cores</span>
          </div>
          <div className="ua-item">
            <span className="ua-label">Memory</span>
            <span className="ua-value">{fp.deviceMemory ? `${fp.deviceMemory} GB` : 'N/A'}</span>
          </div>
          <div className="ua-item ua-item-full">
            <span className="ua-label">User Agent</span>
            <code className="ua-raw">{fp.userAgent}</code>
          </div>
        </div>
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
