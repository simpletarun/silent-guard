import { SecurityTimelineEntry, WeeklyDigest } from '../../types'
import { getSecurityState, updateSecurityState } from '../storage'
import { getOverallScore } from '../engine'

export function startTimelineMonitor(): void {
  chrome.storage.local.get('digest_start_week').then(meta => {
    if (!meta.digest_start_week) {
      chrome.storage.local.set({ digest_start_week: Date.now() })
    }
  })
  recordTimelineEntry()
  chrome.alarms.create('timelineRecord', { periodInMinutes: 60 })
}

export async function recordTimelineEntry(): Promise<void> {
  try {
    const state = await getSecurityState()
    const score = await getOverallScore()
    const allEvents: { type: string; severity: string; title: string }[] = []
    for (const cat of Object.values(state.categories)) {
      for (const evt of (cat.events || []).slice(0, 5)) {
        allEvents.push({ type: evt.type, severity: evt.severity, title: evt.title })
      }
    }
    const entry: SecurityTimelineEntry = {
      date: new Date().toISOString(),
      score,
      eventCount: allEvents.length,
      events: allEvents.slice(0, 10),
    }
    const timeline = [...(state.timeline || []), entry]
    if (timeline.length > 168) timeline.splice(0, timeline.length - 168)
    await updateSecurityState({ timeline })
  } catch (e) {
    console.error('Timeline entry failed:', e)
  }
}

export async function checkWeeklyDigest(): Promise<void> {
  try {
    const state = await getSecurityState()
    const meta = await chrome.storage.local.get('last_digest_week')
    const lastDigestWeek: number = meta.last_digest_week || 0
    const currentWeek = getWeekNumber()
    if (lastDigestWeek === currentWeek) return
    const timeline = state.timeline || []
    const days = new Set(timeline.map(e => e.date.slice(0, 10))).size
    if (days < 7) return
    await chrome.storage.local.set({ last_digest_week: currentWeek })
    await generateWeeklyDigest()
  } catch (e) {
    console.error('Weekly digest check failed:', e)
  }
}

function getWeekNumber(): number {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  const diff = now.getTime() - start.getTime()
  return Math.floor(diff / (7 * 24 * 60 * 60 * 1000))
}

export async function generateWeeklyDigest(): Promise<void> {
  try {
    const state = await getSecurityState()
    const timeline = state.timeline || []
    const weekStart = timeline[0]?.date || new Date(Date.now() - 604800000).toISOString()
    const weekEnd = timeline[timeline.length - 1]?.date || new Date().toISOString()
    const scoreStart = timeline[0]?.score ?? 50
    const scoreEnd = timeline[timeline.length - 1]?.score ?? 50
    const allEvents = timeline.flatMap(e => e.events)
    const criticalEvents = allEvents.filter(e => e.severity === 'critical').length
    const typeCounts: Record<string, number> = {}
    for (const evt of allEvents) {
      typeCounts[evt.type] = (typeCounts[evt.type] || 0) + 1
    }
    const topThreats = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t)
    const catScores = Object.entries(state.categories).map(([id, cat]) => ({ id, score: cat.score.total }))
    const weekAgo = Date.now() - 604800000
    const improvements = catScores.filter(c => {
      const old = timeline.find(t => new Date(t.date).getTime() < weekAgo)
      return old && state.categories[c.id]?.score.total > 50
    }).map(c => c.id)

    const recommendations: string[] = []
    for (const [id, cat] of Object.entries(state.categories)) {
      if (cat.score.total < 60) {
        const labels: Record<string, string> = { network: 'Use a VPN', device: 'Update browser', extensions: 'Review extensions', passwords: 'Use a password manager', privacy: 'Enable tracker blocking', accounts: 'Enable 2FA' }
        if (labels[id]) recommendations.push(labels[id])
      }
    }

    const digest: WeeklyDigest = {
      weekStart, weekEnd, scoreStart, scoreEnd,
      totalEvents: allEvents.length, criticalEvents,
      topThreats, improvements, recommendations,
    }
    const digests = [...(state.weeklyDigests || []), digest]
    if (digests.length > 12) digests.splice(0, digests.length - 12)
    await updateSecurityState({ weeklyDigests: digests })
  } catch (e) {
    console.error('Weekly digest failed:', e)
  }
}
