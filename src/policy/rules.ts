import { PolicyRule } from '../types'
import { DataFieldType } from '../types'

export const DATA_FIELD_DETECTIONS: {
  type: DataFieldType
  label: string
  keywords: string[]
}[] = [
  { type: 'name', label: 'Name', keywords: ['full name', 'first name', 'last name', 'given name'] },
  { type: 'email', label: 'Email Address', keywords: ['email address', 'email', 'e-mail'] },
  { type: 'phone', label: 'Phone Number', keywords: ['phone number', 'telephone', 'mobile number', 'contact number'] },
  { type: 'location', label: 'Precise Location', keywords: ['precise location', 'gps location', 'location data', 'geo-location', 'geolocation'] },
  { type: 'address', label: 'Physical Address', keywords: ['street address', 'postal address', 'home address', 'billing address'] },
  { type: 'cookies', label: 'Cookies', keywords: ['cookies', 'cookie data', 'web beacon', 'tracking pixel'] },
  { type: 'ip', label: 'IP Address', keywords: ['ip address', 'internet protocol'] },
  { type: 'browser', label: 'Browser Info', keywords: ['browser type', 'browser version', 'user agent'] },
  { type: 'os', label: 'Operating System', keywords: ['operating system', 'os version', 'device os'] },
  { type: 'payment', label: 'Payment Information', keywords: ['credit card', 'debit card', 'payment card', 'billing information', 'payment information', 'transaction'] },
  { type: 'contacts', label: 'Contacts/Address Book', keywords: ['contacts', 'address book', 'phone contacts', 'social connections'] },
  { type: 'photos', label: 'Photos/Media', keywords: ['photo', 'image', 'video', 'picture', 'media content'] },
  { type: 'camera', label: 'Camera', keywords: ['camera', 'photograph', 'take pictures'] },
  { type: 'microphone', label: 'Microphone', keywords: ['microphone', 'audio recording', 'voice data'] },
  { type: 'bluetooth', label: 'Bluetooth', keywords: ['bluetooth', 'nearby devices'] },
  { type: 'calendar', label: 'Calendar', keywords: ['calendar', 'schedule', 'appointment'] },
  { type: 'biometric', label: 'Biometric Data', keywords: ['biometric', 'fingerprint', 'face recognition', 'voice recognition', 'iris scan'] },
  { type: 'health', label: 'Health Data', keywords: ['health data', 'health information', 'personal health', 'medical records', 'medical data', 'fitness data', 'biometric health', 'wellness data'] },
]

export const COOKIE_PATTERNS: {
  type: string
  label: string
  keywords: string[]
}[] = [
  { type: 'essential', label: 'Essential', keywords: ['strictly necessary cookies', 'essential cookies', 'necessary for the website', 'required for the site', 'session management'] },
  { type: 'analytics', label: 'Analytics', keywords: ['analytics', 'statistics', 'usage statistics', 'measuring', 'google analytics', 'mixpanel', 'amplitude', 'hotjar', 'matomo'] },
  { type: 'advertising', label: 'Advertising', keywords: ['advertising', 'marketing', 'targeted', 'ad personalization', 'promotional', 'adsense', 'doubleclick', 'adroll', 'ad tech'] },
  { type: 'functional', label: 'Functional', keywords: ['functional', 'preferences', 'personalization', 'customization'] },
  { type: 'performance', label: 'Performance', keywords: ['performance', 'optimization', 'load times'] },
  { type: 'third-party', label: 'Third-party', keywords: ['third-party cookies', 'third party cookies', '3rd party cookies'] },
  { type: 'tracking', label: 'Tracking', keywords: ['tracking', 'tracker', 'pixel', 'beacon', 'fingerprint', 'device fingerprint', 'browser fingerprint'] },
]

