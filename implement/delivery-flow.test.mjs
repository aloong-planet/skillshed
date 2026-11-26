// The command line of local-route.mjs (delivery-flow::REQ-007). Each case group builds a throwaway Git repository
// with local inputs or a routing under .github/ci/ and exercises the decision used before delivery. Run:
//   node --test implement/delivery-flow.test.mjs
// The CI compatibility case uses the CI routing asset of github-ops (github-ops/assets/ci-routing/ci-scope.mjs),
// copied as a project copies it, so those cases also check that the asset answers the interface this script uses.
// The rules the script applies are tested in local-route.test.mjs.
// Gap: a routing that does not finish in time is not driven, as the limit is the script's ROUTING_TIMEOUT_MS; a
// routing killed by a signal, the other way it can end without an exit code, is.
// Gap: what REQ-007 asks of the agent rather than of the script is carried only by the instructions in
// implement/full-verification-gate.md and github-ops/checks-gate.md, which no test drives: that the decision is made
// once before a delivery, one without a pull request included (AC-01, and the exception in REQ-001/AC-03), that a
// routing of another form is wrapped (AC-02), that a fork point that cannot be found runs the command and that
// nothing stops to ask (AC-04), what the delivery note gives (AC-05), that a later commit is decided again (AC-06),
// and that a command is declared only after every file it reads is enumerated (AC-07). Testing them takes an agent
// replaying a delivery. The same gap applies to CI precedence, input audits, and keeping checks and release
// verification outside local selection (AC-08 to AC-10).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, realpathSync, symlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scratchRepos, write } from '../scripts/test-support/scratch-repos.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(HERE, 'local-route.mjs')
const ASSET = join(HERE, '..', 'github-ops', 'assets', 'ci-routing', 'ci-scope.mjs')
const { scratch, env, git } = scratchRepos('local-route-test-')

/** A repository whose first commit holds `files` */
function repo(files) {
  const dir = realpathSync(scratch())
  git(dir, 'init', '-q')
  write(dir, files)
  git(dir, 'add', '-A')
  git(dir, 'commit', '-qm', 'base')
  const g = (...args) => git(dir, ...args)
  return { dir, g, base: g('rev-parse', 'HEAD') }
}

/** Commits `files` on top of HEAD and returns the new commit */
function commit(r, files) {
  write(r.dir, files)
  r.g('add', '-A')
  r.g('commit', '-qm', 'change')
  return r.g('rev-parse', 'HEAD')
}

function route(r, args, { sub = '', vars = {}, script = SCRIPT } = {}) {
  const out = spawnSync(process.execPath, [script, ...args], { cwd: join(r.dir, sub), encoding: 'utf8', env: { ...env, ...vars } })
  return { code: out.status, out: out.stdout, err: out.stderr }
}

test('a delivery without CI runs the command whose input changed and skips the independent command', () => {
  const r = repo({
    'local-test-inputs.json': JSON.stringify([['node a', ['a']], ['node b', ['b']], ['node c', ['c']]]),
    a: 'first', b: 'second', c: 'third'
  })
  commit(r, { a: 'updated first' })
  commit(r, { c: 'updated last' })
  for (const [command, code] of [['node b', 0], ['node a', 1], ['node c', 1]]) {
    const out = route(r, ['--local-inputs', '--base', r.base, '--command', command])
    assert.equal(out.code, code, out.out + out.err)
  }
})

test('a deletion and both names of a move reach the commands that own them', () => {
  const old = 'first/old\nname', next = 'second/new name'
  const r = repo({
    'local-test-inputs.json': JSON.stringify([['first', [old]], ['second', [next]], ['third', ['third']], ['removed', ['removed']]]),
    [old]: 'moved', third: 'unchanged', removed: 'deleted'
  })
  commit(r, { [old]: null, [next]: 'moved', removed: null })
  for (const [command, code] of [['first', 1], ['second', 1], ['removed', 1], ['third', 0]]) {
    const out = route(r, ['--local-inputs', '--base', r.base, '--command', command], { sub: 'second' })
    assert.equal(out.code, code, out.out + out.err)
  }
})

