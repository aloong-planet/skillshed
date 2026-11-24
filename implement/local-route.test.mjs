// Tests for local-route.mjs. Each case group builds a throwaway Git repository holding a routing under .github/ci/
// and runs the script as implement/full-verification-gate.md says to:
//   node --test implement/local-route.test.mjs
// The first group's routing is the CI routing asset of github-ops (github-ops/assets/ci-routing/ci-scope.mjs),
// copied as a project copies it, so those cases also check that the asset answers the interface this script uses.
// Gap: a routing that does not finish in time is not driven, as the limit is the script's ROUTING_TIMEOUT_MS; a
// routing killed by a signal, the other way it can end without an exit code, is.
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(HERE, 'local-route.mjs')
const ASSET = join(HERE, '..', 'github-ops', 'assets', 'ci-routing', 'ci-scope.mjs')

const dirs = []
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }) })

function write(dir, files) {
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, p)), { recursive: true })
    writeFileSync(join(dir, p), c)
  }
}

/** A repository whose first commit holds `files` */
function repo(files) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'local-route-test-')))
  dirs.push(dir)
  const g = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' }).trim()
  g('init', '-q')
  g('config', 'user.email', 'test@example.com')
  g('config', 'user.name', 'test')
  g('config', 'commit.gpgsign', 'false')
  write(dir, files)
  g('add', '-A')
  g('commit', '-qm', 'base', '--no-verify')
  return { dir, g, base: g('rev-parse', 'HEAD') }
}

/** Commits `files` on top of HEAD and returns the new commit */
function commit(r, files) {
  write(r.dir, files)
  r.g('add', '-A')
  r.g('commit', '-qm', 'change', '--no-verify')
  return r.g('rev-parse', 'HEAD')
}

function route(r, args, { sub = '', env = {} } = {}) {
  const out = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: join(r.dir, sub), encoding: 'utf8', env: { ...process.env, ...env } })
  return { code: out.status, out: out.stdout, err: out.stderr }
}

const ROUTING = {
  scopes: { app: ['app-checks'], site: ['site-checks'] },
  rules: [
    { reason: 'Website', select: ['site'], paths: ['site/**'] },
    { reason: 'Application', select: ['app'], paths: ['src/**'] }
  ],
  local: { 'pnpm smoke': 'app' }
}

test('a command runs unless the routing declares it under a scope the change does not select', () => {
  const r = repo({
    '.github/ci/ci-scope.mjs': readFileSync(ASSET, 'utf8'),
    '.github/ci/routing.json': JSON.stringify(ROUTING),
    'site/index.html': '<p>site</p>\n',
    'src/a.ts': 'export const a = 1\n'
  })
  const site = commit(r, { 'site/index.html': '<p>changed</p>\n' })
  r.g('checkout', '-q', '--detach', r.base)
  const app = commit(r, { 'src/a.ts': 'export const a = 2\n' })
  const cases = [
    // [the commit delivered, the command, the exit code, the declared scope's line in the output]
    [site, 'pnpm smoke', 0, 'app=false'],
    [app, 'pnpm smoke', 1, 'app=true'],
    // Not declared: it runs whatever the change selects
    [site, 'pnpm e2e', 1, null]
  ]
  for (const [head, command, code, line] of cases) {
    r.g('checkout', '-q', '--detach', head)
    const out = route(r, ['--base', r.base, '--router', '.github/ci/ci-scope.mjs', '--command', command])
    const what = `${command} at ${head === site ? 'site' : 'app'}: ${out.out}${out.err}`
    assert.equal(out.code, code, what)
    // The output names what made the decision: the routing, the command and the scope's line
    assert.ok(out.out.includes('.github/ci/ci-scope.mjs') && out.out.includes(JSON.stringify(command)), what)
    if (line !== null) assert.ok(out.out.includes(line), what)
  }
})

/** A routing that records how it was run into the file PROBE_LOG names, then writes `output` and exits */
const probe = (output, end = 'process.exitCode = 0') => [
  "import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'",
  'const { PROBE_LOG, GITHUB_EVENT_NAME, GITHUB_EVENT_PATH, GITHUB_OUTPUT } = process.env',
  'if (PROBE_LOG) writeFileSync(PROBE_LOG, JSON.stringify({',
  '  argv: process.argv.slice(2), cwd: process.cwd(), name: GITHUB_EVENT_NAME,',
  "  event: JSON.parse(readFileSync(GITHUB_EVENT_PATH, 'utf8')),",
  "  github: Object.keys(process.env).filter((key) => key.startsWith('GITHUB_')).sort()",
  '}))',
  `appendFileSync(GITHUB_OUTPUT, ${JSON.stringify(output)})`,
  end,
  ''
].join('\n')
const PROBE = '.github/ci/probe.mjs'
const probeArgs = (r, command = 'pnpm smoke') => ['--base', r.base, '--router', PROBE, '--command', command]

test('the routing is the one at the commit delivered, not the one at the fork point', () => {
  const r = repo({ [PROBE]: probe('app=true\nlocal-scope=app\n') })
  commit(r, { [PROBE]: probe('app=false\nlocal-scope=app\n') })
  const out = route(r, probeArgs(r))
  assert.equal(out.code, 0, out.out + out.err)
})

