// The fixed behaviour of ci-scope.mjs and ci-gate.mjs, on a fixture configuration of its own; the repository's
// rules are tested in routing-rules.test.mjs. Copied unchanged with the two scripts. Run: node --test .github/ci/*.test.mjs
// Gap: GitHub's scheduling — job-level skips, a newer push cancelling a run, the required check — shows only on
// the hosted runner: in the pull request's run, and for a push in the default-branch run after a merge.
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync as exec, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifyPath, classifyPaths, collectChanges, comparisonForEvent, parseConfig } from './ci-scope.mjs'
import { gateFailures } from './ci-gate.mjs'

const FIXTURE = {
  scopes: { app: ['app-checks', 'e2e'], site: ['site-checks', 'shared-build'], tool: ['shared-build'] },
  rules: [
    { reason: 'Shared input', select: 'all', paths: ['package.json', 'src/theme.css'] },
    { reason: 'Documentation', select: [], paths: ['README.md', 'README.*.md', 'docs/**/*.md', 'docs/prototypes/**', 'site/README.md'] },
    { reason: 'Website', select: ['site'], paths: ['site/**'] },
    { reason: 'Application', select: ['app'], paths: ['src/**', '*.config.ts'] }
  ]
}
const config = parseConfig(FIXTURE)
const on = (result) => Object.keys(result.scopes).filter((name) => result.scopes[name])
const pr = (base, head) => ({ pull_request: { base: { sha: base }, head: { sha: head } } })

test('a pattern: * stays in one segment, ** spans segments, nothing else is special', () => {
  const cases = [
    ['README.md', []], ['README.en.md', []], ['docs/README.md', []],
    ['docs/a.md', []], ['docs/x/y/z.md', []], ['docs/a.txt', ['app', 'site', 'tool']],
    ['docs/prototypes/a/b.html', []], ['docs/prototypes', ['app', 'site', 'tool']],
    ['vite.config.ts', ['app']], ['web/vite.config.ts', ['app', 'site', 'tool']],
    ['READMEXmd', ['app', 'site', 'tool']],
    ['src/a\nb.ts', ['app']]
  ]
  for (const [path, expected] of cases) assert.deepEqual(classifyPath(path, config).select, expected, JSON.stringify(path))
})

test('the first matching rule wins, and .github/ and unmatched paths select every scope', () => {
  assert.deepEqual(classifyPath('site/README.md', config), { select: [], reason: 'Documentation', pattern: 'site/README.md' })
  assert.deepEqual(classifyPath('src/theme.css', config).select, ['app', 'site', 'tool'])
  assert.equal(classifyPath('src/theme.css', config).reason, 'Shared input')
  for (const path of ['.github/workflows/ci.yml', '.github/ci/routing.json', '.github/ci/ci-scope.mjs']) {
    assert.deepEqual(classifyPath(path, config), { select: ['app', 'site', 'tool'], reason: 'CI definition: every scope', pattern: null }, path)
  }
  assert.deepEqual(classifyPath('new-dir/x.js', config), { select: ['app', 'site', 'tool'], reason: 'No rule matches: every scope', pattern: null })
})

test('a change set takes the union of its paths, explains each one, and an empty one selects nothing', () => {
  const mixed = classifyPaths(['README.md', 'site/index.html', 'src/a.ts'], config)
  assert.deepEqual(mixed.scopes, { app: true, site: true, tool: false })
  for (const path of ['README.md', 'site/index.html', 'src/a.ts']) assert.ok(mixed.reasons.some((line) => line.includes(JSON.stringify(path))), path)
  const empty = classifyPaths([], config)
  assert.deepEqual(empty.scopes, { app: false, site: false, tool: false })
  assert.equal(empty.reasons.length, 1)
  for (const paths of [null, 'src/a.ts', [''], [null], ['/src/a.ts'], ['src/../a.ts'], ['src/./a.ts'], ['src//a.ts'], ['a\0b']]) {
    assert.throws(() => classifyPaths(paths, config), /path/i, JSON.stringify(paths))
  }
})

