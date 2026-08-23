import { useState } from 'react'
import { PolicyReport, ThirdPartyInfo, CookieInfo, UserRight, SecurityPractice, DangerousClause } from '../../../types'
import { getRiskLevelLabel } from '../../../types'
import { cleanExcerpt } from '../../../utils/excerpt'

interface Props {
  report: PolicyReport
  onAnalyzeAgain: () => void
  analyzing?: boolean
}

const SENSITIVE_DATA_FIELDS = ['biometric', 'health', 'location', 'payment', 'camera', 'microphone']

function getScoreColor(score: number): string {
  if (score >= 80) return '#2ed573'
  if (score >= 60) return '#ffa502'
  if (score >= 40) return '#ff6348'
  return '#ff4757'
}

function getSeverityColor(s: string): string {
  const map: Record<string, string> = { low: '#ffa502', medium: '#ff6348', high: '#ff4757', critical: '#8b0000' }
  return map[s] || '#aaa'
}

function getSeverityBg(s: string): string {
  const map: Record<string, string> = {
    low: 'rgba(255,165,2,0.12)', medium: 'rgba(255,99,72,0.12)', high: 'rgba(255,71,87,0.12)', critical: 'rgba(139,0,0,0.25)',
  }
  return map[s] || 'rgba(255,255,255,0.04)'
}

export function OpenPolicyButton({ url }: { url: string }) {
  const [error, setError] = useState(false)
  if (!url) return null

  let target = ''
  try {
    const u = new URL(url)
    if (u.protocol === 'https:' || u.protocol === 'http:') target = u.href
  } catch { /* fall through */ }
  if (!target) return null

  if (error) {
    return <span className="px-open-error">Could not open {target}</span>
  }
  return (
    <button
      className="cat-action-btn cat-action-default"
      onClick={() => {
        chrome.tabs.create({ url: target }).catch(() => setError(true))
      }}
      title={`Open ${target}`}
    >
      🔗 Open Policy
    </button>
  )
}

function EvidenceChip({ label, evidence, color }: { label: string; evidence?: string; color?: string }) {
  const [open, setOpen] = useState(false)
  const canExpand = !!evidence
  return (
    <div className="px-chip-wrap">
      <button
        className="px-chip px-chip-btn"
        style={{ background: `${color ? color : '#5b8dff'}20`, color: color || '#5b8dff' }}
        onClick={() => canExpand && setOpen(!open)}
        disabled={!canExpand}
        title={canExpand ? (open ? 'Hide evidence' : 'View evidence') : label}
      >
        {label}
        {canExpand && <span className="px-chip-arrow">{open ? '▾' : '▸'}</span>}
      </button>
      {open && evidence && <div className="px-ev">{evidence}</div>}
    </div>
  )
}

