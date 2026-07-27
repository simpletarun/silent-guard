import { SecurityState, CategoryScore, ScoreFactor, SecurityCategory } from '../types'
import { getSecurityState, updateCategoryState } from './storage'
import { updateBadge } from './badge'

type ScoreCalculator = (state: SecurityState) => { factors: ScoreFactor[]; baseScore: number }

const SCORE_CALCULATORS: Record<string, ScoreCalculator> = {
  overview: (state) => {
    const factors: ScoreFactor[] = []
    const cats = Object.values(state.categories).filter(c => c.id !== 'overview')
    const scores = cats.map(c => c.score.total)
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 50
    const totalEvents = cats.reduce((sum, c) => sum + c.events.filter(e => !e.acknowledged).length, 0)

    if (totalEvents === 0) {
      factors.push({ label: 'No unresolved issues', score: 20, maxScore: 20, type: 'positive' })
    } else {
      factors.push({ label: `${totalEvents} unresolved issue(s)`, score: -15, maxScore: 20, type: 'negative' })
    }
    factors.push({ label: `Average of ${scores.length} categories`, score: 0, maxScore: 0, type: 'positive' })

    return { factors, baseScore: Math.max(0, Math.min(100, avgScore)) }
  },
  network: (state) => {
    const factors: ScoreFactor[] = []
    let base = 50
    const net = state.network

    if (net) {
      if (!net.isVpn && !net.isProxy) {
        factors.push({ label: 'No VPN/proxy detected', score: 15, maxScore: 15, type: 'positive' })
        base += 15
      } else {
        factors.push({ label: net.isVpn ? 'VPN detected' : 'Proxy detected', score: -15, maxScore: 15, type: 'negative' })
        base -= 15
      }
      if (net.isDoHEnabled) {
        factors.push({ label: 'DNS over HTTPS enabled', score: 10, maxScore: 10, type: 'positive' })
        base += 10
      }
      let ipChanges = 0
      for (let i = 1; i < net.ipHistory.length; i++) {
        if (net.ipHistory[i].ip !== net.ipHistory[i-1].ip) ipChanges++
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
      factors.push({ label: `${critical} threat intel match(es)`, score: -15, maxScore: 15, type: 'negative' })
      base -= Math.min(15, critical * 5)
    }

    return { factors, baseScore: Math.max(0, Math.min(100, base)) }
  },

  device: (state) => {
    const factors: ScoreFactor[] = []
    let base = 50
    const fp = state.fingerprint

    if (fp) {
      factors.push({ label: 'Browser fingerprint stable', score: 20, maxScore: 20, type: 'positive' })
      base += 20
      if (fp.browserVersion) {
        factors.push({ label: `Browser: ${fp.browserName || 'Chrome'} ${fp.browserVersion}`, score: 15, maxScore: 15, type: 'positive' })
        base += 15
      }
    }

    const events = state.categories.device?.events || []
    const unresolved = events.filter(e => !e.acknowledged)
    if (unresolved.length === 0) {
      factors.push({ label: 'No device changes', score: 10, maxScore: 10, type: 'positive' })
      base += 10
    }

    return { factors, baseScore: Math.max(0, Math.min(100, base)) }
  },

  extensions: (state) => {
    const factors: ScoreFactor[] = []
    let base = 50
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
        factors.push({ label: `${weak} weak password(s) detected`, score: -15, maxScore: 15, type: 'negative' })
        base -= Math.min(15, weak * 5)
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

    const totalTrackers = scans.reduce((s, p) => s + p.trackers.length, 0)
    const totalFp = scans.reduce((s, p) => s + p.fingerprintingAttempts, 0)
    const totalCanvas = scans.reduce((s, p) => s + p.canvasAttempts, 0)
    const totalAudio = scans.reduce((s, p) => s + p.audioAttempts, 0)
    const totalBeacons = scans.reduce((s, p) => s + p.beaconCalls, 0)
    const totalHidden = scans.reduce((s, p) => s + p.hiddenElements, 0)
    const totalInline = scans.reduce((s, p) => s + p.suspiciousInlineScripts, 0)
    const totalCookies = scans.reduce((s, p) => s + p.totalCookies, 0)
    const totalThirdParty = scans.reduce((s, p) => s + p.thirdPartyRequests, 0)
    const anyPixels = scans.some(p => p.hasTrackingPixels)
    const anyWebRTC = scans.some(p => p.webRTCLeakDetected)

    if (scans.length > 0) {
      factors.push({ label: `${scans.length} page(s) scanned`, score: 5, maxScore: 5, type: 'positive' })
      base += 5
    } else {
      factors.push({ label: 'No pages scanned yet', score: 0, maxScore: 0, type: 'positive' })
    }

    if (totalTrackers === 0 && scans.length > 0) {
      factors.push({ label: 'No trackers on any page', score: 25, maxScore: 25, type: 'positive' })
      base += 25
    } else if (totalTrackers > 0) {
      const penalty = Math.min(25, Math.floor(totalTrackers / 5) * 10)
      factors.push({ label: `${totalTrackers} tracker(s) across ${scans.length} page(s)`, score: -penalty, maxScore: 25, type: 'negative' })
      base -= penalty
    }

    if (totalFp > 0 || totalCanvas > 0 || totalAudio > 0) {
      const fpScore = Math.min(20, (totalCanvas + totalAudio) * 5)
      factors.push({ label: `Fingerprinting: ${totalCanvas} canvas + ${totalAudio} audio`, score: -fpScore, maxScore: 20, type: 'negative' })
      base -= fpScore
    } else if (scans.length > 0) {
      factors.push({ label: 'No fingerprinting', score: 15, maxScore: 15, type: 'positive' })
      base += 15
    }

    if (totalBeacons > 0) {
      const beaconScore = Math.min(10, totalBeacons * 2)
      factors.push({ label: `${totalBeacons} beacon(s) sent`, score: -beaconScore, maxScore: 10, type: 'negative' })
      base -= beaconScore
    }

    if (totalHidden > 3) {
      factors.push({ label: `${totalHidden} hidden element(s)`, score: -10, maxScore: 10, type: 'negative' })
      base -= 10
    }

    if (totalInline > 0) {
      factors.push({ label: `${totalInline} inline tracking script(s)`, score: -10, maxScore: 10, type: 'negative' })
      base -= 10
    }

    if (anyPixels) {
      factors.push({ label: 'Tracking pixels found', score: -10, maxScore: 10, type: 'negative' })
      base -= 10
    }

    if (anyWebRTC) {
      factors.push({ label: 'WebRTC leak detected', score: -15, maxScore: 15, type: 'negative' })
      base -= 15
    }

    if (totalThirdParty > 10) {
      factors.push({ label: `${totalThirdParty} third-party request(s)`, score: -5, maxScore: 5, type: 'negative' })
      base -= 5
    }

    if (totalCookies > 20) {
      factors.push({ label: `${totalCookies} cookie(s) set`, score: -5, maxScore: 5, type: 'negative' })
      base -= 5
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
      factors.push({ label: `${hijack} correlated incident(s)`, score: -20, maxScore: 20, type: 'negative' })
      base -= Math.min(20, hijack * 10)
    }

    return { factors, baseScore: Math.max(0, Math.min(100, base)) }
  },
}

export async function recalculateCategoryScore(categoryId: SecurityCategory): Promise<CategoryScore> {
  const state = await getSecurityState()
  const calculator = SCORE_CALCULATORS[categoryId]
  if (!calculator) return { total: 50, maxScore: 100, factors: [] }

  const { factors, baseScore } = calculator(state)
  const score: CategoryScore = { total: baseScore, maxScore: 100, factors }

  const cat = state.categories[categoryId]
  if (cat) {
    await updateCategoryState(categoryId, { score })
  }

  await updateBadge()
  return score
}

export async function recalculateAllScores(): Promise<void> {
  for (const catId of Object.keys(SCORE_CALCULATORS)) {
    await recalculateCategoryScore(catId as SecurityCategory)
  }
}

export async function getOverallScore(): Promise<number> {
  const state = await getSecurityState()
  const scores = Object.values(state.categories).map(c => c.score.total)
  if (scores.length === 0) return 0
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
}

