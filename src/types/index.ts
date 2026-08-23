import type { PolicyReport, PolicyLink } from './policy'

export * from './policy'

export type SecurityCategory = 'overview' | 'network' | 'device' | 'extensions' | 'passwords' | 'privacy' | 'accounts' | 'policy'

export type RiskEventType =
  | 'cookie_change'
  | 'extension_installed'
  | 'network_change'
  | 'login_activity'
  | 'ip_change'
  | 'account_breach'
  | 'session_expiry'
  | 'sensor_access'
  | 'phishing_detected'
  | 'password_strength'
  | 'session_hijack'
  | 'cert_anomaly'
  | 'dns_poison'
  | 'missing_security_header'
  | 'threat_intel_match'
  | 'anomaly_detected'
  | 'correlated_incident'
  | 'forensic_snapshot'
  | 'policy_risk'
  | 'suspicious_download'
  | 'panic_triggered'
  | 'panic_recovered'

export interface SensorUsage {
  api: string
  domain: string
  url: string
  timestamp: number
}

export interface PhishingResult {
  url: string
  domain: string
  isPhishing: boolean
  confidence: number
  source: string
  checkedAt: number
}

export interface DownloadScanResult {
  id: string
  downloadId?: number
  fileName: string
  url: string
  domain: string
  extension: string
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  reason: string
  timestamp: number
}

export interface PasswordStrengthResult {
  url: string
  domain: string
  score: number
  crackTime: string
  suggestions: string[]
  warning: string
}

export interface CertAnomaly {
  domain: string
  issuedDaysAgo: number
  issuer: string
  severity: 'low' | 'medium' | 'high'
}

export interface DnsCheckResult {
  domain: string
  expectedIps: string[]
  resolverResults: { resolver: string; ips: string[]; matched: boolean }[]
  isConsistent: boolean
  checkedAt: number
}

export interface SecurityHeadersReport {
  url: string
  auditedAt?: number
  hasHsts: boolean
  hstsApplicable?: boolean // false over plain http — HSTS cannot exist there
  hasCsp: boolean
  hasXfo: boolean
  hasXssProtection: boolean
  hasReferrerPolicy: boolean
  hasPermissionsPolicy: boolean
  score: number
  missingHeaders: string[]
}

export interface ThreatIntelMatch {
  ioc: string
  type: 'ip' | 'domain' | 'url' | 'hash'
  feed: string
  description: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  matchedAt: number
}

export interface AnomalyScore {
  metric: string
  value: number
  baseline: number
  deviation: number
  severity: 'low' | 'medium' | 'high'
}

export interface CorrelatedIncident {
  id: string
  title: string
  description: string
  probability: number
  events: string[]
  domains: string[]
  suggestedAction: string
  timestamp: number
  acknowledged: boolean
}

export interface ForensicSnapshot {
  id: string
  timestamp: number
  trigger: string
  openTabs: { url: string; title: string }[]
  extensions: { id: string; name: string; enabled: boolean }[]
  cookies: { domain: string; name: string; secure: boolean }[]
  networkState: { publicIp: string; isVpn: boolean }
  screenshots?: string[]
}

export interface PanicState {
  active: boolean
  startedAt: number
  snapshotId: string
  lockdownUntil: number
}

export interface SecurityTimelineEntry {
  date: string
  score: number
  eventCount: number
  events: { type: string; severity: string; title: string }[]
}

export interface WeeklyDigest {
  weekStart: string
  weekEnd: string
  scoreStart: number
  scoreEnd: number
  totalEvents: number
  criticalEvents: number
  topThreats: string[]
  improvements: string[]
  recommendations: string[]
}

export interface RiskEvent {
  id: string
  type: RiskEventType
  category: SecurityCategory
  severity: 'low' | 'medium' | 'high' | 'critical'
  title: string
  description: string
  source?: string
  timestamp: number
  acknowledged: boolean
}

export interface ScoreFactor {
  label: string
  score: number
  maxScore: number
  type: 'positive' | 'negative'
}

export interface CategoryScore {
  total: number
  maxScore: number
  factors: ScoreFactor[]
}

export interface CategoryMetric {
  label: string
  value: string
  icon: string
  trend?: 'up' | 'down' | 'stable'
  status?: 'good' | 'warning' | 'danger'
}

export interface CategoryAction {
  id: string
  label: string
  description: string
  icon: string
  action: 'open_url' | 'run_scan' | 'toggle_setting' | 'custom'
  url?: string
  payload?: Record<string, unknown>
  severity?: 'default' | 'primary' | 'danger'
}

