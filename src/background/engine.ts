import { SecurityState, CategoryScore, ScoreFactor, SecurityCategory } from '../types'
import { isNoiseTracker } from '../utils/whoTracksMe'
import { getSecurityState, updateCategoryState } from './storage'
import { updateBadge } from './badge'

type ScoreCalculator = (state: SecurityState) => { factors: ScoreFactor[]; baseScore: number }

const SCORE_CALCULATORS: Record<string, ScoreCalculator> = {
  overview: (state) => {
    const factors: ScoreFactor[] = []
    const cats = Object.values(state.categories).filter(c => c.id !== 'overview')
    const scores = cats.map(c => c.score?.total ?? 50)
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 50
    const totalEvents = cats.reduce((sum, c) => sum + c.events.filter(e => !e.acknowledged).length, 0)

    if (totalEvents === 0) {
      factors.push({ label: 'No unresolved issues', score: 20, maxScore: 20, type: 'positive' })
    } else {
      factors.push({ label: `${totalEvents} unresolved issue(s)`, score: -15, maxScore: 20, type: 'negative' })
    }
    factors.push({ label: `Average of ${scores.length} categories`, score: 0, maxScore: 0, type: 'positive' })

    return { factors, baseScore: Math.max(0, Math.min(100, avgScore + (totalEvents === 0 ? 20 : -15))) }
  },
  network: (state) => {
    const factors: ScoreFactor[] = []
    let base = 50
    const net = state.network

    if (net) {
      let ipChanges = 0
      const ipHistory = net.ipHistory || []
      for (let i = 1; i < ipHistory.length; i++) {
        if (ipHistory[i]?.ip !== ipHistory[i - 1]?.ip) ipChanges++
      }
      if (ipChanges === 0) {
        factors.push({ label: 'Stable IP address', score: 10, maxScore: 10, type: 'positive' })
        base += 10
      } else {
        factors.push({ label: `IP changed ${ipChanges} time(s)`, score: -5, maxScore: 10, type: 'negative' })
        base -= 5
      }
    }

    const recentEvents = state.categories.network?.events.filter(e => !e.acknowledged) || []
    if (recentEvents.length === 0) {
      factors.push({ label: 'No unresolved network events', score: 10, maxScore: 10, type: 'positive' })
      base += 10
    }

    const intelMatches = state.threatIntelMatches || []
    if (intelMatches.length > 0) {
      const critical = intelMatches.filter(m => m.severity === 'critical' || m.severity === 'high').length
      const penalty = Math.min(15, critical * 5)
      factors.push({ label: `${critical} threat intel match(es)`, score: -penalty, maxScore: 15, type: 'negative' })
      base -= penalty
    }

    return { factors, baseScore: Math.max(0, Math.min(100, base)) }
  },

  device: (state) => {
    const factors: ScoreFactor[] = []
    let base = 50
    const events = state.categories.device?.events || []
    const unresolved = events.filter(e => !e.acknowledged)

    if (unresolved.length === 0) {
      factors.push({ label: 'No device changes', score: 10, maxScore: 10, type: 'positive' })
      base += 10
    } else {
      factors.push({ label: `${unresolved.length} device alert(s)`, score: -5, maxScore: 10, type: 'negative' })
      base -= 5
    }

    return { factors, baseScore: Math.max(0, Math.min(100, base)) }
  },

  extensions: (state) => {
    const factors: ScoreFactor[] = []
    let base = 50
    // No self-exclusion: the status card counts every flagged install
    // (SilentGuard included), so the score factor must count the same set
    // or the two numbers contradict each other in the UI.
    const exts = state.dangerousExtensions || []

    if (exts.length === 0) {
      factors.push({ label: 'No dangerous extensions', score: 30, maxScore: 30, type: 'positive' })
      base += 30
    } else {
      const critical = exts.filter(e => e.riskLevel === 'critical').length
      const high = exts.filter(e => e.riskLevel === 'high').length
      if (critical > 0) {
        factors.push({ label: `${critical} critical-risk extensions`, score: -30, maxScore: 30, type: 'negative' })
        base -= 30
      } else if (high > 0) {
        factors.push({ label: `${high} high-risk extensions`, score: -20, maxScore: 30, type: 'negative' })
        base -= 20
      } else {
        factors.push({ label: `${exts.length} medium-risk extensions`, score: -10, maxScore: 30, type: 'negative' })
        base -= 10
      }
    }

    return { factors, baseScore: Math.max(0, Math.min(100, base)) }
  },

  passwords: (state) => {
    const factors: ScoreFactor[] = []
    let base = 50

    const strengths = state.passwordStrengths || []
    const realStrengths = strengths.filter(s => s.score >= 0)
    if (realStrengths.length === 0) {
      factors.push({ label: 'No password scans yet — visit a login page', score: 0, maxScore: 0, type: 'positive' })
    } else {
      const weak = realStrengths.filter(s => s.score < 40).length
      if (weak > 0) {
        const penalty = Math.min(15, weak * 5)
        factors.push({ label: `${weak} weak password(s) detected`, score: -penalty, maxScore: 15, type: 'negative' })
        base -= penalty
      } else {
        factors.push({ label: 'No weak passwords detected', score: 15, maxScore: 15, type: 'positive' })
        base += 15
      }
    }

    return { factors, baseScore: Math.max(0, Math.min(100, base)) }
  },

  privacy: (state) => {
    const factors: ScoreFactor[] = []
    let base = 50
    const scans = state.pageScans || []

    // Every field is optional in stored scans — coerce to numbers so one
    // malformed entry can never NaN the whole privacy score.
    const num = (v: any) => (typeof v === 'number' && isFinite(v) ? v : 0)
    const pl = (n: number, word: string) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`
    // Count only real tracker sightings — inline self-references, GTM
    // consent infra and pixels are noise (inline has its own factor below,
    // so counting them here too would penalize the same signal twice).
    const totalTrackers = scans.reduce((s, p) => s + (Array.isArray(p.trackers) ? p.trackers.filter(t => t && typeof t.domain === 'string' && !isNoiseTracker(t)).length : 0), 0)
    const totalCanvas = scans.reduce((s, p) => s + num(p.canvasAttempts), 0)
    const totalAudio = scans.reduce((s, p) => s + num(p.audioAttempts), 0)
    const totalCookies = scans.reduce((s, p) => s + num(p.totalCookies), 0)
    const totalThirdParty = scans.reduce((s, p) => s + num(p.thirdPartyRequests), 0)
    const anyWebRTC = scans.some(p => p.webRTCLeakDetected)

    if (scans.length > 0) {
      factors.push({ label: `${pl(scans.length, 'page')} scanned`, score: 5, maxScore: 5, type: 'positive' })
      base += 5
    } else {
      factors.push({ label: 'No pages scanned yet', score: 0, maxScore: 0, type: 'positive' })
    }

    if (totalTrackers === 0 && scans.length > 0) {
      factors.push({ label: 'No trackers on any page', score: 25, maxScore: 25, type: 'positive' })
      base += 25
    } else if (totalTrackers > 0) {
      // Gradual: -5 per 10 tracker sightings, capped at -25. The old curve
      // (floor(total/5)*10) leapt straight to -10 for a single sighting.
      const penalty = Math.min(25, Math.ceil(totalTrackers / 10) * 5)
      factors.push({ label: `${pl(totalTrackers, 'tracker')} across ${pl(scans.length, 'page')}`, score: -penalty, maxScore: 25, type: 'negative' })
      base -= penalty
    }

    if (totalCanvas > 0 || totalAudio > 0) {
      const fpScore = Math.min(20, (totalCanvas + totalAudio) * 5)
      factors.push({ label: `Fingerprinting: ${totalCanvas} canvas + ${totalAudio} audio`, score: -fpScore, maxScore: 20, type: 'negative' })
      base -= fpScore
    } else if (scans.length > 0) {
      factors.push({ label: 'No fingerprinting', score: 15, maxScore: 15, type: 'positive' })
      base += 15
    }

    if (anyWebRTC) {
      factors.push({ label: 'WebRTC leak detected', score: -15, maxScore: 15, type: 'negative' })
      base -= 15
    }

    if (totalThirdParty > 10) {
      factors.push({ label: `${pl(totalThirdParty, 'third-party request')}`, score: -5, maxScore: 5, type: 'negative' })
      base -= 5
    }

    if (totalCookies > 20) {
      factors.push({ label: `${pl(totalCookies, 'cookie')} set`, score: -5, maxScore: 5, type: 'negative' })
      base -= 5
    }

    const downloads = state.downloadScans || []
    if (downloads.length > 0) {
      const risky = downloads.filter(d => d.riskLevel === 'high' || d.riskLevel === 'critical').length
      if (risky > 0) {
        const penalty = Math.min(15, risky * 10)
        factors.push({ label: `${pl(risky, 'risky download')}`, score: -penalty, maxScore: 15, type: 'negative' })
        base -= penalty
      } else {
        factors.push({ label: 'No risky downloads', score: 10, maxScore: 10, type: 'positive' })
        base += 10
      }
    }

    return { factors, baseScore: Math.max(0, Math.min(100, base)) }
  },

  accounts: (state) => {
    const factors: ScoreFactor[] = []
    let base = 50
    const accs = state.accounts || []

    if (accs.length > 0) {
      factors.push({ label: `${accs.length} accounts tracked`, score: 10, maxScore: 10, type: 'positive' })
      base += 10
    }

    const hijack = state.correlatedIncidents?.filter(i => i.probability > 0.7 && !i.acknowledged).length || 0
    if (hijack > 0) {
      const penalty = Math.min(20, hijack * 10)
      factors.push({ label: `${hijack} correlated incident(s)`, score: -penalty, maxScore: 20, type: 'negative' })
      base -= penalty
    }

    return { factors, baseScore: Math.max(0, Math.min(100, base)) }
  },

  policy: (state) => {
    const factors: ScoreFactor[] = []
    let base = 50
    const reports = state.policyReports || []
    const events = state.categories.policy?.events || []
    const unresolvedEvents = events.filter(e => !e.acknowledged)

    if (reports.length === 0) {
      factors.push({ label: 'No policy analyses yet', score: 0, maxScore: 0, type: 'positive' })
    } else {
      // Average only over reports that actually HAVE a score — counting
      // unscored reports as 0 dragged the average down unfairly.
      const scored = reports.map(r => r.privacyScore).filter((n): n is number => typeof n === 'number' && isFinite(n))
      if (scored.length === 0) {
        factors.push({ label: 'No scored policy analyses yet', score: 0, maxScore: 0, type: 'positive' })
      } else {
        const avg = Math.round(scored.reduce((a, b) => a + b, 0) / scored.length)
        if (avg >= 80) {
          factors.push({ label: `Average privacy score: ${avg}/100`, score: 20, maxScore: 20, type: 'positive' })
          base += 20
        } else if (avg >= 60) {
          factors.push({ label: `Average privacy score: ${avg}/100`, score: 10, maxScore: 20, type: 'positive' })
          base += 10
        } else {
          factors.push({ label: `Average privacy score: ${avg}/100`, score: -10, maxScore: 20, type: 'negative' })
          base -= 10
        }
      }

      // The privacyScore already encodes rules and dangerous clauses — the old
      // math deducted for the low average AND the risk level AND each clause
      // (−60 possible against a +50 base), welding any bad policy to 0 forever.
      // One modest standing-risk deduction is the non-duplicated signal.
      const dangerous = reports.filter(r => r.riskLevel === 'dangerous').length
      const risky = reports.filter(r => r.riskLevel === 'risky').length
      if (dangerous > 0) {
        factors.push({ label: `${dangerous} dangerous policy/policies`, score: -8, maxScore: 8, type: 'negative' })
        base -= 8
      } else if (risky > 0) {
        factors.push({ label: `${risky} risky policy/policies`, score: -4, maxScore: 8, type: 'negative' })
        base -= 4
      }
    }

    if (unresolvedEvents.length > 0) {
      factors.push({ label: `${unresolvedEvents.length} unresolved policy alert(s)`, score: -5, maxScore: 5, type: 'negative' })
      base -= 5
    }

    return { factors, baseScore: Math.max(0, Math.min(100, base)) }
  },
}

export function computeScore(categoryId: SecurityCategory, state: SecurityState): CategoryScore {
  const calculator = SCORE_CALCULATORS[categoryId]
  if (!calculator) return { total: 50, maxScore: 100, factors: [] }
  const { factors, baseScore } = calculator(state)
  return { total: baseScore, maxScore: 100, factors }
}

export async function recalculateCategoryScore(categoryId: SecurityCategory): Promise<CategoryScore> {
  const state = await getSecurityState()
  const score = computeScore(categoryId, state)

  const cat = state.categories[categoryId]
  if (cat) {
    // Stamp the heartbeat here — every monitor pass ends with a recalc, so
    // this is the one place "last checked" stays truthful without each
    // monitor having to remember to write it.
    await updateCategoryState(categoryId, { score, lastScan: Date.now() })
  }

  await updateBadge()
  return score
}

export async function recalculateAllScores(): Promise<void> {
  // Overview averages the other categories — compute it LAST so its score
  // reflects this pass instead of running one cycle behind.
  const ids = Object.keys(SCORE_CALCULATORS).filter(k => k !== 'overview')
  ids.push('overview')
  for (const catId of ids) {
    await recalculateCategoryScore(catId as SecurityCategory)
  }
}

export async function getOverallScore(): Promise<number> {
  const state = await getSecurityState()
  const scores = Object.values(state.categories)
    .filter(c => c.id !== 'overview')
    .map(c => c.score?.total ?? 50)
  if (scores.length === 0) return 0
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
}

