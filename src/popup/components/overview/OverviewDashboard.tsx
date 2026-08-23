
import { GlobalSettings, SecurityState } from '../../../types'
import CategoryScore from '../shared/CategoryScore'
import { useSettings } from '../../hooks/useSecurityEngine'
import { useToast } from '../shared/Toast'

const timeAgo = (ts?: number): string => {
  if (!ts) return ''
  const mins = Math.max(1, Math.round((Date.now() - ts) / 60000))
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

interface Props {
  state: SecurityState
}

const SHARE_TOGGLES: { key: keyof GlobalSettings; label: string; sub: string }[] = [
  { key: 'monitorThreatIntel', label: 'Threat intel lookups', sub: 'Checks visited domains against AlienVault / URLhaus feeds' },
  { key: 'monitorDns', label: 'DNS checks', sub: 'Queries Cloudflare / Google DoH resolvers for DNS consistency' },
  { key: 'monitorCertificates', label: 'Certificate checks', sub: 'Searches the crt.sh transparency log for new certs' },
] as const

export default function OverviewDashboard({ state }: Props) {
  const cats = state.categories || {} as Record<string, any>
  const categoryList = ['network', 'device', 'extensions', 'passwords', 'privacy', 'accounts', 'policy'] as const
  const unackedEvents = Object.values(cats).reduce((s: number, c: any) => s + (c.events || []).filter((e: any) => !e.acknowledged).length, 0)
  const { settings, update } = useSettings()
  const { show } = useToast()

  const handleClearData = async () => {
    if (!window.confirm('Erase all SilentGuard history and scans? Settings will be kept.')) return
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'CLEAR_ALL_DATA' })
      if (!resp?.success) show('Failed to clear data — try again', 'error')
    } catch {
      show('Failed to clear data — try again', 'error')
    }
  }

  return (
    <div className="tab-panel">
      <div className="card overview-summary">
        <div className="overview-summary-header">
          <span className="overview-title">Security Overview</span>
          <span className={`overview-counts ${unackedEvents > 0 ? 'has-alerts' : ''}`}>
            {unackedEvents > 0 ? `${unackedEvents} unresolved` : 'All clear'}
          </span>
        </div>
        <div className="overview-grid">
          {categoryList.map(catId => {
            const cat = cats[catId]
            if (!cat) return null
            const evts = cat.events || []
            const unacked = evts.filter((e: any) => !e.acknowledged).length
            return (
              <div key={catId} className="overview-category-card" onClick={() => {
                window.dispatchEvent(new CustomEvent('tab-change', { detail: catId }))
              }}>
                <div className="overview-cat-header">
                  <span className="overview-cat-icon">{cat.icon}</span>
                  <span className="overview-cat-name">{cat.label}</span>
                  {unacked > 0 && <span className="overview-cat-alert">{unacked}</span>}
                </div>
                <CategoryScore score={cat.score || { total: 50, maxScore: 100, factors: [] }} size="small" />
                <div className="overview-cat-meta">
                  <span>{unacked > 0 ? `${unacked} alert${unacked !== 1 ? 's' : ''}` : 'No alerts'}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {state.accounts && state.accounts.length > 0 ? (
        <div className="card">
          <div className="card-title">Connected Accounts</div>
          <div className="overview-accounts">
            {state.accounts.slice(0, 6).map(acc => (
              <div key={acc.domain} className="overview-account-row">
                <div className="overview-acc-info">
                  <span className="overview-acc-name">{acc.name}</span>
                  <span className="overview-acc-domain">{acc.domain}</span>
                  {acc.status === 'verified' && acc.lastActive && (
                    <span className="overview-acc-active">active {timeAgo(acc.lastActive)}</span>
                  )}
                </div>
                <span className={`badge badge-${acc.status}`}>{acc.status === 'verified' ? '✓ verified' : 'unverified'}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-title">Connected Accounts</div>
          <div className="overview-accounts-empty">
            <span className="overview-acc-placeholder">No accounts detected yet</span>
            <span className="overview-acc-hint">Accounts appear here when you log in or sign up on a site. Visit a login page to get started.</span>
          </div>
        </div>
      )}

      {state.network && (
        <div className="card">
          <div className="card-title">Network Status</div>
          <div className="overview-network">
            <div className="overview-net-item">
              <span className="overview-net-label">Public IP</span>
              <span className="overview-net-value mono">{state.network.publicIp}</span>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">Data Sharing</div>
        <p className="ov-share-note">
          SilentGuard sends only the domain of sites you visit — never full URLs or tokens — to the
          security feeds you enable below. You can turn each one off.
        </p>
        {SHARE_TOGGLES.map(t => (
          <div key={t.key} className="ov-share-row">
            <div className="ov-share-info">
              <div className="ov-share-nm">{t.label}</div>
              {t.sub && <div className="ov-share-sub">{t.sub}</div>}
            </div>
            <button
              className={`tgl ${settings?.[t.key] ? 'on' : ''}`}
              aria-pressed={!!settings?.[t.key]}
              onClick={() => update({ [t.key]: !settings?.[t.key] })}
            >
              <span className="tgl-knob" />
            </button>
          </div>
        ))}
        <button className="ov-clear-btn" onClick={handleClearData}>🗑 Clear all scan data</button>
      </div>

      <style>{`
        .overview-summary-header {
          display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;
        }
        .overview-title { font-size: 14px; font-weight: 700; color: var(--text-primary); }
        .overview-counts { font-size: 10px; color: var(--text-muted); font-weight: 500; }
        .overview-counts.has-alerts { color: var(--danger); font-weight: 700; }
        .overview-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .overview-category-card {
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 12px 10px;
          cursor: pointer;
          transition: var(--transition);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }
        .overview-category-card:hover {
          border-color: var(--accent);
          background: var(--bg-card);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }
        .overview-category-card:active { transform: translateY(0); }
        .overview-cat-header { display: flex; align-items: center; gap: 5px; position: relative; }
        .overview-cat-icon { font-size: 15px; }
        .overview-cat-name { font-size: 11px; font-weight: 600; color: var(--text-secondary); }
        .overview-cat-alert {
          position: absolute; top: -6px; right: -14px;
          background: var(--danger); color: white;
          font-size: 8px; font-weight: 800;
          width: 16px; height: 16px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          line-height: 1;
        }
        .overview-cat-meta { font-size: 9px; color: var(--text-muted); font-weight: 500; }
        .overview-accounts { display: flex; flex-direction: column; gap: 4px; }
        .overview-account-row {
          display: flex; flex-wrap: wrap; gap: 4px; justify-content: space-between; align-items: center;
          padding: 6px 0; border-bottom: 1px solid var(--border);
        }
        .overview-account-row:last-child { border-bottom: none; }
        .overview-acc-info { display: flex; flex-direction: column; gap: 1px; }
        .overview-acc-name { font-size: 12px; font-weight: 600; }
        .overview-acc-domain { font-size: 9px; color: var(--text-muted); }
        .overview-acc-active { font-size: 8px; color: var(--info); font-weight: 600; }
        .overview-accounts-empty { padding: 8px 0; }
        .overview-acc-placeholder { display: block; font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 4px; }
        .overview-acc-hint { display: block; font-size: 9px; color: var(--text-muted); line-height: 1.4; }
        .overview-network { display: flex; flex-direction: column; gap: 4px; }
        .overview-net-item {
          display: flex; justify-content: space-between; padding: 6px 0;
          font-size: 11px; border-bottom: 1px solid var(--border);
        }
        .overview-net-item:last-child { border-bottom: none; }
        .overview-net-label { color: var(--text-secondary); }
        .overview-net-value { font-weight: 600; }
        .overview-net-value.mono { font-family: 'JetBrains Mono', monospace; font-size: 10px; }
        .text-success { color: var(--success); }
        .text-warning { color: var(--warning); }
        .text-danger { color: var(--danger); }
        .ov-share-note { font-size: 9px; color: var(--text-muted); line-height: 1.5; margin: 0 0 8px 0; }
        .ov-share-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--border); }
        .ov-share-row:last-of-type { border-bottom: none; }
        .ov-share-info { flex: 1; min-width: 0; }
        .ov-share-nm { font-size: 11px; font-weight: 600; }
        .ov-share-sub { font-size: 8px; color: var(--text-muted); margin-top: 1px; }
        .ov-clear-btn { margin-top: 10px; width: 100%; padding: 8px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-surface); color: var(--danger); font-size: 11px; font-weight: 600; cursor: pointer; }
        .ov-clear-btn:hover { border-color: var(--danger); }
      `}</style>
    </div>
  )
}