export interface CategoryState {
  id: SecurityCategory
  label: string
  icon: string
  enabled: boolean
  score: CategoryScore
  events: RiskEvent[]
  metrics: CategoryMetric[]
  actions: CategoryAction[]
  settings: Record<string, boolean | string>
  lastScan: number
}

export interface DangerousExtension {
  id: string
  name: string
  permissions: string[]
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  canAccessAllUrls: boolean
  canReadCookies: boolean
  canUseWebRequest: boolean
  reason?: string[]
  version?: string
  updateTime?: number
  isWhitelisted?: boolean
  enabled?: boolean
}

export type AccountAuthRole = 'login' | 'signup'

export interface AccountSite {
  domain: string
  name: string
  status: 'verified' | 'unverified'
  securityUrl?: string
  loginActivityUrl?: string
  lastChecked: number
  hasSession?: boolean
  sessionAge?: number
  breachCount?: number
  role?: AccountAuthRole
  lastAuthAt?: number
  lastActive?: number
}

export interface NetworkInfo {
  publicIp: string
  isp?: string
  country?: string
  city?: string
  isVpn: boolean
  isProxy: boolean
  isTor: boolean
  lastChecked: number
  ipHistory: { ip: string; timestamp: number }[]
}

export interface PasswordFormInfo {
  url: string
  hasPasswordField: boolean
  isOverHttp: boolean
  formAction?: string
  autocomplete?: string
  timestamp: number
}

export interface TrackerFinding {
  domain: string
  source: string
  type: 'script' | 'pixel' | 'iframe' | 'beacon' | 'fingerprinting' | 'hidden' | 'inline' | 'webRTC' | 'font' | 'audio' | 'canvas'
  category: 'analytics' | 'advertising' | 'social' | 'fingerprinting' | 'tracking'
  details?: string
}

export interface PageScanResult {
  url: string
  domain: string
  scannedAt: number
  trackers: TrackerFinding[]
  canvasAttempts: number
  audioAttempts: number
  webRTCLeakDetected: boolean
  thirdPartyRequests: number
  totalCookies: number
}

export interface SecurityState {
  categories: Record<string, CategoryState>
  accounts: AccountSite[]
  dismissedAccounts: string[]
  dangerousExtensions: DangerousExtension[]
  installedExtensions: DangerousExtension[]
  network: NetworkInfo | null
  pageScans: PageScanResult[]
  sensorUsage: SensorUsage[]
  phishingResults: PhishingResult[]
  downloadScans: DownloadScanResult[]
  passwordStrengths: PasswordStrengthResult[]
  certAnomalies: CertAnomaly[]
  dnsChecks: DnsCheckResult[]
  securityHeaders: SecurityHeadersReport[]
  threatIntelMatches: ThreatIntelMatch[]
  anomalyScores: AnomalyScore[]
  correlatedIncidents: CorrelatedIncident[]
  // Event ids already cited by a correlated incident — persists beyond the
  // 20-incident cap so truncation cannot re-trigger the same incident.
  correlatedEventIds: string[]
  forensicSnapshots: ForensicSnapshot[]
  panicState: PanicState
  timeline: SecurityTimelineEntry[]
  weeklyDigests: WeeklyDigest[]
  policyReports: PolicyReport[]
  lastPolicyHash: string
  // URLs probed by the last common-path sweep — lets the popup show "we
  // checked these N locations" when no policy was found.
  lastPolicyProbes: string[]
}

export interface StorageData {
  securityState: SecurityState
  settings: GlobalSettings
  eventHistory: RiskEvent[]
}

export interface GlobalSettings {
  notificationsEnabled: boolean
  autoScanExtensions: boolean
  monitorCookies: boolean
  monitorNetwork: boolean
  monitorPasswords: boolean
  monitorPrivacy: boolean
  onlyHighRiskAlerts: boolean
  extensionWhitelist: string[]
  monitorPhishing: boolean
  monitorPasswordStrength: boolean
  monitorSessionHijack: boolean
  monitorCertificates: boolean
  monitorDns: boolean
  monitorHeaders: boolean
  monitorThreatIntel: boolean
  monitorAnomaly: boolean
  monitorCorrelation: boolean
  autoKillSessions: boolean
  autoRotateCredentials: boolean
  forensicSnapshots: boolean
  weeklyDigest: boolean
  monitorPolicy: boolean
  autoBlockDownloads: boolean
  debugMode: boolean
}

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  notificationsEnabled: true,
  autoScanExtensions: true,
  monitorCookies: true,
  monitorNetwork: true,
  monitorPasswords: true,
  monitorPrivacy: true,
  onlyHighRiskAlerts: true,
  extensionWhitelist: [],
  monitorPhishing: true,
  monitorPasswordStrength: true,
  monitorSessionHijack: true,
  monitorCertificates: true,
  monitorDns: true,
  monitorHeaders: true,
  monitorThreatIntel: true,
  monitorAnomaly: true,
  monitorCorrelation: true,
  autoKillSessions: false,
  autoRotateCredentials: false,
  forensicSnapshots: true,
  weeklyDigest: true,
  monitorPolicy: true,
  autoBlockDownloads: false,
  debugMode: false,
}