test('routing.json is refused unless it has exactly the documented shape', () => {
  const bad = [
    null, [], {}, { scopes: {}, rules: [] }, { ...FIXTURE, extra: 1 },
    { scopes: { App: ['x'] }, rules: [] }, { scopes: { app: [] }, rules: [] }, { scopes: { app: ['x', 'x'] }, rules: [] },
    { scopes: { app: ['changes'] }, rules: [] }, { scopes: { app: [''] }, rules: [] }, { scopes: { app: ['x'] } },
    { scopes: { app: ['x'] }, rules: [{ reason: 'r', select: ['web'], paths: ['a'] }] },
    { scopes: { app: ['x'] }, rules: [{ reason: 'r', select: 'some', paths: ['a'] }] },
    { scopes: { app: ['x'] }, rules: [{ reason: '', select: [], paths: ['a'] }] },
    { scopes: { app: ['x'] }, rules: [{ reason: 'r', select: [], paths: [] }] },
    { scopes: { app: ['x'] }, rules: [{ reason: 'r', select: [], paths: ['a'], when: 'x' }] },
    ...['/a', 'a/../b', 'a//b', 'a?.md', 'a[0].md', '{a,b}', '!a', 'a**/b', '.github/x', '.github/**'].map((pattern) => (
      { scopes: { app: ['x'] }, rules: [{ reason: 'r', select: [], paths: [pattern] }] }
    ))
  ]
  for (const value of bad) assert.throws(() => parseConfig(value), /^Error: routing\.json: /, JSON.stringify(value))
})

test('only a pull request is compared, and an unsupported event or malformed commits fail', () => {
  const a = 'a'.repeat(40)
  const b = 'b'.repeat(40)
  assert.equal(comparisonForEvent('pull_request', pr(a, b)), `${a}...${b}`)
  assert.equal(comparisonForEvent('push', {}), null)
  // The unsupported events carry commits a pull request is accepted with, so only their names can reject them
  for (const [name, event] of [
    ['pull_request_target', pr(a, b)], ['merge_group', pr(a, b)], [undefined, pr(a, b)],
    ['pull_request', { before: a, after: b }], ['pull_request', pr('0'.repeat(40), b)],
    ['pull_request', pr(a, '0'.repeat(40))], ['pull_request', pr('--output=x', b)], ['pull_request', pr(a.toUpperCase(), b)]
  ]) assert.throws(() => comparisonForEvent(name, event), /event|commit/, `${name} ${JSON.stringify(event)}`)
})

test('a push selects every scope without reading a comparison', () => {
  const a = 'a'.repeat(40)
  // Commits no repository holds, no commits, equal endpoints, and a directory that is not a repository
  for (const event of [{ before: a, after: 'b'.repeat(40) }, {}, { before: a, after: a }]) {
    const result = collectChanges('push', event, config, tmpdir())
    assert.deepEqual(result.scopes, { app: true, site: true, tool: true }, JSON.stringify(event))
    assert.equal(result.reasons.length, 1)
  }
})

