import { getSecurityState } from './storage'

export async function updateBadge(): Promise<void> {
  try {
    const state = await getSecurityState()
    let unacked = 0
    for (const catId of Object.keys(state.categories)) {
      const cat = state.categories[catId]
      if (cat && cat.events) {
        unacked += cat.events.filter(e => !e.acknowledged).length
      }
    }
    const cats = Object.values(state.categories).filter(c => c.id !== 'overview')
    const scores = cats.map(c => c.score.total)
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0

    if (unacked > 0) {
      chrome.action.setBadgeText({ text: unacked > 99 ? '99+' : String(unacked) }).catch(() => {})
      chrome.action.setBadgeBackgroundColor({ color: '#ff4757' }).catch(() => {})
      chrome.action.setTitle({ title: `Session Guardian — ${avgScore}/100 · ${unacked} alert(s) unresolved` }).catch(() => {})
    } else {
      chrome.action.setBadgeText({ text: String(avgScore) }).catch(() => {})
      const color = avgScore >= 80 ? '#2ed573' : avgScore >= 60 ? '#ffa502' : avgScore >= 40 ? '#ff6348' : '#ff4757'
      chrome.action.setBadgeBackgroundColor({ color }).catch(() => {})
      chrome.action.setTitle({ title: `Session Guardian — ${avgScore}/100` }).catch(() => {})
    }
  } catch (e) {
    console.error('updateBadge failed:', e)
  }
}