export type BackgroundMessage =
  | { type: 'PING' }
  | { type: 'GET_STATE' }
  | { type: 'ADD_EVENT'; category: SecurityCategory; event: RiskEvent }
  | { type: 'ACKNOWLEDGE_EVENT'; eventId: string }
  | { type: 'CLEAR_ALL_DATA' }
  | { type: 'GET_SETTINGS' }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<GlobalSettings> }
  | { type: 'SCAN_EXTENSIONS' }
  | { type: 'PAGE_SCAN_RESULT'; result: PageScanResult }
  | { type: 'ADD_ACCOUNT'; domain: string; name: string }
  | { type: 'REMOVE_ACCOUNT'; domain: string }
  | { type: 'SENSOR_USAGE'; data: { api: string; details?: string; url: string; timestamp: number } }
  | { type: 'POPUP_OPENED' }
  | { type: 'PASSWORD_FORM_DETECTED'; url?: string; hasPasswordField?: boolean; isOverHttp?: boolean; formAction?: string; autocomplete?: string }
  | { type: 'ACCOUNT_AUTH_DETECTED'; domain: string; role: AccountAuthRole }
  | { type: 'ACCOUNT_LOGGED_IN'; domain: string; role?: AccountAuthRole }
  | { type: 'ACCOUNT_LOGIN_FAILED'; domain: string }
  | { type: 'POLICY_LINKS_FOUND'; domain: string; links: PolicyLink[] }
  | { type: 'POLICY_TEXT'; url: string; text: string; source: 'dom'; siteDomain?: string }
  | { type: 'POLICY_TEXT'; url: string; text: string; source: 'probe'; probed?: string[]; siteDomain?: string }
  | { type: 'ANALYZE_POLICY'; domain: string; policyUrl?: string }
  | { type: 'GET_POLICY_REPORTS' }
  | { type: 'GET_POLICY_REPORT'; domain: string }
  | { type: 'PANIC' }
  | { type: 'PANIC_RECOVER' }

export function sanitizeForDisplay(input: string | null | undefined, maxLen: number = 250): string {
  if (!input) return ''
  return input.replace(/[<>'"&]/g, '').substring(0, maxLen)
}

export function createCategoryConfig(id: SecurityCategory): CategoryState {
  const configs: Record<SecurityCategory, { label: string; icon: string }> = {
    overview: { label: 'Overview', icon: '◈' },
    network: { label: 'Network', icon: '🌐' },
    device: { label: 'Device', icon: '💻' },
    extensions: { label: 'Extensions', icon: '🧩' },
    passwords: { label: 'Passwords', icon: '🔑' },
    privacy: { label: 'Privacy', icon: '🛡️' },
    accounts: { label: 'Accounts', icon: '👤' },
    policy: { label: 'PolicyMatrix', icon: '📜' },
  }
  const cfg = configs[id]
  return {
    id,
    label: cfg.label,
    icon: cfg.icon,
    enabled: true,
    score: { total: 50, maxScore: 100, factors: [] },
    events: [],
    metrics: [],
    actions: [],
    settings: {},
    lastScan: 0,
  }
}

export function createInitialState(): SecurityState {
  const categoryIds: SecurityCategory[] = ['overview', 'network', 'device', 'extensions', 'passwords', 'privacy', 'accounts', 'policy']
  const categories: Record<string, CategoryState> = {}
  for (const id of categoryIds) {
    categories[id] = createCategoryConfig(id)
  }
  return {
    categories,
    accounts: [],
    dismissedAccounts: [],
    dangerousExtensions: [],
    installedExtensions: [],
    network: null,
    pageScans: [],

    sensorUsage: [],
    phishingResults: [],
    downloadScans: [],
    passwordStrengths: [],
    certAnomalies: [],
    dnsChecks: [],
    securityHeaders: [],
    threatIntelMatches: [],
    anomalyScores: [],
    correlatedIncidents: [],
    correlatedEventIds: [],
    forensicSnapshots: [],
    panicState: { active: false, startedAt: 0, snapshotId: '', lockdownUntil: 0 },
    timeline: [],
    weeklyDigests: [],
    policyReports: [],
    lastPolicyHash: '',
    lastPolicyProbes: [],
  }
}
