import { useState, useEffect, Component, ReactNode } from 'react'
import { SecurityCategory } from '../types'
import { useSecurityState, useActions } from './hooks/useSecurityEngine'
import OverviewDashboard from './components/overview/OverviewDashboard'
import NetworkDashboard from './components/network/NetworkDashboard'
import DeviceDashboard from './components/device/DeviceDashboard'
import ExtensionsDashboard from './components/extensions/ExtensionsDashboard'
import PasswordDashboard from './components/passwords/PasswordDashboard'
import PrivacyDashboard from './components/privacy/PrivacyDashboard'
import AccountsDashboard from './components/accounts/AccountsDashboard'
import PolicyMatrixDashboard from './components/policy/PolicyMatrixDashboard'
import ToastBar, { useToast, showToast } from './components/shared/Toast'
import PanicButton from './components/shared/PanicButton'
type Tab = SecurityCategory

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: '◈' },
  { id: 'network', label: 'Network', icon: '🌐' },
  { id: 'device', label: 'Device', icon: '💻' },
  { id: 'extensions', label: 'Extensions', icon: '🧩' },
  { id: 'passwords', label: 'Passwords', icon: '🔑' },
  { id: 'privacy', label: 'Privacy', icon: '🛡️' },
  { id: 'accounts', label: 'Accounts', icon: '👤' },
  { id: 'policy', label: 'Policy', icon: '📜' },
]