test('the gate requires selected jobs, tolerates skipped unselected ones, and requires every other job', () => {
  const needs = (app, site, tool, results = {}) => ({
    changes: { result: 'success', outputs: { app, site, tool } },
    policy: { result: 'success' },
    'app-checks': { result: app === 'true' ? 'success' : 'skipped' },
    e2e: { result: app === 'true' ? 'success' : 'skipped' },
    'site-checks': { result: site === 'true' ? 'success' : 'skipped' },
    'shared-build': { result: site === 'true' || tool === 'true' ? 'success' : 'skipped' },
    ...Object.fromEntries(Object.entries(results).map(([id, result]) => [id, result === undefined ? undefined : { result }]))
  })
  for (const flags of [['false', 'false', 'false'], ['true', 'false', 'false'], ['false', 'true', 'false'], ['false', 'false', 'true'], ['true', 'true', 'true']]) {
    assert.deepEqual(gateFailures(needs(...flags), config), [], flags.join(','))
  }
  const failing = [
    [needs('true', 'false', 'false', { e2e: 'skipped' }), /^e2e: skipped \(selected\)$/],
    [needs('true', 'false', 'false', { e2e: 'cancelled' }), /^e2e: cancelled \(selected\)$/],
    [needs('true', 'false', 'false', { e2e: 'failure' }), /^e2e: failure \(selected\)$/],
    [needs('false', 'false', 'false', { e2e: 'failure' }), /^e2e: failure \(not selected\)$/],
    [needs('false', 'false', 'false', { e2e: 'cancelled' }), /^e2e: cancelled \(not selected\)$/],
    // shared-build is listed by site and by tool: either one selects it
    [needs('false', 'false', 'true', { 'shared-build': 'skipped' }), /^shared-build: skipped \(selected\)$/],
    [needs('false', 'true', 'false', { 'shared-build': 'skipped' }), /^shared-build: skipped \(selected\)$/],
    [needs('false', 'false', 'false', { policy: 'skipped' }), /^policy: skipped \(always required\)$/],
    [needs('false', 'false', 'false', { policy: 'failure' }), /^policy: failure \(always required\)$/],
    [needs('false', 'false', 'false', { e2e: undefined }), /^e2e: missing \(not selected\)$/],
    [{ ...needs('false', 'false', 'false'), changes: { result: 'failure', outputs: {} } }, /^changes: failure$/]
  ]
  for (const [input, expected] of failing) {
    const errors = gateFailures(input, config)
    assert.ok(errors.some((line) => expected.test(line)), `${expected}: ${errors.join(' | ')}`)
  }
  const { e2e: _, ...withoutE2e } = needs('false', 'false', 'false')
  assert.deepEqual(gateFailures(withoutE2e, config), ["e2e: listed in routing.json but not among the gate's needs"])
  // A flag that is not exactly "true" or "false" fails, and its jobs are then required: skipped ones fail too
  for (const flag of [undefined, '', 'TRUE', 'yes']) {
    const errors = gateFailures(needs(flag, 'false', 'false'), config)
    assert.ok(errors.some((line) => line.startsWith('Invalid app classification')), String(flag))
    assert.ok(errors.includes('app-checks: skipped (selected)'), String(flag))
  }
  for (const input of [null, [], 'x']) assert.deepEqual(gateFailures(input, config), ['Missing job results'])
})

// One Git history for the command-line cases, with both scripts and the fixture beside each other as a
// repository holds them.
const dir = mkdtempSync(join(tmpdir(), 'ci-routing-'))
after(() => rmSync(dir, { recursive: true, force: true }))
const git = (...args) => exec('git', args, { cwd: dir, encoding: 'utf8' }).trim()
const put = (path, text = 'fixture\n') => {
  mkdirSync(dirname(join(dir, path)), { recursive: true })
  writeFileSync(join(dir, path), text)
}
const here = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(dir, 'ci'), { recursive: true })
for (const name of ['ci-scope.mjs', 'ci-gate.mjs']) copyFileSync(join(here, name), join(dir, 'ci', name))
writeFileSync(join(dir, 'ci', 'routing.json'), JSON.stringify(FIXTURE))
git('init', '-q')
git('config', 'user.name', 'CI routing test')
git('config', 'user.email', 'ci-routing@example.invalid')
git('config', 'commit.gpgsign', 'false')
git('config', 'core.hooksPath', join(dir, 'no-hooks'))
put('src/deleted.ts')
put('src/moved.ts')
git('add', 'src')
git('commit', '-qm', 'base')
const base = git('rev-parse', 'HEAD')
rmSync(join(dir, 'src/deleted.ts'))
mkdirSync(join(dir, 'docs/prototypes'), { recursive: true })
renameSync(join(dir, 'src/moved.ts'), join(dir, 'docs/prototypes/moved.ts'))
put('site/space and\nnewline.html')
git('add', '-A', 'src', 'docs', 'site')
git('commit', '-qm', 'product changes')
const products = git('rev-parse', 'HEAD')
put('README.md')
git('add', 'README.md')
git('commit', '-qm', 'documentation afterwards')
const head = git('rev-parse', 'HEAD')
git('checkout', '-q', '--detach', base)
put('only-on-main.js')
git('add', 'only-on-main.js')
git('commit', '-qm', 'base advances independently')
const advanced = git('rev-parse', 'HEAD')