export const RETENTION_PATTERNS: {
  period: string
  regex: RegExp
}[] = [
  { period: '30 days', regex: /\b(30\s*days?)\b/i },
  { period: '90 days', regex: /\b(90\s*days?)\b/i },
  { period: '180 days', regex: /\b(180\s*days?)\b/i },
  { period: '3 months', regex: /\b(3\s*months?)\b/i },
  { period: '6 months', regex: /\b(6\s*months?)\b/i },
  { period: '9 months', regex: /\b(9\s*months?)\b/i },
  { period: '18 months', regex: /\b(18\s*months?)\b/i },
  { period: '1 year', regex: /\b(1\s*year|12\s*months?)\b/i },
  { period: '2 years', regex: /\b(2\s*years?|24\s*months?)\b/i },
  { period: '5 years', regex: /\b(5\s*years?|60\s*months?)\b/i },
  { period: '7 years', regex: /\b(7\s*years?)\b/i },
  { period: '10 years', regex: /\b(10\s*years?|120\s*months?)\b/i },
  { period: 'indefinitely', regex: /\b(indefinitely|forever)\b/i },
  { period: 'until account deletion', regex: /\b(until.*?account.*?delet|until.*?delet|until.*?clos)\b/i },
]

export const USER_RIGHTS: {
  id: string
  label: string
  keywords: string[]
}[] = [
  { id: 'delete', label: 'Right to Delete Account', keywords: ['delete your account', 'delete your data', 'right to deletion', 'erase your', 'remove your account'] },
  { id: 'portability', label: 'Data Portability (Download Data)', keywords: ['data portability', 'download your data', 'export your data', 'receive your data'] },
  { id: 'correct', label: 'Right to Correct Information', keywords: ['correct your', 'update your', 'rectify', 'right to rectification'] },
  { id: 'withdraw', label: 'Withdraw Consent', keywords: ['withdraw consent', 'withdraw your consent', 'opt out', 'opt-out', 'revoke consent'] },
  { id: 'object', label: 'Right to Object', keywords: ['right to object', 'object to processing', 'opt out of sale', 'opt out of sharing'] },
  { id: 'dpo', label: 'Contact DPO / Privacy Officer', keywords: ['dpo', 'data protection officer', 'privacy officer', 'designated privacy'] },
  { id: 'appeal', label: 'Right to Appeal', keywords: ['appeal', 'contest', 'challenge'] },
]

export const SECURITY_PRACTICES: {
  id: string
  label: string
  keywords: string[]
}[] = [
  { id: 'encryption', label: 'Encryption', keywords: ['encrypt', 'encryption', 'encrypted', 'tls', 'ssl'] },
  { id: 'https', label: 'HTTPS', keywords: ['https', 'secure socket', 'transport security'] },
  { id: 'backup', label: 'Data Backup', keywords: ['backup', 'back up', 'redundancy', 'disaster recovery'] },
  { id: 'access_control', label: 'Access Control', keywords: ['access control', 'access restriction', 'authorization', 'role-based'] },
  { id: 'authentication', label: 'Authentication', keywords: ['authentication', 'password', 'two-factor', '2fa', 'multi-factor', 'mfa'] },
  { id: 'audits', label: 'Security Audits', keywords: ['security audit', 'penetration test', 'vulnerability assessment', 'soc 2', 'iso 27001'] },
  { id: 'incident_response', label: 'Incident Response', keywords: ['incident response', 'data breach', 'security incident', 'notification of breach'] },
]