interface Props { children: ReactNode }
interface State { hasError: boolean }
class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }
  static getDerivedStateFromError(): State { return { hasError: true } }
  render() {
    if (this.state.hasError) {
      return (
        <div className="app">
          <div className="app-loading">
            <p>Something went wrong. Close and reopen the popup.</p>
            <button className="btn btn-primary" onClick={() => this.setState({ hasError: false })}>Retry</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const { state, loading, refresh, removeAccount } = useSecurityState()
  const actions = useActions(refresh)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [refreshing, setRefreshing] = useState(false)
  // One global toast host — showToast() dispatches a window event that any
  // mounted ToastBar would catch; mounting it per-dashboard left all but
  // Passwords/Accounts silent.
  const { toasts } = useToast()

  const handleRefresh = () => {
    if (refreshing) return
    setRefreshing(true)
    // Kick off background scans (extensions, IP, active-tab page scan, policy)
    chrome.runtime.sendMessage({ type: 'POPUP_OPENED' }).catch(() => {})
    refresh()
      .then(() => new Promise(r => setTimeout(r, 1200)))
      .then(refresh)
      .catch(() => {})
      .finally(() => {
        setTimeout(() => setRefreshing(false), 300)
      })
  }

  const [reloadingTabs, setReloadingTabs] = useState(false)

  // One click reloads every open tab in every window. All reload commands
  // are dispatched in PARALLEL in one tick — a sequential await loop died
  // whenever the popup unloaded midway (any focus loss kills the popup),
  // leaving most tabs un-reloaded.
  const handleRefreshTabs = async () => {
    if (reloadingTabs) return
    setReloadingTabs(true)
    try {
      const tabs = await chrome.tabs.query({})
      const targets = tabs.filter(t => typeof t.id === 'number') as (chrome.tabs.Tab & { id: number })[]
      const results = await Promise.allSettled(targets.map(t => chrome.tabs.reload(t.id)))
      const ok = results.filter(r => r.status === 'fulfilled').length
      showToast(
        ok > 0 ? `Reloaded ${ok} tab${ok === 1 ? '' : 's'}` : 'No open tabs to reload',
        ok > 0 ? 'success' : 'info'
      )
    } catch {
      showToast('Could not reload tabs', 'error')
    } finally {
      setReloadingTabs(false)
    }
  }

  useEffect(() => {
    // The scrolling container persists across switches — without this the
    // new tab opens pre-scrolled to wherever the previous one ended.
    const el = document.querySelector<HTMLElement>('.tab-content')
    if (el) el.scrollTop = 0
  }, [activeTab])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as Tab
      if (detail) setActiveTab(detail)
    }
    window.addEventListener('tab-change', handler)
    return () => window.removeEventListener('tab-change', handler)
  }, [])

  useEffect(() => {
    // Warm up background by initializing it
    chrome.runtime.sendMessage({ type: 'POPUP_OPENED' }).catch(() => {})

    // Refresh with retry
    const attemptRefresh = (attempt: number) => {
      refresh().catch(() => {
        if (attempt < 3) {
          setTimeout(() => attemptRefresh(attempt + 1), 300 * attempt)
        }
      })
    }
    attemptRefresh(0)
  }, [])

  if (loading || !state) {
    if (!loading && !state) {
      return (
        <div className="app-loading">
          <div className="loading-spinner" />
          <p className="app-loading-text">Unable to reach security core</p>
          <p className="app-loading-sub">The background service may still be waking up</p>
          <button className="btn btn-primary" onClick={handleRefresh}>Retry</button>
        </div>
      )
    }
    return (
      <div className="app-loading">
        <div className="loading-spinner" />
        <p className="app-loading-text">
          {loading ? 'Initializing security...' : 'Preparing...'}
        </p>
        <div className="app-loading-sub">
          {loading ? 'Security modules launching...' : 'Ready'}
        </div>
      </div>
    )
  }

  const renderDashboard = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewDashboard state={state} />
      case 'network':
        return (
          <NetworkDashboard
            category={state.categories.network}
            network={state.network}
          />
        )
      case 'device':
        return (
          <DeviceDashboard
            category={state.categories.device}
          />
        )
      case 'extensions':
        return (
          <ExtensionsDashboard
            category={state.categories.extensions}
            extensions={state.installedExtensions || state.dangerousExtensions || []}
            flagged={state.dangerousExtensions || []}
            onAcknowledge={actions.acknowledgeEvent}
            onRemove={actions.removeExtension}
            onScan={actions.scanExtensions}
          />
        )
      case 'passwords':
        return <PasswordDashboard />
      case 'privacy':
        return (
          <PrivacyDashboard
            category={state.categories.privacy}
            pageScans={state.pageScans}
            downloadScans={state.downloadScans}
            securityHeaders={state.securityHeaders}
            policyReports={state.policyReports || []}
            onAcknowledge={actions.acknowledgeEvent}
          />
        )
      case 'accounts':
        return (
          <AccountsDashboard
            category={state.categories.accounts}
            accounts={state.accounts}
            onAcknowledge={actions.acknowledgeEvent}
            onAddAccount={actions.addAccount}
            onRemoveAccount={removeAccount}
            refresh={refresh}
          />
        )
      case 'policy':
        return <PolicyMatrixDashboard category={state.categories.policy} lastProbes={state.lastPolicyProbes} />
      default:
        return null
    }
  }

  return (
    <ErrorBoundary>
      <div className="app">
        <header className="app-header">
          <h1>SilentGuard</h1>
          <div className="header-actions">
            <button
              type="button"
              className={`refresh-tabs-btn ${reloadingTabs ? 'spinning' : ''}`}
              onClick={handleRefreshTabs}
              disabled={reloadingTabs}
              title="Refresh all open websites"
              aria-label="Refresh all open websites"
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M13.6 8a5.6 5.6 0 1 1-1.64-3.96" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                <path d="M14 1.6v3h-3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <PanicButton state={state} />
          </div>
        </header>

        <div className="tab-bar" role="tablist" aria-label="Security categories">
          {TABS.map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="tab-icon">{tab.icon}</span>
              <span className="tab-label">{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="tab-content" role="tabpanel" id={`panel-${activeTab}`} aria-label={TABS.find(t => t.id === activeTab)?.label}>
          {renderDashboard()}
        </div>

        <footer className="app-footer"></footer>
        <ToastBar toasts={toasts} />
      </div>
    </ErrorBoundary>
  )
}
