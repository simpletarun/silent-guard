const test = require('node:test')
const assert = require('node:assert/strict')

const { isLikelyPolicyText } = require('./build/src/background/monitors/policyMonitor.js')

const REAL_POLICY = `We respect your privacy. This privacy policy explains how we collect, use and share your
personal information. When you visit our services we may collect your name, email address and
usage data. We use cookies to improve your experience. You may delete your account at any time by
contacting our data protection officer. We implement industry standard encryption (TLS) and take
security measures including access control. We do not sell your personal data to third parties.
Data retention: we keep your information only as long as necessary. Your rights include data
portability, the right to object to processing, and the right to withdraw consent. Please contact
support if you have any questions. This policy may change from time to time and we will notify
you of material changes. `.repeat(15)

test('accepts a real-length privacy policy', () => {
  assert.equal(isLikelyPolicyText(REAL_POLICY), true)
})

test('rejects bot-protection / consent wall pages', () => {
  const junk = `<html><body>Just a moment... Please enable JavaScript and cookies.
    We are checking your browser before proceeding. Verify you are human.</body></html>`
  assert.equal(isLikelyPolicyText(junk), false)
})

test('rejects short fragments regardless of content', () => {
  assert.equal(isLikelyPolicyText('Enable JavaScript and reload to continue. Privacy.'), false)
  assert.equal(isLikelyPolicyText('short page with only a few words in it'), false)
})

test('rejects HTML that is mostly navigation junk', () => {
  const thin = `<html><header>Menu Home Products Pricing About</header>
<footer>Terms Privacy Contact Job openings Careers</footer><body>please wait</body></html>`
  assert.equal(isLikelyPolicyText(thin), false)
})

test('captcha mentioned deep inside a real policy is not a bot wall', () => {
  const body = `${REAL_POLICY.slice(0, 1200)}${' Additional detail about our data practices follows here. '.repeat(30)}Our systems may present a captcha challenge to prevent automated abuse of the services.`
  assert.equal(isLikelyPolicyText(body), true)
})

test('short vocabulary-dense summary policy passes the adaptive floor', () => {
  const sentence = 'We collect personal information, use cookies and consent tools, honor opt out requests under gdpr and ccpa, apply data protection safeguards, retain records, share with third-party processors, disclose data subject rights. '
  const denseShort = sentence.repeat(9) // ~280 words, >4 distinct signals
  assert.equal(isLikelyPolicyText(denseShort), true)
})

test('equally long text with thin vocabulary still fails the full floor', () => {
  const thinLong = 'Your privacy matters and our cookie settings help. We discuss retention schedules. '.repeat(18) // ~300 words, 3 signals
  assert.equal(isLikelyPolicyText(thinLong), false)
})

test('Swedish policy clears the gate', () => {
  const sv = 'Vi respekterar din integritetspolicy och behandlar personuppgifter enligt gdpr. Vi samlar in personuppgifter nar du anvander varja tjanster och anvander cookies efter samtycke. Du kan begara ut eller radera dina personuppgifter genom att kontakta dataskyddsansvarige. Denna integritetspolicy beskriver aven lagring och dina rattigheter. '
  assert.equal(isLikelyPolicyText(sv.repeat(8)), true)
})

test('rejects a long terms-of-service page without privacy vocabulary', () => {
  const tos = `Section 1. License Grant. We grant you a revocable, non-exclusive license to use the software. You may not modify, redistribute or reverse engineer our software. Section 2. Termination. We may terminate your access at any time. Section 3. Indemnification. You agree to defend and hold harmless the company from any claims. Section 4. Liability. Our aggregate liability is limited to the amount you paid. Section 5. Warranty Disclaimer. The software is provided as-is without warranty of any kind. Section 6. Governing Law. These terms are governed by the laws of the State of Delaware. Section 7. Changes. We may modify these terms and will post the updated version here.`.repeat(20)
  assert.equal(isLikelyPolicyText(tos), false)
})

test('accepts a policy page that also contains some legal boilerplate', () => {
  const mixed = `${REAL_POLICY} Section 1. License Grant. We grant you a revocable license to use the website. Section 2. Indemnification. You agree to indemnify the company. `.repeat(2)
  assert.equal(isLikelyPolicyText(mixed), true)
})