test('the routing runs from the repository root with the interface of a pull request run, and nothing else of GitHub', () => {
  const r = repo({ [PROBE]: probe('app=false\nlocal-scope=app\n'), 'src/a.ts': 'export const a = 1\n' })
  const head = commit(r, { 'src/a.ts': 'export const a = 2\n' })
  const log = join(realpathSync(mkdtempSync(join(tmpdir(), 'local-route-log-'))), 'probe.json')
  dirs.push(dirname(log))
  // Run from a subdirectory, inside a GitHub Actions job whose own variables must not reach the routing
  const env = { PROBE_LOG: log, GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_PATH: join(r.dir, 'none.json'), GITHUB_OUTPUT: join(r.dir, 'none'), GITHUB_STEP_SUMMARY: join(r.dir, 'summary'), GITHUB_TOKEN: 'x' }
  const out = route(r, probeArgs(r), { sub: 'src', env })
  assert.equal(out.code, 0, out.out + out.err)
  const seen = JSON.parse(readFileSync(log, 'utf8'))
  assert.deepEqual(seen.argv, ['--local-command', 'pnpm smoke'])
  assert.equal(seen.cwd, r.dir)
  assert.equal(seen.name, 'pull_request')
  assert.deepEqual(seen.event, { pull_request: { base: { sha: r.base }, head: { sha: head } } })
  assert.deepEqual(seen.github, ['GITHUB_EVENT_NAME', 'GITHUB_EVENT_PATH', 'GITHUB_OUTPUT'])
})

/** A fresh file path for PROBE_LOG, outside every repository */
function logPath() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'local-route-log-')))
  dirs.push(dir)
  return join(dir, 'probe.json')
}

// Every case below has a routing that would answer "does not run": only the failure can make it run
const NOT_RUN = 'app=false\nlocal-scope=app\n'

test('uncommitted changes and bad arguments run the command without running the routing', () => {
  const r = repo({ [PROBE]: probe(NOT_RUN), 'src/a.ts': 'export const a = 1\n' })
  const tree = r.g('rev-parse', 'HEAD^{tree}')
  const cases = [
    ['a tracked file modified', () => write(r.dir, { 'src/a.ts': 'export const a = 2\n' }), probeArgs(r)],
    ['an untracked file', () => write(r.dir, { 'src/b.ts': 'export const b = 1\n' }), probeArgs(r)],
    ['no --base', null, ['--router', PROBE, '--command', 'pnpm smoke']],
    ['a fork point that is no commit', null, ['--base', 'nosuchref', '--router', PROBE, '--command', 'pnpm smoke']],
    ['a fork point that is a tree', null, ['--base', tree, '--router', PROBE, '--command', 'pnpm smoke']],
    ['no --command', null, ['--base', r.base, '--router', PROBE]],
    ['an empty command', null, ['--base', r.base, '--router', PROBE, '--command', '']],
    ['an unknown flag', null, [...probeArgs(r), '--scope', 'app']],
    ['a flag twice', null, [...probeArgs(r), '--command', 'pnpm e2e']]
  ]
  for (const [what, setUp, args] of cases) {
    setUp?.()
    const log = logPath()
    const out = route(r, args, { env: { PROBE_LOG: log } })
    assert.equal(out.code, 2, `${what}: ${out.out}${out.err}`)
    assert.match(out.err, /no decision, so the command runs/, what)
    assert.throws(() => readFileSync(log), { code: 'ENOENT' }, `${what}: the routing ran`)
    r.g('checkout', '-q', '--', '.')
    r.g('clean', '-qfd')
  }
})

test('a routing that fails, or writes anything but a line per scope and one declaration, runs the command', () => {
  const r = repo({ [PROBE]: probe(NOT_RUN) })
  const cases = [
    ['exits 3', probe('', 'process.exitCode = 3')],
    ['is killed after writing its answer', probe(NOT_RUN, "process.kill(process.pid, 'SIGKILL')")],
    ['exits 0 and writes nothing', probe('')],
    ['declares a scope it writes no line for', probe('app=true\nlocal-scope=web\n')],
    ['writes a value other than true or false', probe('app=maybe\nlocal-scope=app\n')],
    ['writes a line of another form', probe(`${NOT_RUN}note\n`)],
    ['writes a scope twice', probe('app=true\napp=false\nlocal-scope=app\n')],
    ['declares twice', probe('app=false\nsite=true\nlocal-scope=app\nlocal-scope=site\n')]
  ]
  for (const [what, source] of cases) {
    commit(r, { [PROBE]: source })
    const out = route(r, probeArgs(r))
    assert.equal(out.code, 2, `${what}: ${out.out}${out.err}`)
    assert.match(out.err, /no decision, so the command runs/, what)
  }
  for (const [what, router] of [['missing', '.github/ci/none.mjs'], ['outside the repository', ASSET]]) {
    const out = route(r, ['--base', r.base, '--router', router, '--command', 'pnpm smoke'])
    assert.equal(out.code, 2, `a router ${what}: ${out.out}${out.err}`)
    assert.match(out.err, /no decision, so the command runs/, what)
  }
})
