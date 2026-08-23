const test = require('node:test')
const assert = require('node:assert/strict')

const { classifyConnection } = require('./build/src/background/monitors/networkMonitor.js')

const none = { vpn: false, proxy: false, tor: false, hosting: false }

test('VPN flag from geo API sets isVpn', () => {
  const r = classifyConnection('SomeHost', 'SomeHost', { ...none, vpn: true })
  assert.equal(r.isVpn, true)
  assert.equal(r.isProxy, false)
})

test('hosting flag is treated as VPN (datacenter exit)', () => {
  const r = classifyConnection('M247 Ltd', 'M247 Ltd', { ...none, hosting: true })
  assert.equal(r.isVpn, true)
})

test('proxy flag sets isProxy', () => {
  const r = classifyConnection('ProxyOrg', 'ProxyOrg', { ...none, proxy: true })
  assert.equal(r.isProxy, true)
})

test('tor flag sets isTor', () => {
  const r = classifyConnection('TorOrg', 'TorOrg', { ...none, tor: true })
  assert.equal(r.isTor, true)
})

test('provider keywords detect VPN when API has no flags', () => {
  assert.equal(classifyConnection('NordVPN', 'NordVPN', none).isVpn, true)
  assert.equal(classifyConnection('Datacamp Limited', 'Datacamp Limited', none).isVpn, true)
  assert.equal(classifyConnection('DigitalOcean LLC', 'DigitalOcean LLC', none).isVpn, true)
})

test('normal residential ISP is not flagged', () => {
  const r = classifyConnection('Comcast Cable Communications', 'Comcast', none)
  assert.equal(r.isVpn, false)
  assert.equal(r.isProxy, false)
  assert.equal(r.isTor, false)
})

test('tor keyword in org is detected', () => {
  assert.equal(classifyConnection('Tor Project', 'Tor Project', none).isTor, true)
})

test('known TOR ASN in org is detected', () => {
  const r = classifyConnection('AS9009 M247 Ltd', 'M247', none)
  assert.equal(r.isTor, true)
})

test('missing org/isp never crashes', () => {
  const r = classifyConnection(undefined, undefined, none)
  assert.equal(r.isVpn, false)
  assert.equal(r.isProxy, false)
  assert.equal(r.isTor, false)
})

test('ASN/asname text catches VPN providers', () => {
  const r = classifyConnection('Some Corp', 'Some Corp', none, 'Datacamp Limited')
  assert.equal(r.isVpn, true)
})

test('M247 AS9009 in asname flags TOR', () => {
  const r = classifyConnection('M247 Ltd', 'M247 Ltd', none, 'AS9009 M247-LTD')
  assert.equal(r.isTor, true)
})