export const POLICY_RULES: PolicyRule[] = [
  {
    id: 'rule_sell_data',
    category: 'dangerous',
    pattern: 'sell.*?personal|sell.*?data|sell.*?information|sale.*?personal|transfer.*?sell',
    isRegex: true,
    riskDelta: 45,
    description: 'Policy mentions selling personal information',
    severity: 'critical',
  },
  {
    id: 'rule_share_advertisers',
    category: 'third_party',
    pattern: 'share.*?advertiser|advertiser.*?share|ad.*?network.*?share|marketing.*?partner',
    isRegex: true,
    riskDelta: 25,
    description: 'Policy shares data with advertisers',
    severity: 'high',
  },
  {
    id: 'rule_share_third_party',
    category: 'third_party',
    // data words must be near "share" — "revenue share partners" is money, not data
    pattern: '(share|sharing).{0,40}(data|information|personal|your|user).{0,30}(third.party|partner)|(third.party|partner).{0,50}(share|sharing).{0,40}(data|information|personal|your|user)',
    isRegex: true,
    riskDelta: 20,
    description: 'Policy mentions sharing with third parties or partners',
    severity: 'medium',
  },
  {
    id: 'rule_retain_indefinitely',
    category: 'retention',
    pattern: 'indefinitely|forever|retain.*?without.{0,40}(end|limit|time|period)',
    isRegex: true,
    riskDelta: 25,
    description: 'Data is retained indefinitely or without a clear end date',
    severity: 'high',
  },
  {
    id: 'rule_precise_location',
    category: 'data_collection',
    pattern: 'precise location|gps location|geo-location|geolocation',
    isRegex: true,
    riskDelta: 20,
    description: 'Policy mentions collecting precise location data',
    severity: 'medium',
  },
  {
    id: 'rule_biometric',
    category: 'data_collection',
    pattern: 'biometric|face\\s+(recognition|print|scan)|voiceprint|voice\\s+print|iris\\s+scan|fingerprint\\s+(data|scan|recognition|authentication)',
    isRegex: true,
    riskDelta: 30,
    description: 'Policy mentions collecting biometric data',
    severity: 'high',
  },
  {
    id: 'rule_health_data',
    category: 'data_collection',
    pattern: 'health data|medical data|health information',
    isRegex: true,
    riskDelta: 35,
    description: 'Policy mentions collecting health or medical data',
    severity: 'high',
  },
  {
    id: 'rule_children_data',
    category: 'data_collection',
    pattern: 'collect.*(children|minors?)|(children|minors?).*(collect|personal information|personal data)|knowingly.*(children|minors?)|solicit.*(children|minors?)',
    isRegex: true,
    riskDelta: 20,
    description: 'Policy mentions collecting children\'s data',
    severity: 'medium',
  },
  {
    id: 'rule_cross_border',
    category: 'dangerous',
    // data-word prefix keeps "users located outside the EEA" from matching
    pattern: 'cross.border|third.country|transfer.{0,80}(international|abroad|outside)|(abroad|international).{0,60}transfer|(data|information|process|store|transfer|collect)(ed|ing)?[^.]{0,50}outside\\s+the\\s+(eea|european\\s+economic\\s+area|eu\\b|united\\s+kingdom|uk\\b)',
    isRegex: true,
    riskDelta: 15,
    description: 'Policy mentions cross-border data transfers',
    severity: 'medium',
  },
  {
    id: 'rule_government_requests',
    category: 'dangerous',
    pattern: 'government.{0,60}(request|demand|require|share|disclos)|law enforcement.{0,60}(request|share|disclos)|subpoena|court order|legal process',
    isRegex: true,
    riskDelta: 15,
    description: 'Policy mentions government or law enforcement data requests',
    severity: 'medium',
  },
  {
    id: 'rule_behavioral_profiling',
    category: 'dangerous',
    pattern: 'behavioral.*?profil|profil.*?behavioral|automated.*?decision|profiling',
    isRegex: true,
    riskDelta: 20,
    description: 'Policy mentions behavioral profiling or automated decision-making',
    severity: 'high',
  },
  {
    id: 'rule_no_deletion',
    category: 'dangerous',
    // bounded: "no" must be within ~120 chars of "delete*" and not any
    // stray "no" in a word like "non-licensed" hundreds of chars earlier.
    // The lookahead skips protective "no fee/charge to delete" sentences,
    // which flagged model deletion policies as "data cannot be deleted".
    pattern: '\\bno\\b(?!\\s*(?:fee|charge|cost|penalty)).{0,120}?\\bdelet|cannot.{0,120}?\\bdelet|may not.{0,120}?\\bdelet|without.{0,120}?\\bdelet',
    isRegex: true,
    riskDelta: 25,
    description: 'Policy states data cannot be deleted',
    severity: 'high',
  },
  {
    id: 'rule_advertising_cookies',
    category: 'cookies',
    pattern: 'advertising cookie|ad cookie|targeting cookie|marketing cookie',
    isRegex: true,
    riskDelta: 15,
    description: 'Policy mentions advertising/targeting cookies',
    severity: 'medium',
  },
  {
    id: 'rule_encryption_present',
    category: 'security',
    pattern: 'encrypt',
    riskDelta: -15,
    description: 'Policy mentions encryption of user data',
    severity: 'low',
  },
  {
    id: 'rule_delete_account_present',
    category: 'rights',
    pattern: 'delete your account|delete your data|request deletion|erase your data|right to erasure|right to be forgotten|right to deletion',
    isRegex: true,
    riskDelta: -20,
    description: 'Policy grants users the right to delete their account/data',
    severity: 'low',
  },
  {
    id: 'rule_gdpr_ccpa_rights',
    category: 'rights',
    pattern: 'gdpr|ccpa|cpra|data subject right|california consumer|california privacy rights|general data protection regulation',
    isRegex: true,
    riskDelta: -10,
    description: 'Policy references GDPR or CCPA user rights',
    severity: 'low',
  },
  {
    id: 'rule_third_party_sale',
    category: 'dangerous',
    pattern: 'sale of personal|sell.*?personal information|personal information.*?sell',
    isRegex: true,
    riskDelta: 45,
    description: 'Policy mentions sale of personal information',
    severity: 'critical',
  },
  {
    id: 'rule_sensitive_data',
    category: 'data_collection',
    pattern: '(collect|process|obtain|gather|store|use).{0,80}\\b(racial?|ethnic origin|religious|political opinion|sexual orientation|union membership)\\b',
    isRegex: true,
    riskDelta: 15,
    description: 'Policy mentions collection of sensitive personal data',
    severity: 'medium',
  },
  {
    id: 'rule_tracking_pixel',
    category: 'tracking',
    // "Pixel" alone is a common brand (Pixel phones) — require tracking context
    pattern: 'tracking pixel|web beacon|analytics pixel|pixel tag|\\bbeacons?\\b',
    isRegex: true,
    riskDelta: 15,
    description: 'Policy mentions tracking pixels or web beacons',
    severity: 'medium',
  },
  {
    id: 'rule_fingerprinting',
    category: 'tracking',
    // "browser information"/"user agent" are routine metadata, not fingerprinting;
    // bare "fingerprint" is caught by the biometric rule when data-related
    pattern: 'device fingerprint|browser fingerprint|canvas fingerprint|fingerprinting',
    isRegex: true,
    riskDelta: 20,
    description: 'Policy mentions fingerprinting or device identification',
    severity: 'high',
  },
  {
    id: 'rule_advertising_sharing',
    category: 'third_party',
    pattern: 'advertising.*?partner|marketing.*?partner|ads.*?share|share.*?ads',
    isRegex: true,
    riskDelta: 20,
    description: 'Policy mentions advertising or marketing partners',
    severity: 'medium',
  },
  {
    id: 'rule_cookie_tracking',
    category: 'cookies',
    pattern: 'tracking cookie|targeting cookie|ad cookie|advertising cookie',
    isRegex: true,
    riskDelta: 10,
    description: 'Policy mentions tracking or advertising cookies',
    severity: 'low',
  },
  // ---- sensitive data types ----
  { id: 'rule_government_ids', category: 'data_collection', pattern: 'social security number|\\bssn\\b|passport number|driver.?s\\s+license|drivers license|national identification|government.{0,20}(issued|id)|taxpayer identification', isRegex: true, riskDelta: 25, description: 'Policy mentions collecting government-issued identification', severity: 'high' },
  { id: 'rule_payment_info', category: 'data_collection', pattern: 'credit card|debit card|payment card|card number|\\bcvv\\b|cardholder|billing information', isRegex: true, riskDelta: 15, description: 'Policy mentions collecting payment card information', severity: 'medium' },
  { id: 'rule_employment_income', category: 'data_collection', pattern: 'employment.{0,30}(data|information|status|history)|income.{0,20}(data|information)|salary|job.{0,20}(application|history)', isRegex: true, riskDelta: 15, description: 'Policy mentions collecting employment or income data', severity: 'medium' },
  { id: 'rule_messages_content', category: 'data_collection', pattern: 'message content|content of your messages|content of messages|private messages|direct messages|email content|email contents|chat content|communications content|content of your communications', isRegex: true, riskDelta: 20, description: 'Policy mentions collecting message or communication content', severity: 'medium' },
  { id: 'rule_browsing_history', category: 'data_collection', pattern: 'browsing history|browser history|web history|search history|websites you visit|pages you visit|sites you visit|viewed pages', isRegex: true, riskDelta: 20, description: 'Policy mentions collecting browsing history', severity: 'medium' },
  { id: 'rule_device_identifiers', category: 'data_collection', pattern: 'advertising id|advertising identifier|identifier for advertising|\\bad\\s+id\\b|\\bidfa\\b|\\bgaid\\b|device id|device identifier|unique device|\\bimei\\b|mac address', isRegex: true, riskDelta: 15, description: 'Policy mentions advertising IDs or device identifiers', severity: 'medium' },
  { id: 'rule_keystroke', category: 'tracking', pattern: 'keystroke|key stroke|keystrokes|key strokes|keyboard input|key logging|keylogging|keystroke logging|typing pattern', isRegex: true, riskDelta: 25, description: 'Policy mentions keystroke or keyboard-input tracking', severity: 'high' },
  // ---- dangerous clauses ----
  { id: 'rule_arbitration', category: 'dangerous', pattern: 'binding arbitration|mandatory arbitration|forced arbitration|arbitration clause|arbitrate|you agree.{0,60}arbitration|resolve.{0,50}(through|by)\\s+(binding\\s+)?arbitration', isRegex: true, riskDelta: 15, description: 'Policy includes a mandatory arbitration clause', severity: 'medium' },
  { id: 'rule_forced_consent', category: 'dangerous', pattern: 'by using (our|the).{0,40}(site|service|website|app|application|platform)\\b.{0,60}(consent|agree)|by accessing.{0,40}(site|service|website|app)\\b.{0,60}(consent|agree)|continuing to use.{0,60}(consent|agree)|use of (our|the).{0,30}(site|service|website|app)\\b.{0,40}constitutes.{0,30}(consent|agreement)', isRegex: true, riskDelta: 15, description: 'Policy takes consent by continued use of the service', severity: 'medium' },
  { id: 'rule_class_action_waiver', category: 'dangerous', pattern: 'class action.{0,60}(waiv|arbitrat|prohibit)|waive.{0,60}class action|class action waiver|collective action.{0,60}waiv|representative action.{0,60}waiv', isRegex: true, riskDelta: 15, description: 'Policy waives class action rights', severity: 'medium' },
  // ---- protections ----
  { id: 'rule_data_minimization', category: 'security', pattern: 'data minimization|minimize.{0,40}(data|collect)|collect.{0,30}only.{0,40}necessary|only.{0,30}necessary.{0,30}(data|information|personal)|as little.{0,40}(data|information)', isRegex: true, riskDelta: -15, description: 'Policy commits to data minimization', severity: 'low' },
  { id: 'rule_breach_notification', category: 'security', pattern: 'breach.{0,60}notif|notif.{0,60}breach|notify.{0,60}(affected|regulators?)|data breach.{0,60}(inform|report|contact)|breach notification', isRegex: true, riskDelta: -15, description: 'Policy commits to breach notification', severity: 'low' },
  { id: 'rule_encryption_at_rest', category: 'security', pattern: 'encrypt(ed)?[^.]{0,25}at\\s+rest|at[- ]?rest\\s+encryption|encryption\\s+at\\s+rest', isRegex: true, riskDelta: -10, description: 'Policy mentions encryption of data at rest', severity: 'low' },
  { id: 'rule_dpo_present', category: 'rights', pattern: 'data protection officer|\\bdpo\\b|privacy officer|privacy contact', isRegex: true, riskDelta: -10, description: 'Policy provides a data protection officer or privacy contact', severity: 'low' },
  { id: 'rule_explicit_consent', category: 'rights', pattern: 'explicit consent|express consent|affirmative consent|prior consent|obtain your consent|ask for your consent|consent before', isRegex: true, riskDelta: -10, description: 'Policy requires explicit consent', severity: 'low' },
  // ---- user rights ----
  { id: 'rule_right_access', category: 'rights', pattern: 'right to access|right of access|access your (personal )?(data|information)|request a copy|obtain a copy', isRegex: true, riskDelta: -10, description: 'Policy grants the right to access personal data', severity: 'low' },
  { id: 'rule_right_portability', category: 'rights', pattern: 'data portability|right to portability|right to receive your data', isRegex: true, riskDelta: -10, description: 'Policy grants data portability rights', severity: 'low' },
  { id: 'rule_right_objection', category: 'rights', pattern: 'right to object|object to (the )?(processing|sale|sharing|use)|right to opt out of (the )?(sale|sharing)|opt out of (the )?sale|do not sell my (personal )?(data|information)', isRegex: true, riskDelta: -10, description: 'Policy grants objection or opt-out rights', severity: 'low' },
  { id: 'rule_do_not_sell_signals', category: 'rights', pattern: 'global privacy control|\\bgpc\\b|honor.{0,30}(do not sell|gpc|global privacy)|do not sell.{0,40}(signal|request|preference)', isRegex: true, riskDelta: -10, description: 'Policy honors do-not-sell or GPC signals', severity: 'low' },
]

