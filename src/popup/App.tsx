import { useState, useEffect, Component, ReactNode } from 'react'
import { SecurityCategory } from '../types'
import { collectFingerprint } from '../utils/fingerprint'
import { useSecurityState, useActions } from './hooks/useSecurityEngine'
import OverviewDashboard from './components/overview/OverviewDashboard'
import NetworkDashboard from './components/network/NetworkDashboard'
import DeviceDashboard from './components/device/DeviceDashboard'
import ExtensionsDashboard from './components/extensions/ExtensionsDashboard'
import PasswordDashboard from './components/passwords/PasswordDashboard'
import PrivacyDashboard from './components/privacy/PrivacyDashboard'
import AccountsDashboard from './components/accounts/AccountsDashboard'
type Tab = SecurityCategory

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: '◈' },
  { id: 'network', label: 'Network', icon: '🌐' },
  { id: 'device', label: 'Device', icon: '💻' },
  { id: 'extensions', label: 'Extensions', icon: '🧩' },
  { id: 'passwords', label: 'Passwords', icon: '🔑' },
  { id: 'privacy', label: 'Privacy', icon: '🛡️' },
  { id: 'accounts', label: 'Accounts', icon: '👤' },
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

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as Tab
      if (detail) setActiveTab(detail)
    }
    window.addEventListener('tab-change', handler)
    return () => window.removeEventListener('tab-change', handler)
  }, [])

  useEffect(() => {
    const fp = collectFingerprint()
    chrome.runtime.sendMessage({ type: 'FINGERPRINT_REPORT', fingerprint: fp }).catch(() => {})
    chrome.runtime.sendMessage({ type: 'POPUP_OPENED' }).then(() => refresh()).catch(() => {})
  }, [])

  if (loading || !state) {
    return (
      <div className="app-loading">
        <div className="loading-spinner" />
        <p>Loading SilentGuard…</p>
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
            onAcknowledge={actions.acknowledgeEvent}
          />
        )
      case 'device':
        return (
          <DeviceDashboard
            category={state.categories.device}
            fingerprint={state.fingerprint}
            onAcknowledge={actions.acknowledgeEvent}
          />
        )
      case 'extensions':
        return (
          <ExtensionsDashboard
            category={state.categories.extensions}
            extensions={state.dangerousExtensions}
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
          />
        )
      default:
        return null
    }
  }

  return (
    <ErrorBoundary>
      <div className="app">
        <header className="app-header">
          <h1>SilentGuard</h1>
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
      </div>
    </ErrorBoundary>
  )
}
