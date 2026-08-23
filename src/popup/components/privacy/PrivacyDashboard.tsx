import { useEffect, useState } from 'react'
import { CategoryState, PageScanResult, DownloadScanResult, SecurityHeadersReport, PolicyReport } from '../../../types'
import CategoryScore from '../shared/CategoryScore'
import CategoryEvents from '../shared/CategoryEvents'
import { useSettings } from '../../hooks/useSecurityEngine'
import { aggregateWhoTracksMe, currentPageTrackers, trackerTypeLabel } from '../../../utils/whoTracksMe'

interface Props {
  category: CategoryState
  pageScans: PageScanResult[]
  downloadScans: DownloadScanResult[]
  securityHeaders: SecurityHeadersReport[]
  policyReports: PolicyReport[]
  onAcknowledge: (id: string) => void
}

function hostnameOf(url: string): string {
  try { return new URL(url).hostname } catch { return url }
}

export default function PrivacyDashboard({ category, pageScans, downloadScans, securityHeaders, policyReports, onAcknowledge }: Props) {
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null)
  const [activeUrl, setActiveUrl] = useState<string | undefined>(undefined)
  const [headerQuery, setHeaderQuery] = useState('')
  const { settings, update } = useSettings()
  const cat = category || { id: 'privacy', label: 'Privacy', icon: '🛡️', enabled: true, score: { total: 50, maxScore: 100, factors: [] }, events: [], metrics: [], actions: [], settings: {}, lastScan: 0 }

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true })
      .then(tabs => { const u = tabs[0]?.url; if (u) setActiveUrl(u) })
      .catch(() => {})
  }, [])

  const allCompanies = aggregateWhoTracksMe(pageScans)
  const who = allCompanies.slice(0, 50)
  const siteCount = new Set(pageScans.map(p => p.domain)).size
  const rightNow = currentPageTrackers(pageScans, activeUrl)
  const sitesByDomain = new Map(allCompanies.map(r => [r.domain, r.sites]))
  const currentHost = (() => {
    try {
      const u = activeUrl || ''
      if (!/^https?:/i.test(u)) return ''
      return new URL(u).hostname.replace(/^www\./, '')
    } catch { return '' }
  })()

  // Build a lookup: visited-site domain -> policy report
  const policyLookup = new Map<string, PolicyReport>()
  for (const report of policyReports) {
    policyLookup.set(report.domain.toLowerCase(), report)
  }
  function dataCollectedFor(sites: string[]): string[] {
    // Policy reports exist for SITES, not tracker domains — union what the
    // sites this tracker was seen on declare they collect.
    const found: string[] = []
    for (const site of sites) {
      const report = policyLookup.get(site.toLowerCase())
      if (!report) continue
      for (const d of report.collectedData) {
        if (d.found && !found.includes(d.label)) found.push(d.label)
        if (found.length >= 8) return found
      }
    }
    return found
  }

  return (
    <div className="cat-dashboard">
      <div className="card cat-header-card">
        <CategoryScore score={cat.score} size="medium" />
      </div>

      <div className="card">
        <div className="card-title">Who Tracks Me</div>
        {pageScans.length === 0 ? (
          <div className="cat-events-empty" style={{ padding: '16px 0' }}>
            <p className="cat-events-clean">Visit pages to see who's tracking you</p>
          </div>
        ) : (
          <div className="wtm">
            <div className="wtm-hd">👁️ {who.length === allCompanies.length ? `${who.length} companies` : `Top ${who.length} of ${allCompanies.length} companies`} tracked you across {siteCount} site{siteCount === 1 ? '' : 's'} (last 50 pages)</div>
            {currentHost && (
              <div className="wtm-now-panel">
                <div className="wtm-now-hd">👁 On {currentHost} right now</div>
                {rightNow === null ? (
                  <div className="wtm-now-empty">Scanning this page…</div>
                ) : rightNow.length === 0 ? (
                  <div className="wtm-now-empty">No trackers detected on this page</div>
                ) : (
                  rightNow.map(r => {
                    const histSites = sitesByDomain.get(r.domain) || []
                    const collected = dataCollectedFor([currentHost, ...histSites])
                    return (
                      <div key={r.domain} className="wtm-now-row">
                        <span className="wtm-co">{r.company}</span>
                        {collected.length > 0 ? (
                          <span className="wtm-collected">
                            {collected.map(d => <span key={d} className="wtm-collected-chip">{d}</span>)}
                          </span>
                        ) : (
                          <span className="wtm-collected-none">Data not yet analyzed — open the Policy tab for this site</span>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            )}
            <div className="wtm-lst">
              {who.map(r => {
                return (
                  <div key={r.domain} className="wtm-row">
                    <div className="wtm-row-hd" role="button" tabIndex={0} onClick={() => setExpandedCompany(expandedCompany === r.domain ? null : r.domain)}>
                      <span className={`wtm-cat ${r.category}`}>{r.category}</span>
                      <span className="wtm-co">{r.company}</span>
                      <span className="wtm-type">{r.types.map(trackerTypeLabel).join(', ')}</span>
                      <span className="wtm-cnt">{r.siteCount} site{r.siteCount === 1 ? '' : 's'}</span>
                      <span className="pv-arr">{expandedCompany === r.domain ? '▾' : '▸'}</span>
                    </div>
                    {expandedCompany === r.domain && (
                      <div className="wtm-row-bd">
                        <div className="wtm-sub">Seen on: {r.sites.join(', ')}</div>
                        {(() => {
                          const collected = dataCollectedFor(r.sites)
                          return collected.length > 0 ? (
                            <div className="wtm-collected">
                              <span className="wtm-collected-lb">Collects:</span>
                              {collected.map(d => <span key={d} className="wtm-collected-chip">{d}</span>)}
                            </div>
                          ) : (
                            <div className="wtm-collected-none">Data not yet analyzed — visit site to scan</div>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Download Shield</div>
        <div className="dl-shield-row">
          <div className="dl-shield-info">
            <div className="dl-shield-nm">Auto-cancel risky downloads</div>
            <div className="dl-shield-sub">Automatically cancels high/critical risk downloads when flagged</div>
          </div>
          <button
            className={`tgl ${settings?.autoBlockDownloads ? 'on' : ''}`}
            aria-pressed={!!settings?.autoBlockDownloads}
            onClick={() => update({ autoBlockDownloads: !settings?.autoBlockDownloads })}
          >
            <span className="tgl-knob" />
          </button>
        </div>
        {downloadScans.length === 0 ? (
          <div className="cat-events-empty" style={{ padding: '16px 0' }}>
            <p className="cat-events-clean">No downloads scanned yet — risky files are flagged here</p>
          </div>
        ) : (
          <div className="dl-shield-lst">
            {downloadScans.map(d => (
              <div key={d.id} className="dl-shield-item">
                <span className={`dl-shield-lv ${d.riskLevel}`}>{d.riskLevel}</span>
                <div className="dl-shield-info">
                  <div className="dl-shield-nm">{d.fileName}</div>
                  <div className="dl-shield-sub">{d.reason}{d.domain ? ` — ${d.domain}` : ''}</div>
                </div>
                <span className="dl-shield-time">{new Date(d.timestamp).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title sh-title-row">
          Security Headers
          {securityHeaders.length > 0 && (
            <input
              className="sh-search"
              type="search"
              placeholder="Search sites…"
              value={headerQuery}
              onChange={e => setHeaderQuery(e.target.value)}
            />
          )}
        </div>
        {securityHeaders.length === 0 ? (
          <div className="cat-events-empty" style={{ padding: '16px 0' }}>
            <p className="cat-events-clean">No sites audited yet — headers are checked on each page load</p>
          </div>
        ) : (
          <div className="sh-lst">
            {(() => {
              const q = headerQuery.trim().toLowerCase()
              // Deterministic layout: worst first, ties alphabetical — the
              // same sites must render in the same order on every open.
              const rows = [...securityHeaders]
                .sort((a, b) => a.score - b.score || hostnameOf(a.url).localeCompare(hostnameOf(b.url)))
                .filter(r => !q || hostnameOf(r.url).toLowerCase().includes(q))
                .slice(0, 50)
              if (rows.length === 0) {
                return <p className="sh-no-match">No audited sites match "{headerQuery.trim()}"</p>
              }
              return rows.map(r => {
              const ageTitle = (() => {
                if (!r.auditedAt) return undefined
                const m = Math.floor((Date.now() - r.auditedAt) / 60000)
                return `Checked ${m < 60 ? `${m} min` : `${Math.floor(m / 60)} h`} ago`
              })()
              const chips: [string, boolean, string?][] = [
                ['HSTS', r.hasHsts, r.hstsApplicable === false ? 'n/a over http' : undefined],
                ['CSP', r.hasCsp],
                ['X-Frame-Options', r.hasXfo],
                ['X-XSS-Protection', r.hasXssProtection, 'legacy'],
                ['Referrer-Policy', r.hasReferrerPolicy],
                ['Permissions-Policy', r.hasPermissionsPolicy],
              ]
              return (
                <div key={r.url} className="sh-row">
                  <div className="sh-hd">
                    <span className="sh-site" title={ageTitle}>{hostnameOf(r.url)}</span>
                    <span className={`sh-score ${r.score < 50 ? 'dng' : r.score < 80 ? 'wrn' : 'gd'}`}>{r.score}/100</span>
                  </div>
                  <div className="sh-chips">
                    {chips.map(([name, ok, hint]) => (
                      <span key={name} title={`${name}${hint ? ` (${hint})` : ''} — ${ok ? 'present' : 'missing'}`} className={`sh-chip ${ok ? 'ok' : 'no'}`}>{ok ? '✓' : '✗'} {name}{hint ? ` ·${hint}` : ''}</span>
                    ))}
                  </div>
                </div>
              )
              })
            })()}
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
        <CategoryEvents events={cat.events} onAcknowledge={onAcknowledge} lastScan={cat.lastScan} hint="Events appear when sites miss security headers or serve risky downloads." />
      </div>

      <style>{`
        .wtm-hd { font-size: 11px; font-weight: 700; padding: 2px 0 6px; }
        .wtm-now-panel { background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 6px 8px; margin-bottom: 8px; }
        .wtm-now-hd { font-size: 10px; font-weight: 700; padding-bottom: 4px; }
        .wtm-now-row { display: flex; flex-direction: column; gap: 2px; padding: 3px 0; border-top: 1px solid var(--border); }
        .wtm-now-row .wtm-co { flex: none; }
        .wtm-now-empty { font-size: 9px; color: var(--text-muted); font-style: italic; }
        .wtm-chip { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 10px; padding: 2px 7px; font-size: 9px; font-weight: 600; }
        .wtm-row { border-bottom: 1px solid var(--border); }
        .wtm-row:last-child { border-bottom: none; }
        .wtm-row-hd { display: flex; align-items: center; gap: 6px; width: 100%; padding: 5px 4px; cursor: pointer; background: none; border: none; color: inherit; font: inherit; text-align: left; }
        .wtm-cat { font-size: 7px; padding: 1px 4px; border-radius: 3px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.2px; flex-shrink: 0; }
        .wtm-cat.analytics { background: var(--info-bg); color: var(--info); }
        .wtm-cat.advertising { background: var(--warning-bg); color: var(--warning); }
        .wtm-cat.social { background: var(--accent-glow); color: var(--accent); }
        .wtm-cat.fingerprinting { background: var(--danger-bg); color: var(--danger); }
        .wtm-cat.tracking { background: var(--bg-surface); color: var(--text-muted); }
        .wtm-co { flex: 1; font-size: 11px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .wtm-type { font-size: 8px; color: var(--text-muted); flex-shrink: 0; }
        .wtm-cnt { font-size: 9px; color: var(--text-muted); flex-shrink: 0; }
         .wtm-row-bd { padding: 0 4px 6px 30px; }
         .wtm-sub { font-size: 9px; color: var(--text-muted); }
         .wtm-lst { max-height: 320px; overflow-y: auto; padding-right: 2px; }
         .wtm-lst::-webkit-scrollbar { width: 6px; }
         .wtm-lst::-webkit-scrollbar-track { background: var(--bg-surface); border-radius: 3px; }
         .wtm-lst::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
         .wtm-lst::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
         .wtm-collected { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
         .wtm-collected-lb { font-size: 8px; font-weight: 600; color: var(--text-secondary); }
         .wtm-collected-chip { font-size: 7px; padding: 1px 5px; background: var(--info-bg); color: var(--info); border-radius: 3px; white-space: nowrap; }
         .wtm-collected-none { font-size: 8px; color: var(--text-muted); font-style: italic; }
        .pv-mtr { background: var(--bg-surface); border-radius: var(--radius-sm); padding: 7px 9px; display: flex; align-items: center; gap: 8px; }
        .pv-mtr.good { border-left: 2px solid var(--success); }
        .pv-mtr.warn { border-left: 2px solid var(--warning); }
        .pv-mtr.dng { border-left: 2px solid var(--danger); }
        .pv-mtr-ic { font-size: 15px; }
        .pv-mtr-vl { font-size: 15px; font-weight: 700; line-height: 1; }
        .pv-mtr-lb { font-size: 8px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px; margin-top: 2px; }
        .pv-mtr-sub { font-size: 7px; color: var(--text-muted); margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 110px; }
        .pv-arr { font-size: 9px; color: var(--text-muted); margin-left: 2px; }
        .sh-lst { display: flex; flex-direction: column; gap: 6px; max-height: 240px; overflow-y: auto; }
        .sh-title-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .sh-search {
          flex-shrink: 0; width: 110px; padding: 3px 8px; font-size: 10px;
          background: var(--bg-surface); border: 1px solid var(--border);
          border-radius: 10px; color: inherit; outline: none;
        }
        .sh-search:focus { border-color: var(--accent); }
        .sh-no-match { font-size: 11px; color: var(--text-muted); font-style: italic; padding: 6px 0; }
        .sh-row { background: var(--bg-surface); border-radius: var(--radius-sm); padding: 6px 8px; }
        .sh-hd { display: flex; justify-content: space-between; align-items: center; gap: 6px; }
        .sh-site { font-size: 11px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sh-score { font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 3px; flex-shrink: 0; }
        .sh-score.gd { background: var(--success-bg); color: var(--success); }
        .sh-score.wrn { background: var(--warning-bg); color: var(--warning); }
        .sh-score.dng { background: var(--danger-bg); color: var(--danger); }
        .sh-chips { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 4px; }
        .sh-chip { font-size: 8px; padding: 1px 5px; border-radius: 3px; font-weight: 600; }
        .sh-chip.ok { background: var(--success-bg); color: var(--success); }
        .sh-chip.no { background: var(--danger-bg); color: var(--danger); }
        .dl-shield-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px 0; border-bottom: 1px solid var(--border); }
        .dl-shield-row:last-child { border-bottom: none; }
        .dl-shield-info { flex: 1; min-width: 0; }
        .dl-shield-nm { font-size: 11px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dl-shield-sub { font-size: 8px; color: var(--text-muted); margin-top: 1px; }
        .dl-shield-item { display: flex; align-items: center; gap: 7px; padding: 5px 0; border-bottom: 1px solid var(--border); }
        .dl-shield-item:last-child { border-bottom: none; }
        .dl-shield-lv { font-size: 7px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; padding: 2px 5px; border-radius: 3px; flex-shrink: 0; }
        .dl-shield-lv.low { background: var(--success-bg); color: var(--success); }
        .dl-shield-lv.medium { background: var(--warning-bg); color: var(--warning); }
        .dl-shield-lv.high { background: var(--danger-bg); color: var(--danger); }
        .dl-shield-lv.critical { background: var(--critical-bg); color: var(--critical); }
        .dl-shield-time { font-size: 8px; color: var(--text-muted); flex-shrink: 0; }
      `}</style>
    </div>
  )
}