export const SECTION_HEADINGS: { name: string; patterns: RegExp[] }[] = [
  { name: 'data_collection', patterns: [/information we collect/i, /what we collect/i, /data we collect/i, /collection of/i, /personal data/i] },
  { name: 'usage', patterns: [/how we use/i, /use of data/i, /use your information/i, /purpose/i, /how we process/i] },
  { name: 'cookies', patterns: [/cookies/i, /cookie policy/i, /tracking technolog/i, /tracking/i] },
  { name: 'third_parties', patterns: [/third.?part/i, /third party/i, /partners/i, /service providers/i, /sharing/i] },
  { name: 'advertising', patterns: [/advertis/i, /marketing/i, /targeting/i, /ad.*?personaliz/i] },
  { name: 'retention', patterns: [/retention/i, /how long/i, /data.*?retention/i, /store/i, /time.*?retain/i] },
  { name: 'rights', patterns: [/right to/i, /your right/i, /data subject/i, /opt.?out/i, /opt out/i, /withdraw/i] },
  { name: 'security', patterns: [/security/i, /protect/i, /safeguard/i, /encrypt/i, /access control/i] },
  { name: 'children', patterns: [/children/i, /minor/i, /under 13/i, /under 16/i, /under 18/i, /coppa/i] },
  { name: 'international', patterns: [/international/i, /transfer.*?abroad/i, /transfer.*?outside/i, /countries/i] },
  { name: 'contact', patterns: [/contact/i, /privacy officer/i, /dpo/i, /email.*?privacy/i, /data controller/i] },
  { name: 'updates', patterns: [/update/i, /change.*?policy/i, /revis/i, /modification/i] },
]

