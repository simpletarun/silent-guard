export type RiskLevel = 'excellent' | 'safe' | 'medium' | 'risky' | 'dangerous'

export type DataFieldType =
  | 'name' | 'email' | 'phone' | 'location' | 'address'
  | 'cookies' | 'ip' | 'browser' | 'os'
  | 'payment' | 'contacts' | 'photos'
  | 'camera' | 'microphone' | 'bluetooth'
  | 'calendar' | 'biometric' | 'health'

export interface DataCollectionItem {
  type: DataFieldType
  label: string
  found: boolean
  evidence: string
}

export type ThirdPartyCategory =
  | 'advertising' | 'analytics' | 'social' | 'cloud'
  | 'payment' | 'affiliate' | 'other'

export interface ThirdPartyInfo {
  name: string
  category: ThirdPartyCategory
  evidence: string
  riskLevel?: 'low' | 'medium' | 'high'
  confidence?: number
}

export type CookieType =
  | 'essential' | 'analytics' | 'advertising' | 'functional' | 'performance' | 'third-party' | 'tracking'

export interface CookieInfo {
  name: string
  type: CookieType
  evidence: string
}

export interface RetentionInfo {
  period: string
  rawText: string
  isExcessive: boolean
}

export interface UserRight {
  id: string
  label: string
  found: boolean
  evidence: string
}

export interface SecurityPractice {
  id: string
  label: string
  found: boolean
  evidence: string
}

export interface DangerousClause {
  text: string
  reason: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  matchedRuleId: string
}

export interface PolicySection {
  name: string
  heading: string
  content: string
  startIdx: number
  endIdx: number
}

export interface PolicyRule {
  id: string
  category: string
  pattern: string
  isRegex?: boolean
  riskDelta: number
  description: string
  severity?: 'low' | 'medium' | 'high' | 'critical'
  sectionBias?: string[]
}

export interface MatchedRule {
  id: string
  description: string
  riskDelta: number
  severity: 'low' | 'medium' | 'high' | 'critical'
  evidence?: string
  snippet?: string
}

export interface PolicyReport {
  id: string
  domain: string
  policyUrl: string
  analyzedAt: number
  privacyScore: number
  riskLevel: RiskLevel
  transparencyScore: number
  sections: PolicySection[]
  collectedData: DataCollectionItem[]
  thirdParties: ThirdPartyInfo[]
  cookies: CookieInfo[]
  retention: RetentionInfo
  userRights: UserRight[]
  securityPractices: SecurityPractice[]
  dangerousClauses: DangerousClause[]
  matchedRules: MatchedRule[]
  recommendation: string
  policyHash: string
  wordCount: number
}

export interface PolicyLink {
  url: string
  text: string
  type: 'privacy' | 'terms' | 'cookies'
}

export function getRiskLevel(score: number): RiskLevel {
  if (score >= 95) return 'excellent'
  if (score >= 80) return 'safe'
  if (score >= 60) return 'medium'
  if (score >= 40) return 'risky'
  return 'dangerous'
}

export function getRiskLevelColor(level: RiskLevel): string {
  const map: Record<RiskLevel, string> = {
    excellent: '#2ed573',
    safe: '#2ed573',
    medium: '#ffa502',
    risky: '#ff6348',
    dangerous: '#ff4757',
  }
  return map[level]
}

export function getRiskLevelLabel(level: RiskLevel): string {
  const map: Record<RiskLevel, string> = {
    excellent: 'Excellent',
    safe: 'Safe',
    medium: 'Medium',
    risky: 'Risky',
    dangerous: 'Dangerous',
  }
  return map[level]
}
