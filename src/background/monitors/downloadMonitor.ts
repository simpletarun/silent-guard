import { DownloadScanResult, RiskEvent } from '../../types'
import { addCategoryEvent, getSettings, mutateSecurityState } from '../storage'
import { notifyRiskEvent } from '../notifications'
import { recalculateCategoryScore } from '../engine'

const HIGH_RISK_EXTS = new Set(['exe', 'scr', 'bat', 'cmd', 'ps1', 'vbs', 'vbe', 'js', 'msi', 'jar', 'hta', 'com', 'dll', 'apk', 'reg', 'cpl'])
const MEDIUM_RISK_EXTS = new Set(['zip', 'rar', '7z', 'iso', 'docm', 'xlsm', 'pptm', 'msix', 'appx'])

const TRUSTED_DOMAINS = new Set([
  'microsoft.com', 'windows.com', 'office.com', 'live.com', 'github.com',
  'githubusercontent.com', 'apple.com', 'icloud.com', 'google.com',
  'googleusercontent.com', 'chrome.com', 'mozilla.org', 'cloudflare.com',
  'amazon.com', 'aws.amazon.com', 'amazonaws.com', 'adobe.com',
  'jetbrains.com', 'slack.com', 'discord.com', 'telegram.org',
  'spotify.com', 'zoom.us', 'notion.so', 'figma.com', 'canva.com',
  'openai.com', 'anthropic.com', 'dropbox.com',
])
// Serialize result-list writes — concurrent downloads read the same list
// and dropped each other's entries.
// Ids already evaluated — the onChanged verdict re-run must not double-log.
const scannedDownloadIds = new Set<string>()

export function getDownloadRiskExt(fileName: string): string {
  const cleaned = fileName.replace(/\?.*$/, '').trim()
  const idx = cleaned.lastIndexOf('.')
  if (idx < 0) return ''
  return cleaned.slice(idx + 1).toLowerCase().split(/[^a-z0-9]/)[0]
}

export function getDownloadDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

function isTrustedDomain(domain: string): boolean {
  // Subdomains (aka.ms, download.microsoft.com) are trust-siblings, not
  // lookalikes — match the root domain and any depth below it.
  return [...TRUSTED_DOMAINS].some(d => domain === d || domain.endsWith('.' + d))
}

export function evaluateDownloadRisk(
  fileName: string,
  url: string,
  chromeDangerous: boolean,
): { riskLevel: 'low' | 'medium' | 'high' | 'critical'; reason: string; ext: string; domain: string } {
  const ext = getDownloadRiskExt(fileName)
  const domain = getDownloadDomain(url)

  let score = 0
  const reasons: string[] = []

  if (HIGH_RISK_EXTS.has(ext)) {
    score += 2
    reasons.push(`${ext.toUpperCase()} file`)
  } else if (MEDIUM_RISK_EXTS.has(ext)) {
    score += 1
    reasons.push(`${ext.toUpperCase()} archive`)
  }

  if (url.startsWith('http://') && domain) {
    score += 1
    reasons.push('downloaded over insecure HTTP')
  }

  if (chromeDangerous) {
    score += 2
    reasons.push('flagged by Chrome as dangerous')
  }

  // Trust discount applies only to the ext/http components — Chrome's own
  // danger verdict must never be discounted away, or a Chrome-flagged file
  // on a trusted host scored 0 ('low') and skipped every safety net.
  if (domain && isTrustedDomain(domain) && !chromeDangerous) {
    score = Math.max(0, score - 2)
  } else if (domain && score > 0) {
    score += 1
    reasons.push('untrusted source domain')
  }

  const riskLevel: DownloadScanResult['riskLevel'] =
    score >= 4 ? 'critical' : score >= 3 ? 'high' : score >= 1 ? 'medium' : 'low'

  return { riskLevel, reason: reasons.join('; ') || 'Safe download from trusted source', ext, domain }
}

function isChromeDangerous(danger: string): boolean {
  // 'uncommon' = Chrome considers the file type/publisher unusual — risky
  // enough to flag, not enough to hard-block.
  return danger !== 'safe' && danger !== 'accepted' && danger !== 'safe_archive'
}

