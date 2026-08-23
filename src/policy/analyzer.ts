import {
  PolicyReport, RiskLevel, DataCollectionItem, ThirdPartyInfo,
  CookieInfo, RetentionInfo, UserRight, SecurityPractice, DangerousClause,
  PolicySection, MatchedRule, getRiskLevel,
} from '../types'
import {
  DATA_FIELD_DETECTIONS, COOKIE_PATTERNS,
  RETENTION_PATTERNS, USER_RIGHTS, SECURITY_PRACTICES, POLICY_RULES,
  SECTION_HEADINGS, TRANSPARENCY_TOPICS,
  NEGATION_RULES, KNOWN_THIRD_PARTIES,
} from './rules'
import { cleanExcerpt } from '../utils/excerpt'

const MAX_POLICY_SIZE = 5 * 1024 * 1024

export function simpleHash(str: string): string {
  // Use djb2 hash algorithm - fast and reliable
  let hash = 5381
  const len = Math.min(str.length, 50000) // Hash up to 50K chars for reliable comparison
  for (let i = 0; i < len; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i)
    hash = hash >>> 0
  }
  return hash.toString(36)
}

export function extractTextFromHtml(html: string): string {
  // Early exit for plain text
  if (!html.includes('<')) return html

  const cleaned = html
    .replace(/<script[^>]*>[\s\S]*?(?:<\/script>|$)/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?(?:<\/style>|$)/gi, ' ')
    .replace(/<\/?(nav|header|footer|aside|iframe)[^>]*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // Word-boundary separation — adjacent tags concatenate words without it
    .replace(/(?<=[a-z0-9])(?=<\/?[a-z/])/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&apos;|&#\d+;|&[a-z#0-9]+;/gi, ' ')
  return cleaned
}

export function normalizeText(text: string): string {
  // \s+ already swallows newlines — the old second replace was unreachable.
  return text.replace(/\s+/g, ' ').trim()
}

export function detectSections(text: string): PolicySection[] {
  const sections: PolicySection[] = []
  const lowerText = text.toLowerCase()
  let lastEnd = 0
  for (const { name, patterns } of SECTION_HEADINGS) {
    for (const pattern of patterns) {
      const match = lowerText.match(pattern)
      if (match && match.index !== undefined) {
        const start = Math.max(0, match.index - 50)
        const end = Math.min(text.length, match.index + match[0].length + 500)
        if (start > lastEnd || sections.length === 0) {
          const content = text.slice(start, end)
          sections.push({
            name,
            heading: pattern.source.replace(/[\\^$.*+?()[\]{}|]/g, '').replace(/i$/g, ''),
            content,
            startIdx: start,
            endIdx: end,
          })
          lastEnd = end
          break
        }
      }
    }
  }
  return sections
}

const compiledNegationPatterns: { regex: RegExp; categories: string[] }[] = NEGATION_RULES.flatMap(r =>
  r.patterns.map(p => ({ regex: p, categories: r.categories }))
)

const compiledRules = POLICY_RULES.map(r => ({
  ...r,
  compiledRegex: r.isRegex ? new RegExp(r.pattern, 'i') : new RegExp(r.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
}))

// Memoized sentence splitter — getSentenceAt is called once per rule match;
// re-splitting a 5 MB policy on every call stalls the service worker.
let sentenceCache: { text: string; boundaries: number[] } | null = null

function getSentenceAt(text: string, index: number): string {
  if (!sentenceCache || sentenceCache.text !== text) {
    const boundaries: number[] = []
    let acc = 0
    for (const s of text.split(/(?<=[.!?])\s+/)) {
      acc += s.length
      boundaries.push(acc)
      acc += 1
    }
    sentenceCache = { text, boundaries }
  }
  const bounds = sentenceCache.boundaries
  let i = 0
  while (i < bounds.length && index >= bounds[i]) i++
  const start = i === 0 ? 0 : bounds[i - 1] + 1
  const end = i < bounds.length ? bounds[i] : text.length
  return text.slice(start, end)
}

function evidenceText(text: string, idx: number): string {
  return cleanExcerpt(getSentenceAt(text, idx), 220)
}

// Clause previews stay centered on the flagged phrase (not the sentence
// start, which often begins with page-nav junk) — but edges snap to word
// boundaries so previews never read like "tent like ChatGPT...".
function evidenceSnippet(text: string, idx: number, matchLen = 0): string {
  let start = Math.max(0, idx - 60)
  // Window covers the WHOLE match (up to 200 chars) — anchoring the end at
  // idx+150 truncated the tail of long flagged phrases.
  let end = Math.min(text.length, idx + Math.max(150, matchLen + 30))
  if (start > 0) {
    const sp = text.lastIndexOf(' ', start)
    start = sp <= 0 ? 0 : sp + 1
  }
  if (end < text.length) {
    const sp = text.indexOf(' ', end)
    end = sp === -1 ? text.length : sp
  }
  const body = text.slice(start, end).replace(/\s+/g, ' ').trim()
  return `${start > 0 ? '… ' : ''}${body}${end < text.length ? ' …' : ''}`
}

function checkNegation(text: string, categories: string[], matchIndex: number): boolean {
  // Negation only applies inside the sentence containing the match — a
  // "we do not sell" sentence elsewhere must not hide a genuine selling clause.
  const sentence = getSentenceAt(text, matchIndex)
  for (const { regex, categories: negCategories } of compiledNegationPatterns) {
    if (regex.test(sentence) && negCategories.some(cat => categories.includes(cat))) {
      return true
    }
  }
  return false
}

function runRuleEngine(text: string): { matchedRules: MatchedRule[]; dangerPoints: number } {
  const matched: MatchedRule[] = []
  let dangerPoints = 0
  // One sentence must not be penalized twice by overlapping rules of the same
  // category (e.g. rule_sell_data and rule_third_party_sale both fire on
  // "We sell your personal information" → was −90 instead of −45).
  // A full set, not a single-slot map: rules run in array order, so an
  // interleaved rule from the same category used to overwrite the slot and
  // let a later rule re-hit the first sentence.
  const penalizedSentences = new Set<string>()

  for (const rule of compiledRules) {
    // Scan every occurrence — the first match may sit in a negated sentence
    // while the same rule genuinely matches later in the policy.
    const regex = new RegExp(rule.compiledRegex.source, rule.compiledRegex.flags + 'g')
    let match: RegExpExecArray | null
    while ((match = regex.exec(text)) !== null) {
      // A match that spans a sentence boundary is a regex overreach
      // ("advertising… We share data with partner"), not a real factor.
      if (match[0].length > 200 || /[.!?]\s/.test(match[0])) continue
      if (checkNegation(text, [rule.category], match.index)) continue
      const evidence = evidenceText(text, match.index)
      if (rule.riskDelta > 0) {
        const dedupeKey = `${rule.category}\u0000${evidence}`
        if (penalizedSentences.has(dedupeKey)) continue
        penalizedSentences.add(dedupeKey)
      }
      matched.push({
        id: rule.id,
        description: rule.description,
        riskDelta: rule.riskDelta,
        severity: rule.severity || 'low',
        evidence,
        snippet: evidenceSnippet(text, match.index, match[0].length),
      })
      dangerPoints += rule.riskDelta
      break
    }
  }
  return { matchedRules: matched, dangerPoints }
}

function detectCollectedData(text: string, lowerText: string): DataCollectionItem[] {
  return DATA_FIELD_DETECTIONS.map(det => {
    for (const kw of det.keywords) {
      // Scan EVERY occurrence of the keyword: the first may sit in a negated
      // sentence ("we do not collect email addresses") while a later one is
      // a genuine collection statement.
      const needle = kw.toLowerCase()
      let idx = lowerText.indexOf(needle)
      while (idx !== -1) {
        if (!checkNegation(text, ['data_collection'], idx)) {
          return {
            type: det.type,
            label: det.label,
            found: true,
            evidence: evidenceText(text, idx),
          }
        }
        idx = lowerText.indexOf(needle, idx + needle.length)
      }
    }
    return {
      type: det.type,
      label: det.label,
      found: false,
      evidence: '',
    }
  })
}

const knownThirdPartyList = KNOWN_THIRD_PARTIES.map(e => ({
  ...e,
  compiledRegex: new RegExp(`\\b${e.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'),
}))

function detectThirdParties(text: string): ThirdPartyInfo[] {
  const thirdParties: ThirdPartyInfo[] = []
  const seen: Set<string> = new Set()

  for (const entity of knownThirdPartyList) {
    // Word-boundary matching — plain includes() flagged "AWS" inside
    // "applicable laws" and "Meta" inside "metadata" in every policy.
    entity.compiledRegex.lastIndex = 0
    const match = entity.compiledRegex.exec(text)
    if (!match || seen.has(entity.name.toLowerCase())) continue
    seen.add(entity.name.toLowerCase())

    thirdParties.push({
      name: entity.name,
      category: entity.category as ThirdPartyInfo['category'],
      riskLevel: 'medium' as const,
      evidence: match.index !== undefined ? evidenceText(text, match.index) : '',
      confidence: entity.confidence,
    })
  }
  return thirdParties
}

const compiledCookiePatterns = COOKIE_PATTERNS.map(cp => ({
  ...cp,
  compiledRegex: new RegExp(cp.keywords.join('|'), 'i'),
}))

function analyzeCookies(text: string, _lowerText: string): CookieInfo[] {
  const cookies: CookieInfo[] = []
  for (const cp of compiledCookiePatterns) {
    const match = text.match(cp.compiledRegex)
    if (match) {
      cookies.push({
        name: cp.label,
        type: cp.type as CookieInfo['type'],
        evidence: match.index !== undefined ? evidenceText(text, match.index) : '',
      })
    }
  }
  return cookies
}

// Rank retention periods by parsed duration — comparing string length picked
// "30 days" over "5 years" because both are 7 characters.
function retentionDays(period: string): number {
  if (period === 'indefinitely') return Infinity
  if (period === 'until account deletion') return 100000
  const m = period.match(/(\d+)\s*(day|month|year)/i)
  if (!m) return 0
  const n = parseInt(m[1], 10)
  if (m[2].toLowerCase().startsWith('d')) return n
  if (m[2].toLowerCase().startsWith('m')) return n * 30
  return n * 365
}

function detectRetention(_text: string, lowerText: string): RetentionInfo {
  let bestMatch = 'unknown'
  let rawText = ''
  let isExcessive = false
  let bestDays = -1
  for (const rp of RETENTION_PATTERNS) {
    // Scan every occurrence — the first hit may sit inside a negated
    // sentence ("we do not retain your data indefinitely") while the same
    // pattern genuinely matches later in the policy.
    const re = new RegExp(rp.regex.source, rp.regex.flags.includes('g') ? rp.regex.flags : rp.regex.flags + 'g')
    let m: RegExpExecArray | null
    let accepted: RegExpExecArray | null = null
    while ((m = re.exec(lowerText)) !== null) {
      if (!checkNegation(lowerText, ['retention'], m.index)) { accepted = m; break }
    }
    if (!accepted) continue
    const days = retentionDays(rp.period)
    if (days > bestDays) {
      bestMatch = rp.period
      rawText = accepted[0]
      bestDays = days
    }
    if (rp.period === 'indefinitely') isExcessive = true
  }
  if (bestMatch === 'unknown' && /retain|retention|how long/i.test(lowerText)) {
    // "as long as necessary" / "no longer needed" is GDPR-good phrasing,
    // NOT excessive retention.
    if (/as long as|for as long|no longer needed/i.test(lowerText)) {
      bestMatch = 'as long as necessary'
      isExcessive = false
    } else {
      bestMatch = 'unspecified'
    }
    rawText = 'Retention period mentioned but no specific timeframe detected'
  }
  return { period: bestMatch, rawText, isExcessive }
}

const compiledUserRights = USER_RIGHTS.map(ur => ({
  ...ur,
  compiledRegex: new RegExp(ur.keywords.join('|'), 'i'),
}))

const compiledSecurityPractices = SECURITY_PRACTICES.map(sp => ({
  ...sp,
  compiledRegex: new RegExp(sp.keywords.join('|'), 'i'),
}))

function detectUserRights(text: string): UserRight[] {
  return compiledUserRights.map(ur => {
    const match = text.match(ur.compiledRegex)
    return {
      id: ur.id,
      label: ur.label,
      found: !!match,
      evidence: match && match.index !== undefined ? evidenceText(text, match.index) : '',
    }
  })
}

function detectSecurityPractices(text: string): SecurityPractice[] {
  return compiledSecurityPractices.map(sp => {
    const match = text.match(sp.compiledRegex)
    return {
      id: sp.id,
      label: sp.label,
      found: !!match,
      evidence: match && match.index !== undefined ? evidenceText(text, match.index) : '',
    }
  })
}

function findDangerousClauses(matchedRules: MatchedRule[]): DangerousClause[] {
  // Clauses are derived from the rule engine results, which already drop
  // negated matches ("we do not sell") and dedupe repeated sentences —
  // a raw re-scan here kept flagging "does not constitute a sale" clauses.
  const clauses: DangerousClause[] = []
  const seen: Set<string> = new Set()
  for (const rule of matchedRules) {
    if (rule.riskDelta <= 0) continue
    // Centered snippet first (word-snapped); clean sentence as fallback.
    const raw = (rule.snippet || rule.evidence || rule.description).replace(/\s+/g, ' ').trim()
    const text = cleanExcerpt(raw, 200)
    const hash = simpleHash(text)
    if (seen.has(hash)) continue
    seen.add(hash)
    clauses.push({
      text,
      reason: rule.description,
      severity: rule.severity || 'low',
      matchedRuleId: rule.id,
    })
    if (clauses.length >= 15) break
  }
  return clauses
}

function calculateTransparency(_text: string, lowerText: string): number {
  let score = 0
  for (const topic of TRANSPARENCY_TOPICS) {
    for (const pattern of topic.patterns) {
      if (lowerText.match(pattern)) {
        score += topic.points
        break
      }
    }
  }
  // 6 topics × 20 points = 120 raw max — normalize so covering 5 of 6
  // topics reports ~83, not a saturated 100 indistinguishable from perfect.
  return Math.min(100, Math.round((score * 100) / 120))
}

function calculateScore(matchedRules: MatchedRule[], transparencyScore: number): { score: number; riskLevel: RiskLevel } {
  const positiveRules = matchedRules.filter(r => r.riskDelta < 0)
  const negativeRules = matchedRules.filter(r => r.riskDelta > 0)

  const positivePoints = positiveRules.reduce((s, r) => s + Math.abs(r.riskDelta), 0)
  const negativePoints = negativeRules.reduce((s, r) => s + r.riskDelta, 0)
  const transparencyPenalty = transparencyScore < 40 ? 10 : 0

  // A single penalty budget (negative rules + poor transparency) so a stack of
  // generic factors cannot drown a policy to 0 that still shows protections.
  const penalty = Math.min(negativePoints + transparencyPenalty, 75)

  let score = 75 + Math.min(25, positivePoints) - penalty

  if (transparencyScore >= 50) score += 5
  if (transparencyScore >= 80) score += 10

  score = Math.max(0, Math.min(100, Math.round(score)))
  return { score, riskLevel: getRiskLevel(score) }
}

function generateRecommendation(
  _score: number,
  riskLevel: RiskLevel,
  collectedData: DataCollectionItem[],
  thirdParties: ThirdPartyInfo[],
  dangerousClauses: DangerousClause[],
  userRights: UserRight[],
  retention: RetentionInfo,
): string {
  if (riskLevel === 'excellent' || riskLevel === 'safe') {
    let text = 'This website has a strong privacy policy. '
    const collectedCount = collectedData.filter(d => d.found).length
    if (collectedCount === 0) text += 'It does not appear to collect sensitive personal data. '
    else text += `It collects standard data (${collectedCount} data types detected). `
    if (thirdParties.length > 0) text += `It shares data with third parties including ${thirdParties.slice(0, 3).map(p => p.name).join(', ')}. `
    if (retention.isExcessive) text += 'However, data retention may be indefinite or excessive. '
    text += 'Your rights and data deletion are respected.'
    return text
  }
  let text = ''
  if (riskLevel === 'dangerous') text = 'This website has a dangerous privacy policy. '
  else if (riskLevel === 'risky') text = 'This website has a risky privacy policy. '
  else text = 'This website has a medium privacy risk. '

  const highRiskData = collectedData.filter(d => d.found && ['biometric', 'health', 'location', 'payment'].includes(d.type))
  if (highRiskData.length > 0) {
    text += `It collects sensitive data: ${highRiskData.map(d => d.label).join(', ')}. `
  }
  if (thirdParties.some(p => p.category === 'advertising')) text += 'It shares data with advertisers. '
  if (retention.isExcessive && retention.period === 'indefinitely') text += 'Data is retained indefinitely. '
  const missingRights = userRights.filter(r => !r.found).map(r => r.label)
  if (missingRights.length > 0) text += `Missing rights: ${missingRights.slice(0, 3).join(', ')}. `
  if (dangerousClauses.length > 0) {
    text += `Be aware: ${dangerousClauses.slice(0, 2).map(c => c.reason).join('; ')}. `
  }
  text += 'Review the policy before creating an account.'
  return text
}

export function analyzePolicy(domain: string, policyText: string, policyUrl: string): PolicyReport {
  const htmlLimited = policyText.length > MAX_POLICY_SIZE ? policyText.substring(0, MAX_POLICY_SIZE) : policyText
  let text = htmlLimited
  if (htmlLimited.includes('<')) {
    text = extractTextFromHtml(htmlLimited)
  }
  text = normalizeText(text)
  const lowerText = text.toLowerCase()
  const wordCount = text.split(/\s+/).filter(w => w.length > 0).length

  const sections = detectSections(text)
  const collectedData = detectCollectedData(text, lowerText)
  const thirdParties = detectThirdParties(text)
  const cookies = analyzeCookies(text, lowerText)
  const retention = detectRetention(text, lowerText)
  const userRights = detectUserRights(text)
  const securityPractices = detectSecurityPractices(text)
  const transparencyScore = calculateTransparency(text, lowerText)

  const { matchedRules } = runRuleEngine(text)
  const dangerousClauses = findDangerousClauses(matchedRules)
  const { score, riskLevel } = calculateScore(matchedRules, transparencyScore)
  const recommendation = generateRecommendation(
    score, riskLevel, collectedData, thirdParties, dangerousClauses, userRights, retention
  )

  return {
    id: crypto.randomUUID(),
    domain,
    policyUrl,
    analyzedAt: Date.now(),
    privacyScore: score,
    riskLevel,
    transparencyScore,
    sections,
    collectedData,
    thirdParties,
    cookies,
    retention,
    userRights,
    securityPractices,
    dangerousClauses,
    matchedRules,
    recommendation,
    policyHash: simpleHash(text),
    wordCount,
  }
}