// Snapshot badges like "⚠ Found (2)" used to be dead text — this makes them
// expandable so the user sees WHAT matched and the quoted policy sentence.
function SnapshotEvidence({ label, items }: { label: string; items: { title: string; detail?: string }[] }) {
  const [open, setOpen] = useState(false)
  if (items.length === 0) return null
  return (
    <>
      <button
        className="px-badge badge-warning px-snap-btn"
        onClick={() => setOpen(!open)}
        title={open ? 'Hide details' : 'Show what was found'}
        aria-expanded={open}
      >
        ⚠ {label} ({items.length}) <span className="px-chip-arrow">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="px-ev px-snap-list">
          {items.map((it, i) => (
            <div key={i} className="px-snap-item">
              <span className="px-snap-item-title">{it.title}</span>
              {it.detail && <span className="px-snap-item-quote">“{it.detail}”</span>}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function PrivacyNutritionLabel({ report }: { report: PolicyReport }) {
  const scoreColor = getScoreColor(report.privacyScore)
  const riskLevel = getRiskLevelLabel(report.riskLevel)

  const sellRules = report.matchedRules.filter(r => /sell.*personal|sale.*personal/i.test(r.description) && r.riskDelta > 0)
  const trackRules = report.matchedRules.filter(r => /track|pixel|beacon|fingerprint/i.test(r.description) && r.riskDelta > 0)
  const hasHealthData = report.collectedData.some(d => d.type === 'health' && d.found)
  const hasEncryption = report.securityPractices.some(p => p.found && (p.id === 'encryption' || p.id === 'https')) ||
    report.matchedRules.some(r => r.id === 'rule_encryption_present')
  const hasDeleteRight = report.userRights.some(r => r.id === 'delete' && r.found) ||
    report.matchedRules.some(r => r.id === 'rule_delete_account_present')

  // Confidence reflects how much policy text was actually analyzed: more words
  // and careful findings = higher confidence, contradictions/volume trim it.
  const confidence = Math.min(99, Math.max(55, Math.round(
    65 + report.wordCount / 150 - report.matchedRules.length * 0.5 - report.thirdParties.length * 0.4
  )))

  return (
    <div className="px-nutrition-label">
      <div className="px-nutrition-title">🔖 PRIVACY SNAPSHOT</div>
      <div className="px-nutrition-row">
        <span className="px-nutrition-label-text">Score</span>
        <span className="px-nutrition-score" style={{ color: scoreColor }}>{report.privacyScore}/100</span>
      </div>
      <div className="px-nutrition-row">
        <span className="px-nutrition-label-text">Risk Level</span>
        <span className={`px-badge ${report.privacyScore >= 80 ? 'badge-success' : report.privacyScore >= 60 ? 'badge-warning' : 'badge-danger'}`}>
          {riskLevel}
        </span>
      </div>
      <div className="px-nutrition-row">
        <span className="px-nutrition-label-text">Analysis Confidence</span>
        <span className="px-nutrition-confidence">{Math.round(confidence)}%</span>
      </div>
      <div className="px-nutrition-row">
        <span className="px-nutrition-label-text">💰 Data Selling</span>
        {sellRules.length > 0 ? (
          <SnapshotEvidence
            label="Evidence"
            items={sellRules.map(r => ({ title: r.description, detail: r.snippet || r.evidence }))}
          />
        ) : (
          <span className="px-badge badge-success">✅ No</span>
        )}
      </div>
      <div className="px-nutrition-row">
        <span className="px-nutrition-label-text">👥 Third Parties</span>
        {report.thirdParties.length > 0 ? (
          <SnapshotEvidence
            label="Found"
            items={report.thirdParties.map(p => ({ title: p.name, detail: p.evidence }))}
          />
        ) : (
          <span className="px-badge badge-success">✅ None</span>
        )}
      </div>
      <div className="px-nutrition-row">
        <span className="px-nutrition-label-text">👁️ Tracking</span>
        {trackRules.length > 0 ? (
          <SnapshotEvidence
            label="Found"
            items={trackRules.map(r => ({ title: r.description, detail: r.snippet || r.evidence }))}
          />
        ) : (
          <span className="px-badge badge-success">✅ No</span>
        )}
      </div>
      <div className="px-nutrition-row">
        <span className="px-nutrition-label-text">❤️ Health Data</span>
        <span className={`px-badge ${hasHealthData ? 'badge-danger' : 'badge-success'}`}>
          {hasHealthData ? '⚠ Collected' : '✅ No'}
        </span>
      </div>
      <div className="px-nutrition-row">
        <span className="px-nutrition-label-text">🔒 Encryption</span>
        <span className={`px-badge ${hasEncryption ? 'badge-success' : 'badge-warning'}`}>
          {hasEncryption ? '✅ Mentioned' : '❌ Not mentioned'}
        </span>
      </div>
      <div className="px-nutrition-row">
        <span className="px-nutrition-label-text">🗑 Delete Data</span>
        <span className={`px-badge ${hasDeleteRight ? 'badge-success' : 'badge-warning'}`}>
          {hasDeleteRight ? '✅ Available' : '❌ Not found'}
        </span>
      </div>
      <div className="px-nutrition-row">
        <span className="px-nutrition-label-text">📅 Retention</span>
        <span className="px-nutrition-sub">{report.retention.period}</span>
      </div>
    </div>
  )
}

function ScoreExplanation({ report }: { report: PolicyReport }) {
  const protective = report.matchedRules.filter(r => r.riskDelta < 0)
  const dangerous = report.matchedRules.filter(r => r.riskDelta > 0)
  const transparency = report.transparencyScore ?? 0

  return (
    <div className="px-card px-section">
      <div className="card-title">💡 Score Explanation</div>
      <div className="px-score-explanation">
        <div className="px-score-factor positive">
          {protective.length > 0 ? (
            <span>✓ +{Math.min(25, protective.reduce((s, r) => s + Math.abs(r.riskDelta), 0))} pts — Strong protections detected (capped at +25)</span>
          ) : (
            <span>✓ Base score 75 pts</span>
          )}
        </div>
        {dangerous.slice(0, 3).map((r, i) => (
          <div key={i} className="px-score-factor negative">
            <span>✗ −{r.riskDelta} pts — {r.description}</span>
          </div>
        ))}
        {dangerous.length > 3 && (
          <div className="px-score-factor negative">
            <span>✗ −{dangerous.slice(3).reduce((s, r) => s + r.riskDelta, 0)} pts — {dangerous.length - 3} more risk factor(s)</span>
          </div>
        )}
        {transparency < 40 && (
          <div className="px-score-factor negative">
            <span>✗ −10 pts — Limited policy transparency ({transparency}/100)</span>
          </div>
        )}
        {transparency >= 80 && (
          <div className="px-score-factor positive">
            <span>✓ +15 pts — Highly transparent policy ({transparency}/100)</span>
          </div>
        )}
        {transparency >= 50 && transparency < 80 && (
          <div className="px-score-factor positive">
            <span>✓ +5 pts — Good policy transparency ({transparency}/100)</span>
          </div>
        )}
      </div>
    </div>
  )
}

function ClausePreview({ clauses }: { clauses: DangerousClause[] }) {
  if (clauses.length === 0) return null
  return (
    <div className="px-card px-section">
      <div className="card-title">⚠ Dangerous Clauses Preview</div>
      <div className="px-clause-preview">
        {clauses.slice(0, 3).map((c, i) => (
          <ClauseItem key={i} clause={c} />
        ))}
      </div>
    </div>
  )
}

function ClauseItem({ clause }: { clause: DangerousClause }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`px-clause-preview-item ${open ? 'open' : ''}`} onClick={() => setOpen(!open)} title={open ? 'Hide details' : 'Click to expand'}>
      <div className="px-clause-head">
        <span className="px-clause-sev" style={{ background: getSeverityBg(clause.severity), color: getSeverityColor(clause.severity) }}>{clause.severity}</span>
        <span className="px-clause-arrow">{open ? '▾' : '▸'}</span>
      </div>
      <p className="px-clause-preview-text">
        {open ? clause.text : cleanExcerpt(clause.text, 80)}
      </p>
      {open && <div className="px-clause-full">Why flagged: {clause.reason}</div>}
    </div>
  )
}

function DataCard({ items, title, icon }: { items: { name: string; found: boolean; color?: string; evidence?: string }[]; title: string; icon: string }) {
  const foundItems = items.filter(i => i.found)
  return (
    <div className="px-card px-section">
      <div className="card-title">{icon} {title}</div>
      {foundItems.length === 0 ? (
        <p className="px-empty">No data detected</p>
      ) : (
        <div className="px-chip-list">
          {foundItems.map(item => (
            <EvidenceChip key={item.name} label={item.name} evidence={item.evidence} color={item.color} />
          ))}
        </div>
      )}
    </div>
  )
}

function PolicyScoreCard({ report }: { report: PolicyReport }) {
  const scoreColor = getScoreColor(report.privacyScore)
  const dim = 72

  return (
    <div className="px-score-card">
      <div className="px-score-circle">
        <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`}>
          <circle cx={dim/2} cy={dim/2} r={(dim-3)/2} fill="var(--bg-primary)" strokeWidth={3} stroke="var(--border)" />
          <circle cx={dim/2} cy={dim/2} r={(dim-3)/2} fill="none" stroke={scoreColor} strokeWidth={3}
            strokeDasharray={2 * Math.PI * ((dim-3)/2)} strokeDashoffset={2 * Math.PI * ((dim-3)/2) * (1 - report.privacyScore/100)} />
        </svg>
        <div className="px-score-inner">
          <span className="px-score-num">{report.privacyScore}</span>
          <span className="px-score-label">/{100}</span>
        </div>
      </div>

      <div className="px-score-info">
        <h2 className="px-score-title">Privacy Score</h2>
        <div className="px-risk-badge" style={{ background: `${scoreColor}20`, color: scoreColor }}>
          {getRiskLevelLabel(report.riskLevel)}
        </div>
      </div>

      <div className="px-score-actions">
        <OpenPolicyButton url={report.policyUrl} />
      </div>
    </div>
  )
}

export default function PolicyReportDetail({ report, onAnalyzeAgain, analyzing }: Props) {
  const isAnalyzing = analyzing ?? false
  return (
    <>
      <PrivacyNutritionLabel report={report} />

      <PolicyScoreCard report={report} />

      <div className="px-stats-cards">
        <StatCard icon="📄" label="Words" value={report.wordCount} />
        <StatCard icon="⚠" label="Clauses" value={report.dangerousClauses.length} />
        <StatCard icon="📜" label="Risks" value={report.matchedRules.filter(r => r.riskDelta > 0).length} />
        <StatCard icon="🤝" label="Sharing" value={report.thirdParties.length} />
      </div>

      <RiskBreakdown report={report} />

      <DataCard
        items={report.collectedData.map(d => ({
          name: d.label, found: d.found, evidence: d.evidence,
          color: SENSITIVE_DATA_FIELDS.includes(d.type) ? '#ff4757' : '#5b8dff'
        }))}
        title="Collected Data" icon="📦"
      />

      {report.thirdParties.length > 0 && (
        <ThirdPartySection parties={report.thirdParties} />
      )}

      {report.cookies.length > 0 && (
        <div className="px-card px-section">
          <div className="card-title">🍪 Cookies</div>
          <CookieList cookies={report.cookies} />
        </div>
      )}

      <RetentionSection retention={report.retention} />
      <RightsSection rights={report.userRights} />
      <SecuritySection practices={report.securityPractices} />

      <ClausePreview clauses={report.dangerousClauses} />
      <ScoreExplanation report={report} />

      <RecommendationSection report={report} />

      <div className="cat-actions-section">
        <div className="px-analyze-row">
          <span className="px-analyze-time">{report.analyzedAt > 0 ? `Analyzed: ${new Date(report.analyzedAt).toLocaleString()}` : 'Not yet analyzed'}</span>
          <button className="cat-action-btn cat-action-primary" onClick={onAnalyzeAgain} disabled={isAnalyzing}>
            {isAnalyzing ? <span className="cat-action-spinner" /> : ''}
            {isAnalyzing ? 'Analyzing...' : '🔍 Analyze Again'}
          </button>
        </div>
      </div>
    </>
  )
}

function StatCard({ icon, label, value }: { icon: string; label: string; value: number | string }) {
  return (
    <div className="px-stat-card">
      <div className="px-stat-icon">{icon}</div>
      <div className="px-stat-label">{label}</div>
      <div className="px-stat-value">{value}</div>
    </div>
  )
}

function RiskBreakdown({ report }: { report: PolicyReport }) {
  const items = [
    { label: 'Critical', count: report.matchedRules.filter(r => r.severity === 'critical').length, color: '#8b0000' },
    { label: 'High', count: report.matchedRules.filter(r => r.severity === 'high').length, color: '#ff4757' },
    { label: 'Medium', count: report.matchedRules.filter(r => r.severity === 'medium').length, color: '#ff6348' },
    { label: 'Low', count: report.matchedRules.filter(r => r.severity === 'low').length, color: '#ffa502' },
  ].filter(i => i.count > 0)

  return (
    <div className="card px-card px-section">
      <div className="card-title">📊 Risk Distribution</div>
      {items.length === 0 ? (
        <p className="px-empty">No risk factors detected</p>
      ) : (
        <div className="px-risk-breakdown">
          {items.map(item => (
            <div key={item.label} className="px-risk-row">
              <span className="px-risk-dot" style={{ background: item.color }} />
              <span>{item.label}</span>
              <span className="px-risk-count">{item.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ThirdPartySection({ parties }: { parties: ThirdPartyInfo[] }) {
  const byCategory = parties.reduce((acc, p) => {
    if (!acc[p.category]) acc[p.category] = []
    acc[p.category].push(p)
    return acc
  }, {} as Record<string, ThirdPartyInfo[]>)

  return (
    <div className="px-card px-section">
      <div className="card-title">🤝 Third-Party Sharing</div>
      <div className="px-tp-section">
        {Object.entries(byCategory).map(([cat, items]) => (
          <div key={cat} className="px-tp-group">
            <span className="px-tp-cat">{cat.toUpperCase()}</span>
            {items.map((p, i) => (
              <div key={i} className="px-tp-item">
                <EvidenceChip label={p.name} evidence={p.evidence} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function CookieList({ cookies }: { cookies: CookieInfo[] }) {
  const typeLabels: Record<string, string> = {
    essential: 'Essential', analytics: 'Analytics', advertising: 'Advertising',
    functional: 'Functional', performance: 'Performance', 'third-party': 'Third-Party', tracking: 'Tracking'
  }
  return (
    <div className="px-cookie-grid">
      {cookies.map((c, i) => (
        <EvidenceChip key={i} label={c.name || typeLabels[c.type]} evidence={c.evidence} color="#ffa502" />
      ))}
    </div>
  )
}

function RetentionSection({ retention }: { retention: any }) {
  const showRaw = retention.rawText && retention.rawText !== retention.period
  return (
    <div className="px-card px-section px-retention-card">
      <div className="card-title">🗂 Data Retention</div>
      <div className="px-retention-content">
        <span className={`px-retention-badge ${retention.isExcessive ? 'excessive' : 'ok'}`}>
          {retention.period}
        </span>
        {showRaw && <p className="px-retention-text">{retention.rawText}</p>}
        {retention.isExcessive && <p className="px-empty" style={{ color: '#ff4757' }}>⚠ Excessive or indefinite retention</p>}
      </div>
    </div>
  )
}

function RightsSection({ rights }: { rights: UserRight[] }) {
  const found = rights.filter(r => r.found)
  const missing = rights.filter(r => !r.found)
  return (
    <div className="px-card px-section">
      <div className="card-title">✅ User Rights</div>
      <div className="px-rights-grid">
        {found.slice(0, 6).map(r => <EvidenceChip key={r.id} label={`✓ ${r.label}`} evidence={r.evidence} color="#2ed573" />)}
        {missing.slice(0, 3).map(r => <div key={r.id} className="px-right-item missing">✕ {r.label}</div>)}
      </div>
    </div>
  )
}

function SecuritySection({ practices }: { practices: SecurityPractice[] }) {
  const found = practices.filter(p => p.found)
  return (
    <div className="px-card px-section">
      <div className="card-title">🔐 Security</div>
      <div className="px-sec-grid">
        {found.length === 0 ? (
          <p className="px-empty">No security practices mentioned</p>
        ) : found.slice(0, 6).map(p => (
          <EvidenceChip key={p.id} label={`🛡️ ${p.label}`} evidence={p.evidence} color="#5b8dff" />
        ))}
      </div>
    </div>
  )
}

function RecommendationSection({ report }: { report: PolicyReport }) {
  return (
    <div className="px-card px-section">
      <div className="card-title">🛡 Recommendation</div>
      <div className="px-recommendation">
        <p>
          {report.recommendation}
        </p>
      </div>
    </div>
  )
}