export const TRANSPARENCY_TOPICS: {
  id: string
  label: string
  patterns: RegExp[]
  points: number
}[] = [
  { id: 'purpose', label: 'Explains why data is collected', patterns: [/why.*?collect/i, /purpose.*?collect/i, /reason.*?collect/i, /use.*?data/i, /how.*?use/i], points: 20 },
  { id: 'recipients', label: 'Identifies who receives data', patterns: [/who.*?receive/i, /third.?part/i, /recipient/i, /with.*?share/i, /with.*?disclose/i], points: 20 },
  { id: 'retention_period', label: 'States retention period', patterns: [/retain.*?for/i, /keep.*?for/i, /stored.*?for/i, /retention/i], points: 20 },
  { id: 'deletion', label: 'Explains deletion process', patterns: [/delet/i, /remov.*?data/i, /dispos/i], points: 20 },
  { id: 'user_rights', label: 'Describes user rights', patterns: [/right.*?access/i, /right.*?delet/i, /right.*?rectif/i, /data subject/i], points: 20 },
  { id: 'contact', label: 'Provides contact details', patterns: [/contact.{0,80}(email|officer|dpo|form|@)|(privacy|data protection).{0,40}contact/i, /email.{0,40}privacy|privacy.{0,40}email/i], points: 20 },
]

