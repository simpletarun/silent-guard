import { useState } from 'react'
import { CategoryState, PageScanResult } from '../../../types'
import CategoryScore from '../shared/CategoryScore'
import CategoryEvents from '../shared/CategoryEvents'

interface Props {
  category: CategoryState
  pageScans: PageScanResult[]
  onAcknowledge: (id: string) => void
}

export default function PrivacyDashboard({ category, pageScans, onAcknowledge }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const cat = category || { id: 'privacy', label: 'Privacy', icon: '🛡️', enabled: true, score: { total: 50, maxScore: 100, factors: [] }, events: [], metrics: [], actions: [], settings: {}, lastScan: 0 }

  const totals = {
    trackers: pageScans.reduce((s, p) => s + p.trackers.length, 0),
    canvas: pageScans.reduce((s, p) => s + p.canvasAttempts, 0),
    audio: pageScans.reduce((s, p) => s + p.audioAttempts, 0),
    beacons: pageScans.reduce((s, p) => s + p.beaconCalls, 0),
    hidden: pageScans.reduce((s, p) => s + p.hiddenElements, 0),
    inline: pageScans.reduce((s, p) => s + p.suspiciousInlineScripts, 0),
    thirdParty: pageScans.reduce((s, p) => s + p.thirdPartyRequests, 0),
    cookies: pageScans.reduce((s, p) => s + p.totalCookies, 0),
  }

  function status(value: number, warn: number, danger: number): string {
    return value > danger ? 'danger' : value > warn ? 'warning' : 'good'
  }

  return (
    <div className="cat-dashboard">
      <div className="card cat-header-card">
        <CategoryScore score={cat.score} size="medium" />
      </div>

      <div className="card">
        <div className="card-title">Privacy Scan Results</div>
        {pageScans.length === 0 ? (
          <div className="cat-events-empty" style={{ padding: '16px 0' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" opacity="0.25">
              <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5" />
              <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="cat-events-clean">Scan a page to see trackers, fingerprinting &amp; more</p>
          </div>
        ) : (
          <div className="pv-grid">
            <M label="Pages" value={pageScans.length} icon="📄" s="good" />
            <M label="Trackers" value={totals.trackers} icon="👁️" s={status(totals.trackers, 5, 15)} />
            <M label="Canvas" value={totals.canvas} icon="🎨" s={status(totals.canvas, 0, 1)} />
            <M label="Audio" value={totals.audio} icon="🔊" s={status(totals.audio, 0, 1)} />
            <M label="Beacons" value={totals.beacons} icon="📡" s={status(totals.beacons, 0, 5)} />
            <M label="Hidden" value={totals.hidden} icon="👻" s={status(totals.hidden, 10, 50)} />
            <M label="Inline" value={totals.inline} icon="📝" s={status(totals.inline, 0, 3)} />
            <M label="3rd-Party" value={totals.thirdParty} icon="🔗" s={status(totals.thirdParty, 15, 40)} />
            <M label="Cookies" value={totals.cookies} icon="🍪" s={status(totals.cookies, 10, 30)} />
            {pageScans.some(p => p.webRTCLeakDetected) && <M label="WebRTC Leak" value="YES" icon="🌐" s="danger" />}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Scanned Pages</div>
        {pageScans.length > 0 ? pageScans.map((page) => (
          <div key={page.url} className="pv-page">
            <div className="pv-page-hd" onClick={() => setExpanded(expanded === page.url ? null : page.url)}>
              <div className="pv-page-hd-l">
                <span className="pv-page-av">{page.domain.charAt(0).toUpperCase()}</span>
                <span className="pv-page-nm">{page.domain}</span>
              </div>
              <div className="pv-page-hd-r">
                <span className={`pv-bdg ${page.trackers.length > 5 ? 'dng' : page.trackers.length > 0 ? 'wrn' : 'gd'}`}>{page.trackers.length} T</span>
                {page.hiddenElements > 10 && <span className="pv-bdg wrn">{page.hiddenElements}H</span>}
                {totals.canvas + totals.audio > 0 && <span className="pv-bdg dng">FP</span>}
                <span className="pv-arr">{expanded === page.url ? '▾' : '▸'}</span>
              </div>
            </div>
            {expanded === page.url && (
              <div className="pv-page-bd">
                <div className="pv-stats">
                  <S l="Canvas" v={page.canvasAttempts} c={page.canvasAttempts > 0 ? 'var(--danger)' : 'var(--success)'} />
                  <S l="Audio" v={page.audioAttempts} c={page.audioAttempts > 0 ? 'var(--danger)' : 'var(--success)'} />
                  <S l="Beacons" v={page.beaconCalls} c={page.beaconCalls > 0 ? 'var(--warning)' : 'var(--success)'} />
                  <S l="Hidden" v={page.hiddenElements} c={page.hiddenElements > 10 ? 'var(--warning)' : 'var(--success)'} />
                  <S l="Inline" v={page.suspiciousInlineScripts} c={page.suspiciousInlineScripts > 0 ? 'var(--warning)' : 'var(--success)'} />
                  <S l="3rd-Party" v={page.thirdPartyRequests} c={page.thirdPartyRequests > 15 ? 'var(--warning)' : 'var(--success)'} />
                  <S l="Cookies" v={page.totalCookies} c={page.totalCookies > 10 ? 'var(--warning)' : 'var(--success)'} />
                  <S l="Storage" v={page.localStorageItems + page.sessionStorageItems} c="var(--text-muted)" />
                  {page.webRTCLeakDetected && <S l="WebRTC" v="LEAK" c="var(--critical)" />}
                </div>
                {page.trackers.length > 0 && (
                  <div className="pv-tkrs">
                    <div className="pv-tkrs-ttl">TRACKERS ({page.trackers.length})</div>
                    <div className="pv-tkrs-lst">
                      {page.trackers.map((t, j) => (
                        <div key={j} className="pv-tkr">
                          <span className="pv-tkr-dt" style={{ background: TCOLOR[t.type] || 'var(--text-muted)' }} />
                          <span className="pv-tkr-dm">{t.domain}</span>
                          <span className={`pv-tkr-tp ${t.type}`}>{t.type}</span>
                          {t.details && <span className="pv-tkr-dl">{t.details}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="pv-scantime">Scanned {new Date(page.scannedAt).toLocaleTimeString()}</div>
              </div>
            )}
          </div>
        )) : (
          <div className="cat-events-empty">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" opacity="0.3">
              <circle cx="12" cy="12" r="9" stroke="var(--text-muted)" strokeWidth="1.5" />
              <path d="M12 8v4M12 16h0" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <p className="cat-events-clean">No pages scanned yet — visit a page to find trackers and hidden info</p>
          </div>
        )}
      </div>

      <div className="cat-actions-section">
        <div className="cat-actions-label">Quick Actions</div>
        <div className="cat-actions-grid">
          <button className="cat-action-btn cat-action-default" onClick={() => chrome.tabs.create({ url: 'chrome://settings/clearBrowserData' }).catch(() => {})}>
            <span className="cat-action-icon">🍪</span><span className="cat-action-text">Clear Cookies</span>
          </button>
          <button className="cat-action-btn cat-action-default" onClick={() => chrome.tabs.create({ url: 'chrome://settings/privacy' }).catch(() => {})}>
            <span className="cat-action-icon">⚙️</span><span className="cat-action-text">Privacy Settings</span>
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Recent Events</div>
        <CategoryEvents events={cat.events} onAcknowledge={onAcknowledge} compact />
      </div>

      <style>{`
        .pv-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
        .pv-mtr { background: var(--bg-surface); border-radius: var(--radius-sm); padding: 7px 9px; display: flex; align-items: center; gap: 8px; }
        .pv-mtr.good { border-left: 2px solid var(--success); }
        .pv-mtr.warn { border-left: 2px solid var(--warning); }
        .pv-mtr.dng { border-left: 2px solid var(--danger); }
        .pv-mtr-ic { font-size: 15px; }
        .pv-mtr-vl { font-size: 15px; font-weight: 700; line-height: 1; }
        .pv-mtr-lb { font-size: 8px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px; margin-top: 2px; }
        .pv-page { border-bottom: 1px solid var(--border); padding: 5px 0; }
        .pv-page:last-child { border-bottom: none; }
        .pv-page-hd { display: flex; justify-content: space-between; align-items: center; cursor: pointer; padding: 4px 6px; border-radius: var(--radius-sm); }
        .pv-page-hd:hover { background: var(--bg-surface-hover); }
        .pv-page-hd-l { display: flex; align-items: center; gap: 6px; }
        .pv-page-av { width: 18px; height: 18px; border-radius: 4px; background: var(--accent); color: #fff; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .pv-page-nm { font-weight: 600; font-size: 11px; }
        .pv-page-hd-r { display: flex; align-items: center; gap: 4px; }
        .pv-bdg { font-size: 8px; padding: 1px 5px; border-radius: 3px; font-weight: 700; }
        .pv-bdg.gd { background: var(--success-bg); color: var(--success); }
        .pv-bdg.wrn { background: var(--warning-bg); color: var(--warning); }
        .pv-bdg.dng { background: var(--danger-bg); color: var(--danger); }
        .pv-arr { font-size: 9px; color: var(--text-muted); margin-left: 2px; }
        .pv-page-bd { padding: 6px 6px 2px 26px; }
        .pv-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3px; margin-bottom: 6px; }
        .pv-stat { background: var(--bg-surface); border-left: 2px solid; border-radius: 3px; padding: 3px 5px; }
        .pv-stat-v { font-size: 11px; font-weight: 700; line-height: 1.2; }
        .pv-stat-l { font-size: 7px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.2px; }
        .pv-tkrs { margin-top: 4px; }
        .pv-tkrs-ttl { font-size: 9px; font-weight: 700; color: var(--text-muted); margin-bottom: 3px; letter-spacing: 0.3px; }
        .pv-tkrs-lst { max-height: 160px; overflow-y: auto; }
        .pv-tkr { display: flex; align-items: center; gap: 4px; padding: 2px 4px; font-size: 9px; border-radius: 2px; }
        .pv-tkr:nth-child(odd) { background: rgba(255,255,255,0.02); }
        .pv-tkr-dt { width: 4px; height: 4px; border-radius: 50%; flex-shrink: 0; }
        .pv-tkr-dm { font-family: 'JetBrains Mono', monospace; font-size: 8px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .pv-tkr-tp { font-size: 7px; padding: 1px 3px; border-radius: 2px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.2px; flex-shrink: 0; }
        .pv-tkr-tp.script { background: var(--warning-bg); color: var(--warning); }
        .pv-tkr-tp.pixel { background: var(--danger-bg); color: var(--danger); }
        .pv-tkr-tp.iframe { background: var(--info-bg); color: var(--info); }
        .pv-tkr-tp.beacon { background: var(--accent-glow); color: var(--accent); }
        .pv-tkr-tp.hidden { background: var(--danger-bg); color: var(--danger); }
        .pv-tkr-tp.inline { background: var(--warning-bg); color: var(--warning); }
        .pv-tkr-tp.fingerprinting { background: var(--danger-bg); color: var(--danger); }
        .pv-tkr-tp.webRTC { background: var(--critical-bg); color: var(--critical); }
        .pv-tkr-dl { font-size: 7px; color: var(--text-muted); max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .pv-scantime { font-size: 7px; color: var(--text-muted); margin-top: 3px; }
      `}</style>
    </div>
  )
}

function M({ label, value, icon, s }: { label: string; value: number | string; icon: string; s?: string }) {
  return (
    <div className={`pv-mtr ${s || 'good'}`}>
      <span className="pv-mtr-ic">{icon}</span>
      <div>
        <div className="pv-mtr-vl">{value}</div>
        <div className="pv-mtr-lb">{label}</div>
      </div>
    </div>
  )
}

function S({ l, v, c }: { l: string; v: number | string; c: string }) {
  return (
    <div className="pv-stat" style={{ borderLeftColor: c }}>
      <div className="pv-stat-v" style={{ color: c }}>{v}</div>
      <div className="pv-stat-l">{l}</div>
    </div>
  )
}

const TCOLOR: Record<string, string> = {
  script: 'var(--info)', pixel: 'var(--danger)', iframe: 'var(--warning)',
  beacon: 'var(--accent)', hidden: 'var(--danger)', inline: 'var(--warning)',
  canvas: 'var(--danger)', audio: 'var(--danger)', webRTC: 'var(--critical)', font: 'var(--info)',
}
