import { PasswordStrengthResult, RiskEvent, PasswordFormInfo } from '../../types'
import { addCategoryEvent, getSecurityState, updateSecurityState } from '../storage'
import { recalculateCategoryScore } from '../engine'

function evaluateFromMetadata(info: PasswordFormInfo): PasswordStrengthResult {
  let score: number
  const suggestions: string[] = []
  let warning: string

  if (info.isOverHttp) {
    score = 10
    suggestions.push('Form is submitted over insecure HTTP')
    warning = 'Insecure password submission'
    if (info.hasPasswordField) {
      suggestions.push('Use HTTPS for password forms')
    }
  } else {
    score = 100
    warning = 'Strong password form'
  }

  if (!info.autocomplete || info.autocomplete === 'off') {
    score -= 10
    suggestions.push('Enable autocomplete for better password management')
  }

  score = Math.max(0, Math.min(100, score))

  let domain = ''
  try { domain = new URL(info.url).hostname } catch { domain = info.url }

  const crackTime = score < 20 ? 'instant' : score < 40 ? 'minutes' : score < 60 ? 'hours' : score < 80 ? 'days' : 'years'

  return {
    url: info.url,
    domain,
    score,
    crackTime,
    suggestions: suggestions.slice(0, 4),
    warning,
  }
}

export async function evaluatePasswordStrength(info: PasswordFormInfo): Promise<PasswordStrengthResult> {
  const result = evaluateFromMetadata(info)
  const existing = (await getSecurityState()).passwordStrengths || []
  const strengths = [result, ...existing].slice(0, 20)
  await updateSecurityState({ passwordStrengths: strengths })

  if (result.score < 40) {
    const severity = result.score < 20 ? 'high' : 'medium'
    const event: RiskEvent = {
      id: crypto.randomUUID(),
      type: 'password_strength',
      category: 'passwords',
      severity,
      title: `Weak password form on ${result.domain}`,
      description: result.suggestions.join('; ') || `Form scored ${result.score}/100`,
      source: result.domain,
      timestamp: Date.now(),
      acknowledged: false,
    }
    await addCategoryEvent('passwords', event)
  }
  await recalculateCategoryScore('passwords')

  return result
}

export function startPasswordStrengthMonitor(): void {
  setTimeout(async () => {
    const state = await getSecurityState()
    if ((state.passwordStrengths || []).length === 0) {
      const pending: PasswordStrengthResult = {
        url: '',
        domain: '',
        score: -1,
        crackTime: '',
        suggestions: ['Visit a login page to enable password scanning'],
        warning: 'No password forms detected yet',
      }
      const strengths = [pending]
      await updateSecurityState({ passwordStrengths: strengths })
      await recalculateCategoryScore('passwords')
    }
  }, 30000)
}
