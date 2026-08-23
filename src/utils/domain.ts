const MULTI_LABEL_SUFFIXES = [
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.in', 'co.jp', 'com.br',
  'com.mx', 'co.za', 'com.sg', 'com.hk', 'com.tr', 'co.nz', 'com.my', 'com.ph', 'com.vn',
  'com.ua', 'co.id', 'com.tw', 'co.kr', 'com.pl',
  // Common suffixes that were collapsing two different sites into one
  // ("foo.co.il" vs "co.il" owner). Extend as needed from the Public Suffix List.
  'com.ar', 'co.il', 'co.th', 'com.sa', 'com.ng',
  'com.eg', 'com.pk', 'or.jp', 'ne.jp', 'org.nz',
  'net.nz', 'edu.au', 'gov.au', 'gov.in', 'co.ke',
]

// Same company logs in under several domains (google.in / googlr.com) —
// collapse them to the primary so one website isn't tracked as five accounts.
const DOMAIN_ALIASES: Record<string, string> = {
  'google.co.in': 'google.com', 'google.co.uk': 'google.com', 'google.in': 'google.com',
  'googlr.com': 'google.com',
}

export function normalizeDomain(raw: string): string {
  let d = (raw || '').trim().toLowerCase()
  if (/^https?:\/\//i.test(d)) {
    try { d = new URL(d).hostname } catch { d = '' }
  }
  d = d.replace(/^www\./, '').replace(/\/.*$/, '')
  return d.replace(/^\.+/, '')
}

export function isValidDomain(d: string): boolean {
  return d.length > 0 && d.length <= 253 &&
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(d)
}

// Registrable base: keep eTLD+1 (multi-label public suffixes keep three labels).
export function baseDomain(domain: string): string {
  const labels = (domain || '').toLowerCase().split('.').filter(Boolean)
  if (labels.length <= 2) return labels.join('.')
  const tail = labels.slice(-2).join('.')
  return MULTI_LABEL_SUFFIXES.includes(tail) ? labels.slice(-3).join('.') : tail
}

export function canonicalAccountDomain(domain: string): string {
  const base = baseDomain(domain)
  return DOMAIN_ALIASES[base] || base
}

// Brand name from an already-canonicalized registrable domain.
// "google.com" -> "Google", "bbc.co.uk" -> "Bbc", "x.com" -> "X".
const NAME_OVERRIDES: Record<string, string> = { x: 'X' }

export function inferAccountName(canonical: string): string {
  const word = (canonical || '').split('.').filter(Boolean)[0] || ''
  if (!word) return 'Unknown'
  return NAME_OVERRIDES[word] || word.charAt(0).toUpperCase() + word.slice(1)
}