const { analyzePolicy } = require('./build/src/policy/analyzer.js')

test('retention: plain "keep" mention is not flagged as excessive', () => {
  const text = `We keep your information secure and retain it as described in our records. We value your business.`
  const rep = analyzePolicy('keep.example', text, 'https://keep.example/privacy')
  assert.equal(rep.retention.isExcessive, false)
  assert.equal(rep.retention.period, 'unspecified')
})

test('retention: "as long as necessary" is GDPR-good, not excessive', () => {
  const text = `We retain your personal data for as long as necessary to provide our services.`
  const rep = analyzePolicy('necessary.example', text, 'https://necessary.example/privacy')
  assert.equal(rep.retention.isExcessive, false)
  assert.equal(rep.retention.period, 'as long as necessary')
})

test('retention: specific period wins over generic mention', () => {
  const text = `We retain logs for 30 days and may keep other data as required.`
  const rep = analyzePolicy('days.example', text, 'https://days.example/privacy')
  assert.equal(rep.retention.period, '30 days')
  assert.equal(rep.retention.isExcessive, false)
})

test('retention: negated sentence ("no retention beyond...") is not flagged', () => {
  const text = `We do not retain your personal data after account closure. We value your privacy and never sell information to third parties. `.repeat(6)
  const rep = analyzePolicy('negate.example', text, 'https://negate.example/privacy')
  assert.equal(rep.retention.isExcessive, false)
})

test('negation: "we do not sell" elsewhere does not hide a real selling clause', () => {
  const text = `We do not sell your personal information. We do, however, sell your personal data to selected advertising partners.`
  const rep = analyzePolicy('sell.example', text, 'https://sell.example/privacy')
  const selling = rep.matchedRules.filter(r => r.id === 'rule_sell_data' || r.id === 'rule_third_party_sale')
  assert.ok(selling.length > 0, 'selling rule must still match within its own sentence')
})

test('negation: "we do not sell" suppresses sell rule in the same sentence', () => {
  const text = `We do not sell your personal information and never share it with advertisers.`
  const rep = analyzePolicy('nosell.example', text, 'https://nosell.example/privacy')
  assert.ok(rep.matchedRules.every(r => r.id !== 'rule_sell_data' && r.id !== 'rule_third_party_sale'))
})

test('negation: "does not constitute a sale" is not flagged as selling', () => {
  const text = `This does not constitute a sale or other restricted transfer of your personal information.`
  const rep = analyzePolicy('constitute.example', text, 'https://constitute.example/privacy')
  assert.ok(rep.matchedRules.every(r => r.id !== 'rule_sell_data' && r.id !== 'rule_third_party_sale'))
})

test('children: protective COPPA statement is not flagged as collecting children data', () => {
  const text = `Our services are not directed to children under 13 and we do not knowingly collect personal information from minors.`
  const rep = analyzePolicy('coppa.example', text, 'https://coppa.example/privacy')
  assert.ok(rep.matchedRules.every(r => r.id !== 'rule_children_data'))
})

test('children: affirmative collection statement IS flagged', () => {
  const text = `We collect personal information from children who use our kids platform.`
  const rep = analyzePolicy('kids.example', text, 'https://kids.example/privacy')
  assert.ok(rep.matchedRules.some(r => r.id === 'rule_children_data'))
})

test('same sentence is not double-penalized by overlapping sell rules', () => {
  const text = `We sell your personal information to third parties.`
  const rep = analyzePolicy('dupe.example', text, 'https://dupe.example/privacy')
  const penalties = rep.matchedRules.filter(r => r.riskDelta === 45)
  assert.equal(penalties.length, 1, 'only one −45 sell penalty per sentence')
})

test('interleaved same-category rules cannot re-hit an already-penalized sentence', () => {
  // sell(S1) → profiling(S2) → third_party_sale(S1 again): the single-slot
  // dedupe used to let S1 count twice (−90 instead of −45).
  const text = `We sell your personal information to data brokers. Our systems perform behavioral profiling of users. We also sell your information for advertising purposes.`
  const rep = analyzePolicy('interleave.example', text, 'https://interleave.example/privacy')
  const s1Penalties = rep.matchedRules.filter(r => r.riskDelta === 45)
  assert.equal(s1Penalties.length, 1, `expected one −45 penalty, got ${s1Penalties.length}`)
})

