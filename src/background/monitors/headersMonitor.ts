import { RiskEvent, SecurityHeadersReport } from '../../types'
import { addCategoryEvent, getSecurityState, updateSecurityState } from '../storage'
import { recalculateCategoryScore } from '../engine'

function normalizeHeaderName(h: string): string {
  return h.toLowerCase().replace(/-/g, '')
}

export async function auditHeaders(url: string, headers: chrome.webRequest.HttpHeader[]): Promise<void> {
  try {
    const headerNames = headers.map(h => normalizeHeaderName(h.name))
    const hasHsts = headerNames.includes('stricttransportsecurity')
    const hasCsp = headerNames.includes('contentsecuritypolicy')
    const hasXfo = headerNames.includes('xframeoptions')
    const hasXssProtection = headerNames.includes('xxssprotection')
    const hasReferrerPolicy = headerNames.includes('referrerpolicy')
    const hasPermissionsPolicy = headerNames.includes('permissionspolicy')

    const present = [hasHsts, hasCsp, hasXfo, hasXssProtection, hasReferrerPolicy, hasPermissionsPolicy]
    const count = present.filter(Boolean).length
    const score = Math.round((count / 6) * 100)

    const missingHeaders: string[] = []
    const expected = ['Strict-Transport-Security', 'Content-Security-Policy', 'X-Frame-Options', 'X-XSS-Protection', 'Referrer-Policy', 'Permissions-Policy']
    for (let i = 0; i < expected.length; i++) {
      if (!present[i]) missingHeaders.push(expected[i])
    }

    const report: SecurityHeadersReport = {
      url,
      hasHsts,
      hasCsp,
      hasXfo,
      hasXssProtection,
      hasReferrerPolicy,
      hasPermissionsPolicy,
      score,
      missingHeaders,
    }

    const existing = (await getSecurityState()).securityHeaders || []
    const headersList = [report, ...existing].slice(0, 50)
    await updateSecurityState({ securityHeaders: headersList })

    if (score < 50) {
      const event: RiskEvent = {
        id: crypto.randomUUID(),
        type: 'missing_security_header',
        category: 'privacy',
        severity: 'medium',
        title: `Missing security headers on ${new URL(url).hostname}`,
        description: `Score ${score}/100 — missing: ${missingHeaders.join(', ')}`,
        source: url,
        timestamp: Date.now(),
        acknowledged: false,
      }
      await addCategoryEvent('privacy', event)
      await recalculateCategoryScore('privacy')
    }
  } catch (e) {
    console.error('Headers audit failed:', e)
  }
}

export function headersReceivedHandler(details: chrome.webRequest.WebResponseHeadersDetails): void {
  if (details.responseHeaders && details.url) {
    auditHeaders(details.url, details.responseHeaders)
  }
}

