import { SecurityTimelineEntry, WeeklyDigest } from '../../types'
import { getSecurityState, mutateSecurityState } from '../storage'
import { getOverallScore } from '../engine'

export function startTimelineMonitor(): void {
  recordTimelineEntry()
  chrome.alarms.create('timelineRecord', { periodInMinutes: 60 })
}

export async function recordTimelineEntry(): Promise<void> {
  try {
    // Score is computed from a pre-read (it doesn't depend on the mutation);
    // the append itself happens under the storage mutex so the hourly alarm
    // overlapping the startup call can't drop entries.
    const score = await getOverallScore()
    await mutateSecurityState(state => {
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
      state.timeline = timeline
    })
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
    await generateWeeklyDigest()
    // Mark the week as done only AFTER the digest was generated — writing
    // first meant a failed generation permanently skipped the week.
    await chrome.storage.local.set({ last_digest_week: currentWeek })
  } catch (e) {
    console.error('Weekly digest check failed:', e)
  }
}

function getWeekNumber(): number {
  // Year-qualified: a bare week-of-year collides across years, silently
  // skipping the first weekly digest after every New Year.
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  const diff = now.getTime() - start.getTime()
  return now.getFullYear() * 53 + Math.floor(diff / (7 * 24 * 60 * 60 * 1000))
}

async function generateWeeklyDigest(): Promise<void> {
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
    // Per-category history isn't stored — only overall timeline entries — so
    // "improvements" can only honestly compare overall score to a week ago.
    // The timeline is capped at 168 hourly entries (~7 days), so the oldest
    // entry is the week-ago baseline; find(< weekAgo) never matched.
    const weekAgoEntry = timeline[0]
    const improvements = weekAgoEntry && scoreEnd > weekAgoEntry.score ? ['overall'] : []

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
    await mutateSecurityState(state => {
      const digests = [...(state.weeklyDigests || []), digest]
      if (digests.length > 12) digests.splice(0, digests.length - 12)
      state.weeklyDigests = digests
    })
  } catch (e) {
    console.error('Weekly digest failed:', e)
  }
}
