import { RiskEvent, CorrelatedIncident, SecurityState } from '../../types'
import { addCategoryEvent, getSecurityState, updateSecurityState } from '../storage'
import { recalculateCategoryScore } from '../engine'

const MIN_MATCH_EVENTS = 2
const DEDUP_WINDOW_MS = 3600000

interface PatternDef {
  name: string
  title: string
  description: string
  probability: number
  suggestedAction: string
  check: (state: SecurityState) => { matched: boolean; eventIds: string[] }
}

const patterns: PatternDef[] = [
  {
    name: 'Session Hijack',
    title: 'Possible session hijacking detected',
    description: 'IP address change combined with new device fingerprint and login activity suggests session hijacking',
    probability: 0.85,
    suggestedAction: 'Change passwords and revoke sessions',
    check: (state) => {
      const eventIds: string[] = []
      const net = state.categories.network?.events || []
      const dev = state.categories.device?.events || []
      const acc = state.categories.accounts?.events || []
      const ipChange = net.find(e => e.type === 'ip_change' && !e.acknowledged)
      const newDevice = dev.find(e => e.type === 'fingerprint_change' && !e.acknowledged)
      const login = acc.find(e => e.type === 'login_activity' && !e.acknowledged)
      if (ipChange) eventIds.push(ipChange.id)
      if (newDevice) eventIds.push(newDevice.id)
      if (login) eventIds.push(login.id)
      return { matched: eventIds.length >= MIN_MATCH_EVENTS, eventIds }
    },
  },
  {
    name: 'Credential Stuffing',
    title: 'Possible credential stuffing attack',
    description: 'Multiple weak passwords detected alongside a new device, suggesting credential stuffing',
    probability: 0.75,
    suggestedAction: 'Enable 2FA on all accounts',
    check: (state) => {
      const eventIds: string[] = []
      const dev = state.categories.device?.events || []
      const pwd = state.categories.passwords?.events || []
      const weak = pwd.filter(e => e.type === 'password_strength' && !e.acknowledged)
      const newDevice = dev.find(e => e.type === 'fingerprint_change' && !e.acknowledged)
      if (weak.length >= 2) weak.forEach(e => eventIds.push(e.id))
      if (newDevice) eventIds.push(newDevice.id)
      return { matched: weak.length >= 2 && !!newDevice && eventIds.length >= MIN_MATCH_EVENTS, eventIds }
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
      return { matched: eventIds.length >= MIN_MATCH_EVENTS, eventIds }
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
      return { matched: sensorEvents.length > 3 && !!newExt, eventIds }
    },
  },
]

export function startCorrelationEngine(): void {
  runCorrelation()
}

export async function runCorrelation(): Promise<void> {
  try {
    const state = await getSecurityState()
    const existingIncidents = state.correlatedIncidents || []
    const newIncidents: CorrelatedIncident[] = []
    const now = Date.now()

    for (const pattern of patterns) {
      const existingMatch = existingIncidents.find(i =>
        i.title === pattern.title && !i.acknowledged && now - i.timestamp < DEDUP_WINDOW_MS
      )
      if (existingMatch) continue

      const { matched, eventIds } = pattern.check(state)
      if (!matched || eventIds.length < MIN_MATCH_EVENTS) continue

      const incident: CorrelatedIncident = {
        id: crypto.randomUUID(),
        title: pattern.title,
        description: pattern.description,
        probability: pattern.probability,
        events: eventIds,
        suggestedAction: pattern.suggestedAction,
        timestamp: now,
        acknowledged: false,
      }
      newIncidents.push(incident)

      if (pattern.probability > 0.7) {
        const sev = pattern.probability > 0.85 ? 'critical' : 'high'
        const event: RiskEvent = {
          id: crypto.randomUUID(),
          type: 'correlated_incident',
          category: 'overview',
          severity: sev as 'low' | 'medium' | 'high' | 'critical',
          title: incident.title,
          description: incident.description,
          timestamp: now,
          acknowledged: false,
        }
        await addCategoryEvent('overview', event)
      }
    }

    if (newIncidents.length === 0) return
    const all = [...newIncidents, ...existingIncidents]
    if (all.length > 20) all.length = 20
    await updateSecurityState({ correlatedIncidents: all })
    await recalculateCategoryScore('overview')
  } catch (e) {
    console.error('Correlation engine failed:', e)
  }
}