test('"no fee to delete" is not flagged as inability to delete', () => {
  const text = `You may delete your account at any time; there is no fee to delete your personal data. We retain your data for 30 days after deletion.`
  const rep = analyzePolicy('nofee.example', text, 'https://nofee.example/privacy')
  assert.ok(rep.matchedRules.every(r => r.id !== 'rule_no_deletion'), '"no fee to delete" must not fire rule_no_deletion')
})

test('retention: "6 months" is parsed as a specific period', () => {
  const text = `We retain your personal data for 6 months after account closure.`
  const rep = analyzePolicy('sixmo.example', text, 'https://sixmo.example/privacy')
  assert.equal(rep.retention.period, '6 months')
  assert.equal(rep.retention.isExcessive, false)
})

test('clauses respect negation: license-grant sentence is not a dangerous clause', () => {
  const text = `You retain ownership of your content. This does not constitute a sale or other restricted transfer of your personal information. Section 5. License Grant.`
  const rep = analyzePolicy('license.example', text, 'https://license.example/privacy')
  const bad = rep.dangerousClauses.filter(c => /sale|sell/i.test(c.text))
  assert.deepEqual(bad, [], 'negated sentence must not appear in clause preview')
  assert.ok(rep.matchedRules.every(r => r.id !== 'rule_sell_data'))
})

test('children: "under 13" age gate is not flagged as children data collection', () => {
  const text = `You must be at least 13 years old to use our site. We do not collect data from children under 13. We are not directed to children.`
  const rep = analyzePolicy('agegate.example', text, 'https://agegate.example/privacy')
  assert.ok(rep.matchedRules.every(r => r.id !== 'rule_children_data'))
})

test('no-deletion rule does not match stray "no" across sentences', () => {
  const text = `If you are a non-licensed user, you grant us a worldwide royalty-free license for your content. You may delete your account at any time by contacting our data protection officer. We retain your data for 30 days.`
  const rep = analyzePolicy('license2.example', text, 'https://license2.example/privacy')
  assert.ok(rep.matchedRules.every(r => r.id !== 'rule_no_deletion'))
})

test('opt-out right sentence is not flagged as selling', () => {
  const text = `Some states give residents the right to opt out of the sale of their personal information. We do not sell your personal information and we never share it.`
  const rep = analyzePolicy('ccpa.example', text, 'https://ccpa.example/privacy')
  assert.ok(rep.matchedRules.every(r => r.id !== 'rule_sell_data' && r.id !== 'rule_third_party_sale'))
})

test('regexes do not match across sentence boundaries', () => {
  const text = `The "Ads Data" section explains our ad experience. We share personal information with advertising partners for relevance.`
  const rep = analyzePolicy('bounds.example', text, 'https://bounds.example/privacy')
  for (const m of rep.matchedRules) {
    assert.ok(!/\.\s|!\s|\?\s/.test(m.evidence), `evidence must not span sentence boundaries: ${m.evidence}`)
  }
})

test('product name "Pixel" is not flagged as tracking pixel', () => {
  const text = `Pixel devices keep you safer both online and in the physical world. Pixel phones include built-in security chips.`
  const rep = analyzePolicy('pixel.example', text, 'https://pixel.example/privacy')
  assert.ok(rep.matchedRules.every(r => r.id !== 'rule_tracking_pixel'))
})

test('genuine web beacon mention still flags tracking', () => {
  const text = `We and our partners may place tracking pixels or web beacons in our emails to measure engagement.`
  const rep = analyzePolicy('beacon.example', text, 'https://beacon.example/privacy')
  assert.ok(rep.matchedRules.some(r => r.id === 'rule_tracking_pixel'))
})

