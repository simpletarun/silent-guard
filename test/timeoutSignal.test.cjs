const test = require('node:test')
const assert = require('node:assert/strict')

const { timeoutSignal } = require('./build/src/utils/timeoutSignal.js')

test('timeoutSignal returns a real AbortSignal that aborts on timeout', async () => {
  const signal = timeoutSignal(50)
  assert.ok(signal instanceof AbortSignal, 'must be a real AbortSignal')
  assert.equal(signal.aborted, false)
  await new Promise(r => setTimeout(r, 150))
  assert.equal(signal.aborted, true)
})

test('timeoutSignal is a fresh signal per call (no recursion bug regression)', () => {
  const a = timeoutSignal(1000)
  const b = timeoutSignal(1000)
  assert.notEqual(a, b, 'each call must return a new signal')
  assert.equal(a.aborted, false)
  assert.equal(b.aborted, false)
})

test('timeoutSignal respects custom listeners', async () => {
  let fired = false
  const signal = timeoutSignal(30)
  signal.addEventListener('abort', () => { fired = true })
  await new Promise(r => setTimeout(r, 120))
  assert.equal(fired, true)
})