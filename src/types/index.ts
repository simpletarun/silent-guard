export type SecurityCategory = 'overview' | 'network' | 'device' | 'extensions' | 'passwords' | 'privacy' | 'accounts'

export type RiskEventType =
  | 'cookie_change'
  | 'extension_installed'
  | 'permission_change'
  | 'fingerprint_change'
  | 'security_setting_change'
  | 'network_change'
  | 'login_activity'
  | 'ip_change'
  | 'vpn_detected'
  | 'weak_password'
  | 'tracker_detected'
  | 'storage_audit'
  | 'account_breach'
  | 'browser_outdated'
  | 'form_on_http'
  | 'third_party_cookies'
  | 'new_device'
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
  | 'dark_web_mention'
  | 'forensic_snapshot'

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
  hasHsts: boolean
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
  fingerprint: BrowserFingerprint | null
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

export interface CategorySetting {
  id: string
  label: string
  description: string
  type: 'toggle' | 'select' | 'button'
  value: boolean | string
  options?: { label: string; value: string }[]
  action?: string
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

export interface BrowserFingerprint {
  screenWidth: number
  screenHeight: number
  colorDepth: number
  timezone: string
  language: string
  platform: string
  userAgent: string
  hardwareConcurrency: number
  deviceMemory?: number
  browserName?: string
  browserVersion?: string
  osName?: string
}

export interface DangerousExtension {
  id: string
  name: string
  permissions: string[]
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  canAccessAllUrls: boolean
  canReadCookies: boolean
  canUseWebRequest: boolean
  version?: string
  updateTime?: number
  isWhitelisted?: boolean
}

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
}

export interface NetworkInfo {
  publicIp: string
  isp?: string
  country?: string
  city?: string
  isVpn: boolean
  isProxy: boolean
  isTor: boolean
  isDoHEnabled: boolean
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
  fingerprintingAttempts: number
  canvasAttempts: number
  audioAttempts: number
  hasTrackingPixels: boolean
  hasHiddenIframes: boolean
  hiddenElements: number
  beaconCalls: number
  suspiciousInlineScripts: number
  webRTCLeakDetected: boolean
  thirdPartyRequests: number
  totalCookies: number
  localStorageItems: number
  sessionStorageItems: number
}

export interface SecurityState {
  categories: Record<string, CategoryState>
  accounts: AccountSite[]
  dismissedAccounts: string[]
  dangerousExtensions: DangerousExtension[]
  fingerprint: BrowserFingerprint | null
  network: NetworkInfo | null
  pageScans: PageScanResult[]

  httpsSites: number
  totalSites: number
  lastFullScan: number
  sensorUsage: SensorUsage[]
  phishingResults: PhishingResult[]
  passwordStrengths: PasswordStrengthResult[]
  certAnomalies: CertAnomaly[]
  dnsChecks: DnsCheckResult[]
  securityHeaders: SecurityHeadersReport[]
  threatIntelMatches: ThreatIntelMatch[]
  anomalyScores: AnomalyScore[]
  correlatedIncidents: CorrelatedIncident[]
  forensicSnapshots: ForensicSnapshot[]
  timeline: SecurityTimelineEntry[]
  weeklyDigests: WeeklyDigest[]
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
  monitorFingerprint: boolean
  monitorNetwork: boolean
  monitorPasswords: boolean
  monitorPrivacy: boolean
  darkMode: boolean
  onlyHighRiskAlerts: boolean
  extensionWhitelist: string[]
  trackerBlocklist: string[]
  monitorPhishing: boolean
  monitorPasswordStrength: boolean
  monitorSessionHijack: boolean
  monitorCertificates: boolean
  monitorDns: boolean
  monitorHeaders: boolean
  monitorThreatIntel: boolean
  monitorAnomaly: boolean
  monitorCorrelation: boolean
  monitorDarkWeb: boolean
  autoKillSessions: boolean
  autoRotateCredentials: boolean
  networkIsolation: boolean
  forensicSnapshots: boolean
  weeklyDigest: boolean
}

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  notificationsEnabled: true,
  autoScanExtensions: true,
  monitorCookies: true,
  monitorFingerprint: true,
  monitorNetwork: true,
  monitorPasswords: true,
  monitorPrivacy: true,
  darkMode: true,
  onlyHighRiskAlerts: true,
  extensionWhitelist: [],
  trackerBlocklist: [],
  monitorPhishing: true,
  monitorPasswordStrength: true,
  monitorSessionHijack: true,
  monitorCertificates: true,
  monitorDns: true,
  monitorHeaders: true,
  monitorThreatIntel: true,
  monitorAnomaly: true,
  monitorCorrelation: true,
  monitorDarkWeb: true,
  autoKillSessions: false,
  autoRotateCredentials: false,
  networkIsolation: false,
  forensicSnapshots: true,
  weeklyDigest: true,
}