test('recommendation wording matches actual risk level', () => {
  const text = `We share data with partners and we keep your information indefinitely. Address: 1 Main St, Anytown USA.`
  const rep = analyzePolicy('risky.example', text, 'https://risky.example/privacy')
  if (rep.riskLevel === 'risky') {
    assert.match(rep.recommendation, /risky privacy policy/)
  }
})

test('clause preview is centered on the flagged phrase, not the sentence start', () => {
  const text = `Navigation Features Advanced Security Settings Page Overview Privacy Report Tool expands so we sell your personal information to third-party partners for advertising purposes. We also keep it forever.`
  const rep = analyzePolicy('snippet.example', text, 'https://snippet.example/privacy')
  const clause = rep.dangerousClauses.find((c) => (c.text || '').includes('sell your personal'))
  assert.ok(clause, 'sell clause present: ' + JSON.stringify(rep.dangerousClauses))
  assert.ok(clause.text.includes('sell your personal information'), 'clause text shows the flagged phrase: ' + clause.text)
  assert.ok(!clause.text.startsWith('Navigation'), 'clause does not start with a page heading: ' + clause.text)
})

test('several generic dangers but real protections still score above zero', () => {
  const text = `We share your data with partners. We may disclose records in response to a court order or legal process. We use encryption (TLS) to protect data in transit and you may delete your account at any time under GDPR. We do not sell your personal information and we do not collect data from children under 13.`
  const rep = analyzePolicy('mix.example', text, 'https://mix.example/privacy')
  assert.ok(rep.privacyScore >= 25, `expected score >= 25, got ${rep.privacyScore}`)
  assert.ok(rep.matchedRules.some(r => r.riskDelta > 0), 'threats still surfaced')
})

test('data: biometric collection (face/voice) is flagged', () => {
  const text = `We collect biometric data including face recognition and voiceprint scans for authentication.`
  const rep = analyzePolicy('bio.example', text, 'https://bio.example/privacy')
  const rule = rep.matchedRules.find(r => r.id === 'rule_biometric')
  assert.ok(rule, 'biometric rule must match')
  assert.ok(rule.riskDelta > 0)
})

test('negation: "we do not process biometric data" is not flagged', () => {
  const text = `We do not process biometric data such as face recognition or voiceprints.`
  const rep = analyzePolicy('nobio.example', text, 'https://nobio.example/privacy')
  assert.ok(rep.matchedRules.every(r => r.id !== 'rule_biometric' && r.id !== 'rule_fingerprinting'))
})

test('danger: cross-border transfer to third countries is flagged', () => {
  const text = `We may transfer your personal data to servers outside the EEA for processing.`
  const rep = analyzePolicy('border.example', text, 'https://border.example/privacy')
  assert.ok(rep.matchedRules.some(r => r.id === 'rule_cross_border'))
})

test('negation: "we do not transfer your data outside the EEA" is not flagged', () => {
  const text = `We do not transfer your data outside the EEA and we never share it with third countries.`
  const rep = analyzePolicy('noborder.example', text, 'https://noborder.example/privacy')
  assert.ok(rep.matchedRules.every(r => r.id !== 'rule_cross_border'))
})

test('danger: binding arbitration clause is flagged', () => {
  const text = `Any dispute arising from this agreement will be resolved through binding arbitration.`
  const rep = analyzePolicy('arb.example', text, 'https://arb.example/privacy')
  assert.ok(rep.matchedRules.some(r => r.id === 'rule_arbitration'))
})

test('protection: DPO contact is credited', () => {
  const text = `You may contact our data protection officer at privacy@example.com for any questions.`
  const rep = analyzePolicy('dpo.example', text, 'https://dpo.example/privacy')
  const rule = rep.matchedRules.find(r => r.id === 'rule_dpo_present')
  assert.ok(rule, 'DPO rule must match')
  assert.ok(rule.riskDelta < 0)
})

test('danger: take-it-or-leave-it consent phrase is flagged', () => {
  const text = `By using our service you agree to the collection and processing of your data.`
  const rep = analyzePolicy('consent.example', text, 'https://consent.example/privacy')
  assert.ok(rep.matchedRules.some(r => r.id === 'rule_forced_consent'))
})