const RISK_ORDER = ['low', 'medium', 'high', 'critical']

export async function handleDownload(downloadItem: chrome.downloads.DownloadItem): Promise<void> {
  // Key on the danger verdict, not just the id: Chrome delivers its real
  // malware verdict ASYNC via onChanged ('safe' at onCreated), and the old
  // id-only guard swallowed that re-evaluation — flagged downloads scored
  // as if safe. Same key never re-runs (onChanged fires once per change).
  const scanKey = `${downloadItem.id}:${downloadItem.danger || 'safe'}`
  if (scannedDownloadIds.has(scanKey)) return
  scannedDownloadIds.add(scanKey)
  if (scannedDownloadIds.size > 300) {
    const oldest = scannedDownloadIds.values().next().value
    if (oldest !== undefined) scannedDownloadIds.delete(oldest)
  }
  try {
    const fileName = downloadItem.filename.split(/[\\/]/).pop() || 'download'
    const danger = typeof downloadItem.danger === 'string' ? downloadItem.danger : 'safe'
    // finalUrl reflects redirects; url alone misses downloads behind
    // shorteners/redirects.
    const { riskLevel, reason, ext, domain } = evaluateDownloadRisk(
      fileName,
      downloadItem.finalUrl || downloadItem.url,
      isChromeDangerous(danger),
    )

    // Cancel BEFORE the async state writes — small files finish before
    // getSecurityState/updateSecurityState resolve.
    if (riskLevel === 'high' || riskLevel === 'critical') {
      const settings = await getSettings()
      if (settings.autoBlockDownloads) {
        try {
          await chrome.downloads.cancel(downloadItem.id)
        } catch {}
      }
    }

    const scan: DownloadScanResult = {
      id: crypto.randomUUID(),
      downloadId: downloadItem.id,
      fileName,
      url: downloadItem.finalUrl || downloadItem.url || '',
      domain,
      extension: ext,
      riskLevel,
      reason,
      timestamp: Date.now(),
    }

    // Upsert by the stable Chrome download id — a danger-verdict re-run must
    // REPLACE the first-pass row, not stack a second one.
    let prevLevel: DownloadScanResult['riskLevel'] | undefined
    await mutateSecurityState(s => {
      const prior = (s.downloadScans || []).find(d => d.downloadId === downloadItem.id)
      if (prior) prevLevel = prior.riskLevel
      s.downloadScans = [scan, ...(s.downloadScans || []).filter(d => d.downloadId !== downloadItem.id)].slice(0, 50)
    })

    if (riskLevel === 'low') return
    // Escalation only: a re-run at equal/lower severity must not duplicate
    // events or notifications for the same file.
    const rank = RISK_ORDER.indexOf(riskLevel)
    if (prevLevel && rank <= RISK_ORDER.indexOf(prevLevel)) return

    const event: RiskEvent = {
      id: crypto.randomUUID(),
      type: 'suspicious_download',
      category: 'privacy',
      severity: riskLevel === 'critical' ? 'critical' : riskLevel === 'high' ? 'high' : 'medium',
      title: `${riskLevel === 'critical' ? 'Suspicious' : 'Risky'} download: ${fileName}`,
      description: reason,
      source: domain || 'unknown',
      timestamp: Date.now(),
      acknowledged: false,
    }
    await addCategoryEvent('privacy', event)
    await notifyRiskEvent(event)
    await recalculateCategoryScore('privacy')
  } catch (e) {
    console.error('Download scan failed:', e)
  }
}

export function startDownloadMonitor(): void {
  chrome.downloads.onCreated.addListener((item) => {
    handleDownload(item).catch(() => {})
  })
  // Chrome delivers its real danger verdict (uncommon / file_malicious)
  // ASYNC via onChanged — at onCreated it is almost always still 'safe',
  // so the flag term never fired without this re-evaluation.
  chrome.downloads.onChanged.addListener(delta => {
    if (!delta.danger) return
    chrome.downloads.search({ id: delta.id }).then(items => {
      if (items[0]) return handleDownload(items[0])
    }).catch(() => {})
  })
}
