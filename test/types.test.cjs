const test = require('node:test')
const assert = require('node:assert/strict')

const { getRiskLevel, getRiskLevelLabel, getRiskLevelColor } = require('./build/src/types/policy.js')

test('risk level thresholds are ordered correctly', () => {
  assert.equal(getRiskLevel(99), 'excellent')
  assert.equal(getRiskLevel(95), 'excellent')
  assert.equal(getRiskLevel(94), 'safe')
  assert.equal(getRiskLevel(80), 'safe')
  assert.equal(getRiskLevel(79), 'medium')
  assert.equal(getRiskLevel(60), 'medium')
  assert.equal(getRiskLevel(59), 'risky')
  assert.equal(getRiskLevel(40), 'risky')
  assert.equal(getRiskLevel(39), 'dangerous')
  assert.equal(getRiskLevel(0), 'dangerous')
})

test('labels and colors cover every level', () => {
  for (const l of ['excellent', 'safe', 'medium', 'risky', 'dangerous']) {
    assert.ok(getRiskLevelLabel(l).length > 0, `label for ${l}`)
    assert.ok(getRiskLevelColor(l).startsWith('#'), `color for ${l}`)
  }
})