export const NEGATION_RULES: { patterns: RegExp[]; categories: string[] }[] = [
  { patterns: [
      /do\s+not\s+sell/i, /does\s+not\s+sell/i, /don\'t\s+sell/i,
      /never\s+sell/i, /will\s+not\s+sell/i, /won\'t\s+sell/i,
      /do\s+not\s+share/i, /does\s+not\s+share/i, /don\'t\s+share/i, /won\'t\s+share/i,
      /not\s+sell|not\s+share|no\s+sale|no\s+selling/i,
      /does\s+not\s+constitute\s+a\s+sale|is\s+not\s+a\s+sale|not\s+sold|never\s+sold|not\s+being\s+sold/i,
      // CCPA/GDPR opt-out wording is a user right, not evidence of selling:
      // "right to opt out of the sale of your personal information"
      /\bopt\s+out\s+of\s+(the\s+)?(sale|sale\s+of\s+personal|sharing|selling)|right\s+to\s+opt\s+out\s+of\s+(the\s+)?(sale|sharing)/i
    ],
    categories: ['dangerous', 'third_party']
  },
  { patterns: [
      /do\s+not\s+sell\s+your\s+personal/i, /do\s+not\s+share\s+your/i,
      /you\s+may\s+not\s+sell/i, /you\s+will\s+not\s+sell/i,
      /we\s+do\s+not\s+sell/i, /we\s+do\s+not\s+share/i
    ],
    categories: ['dangerous', 'third_party', 'cookies']
  },
  { patterns: [
      /do\s+not\s+(knowingly\s+)?collect/i, /does\s+not\s+(knowingly\s+)?collect/i,
      /never\s+collect/i, /won\'t\s+collect/i, /will\s+not\s+collect/i,
      /no\s+longer\s+collect/i, /do\s+not\s+solicit/i, /not\s+collect/i,
      /not\s+directed\s+to\s+children|not\s+intended\s+for\s+children|not\s+designed\s+for\s+children/i,
      // age-gate phrasing ("only 13+", "must be at least 13") is not collection
      /under[.\s\-\/]?(13|16|18)\b|at\s+least\s+(13|16|18)\b|must\s+be\s+(13|16|18)\b|\bage\s+(13|16|18)\b|aged\s+(13|16|18)\b/i
    ],
    categories: ['data_collection']
  },
  { patterns: [
      // GDPR-good retention phrasing is not "indefinite retention":
      // "we retain data only as long as necessary"
      /do\s+not\s+retain\s+(your\s+)?(data|information|personal)\s+indefinitely/i,
      /not\s+retain\s+indefinitely|never\s+retain\s+indefinitely/i,
      /retain[^.]{0,60}only\s+as\s+long\s+as\s+(necessary|required|needed|legally)/i,
      /as\s+long\s+as\s+(necessary|required|needed|legally\s+required)[^.]{0,60}retain/i,
      /no\s+longer\s+than\s+necessary|not\s+longer\s+than\s+necessary/i
    ],
    categories: ['retention']
  },
  { patterns: [
      /do\s+not\s+use\s+(browser\s+)?(fingerprint|fingerprinting)/i, /no\s+fingerprinting/i,
      /does\s+not\s+use\s+(browser\s+)?(fingerprint|fingerprinting)/i,
      /not\s+be\s+used\s+for\s+fingerprinting/i
    ],
    categories: ['tracking']
  },
  { patterns: [
      /do\s+not\s+transfer|will\s+not\s+transfer|won\'t\s+transfer|no\s+transfer/i,
      /not\s+transfer\s+(your|personal|data)/i, /we\s+never\s+transfer/i
    ],
    categories: ['dangerous', 'third_party']
  },
  { patterns: [
      /do\s+not\s+engage\s+in\s+(behavioral\s+)?profiling|no\s+profiling|no\s+behavioral\s+profiling/i,
      /prohibit\s+profiling|does\s+not\s+profile/i,
      /human\s+review|request\s+human|right\s+to\s+object[^.]{0,60}automated/i
    ],
    categories: ['dangerous', 'data_collection']
  },
  { patterns: [
      /no\s+longer\s+(need|require|use|retain|store|hold)[^.]{0,80}?\bdelet/i,
      /once\s+no\s+longer\s+needed[^.]{0,80}?\bdelet/i
    ],
    categories: ['dangerous', 'data_collection']
  },
  { patterns: [
      /do\s+not\s+(process|store|use|obtain|gather|read|access|monitor)\b|does\s+not\s+(process|store|use|obtain|gather|read|access|monitor)\b|will\s+not\s+(process|store|use|obtain|gather|read|access|monitor)\b|won\'t\s+(process|store|use|obtain|gather|read|access|monitor)\b/i
    ],
    categories: ['data_collection', 'dangerous']
  },
  { patterns: [
      /do\s+not\s+use\s+automated|does\s+not\s+use\s+automated|will\s+not\s+use\s+automated|no\s+automated\s+decision|do\s+not\s+make\s+automated/i
    ],
    categories: ['dangerous', 'data_collection']
  },
  { patterns: [
      /do\s+not\s+(track|record|monitor|log|use)\s+keystrokes?|no\s+keystrokes?/i
    ],
    categories: ['tracking']
  },
  { patterns: [
      // Explicit cookie disclaimers are the ONLY way a 'cookies' rule can be
      // negated ("we do not use advertising or targeting cookies") — without
      // this group, policies that explicitly disclaim ad cookies got penalized.
      /do(?:es)?\s+not\s+(?:use|set|serve|place|employ)[^.]{0,60}\bcookies?\b/i,
      /no\s+(advertising|targeting|tracking|third[-\s]?party)\s+cookies?\b/i,
      /(advertising|targeting|tracking)\s+cookies?\s+(are|is)\s+not\s+used/i,
      /cookies?\s+are\s+strictly\s+necessary|only\s+(?:use\s+)?strictly\s+necessary\s+cookies/i
    ],
    categories: ['cookies']
  },
]

