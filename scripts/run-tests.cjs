const { spawnSync } = require('child_process')
const path = require('path')

const root = path.join(__dirname, '..')
const tsc = spawnSync('npx', ['tsc', '-p', 'test/tsconfig.test.json'], { cwd: root, shell: true, stdio: 'inherit' })
if (tsc.status !== 0) process.exit(tsc.status || 1)

const tests = spawnSync('node', ['--test', 'test/tracker.test.cjs', 'test/types.test.cjs', 'test/engine.test.cjs', 'test/storage.test.cjs', 'test/timeoutSignal.test.cjs', 'test/policy.test.cjs', 'test/domain-scope.test.cjs', 'test/who-tracks.test.cjs', 'test/network.test.cjs', 'test/authRole.test.cjs', 'test/accountDetection.test.cjs', 'test/loginFailed.test.cjs', 'test/headers.test.cjs', 'test/extensionRisk.test.cjs', 'test/accountsAccuracy.test.cjs', 'test/sitemap.test.cjs'], { cwd: root, shell: true, stdio: 'inherit' })
process.exit(tests.status ?? 1)