export const FINGERPRINT_CHANGE_THRESHOLD_MS = 5000

export const HIGH_RISK_PERMISSIONS = [
  '<all_urls>',
  'cookies',
  'webRequest',
  'tabs',
  'scripting',
  'history',
  'clipboardRead',
  'debugger',
  'nativeMessaging',
]



export type BackgroundMessage =
  | { type: 'GET_STATE' }
  | { type: 'GET_CATEGORY'; category: SecurityCategory }
  | { type: 'GET_OVERALL_SCORE' }
  | { type: 'FINGERPRINT_REPORT'; fingerprint: BrowserFingerprint }
  | { type: 'ADD_EVENT'; category: SecurityCategory; event: RiskEvent }
  | { type: 'ACKNOWLEDGE_EVENT'; eventId: string }
  | { type: 'CLEAR_EVENTS' }
  | { type: 'GET_SETTINGS' }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<GlobalSettings> }
  | { type: 'HTTPS_UPDATE'; isHttps: boolean }
  | { type: 'SCAN_EXTENSIONS' }
  | { type: 'CHECK_IP' }
  | { type: 'PAGE_SCAN_RESULT'; result: PageScanResult }
  | { type: 'ADD_ACCOUNT'; domain: string; name: string }
  | { type: 'REMOVE_ACCOUNT'; domain: string }
  | { type: 'SENSOR_USAGE'; data: { api: string; details?: string; url: string; timestamp: number } }
  | { type: 'REMOVE_EXTENSION'; extensionId: string }
  | { type: 'PHISHING_CHECK'; url: string }
  | { type: 'HEADERS_AUDIT'; url: string; headers: { name: string; value?: string }[] }
  | { type: 'FORENSIC_SNAPSHOT'; trigger: string }
  | { type: 'KILL_SESSIONS'; domains: string[] }
  | { type: 'ISOLATE_NETWORK' }
  | { type: 'POPUP_OPENED' }
  | { type: 'PASSWORD_FORM_DETECTED'; url?: string; hasPasswordField?: boolean; isOverHttp?: boolean; formAction?: string; autocomplete?: string }
  | { type: 'VERIFY_ACCOUNT'; domain: string }
  | { type: 'CHECK_ALL_ACCOUNTS' }

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
  const categoryIds: SecurityCategory[] = ['overview', 'network', 'device', 'extensions', 'passwords', 'privacy', 'accounts']
  const categories: Record<string, CategoryState> = {}
  for (const id of categoryIds) {
    categories[id] = createCategoryConfig(id)
  }
  return {
    categories,
    accounts: [],
    dismissedAccounts: [],
    dangerousExtensions: [],
    fingerprint: null,
    network: null,
    pageScans: [],

    httpsSites: 0,
    totalSites: 0,
    lastFullScan: 0,
    sensorUsage: [],
    phishingResults: [],
    passwordStrengths: [],
    certAnomalies: [],
    dnsChecks: [],
    securityHeaders: [],
    threatIntelMatches: [],
    anomalyScores: [],
    correlatedIncidents: [],
    forensicSnapshots: [],
    timeline: [],
    weeklyDigests: [],
  }
}