const runScope = (i, name, event, routing) => {
  const files = { event: join(dir, `event-${i}.json`), output: join(dir, `output-${i}`), summary: join(dir, `summary-${i}`) }
  writeFileSync(files.event, JSON.stringify(event))
  if (routing !== undefined) writeFileSync(join(dir, 'ci', 'routing.json'), routing)
  const run = spawnSync(process.execPath, [join(dir, 'ci', 'ci-scope.mjs')], {
    cwd: dir, encoding: 'utf8',
    env: { ...process.env, GITHUB_EVENT_NAME: name, GITHUB_EVENT_PATH: files.event, GITHUB_OUTPUT: files.output, GITHUB_STEP_SUMMARY: files.summary }
  })
  writeFileSync(join(dir, 'ci', 'routing.json'), JSON.stringify(FIXTURE))
  return { run, ...files }
}

test('the command line publishes each scope from a real pull-request diff, every scope for a push, and nothing on failure', () => {
  const cases = [
    // A code change, a move, a deletion and an odd file name, then a documentation-only commit, over a base
    // that moved on: the whole branch counts and nothing from the advanced base does
    ['pull_request', pr(advanced, head), undefined, 'app=true\nsite=true\ntool=false\n'],
    // The pushed commit adds README.md alone, so every scope cannot come from its paths
    ['push', { before: products, after: head }, undefined, 'app=true\nsite=true\ntool=true\n'],
    ['pull_request', pr(head, head), undefined, 'app=false\nsite=false\ntool=false\n'],
    ['pull_request', pr('f'.repeat(40), head), undefined, null],
    ['workflow_dispatch', {}, undefined, null],
    ['pull_request', pr(base, head), '{ not json', null],
    ['pull_request', pr(base, head), JSON.stringify({ ...FIXTURE, rules: [{ reason: 'r', select: [], paths: ['.github/**'] }] }), null]
  ]
  for (const [i, [name, event, routing, expected]] of cases.entries()) {
    const { run, output, summary } = runScope(i, name, event, routing)
    if (expected === null) {
      assert.equal(run.status, 1, `${i}: ${run.stderr}`)
      assert.ok(run.stderr.trim().length > 0, String(i))
      assert.equal(existsSync(output), false, String(i))
      continue
    }
    assert.equal(run.status, 0, `${i}: ${run.stderr}`)
    assert.equal(readFileSync(output, 'utf8'), expected, String(i))
    assert.match(readFileSync(summary, 'utf8'), /^app: /m)
    if (i === 0) {
      for (const path of ['src/deleted.ts', 'src/moved.ts', 'docs/prototypes/moved.ts', 'README.md']) assert.ok(run.stdout.includes(JSON.stringify(path)), path)
      assert.ok(run.stdout.includes(JSON.stringify('site/space and\nnewline.html')))
      assert.ok(!run.stdout.includes('only-on-main.js'))
    }
  }
})

test('the gate command passes, fails with each reason, and fails on unreadable input', () => {
  const gate = (env) => spawnSync(process.execPath, [join(dir, 'ci', 'ci-gate.mjs')], { cwd: tmpdir(), encoding: 'utf8', env: { ...process.env, ...env } })
  const needs = {
    changes: { result: 'success', outputs: { app: 'false', site: 'true', tool: 'false' } },
    policy: { result: 'success' }, 'app-checks': { result: 'skipped' }, e2e: { result: 'skipped' },
    'site-checks': { result: 'success' }, 'shared-build': { result: 'success' }
  }
  assert.equal(gate({ NEEDS_JSON: JSON.stringify(needs) }).status, 0)
  const failed = gate({ NEEDS_JSON: JSON.stringify({ ...needs, 'site-checks': { result: 'failure' }, policy: { result: 'cancelled' } }) })
  assert.equal(failed.status, 1)
  assert.match(failed.stderr, /site-checks: failure \(selected\)/)
  assert.match(failed.stderr, /policy: cancelled \(always required\)/)
  for (const value of ['{bad', '']) {
    const unreadable = gate({ NEEDS_JSON: value })
    assert.equal(unreadable.status, 1)
    assert.match(unreadable.stderr, /NEEDS_JSON is not JSON/)
  }
  writeFileSync(join(dir, 'ci', 'routing.json'), '[]')
  try {
    const broken = gate({ NEEDS_JSON: JSON.stringify(needs) })
    assert.equal(broken.status, 1)
    assert.match(broken.stderr, /routing\.json/)
  } finally {
    writeFileSync(join(dir, 'ci', 'routing.json'), JSON.stringify(FIXTURE))
  }
})