test('protection: honoring do-not-sell signals is credited', () => {
  const text = `We honor do-not-sell signals such as the Global Privacy Control.`
  const rep = analyzePolicy('dns.example', text, 'https://dns.example/privacy')
  const rule = rep.matchedRules.find(r => r.id === 'rule_do_not_sell_signals')
  assert.ok(rule, 'do-not-sell rule must match')
  assert.ok(rule.riskDelta < 0)
})

test('data: government IDs are flagged', () => {
  const text = `We collect your social security number and passport number when you verify your identity.`
  const rep = analyzePolicy('govid.example', text, 'https://govid.example/privacy')
  assert.ok(rep.matchedRules.some(r => r.id === 'rule_government_ids'))
})

test('data: keystroke tracking is flagged', () => {
  const text = `We may monitor keystrokes and typing patterns to detect fraudulent activity.`
  const rep = analyzePolicy('keys.example', text, 'https://keys.example/privacy')
  assert.ok(rep.matchedRules.some(r => r.id === 'rule_keystroke'))
})

test('negation: "we do not use automated decision-making" is not flagged', () => {
  const text = `We do not use automated decision-making or profiling to evaluate you.`
  const rep = analyzePolicy('noauto.example', text, 'https://noauto.example/privacy')
  assert.ok(rep.matchedRules.every(r => r.id !== 'rule_behavioral_profiling'))
})

test('data: browsing history and device identifiers are flagged', () => {
  const text = `We collect your browsing history and search history. We also collect device identifiers such as advertising IDs.`
  const rep = analyzePolicy('browse.example', text, 'https://browse.example/privacy')
  assert.ok(rep.matchedRules.some(r => r.id === 'rule_browsing_history'))
  assert.ok(rep.matchedRules.some(r => r.id === 'rule_device_identifiers'))
})

test('protections: data minimization and at-rest encryption are credited', () => {
  const text = `We collect only the data necessary to provide our services. We encrypt data at rest and in transit.`
  const rep = analyzePolicy('protect.example', text, 'https://protect.example/privacy')
  for (const id of ['rule_data_minimization', 'rule_encryption_at_rest']) {
    const rule = rep.matchedRules.find(r => r.id === id)
    assert.ok(rule, `${id} must match`)
    assert.ok(rule.riskDelta < 0)
  }
})

test('score: stacked dangers stay within 0-100', () => {
  const text = `We sell your personal information to third parties. We transfer your data outside the EEA. Any dispute is resolved through binding arbitration. By using our service you agree to these terms. We waive class action rights. We collect biometric data, government IDs such as social security numbers, and keystrokes.`
  const rep = analyzePolicy('max.example', text, 'https://max.example/privacy')
  assert.ok(rep.privacyScore >= 0 && rep.privacyScore <= 100, `score out of range: ${rep.privacyScore}`)
})
const { cleanExcerpt } = require('./build/src/utils/excerpt.js')

test('cleanExcerpt cuts at word boundaries with an ellipsis', () => {
  const out = cleanExcerpt('alpha beta gamma delta epsilon zeta eta', 20)
  assert.equal(out, 'alpha beta gamma \u2026')
})

test('cleanExcerpt passes short text through and collapses whitespace', () => {
  assert.equal(cleanExcerpt('short text', 50), 'short text')
  assert.equal(cleanExcerpt('a\n\tb   c', 50), 'a b c')
  assert.equal(cleanExcerpt('', 10), '')
})

test('clause previews never start or end mid-word', () => {
  const text = `We sell your personal information to third parties. We collect biometric data, government IDs such as social security numbers, and precise location from your device GPS sensors at all times while sharing everything with select marketing partners who promote our products and services on third-party properties around the world.`.repeat(4)
  const rep = analyzePolicy('preview.example', text, 'https://preview.example/privacy')
  assert.ok(rep.dangerousClauses.length > 0, 'expected dangerous clauses')
  for (const c of rep.dangerousClauses) {
    assert.match(c.text, /^(\u2026 )?[A-Za-z"'(]/, `starts mid-word: "${c.text.slice(0, 40)}"`)
    assert.match(c.text, /[a-zA-Z0-9.!?)"]$|\u2026$/, `ends mid-word: "...${c.text.slice(-40)}"`)
  }
})
