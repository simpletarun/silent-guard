import { RiskEvent, CorrelatedIncident, SecurityState } from '../../types'
import { addCategoryEvent, mutateSecurityState } from '../storage'
import { recalculateCategoryScore } from '../engine'

const MIN_MATCH_EVENTS = 2

interface PatternCheckResult {
  matched: boolean
  eventIds: string[]
  domains: string[]
}

interface PatternDef {
  name: string
  title: string
  description: string
  probability: number
  suggestedAction: string
  check: (state: SecurityState) => PatternCheckResult
}

const DOMAIN_RE = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i

function isDomainLike(value: string | undefined): value is string {
  return !!value && value.includes('.') && /[a-z]/i.test(value) && DOMAIN_RE.test(value)
}

export function collectIncidentDomains(sources: Array<string | undefined>): string[] {
  return [...new Set(sources.filter(isDomainLike))]
}

const patterns: PatternDef[] = [
  {
    name: 'Session Hijack',
    title: 'Possible session hijacking detected',
    description: 'IP address change combined with login activity suggests session hijacking',
    probability: 0.85,
    suggestedAction: 'Change passwords and revoke sessions',
    check: (state) => {
      const eventIds: string[] = []
      const net = state.categories.network?.events || []
      const acc = state.categories.accounts?.events || []
      const ipChange = net.find(e => e.type === 'ip_change' && !e.acknowledged)
      const login = acc.find(e => e.type === 'login_activity' && !e.acknowledged)
      if (ipChange) eventIds.push(ipChange.id)
      if (login) eventIds.push(login.id)
      return { matched: eventIds.length >= MIN_MATCH_EVENTS, eventIds, domains: collectIncidentDomains([login?.source]) }
    },
  },
  {
    name: 'Targeted Attack',
    title: 'Possible targeted attack in progress',
    description: 'Phishing match combined with new extension installation and cookie changes indicates a targeted attack',
    probability: 0.9,
    suggestedAction: 'Run full security scan and change all passwords',
    check: (state) => {
      const eventIds: string[] = []
      const priv = state.categories.privacy?.events || []
      const ext = state.categories.extensions?.events || []
      const acc = state.categories.accounts?.events || []
      const phish = priv.find(e => e.type === 'phishing_detected' && !e.acknowledged)
      const newExt = ext.find(e => e.type === 'extension_installed' && !e.acknowledged)
      const cookieChange = acc.find(e => e.type === 'cookie_change' && !e.acknowledged)
      if (phish) eventIds.push(phish.id)
      if (newExt) eventIds.push(newExt.id)
      if (cookieChange) eventIds.push(cookieChange.id)
      return { matched: eventIds.length >= MIN_MATCH_EVENTS, eventIds, domains: collectIncidentDomains([phish?.source, cookieChange?.source]) }
    },
  },
  {
    name: 'Data Exfiltration',
    title: 'Possible data exfiltration detected',
    description: 'Sensor usage spike combined with new extension installation',
    probability: 0.6,
    suggestedAction: 'Review installed extensions and clear site data',
    check: (state) => {
      const eventIds: string[] = []
      const ext = state.categories.extensions?.events || []
      const priv = state.categories.privacy?.events || []
      const sensorEvents = priv.filter(e => e.type === 'sensor_access' && !e.acknowledged && Date.now() - e.timestamp < 300000)
      const newExt = ext.find(e => e.type === 'extension_installed' && !e.acknowledged)
      if (sensorEvents.length > 3) sensorEvents.forEach(e => eventIds.push(e.id))
      if (newExt) eventIds.push(newExt.id)
      return { matched: sensorEvents.length > 3 && !!newExt, eventIds, domains: collectIncidentDomains(sensorEvents.map(e => e.source)) }
    },
  },
]

export function startCorrelationEngine(): void {
  runCorrelation()
}

export async function runCorrelation(): Promise<void> {
  try {
    // The dedupe read and incident write must be atomic — the startup call
    // and the 2-minute alarm used to both read the same referencedEventIds
    // set and double-create incidents. Storage ops are never awaited inside
    // the mutate callback (that would deadlock the write queue); events
    // queue up and are written after.
    const pendingEvents: RiskEvent[] = []
    let created = false

    await mutateSecurityState(state => {
      const existingIncidents = state.correlatedIncidents || []
      // Events already cited by a previous incident must not drive a second
      // incident — otherwise the same phishing alert re-triggers a "Targeted
      // Attack" every hour. Referenced ids are persisted separately so the
      // 20-incident cap can't drop them and reset the dedup.
      const referencedEventIds = new Set(state.correlatedEventIds || [])
      const newIncidents: CorrelatedIncident[] = []
      const now = Date.now()

      for (const pattern of patterns) {
        const { matched, eventIds, domains } = pattern.check(state)
        const freshEventIds = eventIds.filter(id => !referencedEventIds.has(id))
        if (!matched || freshEventIds.length < MIN_MATCH_EVENTS) continue

        const incident: CorrelatedIncident = {
          id: crypto.randomUUID(),
          title: pattern.title,
          description: pattern.description,
          probability: pattern.probability,
          events: freshEventIds,
          domains: [...new Set(domains)],
          suggestedAction: pattern.suggestedAction,
          timestamp: now,
          acknowledged: false,
        }
        newIncidents.push(incident)
        freshEventIds.forEach(id => referencedEventIds.add(id))

        if (pattern.probability > 0.7) {
          const sev = pattern.probability > 0.85 ? 'critical' : 'high'
          pendingEvents.push({
            id: crypto.randomUUID(),
            type: 'correlated_incident',
            category: 'overview',
            severity: sev as 'low' | 'medium' | 'high' | 'critical',
            title: incident.title,
            description: incident.description,
            timestamp: now,
            acknowledged: false,
          })
        }
      }

      if (newIncidents.length > 0) {
        state.correlatedIncidents = [...newIncidents, ...existingIncidents]
        if (state.correlatedIncidents.length > 20) state.correlatedIncidents.length = 20
        state.correlatedEventIds = [...referencedEventIds].slice(-500)
        created = true
      }
    })

    if (!created) return
    for (const evt of pendingEvents) {
      await addCategoryEvent('overview', evt)
    }
    await recalculateCategoryScore('overview')
  } catch (e) {
    console.error('Correlation engine failed:', e)
  }
}