export const KNOWN_THIRD_PARTIES: { name: string; category: string; confidence: number }[] = [
  { name: 'Google Analytics', category: 'analytics', confidence: 95 },
  { name: 'Facebook', category: 'social', confidence: 95 },
  { name: 'Meta', category: 'social', confidence: 90 },
  { name: 'Twitter', category: 'social', confidence: 95 },
  { name: 'Instagram', category: 'social', confidence: 95 },
  { name: 'LinkedIn', category: 'social', confidence: 95 },
  { name: 'TikTok', category: 'social', confidence: 95 },
  { name: 'Pinterest', category: 'social', confidence: 90 },
  { name: 'Snapchat', category: 'social', confidence: 90 },
  { name: 'AWS', category: 'cloud', confidence: 95 },
  { name: 'Amazon Web Services', category: 'cloud', confidence: 95 },
  { name: 'Microsoft Azure', category: 'cloud', confidence: 95 },
  { name: 'Google Cloud', category: 'cloud', confidence: 95 },
  { name: 'Cloudflare', category: 'cloud', confidence: 95 },
  { name: 'Stripe', category: 'payment', confidence: 95 },
  { name: 'PayPal', category: 'payment', confidence: 95 },
  { name: 'AdSense', category: 'advertising', confidence: 95 },
  { name: 'DoubleClick', category: 'advertising', confidence: 95 },
  { name: 'Facebook Pixel', category: 'tracking', confidence: 90 },
  { name: 'Hotjar', category: 'analytics', confidence: 90 },
  { name: 'Mixpanel', category: 'analytics', confidence: 95 },
  { name: 'Segment', category: 'analytics', confidence: 95 },
  { name: 'Amplitude', category: 'analytics', confidence: 90 },
  { name: 'Fastly', category: 'cloud', confidence: 90 },
  { name: 'DigitalOcean', category: 'cloud', confidence: 90 },
]
