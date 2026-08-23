import { useState, useEffect, useRef } from 'react'
import { CategoryState } from '../../../types'
import { usePolicyReports } from '../../hooks/useSecurityEngine'
import PolicyReportDetail from './PolicyReportDetail'
import { showToast } from '../shared/Toast'

function formatTimeAgo(timestamp: number): string {
  if (!timestamp || timestamp <= 0) return ''
  const diff = Math.max(0, Date.now() - timestamp)
  const secs = Math.floor(diff / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

interface Props {
  category: CategoryState
  lastProbes?: string[]
}

export default function PolicyMatrixDashboard({ lastProbes }: Props) {
  const { reports, loading, refresh, analyze } = usePolicyReports()
  const [currentDomain, setCurrentDomain] = useState<string | null>(null)
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const analyzingSinceRef = useRef(0)

  useEffect(() => {
    let mounted = true

    // POPUP_OPENED (sent by App on mount) → FIND_POLICY_LINKS → background
    // analyzes the page — the mount-time analyze() below is deliberately NOT
    // run: it raced the background's own cooldown-guarded analysis and
    // duplicated fetches.
    chrome.tabs.query({ active: true, currentWindow: true }).then(tabs => {
      if (!mounted) return
      if (tabs[0]?.url) {
        try {
          const url = new URL(tabs[0].url)
          const domain = url.hostname.replace(/^www\./, '')
          // Only http(s) pages are analyzable — internal chrome:// pages never
          // reach here anyway, but a string prefix check would wrongly reject
          // real sites like chromewebstore.google.com.
          if (domain && (url.protocol === 'http:' || url.protocol === 'https:')) {
            setCurrentDomain(domain)
            setSelectedDomain(domain)
          }
        } catch {}
      }
    }).catch(() => {})

    return () => { mounted = false }
  }, [])

  // Listen for state updates from background
  useEffect(() => {
    const handler = (msg: any) => {
      if (msg?.type === 'STATE_UPDATED') {
        refresh()
      }
    }
    chrome.runtime.onMessage.addListener(handler)
    return () => chrome.runtime.onMessage.removeListener(handler)
  }, [refresh])

  // Track analysis progress: stop when a fresh report appears, or give up with feedback.
  // Generous timeout — the background chain (link discovery → fetch → analyze,
  // up to 15s per candidate path) can legitimately take ~45s.
  useEffect(() => {
    if (!analyzing) return
    const report = reports.find(r => r.domain === currentDomain)
    if (report && report.analyzedAt >= analyzingSinceRef.current) {
      setAnalyzing(false)
      return
    }
    // Deadline is anchored to analyze START — recomputing 45s from "now" on
    // every reports refresh let periodic state pushes postpone it forever.
    const remaining = Math.max(0, 45000 - (Date.now() - analyzingSinceRef.current))
    const timeout = setTimeout(() => {
      setAnalyzing(false)
      showToast('Could not find a privacy policy for this site', 'error')
    }, remaining)
    return () => clearTimeout(timeout)
  }, [analyzing, reports, currentDomain])

  const handleAnalyze = () => {
    if (!currentDomain || analyzing) return
    analyzingSinceRef.current = Date.now()
    setAnalyzing(true)
    analyze(currentDomain)
  }

  const currentReport = reports.find(r => r.domain === selectedDomain)

  // Show danger alert if current site has dangerous/risky policy
  const showDangerAlert = currentReport && (currentReport.riskLevel === 'dangerous' || currentReport.riskLevel === 'risky')

  // Show loading while first loading reports
  if (loading) {
    return (
      <div className="app-loading">
        <div className="loading-spinner" />
        <p>Loading policy reports…</p>
        <p className="app-loading-sub">SilentGuard is scanning this site</p>
      </div>
    )
  }

  if (!currentDomain) {
    return <EmptyState domain={null} />
  }

  return (
    <div className="px-dashboard px-scroll-container">
      {/* Danger Alert Banner */}
      {showDangerAlert && currentReport && (
        <div className="px-danger-alert">
          <span style={{ color: '#ff4757', fontWeight: 600 }}>
            {currentReport.riskLevel === 'dangerous' ? '⚠ Critical Privacy Warning' : '⚠ Privacy Risk Alert'}
          </span>
          <p style={{ margin: '8px 0 0 0', fontSize: 13 }}>
            {currentReport.riskLevel === 'dangerous' ? 'High risk' : 'Medium risk'} privacy policy detected.
            Score: {currentReport.privacyScore}/100
          </p>
        </div>
      )}

      <div className="px-header-section">
        <div className="px-current-site">
          <span className="px-site-icon">🌐</span>
          <span className="px-site-name">{currentDomain || 'Unknown Site'}</span>
        </div>
        <button className="cat-action-btn cat-action-primary" onClick={handleAnalyze} disabled={!currentDomain || analyzing}>
          {analyzing ? <span className="cat-action-spinner" /> : ''}
          {analyzing ? 'Analyzing…' : '🔍 Analyze Privacy Policy'}
        </button>
      </div>

      {currentReport ? (
        <>
          <div className="px-cache-badge">
            <span className="px-cache-icon">🟢</span>
            <span className="px-cache-label">
              Cached • Analyzed {formatTimeAgo(currentReport.analyzedAt)}
            </span>
          </div>
          <PolicyReportDetail
            report={currentReport}
            onAnalyzeAgain={handleAnalyze}
            analyzing={analyzing}
          />
        </>
      ) : (
        <EmptyState domain={currentDomain} lastProbes={lastProbes} />
      )}

      
    </div>
  )
}

function EmptyState({ domain, lastProbes }: { domain: string | null; lastProbes?: string[] }) {
  const probes = lastProbes?.length ? lastProbes : undefined
  return (
    <div className="card px-card">
      <div className="card-title">📄 No Analysis Yet</div>
      <div className="px-empty-state">
        {domain ? (
          <>
            <p>No policy analysis available for <strong>{domain}</strong>.</p>
            <p>Click "Analyze Privacy Policy" to fetch and analyze the site's policy.</p>
            {probes && (
              <p className="px-probes-note">
                Checked {probes.length} common location{probes.length === 1 ? '' : 's'} (e.g. {probes[0]}…) — no policy found.
              </p>
            )}
          </>
        ) : (
          <>
            <p>Visit a website to analyze its privacy policy.</p>
            <p>The PolicyMatrix will automatically detect privacy policies.</p>
          </>
        )}
      </div>
    </div>
  )
}