test('only a tracked regular declaration and a usable fork point permit a skip', () => {
  const manifest = 'local-test-inputs.json'
  const r = repo({ [manifest]: JSON.stringify([['a', ['a']]]), a: 'test a' })
  const query = base => route(r, ['--local-inputs', '--base', base, '--command', 'a'])
  const later = commit(r, { a: 'later revision' })
  r.g('checkout', '-q', '--detach', r.base)
  assert.equal(query(later).code, 2)
  assert.equal(query('missing-ref').code, 2)
  write(r.dir, { untracked: 'dirty' })
  assert.equal(query(r.base).code, 2)
  commit(r, { untracked: null, [manifest]: null })
  assert.equal(query(r.g('rev-parse', 'HEAD')).code, 2)
  // A symlink's blob contains its target name. Make that name parse as a valid declaration.
  symlinkSync('[["a",["a"]]]', join(r.dir, manifest))
  r.g('add', manifest)
  r.g('commit', '-qm', 'symlink declaration')
  assert.equal(query(r.g('rev-parse', 'HEAD')).code, 2)
})

function addSubmodule(parent, name, files) {
  const child = join(parent, name)
  git(parent, 'init', '-q', name)
  write(child, files)
  git(child, 'add', '-A')
  git(child, 'commit', '-qm', 'initial files')
  git(parent, 'submodule', 'add', `./${name}`, name)
  git(parent, 'commit', '-qm', 'track submodule')
  return child
}

test('a dirty submodule keeps the command even when the project hides its changes', async t => {
  const r = repo({ 'local-test-inputs.json': JSON.stringify([['child test', ['child']]]) })
  const child = addSubmodule(r.dir, 'child', { input: 'original' })
  const leaf = addSubmodule(child, 'leaf', { input: 'original' })
  r.g('add', 'child')
  r.g('commit', '-qm', 'track nested submodule')
  r.g('config', 'submodule.child.ignore', 'dirty')
  git(child, 'config', 'status.showUntrackedFiles', 'no')
  git(child, 'config', 'submodule.leaf.ignore', 'dirty')
  const args = ['--local-inputs', '--base', 'HEAD', '--command', 'child test']
  assert.equal(route(r, args).code, 0)
  for (const [dir, file, original] of [[child, 'input', 'original'], [child, 'new.js', null], [leaf, 'input', 'original']]) {
    await t.test(`${dir === child ? 'child' : 'leaf'}/${file}`, () => {
      write(dir, { [file]: 'modified' })
      try {
        assert.equal(r.g('status', '--porcelain'), '')
        const out = route(r, args)
        assert.equal(out.code, 2, out.out + out.err)
      } finally { write(dir, { [file]: original }) }
    })
  }
})

test('upgrading a selector installed as a submodule keeps independent commands', () => {
  const r = repo({ 'local-test-inputs.json': JSON.stringify([['tool test', ['tools']], ['app test', ['app.js']]]), 'app.js': 'app' })
  const tools = addSubmodule(r.dir, 'tools', { 'local-route.mjs': readFileSync(SCRIPT, 'utf8') })
  const base = r.g('rev-parse', 'HEAD')
  write(tools, { 'change-scope.mjs': 'export const version = 2' })
  git(tools, 'add', 'change-scope.mjs')
  git(tools, 'commit', '-qm', 'update selection tool')
  r.g('add', 'tools')
  r.g('commit', '-qm', 'upgrade tools')
  const out = route(r, ['--local-inputs', '--base', base, '--command', 'app test'], { script: join(tools, 'local-route.mjs') })
  assert.equal(out.code, 1, out.out + out.err)
})

/** A fresh file path for PROBE_LOG, outside every repository */
const logPath = () => join(realpathSync(scratch()), 'probe.json')

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
    // [the commit delivered, the command, the exit code, what the output says of the declaration]
    [site, 'pnpm smoke', 0, 'app=false'],
    [app, 'pnpm smoke', 1, 'app=true'],
    [site, 'pnpm e2e', 1, 'declares no scope']
  ]
  for (const [head, command, code, says] of cases) {
    r.g('checkout', '-q', '--detach', head)
    const out = route(r, ['--base', r.base, '--router', '.github/ci/ci-scope.mjs', '--command', command])
    const what = `${command}, ${says}: ${out.out}${out.err}`
    assert.equal(out.code, code, what)
    // The output names what made the decision: the routing, the command and the declaration
    assert.ok(out.out.includes('.github/ci/ci-scope.mjs') && out.out.includes(JSON.stringify(command)) && out.out.includes(says), what)
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
const probeArgs = (r) => ['--base', r.base, '--router', PROBE, '--command', 'pnpm smoke']
// A routing that answers "does not run": in the cases that fail, only the failure can make the command run
const NOT_RUN = 'app=false\nlocal-scope=app\n'

test('the routing is the one at the commit delivered, not the one at the fork point', () => {
  const r = repo({ [PROBE]: probe('app=true\nlocal-scope=app\n') })
  commit(r, { [PROBE]: probe(NOT_RUN) })
  const out = route(r, probeArgs(r))
  assert.equal(out.code, 0, out.out + out.err)
})

test('the routing runs from the repository root with the interface of a pull request run, and nothing else of GitHub', () => {
  const r = repo({ [PROBE]: probe(NOT_RUN), 'src/a.ts': 'export const a = 1\n' })
  const head = commit(r, { 'src/a.ts': 'export const a = 2\n' })
  const log = logPath()
  // Run from a subdirectory, inside a GitHub Actions job whose own variables must not reach the routing
  const vars = { PROBE_LOG: log, GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_PATH: join(r.dir, 'none.json'), GITHUB_OUTPUT: join(r.dir, 'none'), GITHUB_STEP_SUMMARY: join(r.dir, 'summary'), GITHUB_TOKEN: 'x' }
  const out = route(r, probeArgs(r), { sub: 'src', vars })
  assert.equal(out.code, 0, out.out + out.err)
  const seen = JSON.parse(readFileSync(log, 'utf8'))
  assert.deepEqual(seen.argv, ['--local-command', 'pnpm smoke'])
  assert.equal(seen.cwd, r.dir)
  assert.equal(seen.name, 'pull_request')
  assert.deepEqual(seen.event, { pull_request: { base: { sha: r.base }, head: { sha: head } } })
  assert.deepEqual(seen.github, ['GITHUB_EVENT_NAME', 'GITHUB_EVENT_PATH', 'GITHUB_OUTPUT'])
})

test('uncommitted changes, bad arguments and a fork point that is not a commit run the command without running the routing', () => {
  const r = repo({ [PROBE]: probe(NOT_RUN), 'src/a.ts': 'export const a = 1\n' })
  const tree = r.g('rev-parse', 'HEAD^{tree}')
  const cases = [
    ['a tracked file modified', () => write(r.dir, { 'src/a.ts': 'export const a = 2\n' }), probeArgs(r)],
    ['an untracked file', () => write(r.dir, { 'src/b.ts': 'export const b = 1\n' }), probeArgs(r)],
    ['no --command', null, probeArgs(r).slice(0, 4)],
    ['a fork point that is no commit', null, ['--base', 'nosuchref', ...probeArgs(r).slice(2)]],
    ['a fork point that is a tree', null, ['--base', tree, ...probeArgs(r).slice(2)]]
  ]
  for (const [what, setUp, args] of cases) {
    setUp?.()
    const log = logPath()
    const out = route(r, args, { vars: { PROBE_LOG: log } })
    assert.equal(out.code, 2, `${what}: ${out.out}${out.err}`)
    assert.match(out.err, /no decision, so the command runs/, what)
    assert.throws(() => readFileSync(log), { code: 'ENOENT' }, `${what}: the routing ran`)
    r.g('checkout', '-q', '--', '.')
    r.g('clean', '-qfd')
  }
})

test('a routing that fails or writes a line of another form, and a router that is not a tracked file, run the command', () => {
  const r = repo({ [PROBE]: probe(NOT_RUN) })
  const cases = [
    ['exits 3 after writing its answer', probe(NOT_RUN, 'process.exitCode = 3')],
    ['is killed after writing its answer', probe(NOT_RUN, "process.kill(process.pid, 'SIGKILL')")],
    ['writes its answer and a line of another form', probe(`${NOT_RUN}note\n`)]
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
