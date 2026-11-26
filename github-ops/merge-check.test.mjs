// Tests for merge-check.mjs (docs/specs/merge-check.md):
//   node --test github-ops/merge-check.test.mjs
// The rules are unit cases on the exported functions, the checks run through `runChecks` against facts given as plain
// values. The command-line cases run the script against scratch git repositories, with a stub `gh` first on PATH that
// answers from a fixture and logs every call. The gh answers follow the shape of real ones: `closingIssuesReferences`
// entries with id, number, repository and url; a job log line with its timestamp prefix; a 404 that prints the error
// JSON and exits 1.
// Gap: merge-check::REQ-017 is what the merging agent does, written in github-ops/merge-check.md; no test reads that
// document, and none may, a document being outside what the tests read. It can be tested only once the agent's steps
// are code. merge-check::CON-003 has no test and no check: the privacy check of a merge finds only the values of the
// environment that runs it, so another person's account name, address or home path in these files passes it. It can be
// tested once there is a list of such values that does not come from the environment that runs the check.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scratchRepos, write } from '../scripts/test-support/scratch-repos.mjs'
import { CHECKS, UsageError, exitCode, issueAnswer, listLines, parseArgs, readWorkflowRuns, render, runChecks } from './merge-check.mjs'

const HEAD = 'a'.repeat(40)

const BEFORE = ['before', '--repo', 'example-org/demo', '--pr', '7', '--head', HEAD, '--squash-body', 'squash.txt']

// merge-check::REQ-001/AC-01
test('parses the before form with repeated --forbid and --ignore-job', () => {
  const a = parseArgs([...BEFORE, '--forbid', 'secret', '--forbid', 'internal', '--ignore-job', 'macOS .*', '--checkout', 'dir'])
  assert.equal(a.mode, 'before')
  assert.equal(a.repo, 'example-org/demo')
  assert.equal(a.pr, 7)
  assert.equal(a.head, HEAD)
  assert.equal(a.squashBody, 'squash.txt')
  assert.equal(a.checkout, 'dir')
  assert.deepEqual(a.forbid.map((f) => f.source), ['secret', 'internal'])
  assert.ok(a.forbid[0].re.test('A SECRET word'), '--forbid matches case-insensitively')
  assert.deepEqual(a.ignoreJob.map((f) => f.source), ['macOS .*'])
  assert.ok(a.ignoreJob[0].re.test('macOS build'))
  assert.ok(!a.ignoreJob[0].re.test('the macOS build'), '--ignore-job matches the whole name')
  assert.ok(!a.ignoreJob[0].re.test('MACOS build'), '--ignore-job is case-sensitive')
})

test('parses the after form without --squash-body, and --list alone', () => {
  const a = parseArgs(['after', '--repo', 'example-org/demo', '--pr', '7', '--head', 'A'.repeat(40)])
  assert.equal(a.mode, 'after')
  assert.equal(a.head, HEAD, 'an upper-case --head is taken in lower case')
  assert.equal(a.checkout, undefined)
  assert.deepEqual(parseArgs(['--list']), { list: true })
})

for (const [what, argv, message] of [
  ['before without --squash-body', BEFORE.slice(0, -2), /--squash-body is required in before/],
  ['a missing --repo', ['after', '--pr', '7', '--head', HEAD], /--repo is required/],
  ['a repeated --pr', [...BEFORE, '--pr', '8'], /--pr is given twice/],
  ['an unknown argument', [...BEFORE, '--merge'], /unknown argument --merge/],
  ['a short --head', ['after', '--repo', 'example-org/demo', '--pr', '7', '--head', 'abc1234'], /--head must be 40 hexadecimal digits/],
  ['a --pr that is not a number', ['after', '--repo', 'example-org/demo', '--pr', 'x7', '--head', HEAD], /--pr must be a pull request number/],
  ['a --pr of 0', ['after', '--repo', 'example-org/demo', '--pr', '0', '--head', HEAD], /--pr must be a pull request number/],
  ['a --repo that is not owner/repo', ['after', '--repo', 'demo', '--pr', '7', '--head', HEAD], /--repo must be <owner>\/<repo>/],
  ['an invalid --forbid', [...BEFORE, '--forbid', '('], /--forbid "\(" is not a valid regular expression/],
  ['an invalid --ignore-job', [...BEFORE, '--ignore-job', '['], /--ignore-job "\[" is not a valid regular expression/],
  ['--squash-body in after', ['after', '--repo', 'example-org/demo', '--pr', '7', '--head', HEAD, '--squash-body', 'f'], /--squash-body is only for before/],
  ['--ignore-job in after', ['after', '--repo', 'example-org/demo', '--pr', '7', '--head', HEAD, '--ignore-job', 'x'], /--ignore-job is only for before/],
  ['no mode', ['--repo', 'example-org/demo'], /the first argument must be before, after or --list/],
  ['a value missing at the end', [...BEFORE, '--forbid'], /--forbid needs a value/],
]) {
  test(`stops on ${what}`, () => {
    assert.throws(() => parseArgs(argv), (e) => e instanceof UsageError && message.test(e.message))
  })
}

// merge-check::REQ-002/AC-04
for (const [statuses, code] of [
  [['PASS', 'SKIP'], 0],
  [['PASS', 'FAIL'], 1],
  [['FAIL', 'BLOCKED'], 1],
  [['PASS', 'BLOCKED'], 1],
  [['FAIL', 'ERROR', 'BLOCKED'], 2],
]) {
  test(`exits ${code} on ${statuses.join(' + ')}`, () => {
    assert.equal(exitCode(statuses.map((status, i) => ({ id: `c${i}`, kind: 'check', status }))), code)
  })
}

test('a report changes the exit code only when it errs', () => {
  assert.equal(exitCode([{ id: 'c', kind: 'check', status: 'PASS' }, { id: 'r', kind: 'report', status: 'REPORT' }]), 0)
  assert.equal(exitCode([{ id: 'c', kind: 'check', status: 'PASS' }, { id: 'r', kind: 'report', status: 'ERROR' }]), 2)
  const counted = render([{ id: 'c', kind: 'check', status: 'PASS', evidence: [], review: [] }, { id: 'r', kind: 'report', status: 'ERROR', evidence: [], review: [] }])
  assert.match(counted, /^Result: 1 PASS, 0 FAIL, 0 SKIP, 1 ERROR, 0 BLOCKED$/m)
})

// merge-check::REQ-001/AC-04, merge-check::REQ-003/AC-05
test('every dependency is a check listed before it in the same mode', () => {
  for (const mode of ['before', 'after']) {
    const ids = CHECKS.filter((c) => c.modes.includes(mode)).map((c) => c.id)
    for (const c of CHECKS.filter((c) => c.modes.includes(mode))) {
      for (const need of c.needs[mode]) {
        assert.ok(ids.indexOf(need) >= 0 && ids.indexOf(need) < ids.indexOf(c.id), `${mode} ${c.id} needs ${need}`)
      }
    }
  }
})

test('the checks that read the head depend on pr-head and head-ref, and pr-mergeable on pr-open', () => {
  const needs = (id) => CHECKS.find((c) => c.id === id).needs.before
  for (const id of ['up-to-date', 'closing-keywords', 'privacy', 'attribution', 'forbidden-words', 'bare-refs', 'commit-identity', 'ci', 'spec-check', 'adr-check', 'action-pins', 'documents-only']) {
    assert.deepEqual([...needs(id)].sort(), ['head-ref', 'pr-head'], id)
  }
  assert.deepEqual(needs('pr-mergeable'), ['pr-open'])
  assert.deepEqual(CHECKS.find((c) => c.id === 'merged-tree').needs.after.sort(), ['head-ref', 'pr-head', 'pr-merged'])
})

// --- The checks against facts given as plain values ---

const TIP = 'b'.repeat(40)
const OTHER = 'c'.repeat(40)
const COMMIT = 'd'.repeat(40)
const MERGE = 'e'.repeat(40)
const NOREPLY = '1234+octo-test@users.noreply.github.com'
// The shape of a real closingIssuesReferences entry
const ref = (number, owner = 'example-org', name = 'demo') => ({
  id: `I_kwTEST${number}`, number, repository: { id: 'R_kgTEST', name, owner: { id: 'O_kgTEST', login: owner } }, url: `https://github.com/${owner}/${name}/issues/${number}`,
})
// A job log in the shape of a real one: a timestamp before each line
const jobLog = (head, tip) => [
  '2026-01-02T03:04:05.1000000Z ##[group]Checking out the ref',
  '2026-01-02T03:04:05.2000000Z [command]/usr/bin/git checkout --progress --force refs/remotes/pull/7/merge',
  `2026-01-02T03:04:05.3000000Z HEAD is now at 9901c89 Merge ${head} into ${tip}`,
  '2026-01-02T03:04:05.4000000Z ##[endgroup]',
].join('\n')

/** Facts of a pull request that passes every check of `mode`, with `over` replacing some of them */
function facts(over = {}) {
  const pr = { number: 7, title: 'Add the widget', body: 'Adds the widget.\n\nCloses #12\n', state: 'OPEN', headRefOid: HEAD, baseRefName: 'main', mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', closingIssuesReferences: [ref(12)], mergeCommit: null }
  return {
    defaultBranch: 'main',
    pr: () => pr,
    mergeability: () => ({ mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN' }),
    fetchedHead: () => HEAD,
    tip: () => TIP,
    tipIsAncestor: () => true,
    forkPoint: () => TIP,
    commits: () => [{ sha: COMMIT, authorEmail: NOREPLY, committerEmail: NOREPLY, message: 'Add the widget\n\nIt draws the widget.\n' }],
    diff: () => ({ files: [{ status: 'M', path: 'src/widget.js', binary: false }], added: [{ path: 'src/widget.js', line: 3, text: 'export const widget = 1' }] }),
    squashBody: () => 'Adds the widget.\n\nCloses #12\n',
    environment: () => ({ home: '/srv/mc-home', user: 'mc_tester', emails: [{ scope: 'global', value: 'person@example.invalid' }, { scope: 'local', value: NOREPLY }] }),
    user: () => ({ id: 1234, login: 'octo-test' }),
    issue: (n) => ({ 12: { exists: true, state: 'open', title: 'Draw the widget' }, 7: { exists: true, state: 'closed', title: 'Add the widget' } })[n] ?? { exists: false },
    ciRuns: () => [{ databaseId: 11, event: 'pull_request', workflowName: 'CI', workflowDatabaseId: 101, createdAt: '2026-01-02T03:00:00Z', status: 'completed', conclusion: 'success', headSha: HEAD }],
    runView: () => ({ headSha: HEAD, status: 'completed', conclusion: 'success', jobs: [{ databaseId: 21, name: 'checks', status: 'completed', conclusion: 'success' }] }),
    jobLog: () => jobLog(HEAD, TIP),
    workflowsAtHead: () => true,
    workflowFilesAtHead: () => true,
    adrAtHead: () => false,
    runScript: (name) => ({ code: name === 'change-scope.mjs' ? 1 : 0, out: `${name} output` }),
    cleanup: () => ({ left: [] }),
    // after
    landedMessage: () => 'Add the widget (#7)\n\nAdds the widget.\n\nCloses #12\n',
    mergeTree: () => OTHER,
    headTree: () => OTHER,
    mergeIdentity: () => ({ author: NOREPLY, committer: 'noreply@github.com' }),
    issueState: () => 'closed',
    ...over,
  }
}
const merged = (over = {}) => {
  const pr = { ...facts().pr(), state: 'MERGED', mergeCommit: { oid: MERGE } }
  return facts({ pr: () => pr, ...over })
}
const withPr = (fields, base = facts) => { const pr = { ...base().pr(), ...fields }; return { pr: () => pr } }

const OPTS = { repo: 'example-org/demo', pr: 7, head: HEAD, forbid: [], ignoreJob: [] }
const opts = (over = {}) => {
  const slept = []
  let clock = 0
  return { ...OPTS, sleep: async (ms) => { slept.push(ms); clock += ms }, now: () => clock, slept, ...over }
}
async function check(mode, f, o = opts()) {
  const results = await runChecks(mode, f, o)
  return { results, out: render(results), status: (id) => results.find((r) => r.id === id)?.status, of: (id) => results.find((r) => r.id === id) }
}
const parsed = (...extra) => parseArgs([...BEFORE, ...extra])

test('a pull request that holds every rule passes every check of both modes', async () => {
  const b = await check('before', facts(), opts({ forbid: parsed('--forbid', 'secret').forbid }))
  assert.equal(exitCode(b.results), 0, b.out)
  const a = await check('after', merged(), opts({ forbid: parsed('--forbid', 'secret').forbid }))
  assert.equal(exitCode(a.results), 0, a.out)
})

// merge-check::REQ-001/AC-04: one failing scenario for every id of CHECKS, and no scenario for an id it does not have;
// an id whose failing scenario another case drives names that case
const errs = () => { throw new Error('gh: HTTP 502') }
const FAILING = {
  'pr-open': ['before', facts(withPr({ state: 'CLOSED' }))],
  'pr-merged': ['after', merged(withPr({ state: 'OPEN', mergeCommit: null }))],
  'pr-head': ['before', facts(withPr({ headRefOid: OTHER }))],
  'pr-base': ['before', facts(withPr({ baseRefName: 'develop' }))],
  'pr-mergeable': ['before', facts(withPr({ mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY' }))],
  'head-ref': { coveredBy: 'a failed or errored dependency blocks the checks that need it…' },
  'up-to-date': ['before', facts({ tipIsAncestor: () => false })],
  'merged-tree': ['after', merged({ mergeTree: () => TIP })],
  'merge-author': ['after', merged({ mergeIdentity: () => ({ author: 'someone@example.invalid', committer: 'noreply@github.com' }) })],
  'closing-keywords': { coveredBy: 'prints each check line, its evidence indented…' },
  'closing-links': ['before', facts(withPr({ closingIssuesReferences: [] }))],
  privacy: { coveredBy: 'privacy fails on $HOME in any case, and on the local part of an address' },
  attribution: ['before', facts(withPr({ body: 'Closes #12\n\nGenerated with a tool' }))],
  'forbidden-words': ['before', facts(withPr({ title: 'The Secret widget' })), { forbid: parsed('--forbid', 'secret').forbid }],
  'bare-refs': ['before', facts(withPr({ body: 'Closes #12\nSee #404.' }))],
  'commit-identity': ['before', facts({ commits: () => [{ sha: COMMIT, authorEmail: 'someone@example.invalid', committerEmail: NOREPLY, message: 'x' }] })],
  ci: { coveredBy: 'ci fails on a run that failed' },
  'spec-check': ['before', facts({ diff: () => ({ files: [{ status: 'M', path: 'docs/specs/area.md', binary: false }], added: [] }), runScript: (n) => ({ code: 1, out: `${n} output` }) })],
  'adr-check': { coveredBy: 'the document checks run on the paths they own and map 0, 1 and anything else' },
  'action-pins': ['before', facts({ diff: () => ({ files: [{ status: 'M', path: '.github/workflows/ci.yml', binary: false }], added: [] }), runScript: (n) => ({ code: n === 'check-action-pins.mjs' ? 1 : 0, out: '' }) })],
  'issues-closed': { coveredBy: 'issues-closed reads an open issue again…' },
  'closing-issues': ['before', facts({ pr: errs })],
  'changed-files': ['before', facts({ diff: errs })],
  'documents-only': ['before', facts({ runScript: (n) => ({ code: n === 'change-scope.mjs' ? 2 : 0, out: 'git failed' }) })],
  cleanup: ['before', facts({ cleanup: () => ({ left: ['worktree /tmp/x'] }) })],
}

test('the failing scenarios name every check and report, and nothing else', () => {
  assert.deepEqual(Object.keys(FAILING).sort(), CHECKS.map((c) => c.id).sort())
})

for (const [id, scenario] of Object.entries(FAILING)) {
  if (!Array.isArray(scenario)) continue
  const [mode, f, over] = scenario
  const c = CHECKS.find((x) => x.id === id)
  const expected = c.kind === 'report' || id === 'cleanup' ? 'ERROR' : 'FAIL'
  test(`${id} gives ${expected} in its failing scenario`, async () => {
    const r = await check(mode, f, opts(over))
    assert.match(r.out, new RegExp(`^${expected} ${id}: `, 'm'), r.out)
    assert.notEqual(exitCode(r.results), 0)
  })
}

test('--list prints every check and report with its modes and dependencies', () => {
  const lines = listLines()
  assert.equal(lines.length, CHECKS.length)
  assert.ok(lines.some((l) => l === 'pr-mergeable (check; before; needs before: pr-open): mergeable is MERGEABLE and mergeStateStatus CLEAN, or UNSTABLE where --ignore-job matched a job of the ci runs and at least one statusCheckRollup entry is not passing and all such entries are check runs matched by --ignore-job; read up to 5 times 3 s apart while UNKNOWN'), lines.join('\n'))
  const ci = lines.find((line) => line.startsWith('ci (check;'))
  assert.match(ci, /no file anywhere under \.github\/workflows\//)
  assert.match(ci, /every merge line merging the reviewed head into the current default-branch tip/)
  assert.ok(lines.some((l) => l.startsWith('closing-keywords (check; before, after; needs before: pr-head, head-ref; after: pr-merged): ')))
})

// merge-check::REQ-002/AC-01..AC-03
test('prints each check line, its evidence indented, the review block and the counts', async () => {
  const r = await check('before', facts(withPr({ title: 'Fixes #12' })))
  assert.match(r.out, /^FAIL closing-keywords: 1 closing reference\(s\) outside a Closes line\n {4}title: Fixes #12$/m)
  assert.match(r.out, /^For review:$/m)
  assert.match(r.out, /^ {4}closing-issues: closes example-org\/demo#12 https:\/\/github\.com\/example-org\/demo\/issues\/12$/m)
  assert.match(r.out, /^Result: \d+ PASS, 1 FAIL, 4 SKIP, 0 ERROR, 0 BLOCKED\n$/m)
  assert.doesNotMatch(r.out, /^\w+ (closing-issues|changed-files|documents-only):/m, 'a report that does not err prints no status line')
})

// merge-check::REQ-002/AC-02
test('a failed or errored dependency blocks the checks that need it, and a check whose dependencies passed never is', async () => {
  const failed = await check('before', facts({ fetchedHead: () => OTHER }))
  for (const id of ['up-to-date', 'privacy', 'commit-identity', 'ci', 'spec-check']) assert.match(failed.out, new RegExp(`^BLOCKED ${id}: not run, head-ref failed$`, 'm'))
  assert.match(failed.out, /^ {4}documents-only: not run, head-ref failed$/m)
  assert.equal(failed.status('closing-links'), 'PASS', 'closing-links reads no head')
  assert.equal(exitCode(failed.results), 1)
  const errored = await check('before', facts({ pr: errs }))
  assert.match(errored.out, /^ERROR pr-open: gh: HTTP 502$/m)
  assert.match(errored.out, /^BLOCKED pr-mergeable: not run, pr-open errored$/m)
  assert.equal(exitCode(errored.results), 2)
})

test('a fact that cannot be read while the dependencies passed is an ERROR, not BLOCKED', async () => {
  const r = await check('before', facts({ commits: errs }))
  assert.match(r.out, /^ERROR commit-identity: gh: HTTP 502$/m)
  assert.match(r.out, /^ERROR privacy: gh: HTTP 502$/m)
  assert.equal(exitCode(r.results), 2)
})

// merge-check::REQ-003/AC-04
test('reads mergeability again while it is UNKNOWN, five reads 3 s apart in all', async () => {
  const answers = (n) => { const seq = Array(n).fill({ mergeable: 'UNKNOWN', mergeStateStatus: 'UNKNOWN' }); return () => seq.shift() ?? { mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN' } }
  const unknown = withPr({ mergeable: 'UNKNOWN', mergeStateStatus: 'UNKNOWN' })
  const o = opts()
  const late = await check('before', facts({ ...unknown, mergeability: answers(3) }), o)
  assert.equal(late.status('pr-mergeable'), 'PASS', late.out)
  assert.deepEqual(o.slept, [3000, 3000, 3000, 3000])
  const never = await check('before', facts({ ...unknown, mergeability: answers(4) }))
  assert.match(never.out, /^ERROR pr-mergeable: mergeable UNKNOWN, mergeStateStatus UNKNOWN after 5 reads 3 s apart$/m)
  const blocked = await check('before', facts(withPr({ mergeable: 'MERGEABLE', mergeStateStatus: 'BLOCKED' })))
  assert.equal(blocked.status('pr-mergeable'), 'FAIL')
})

for (const first of [{ mergeable: 'MERGEABLE', mergeStateStatus: 'UNKNOWN' }, { mergeable: 'UNKNOWN', mergeStateStatus: 'CLEAN' }]) {
  test(`reads mergeability again on mergeable ${first.mergeable} and mergeStateStatus ${first.mergeStateStatus}`, async () => {
    const o = opts()
    const r = await check('before', facts({ ...withPr(first), mergeability: () => ({ mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN' }) }), o)
    assert.equal(r.status('pr-mergeable'), 'PASS', r.out)
    assert.deepEqual(o.slept, [3000])
  })
}

// merge-check::REQ-003/AC-04, merge-check::REQ-003/AC-06. A rollup in the shape `gh pr view --json statusCheckRollup`
// gives: check runs as a real CI run lists them (one skipped), and a status context with the fields of GitHub's schema
const checkRun = (name, status = 'COMPLETED', conclusion = 'SUCCESS') => ({ __typename: 'CheckRun', completedAt: status === 'COMPLETED' ? '2026-01-02T03:10:00Z' : '0001-01-01T00:00:00Z', conclusion, detailsUrl: `https://github.com/example-org/demo/actions/runs/11/job/${name.length}`, name, startedAt: '2026-01-02T03:01:00Z', status, workflowName: 'CI' })
const statusContext = (context, state) => ({ __typename: 'StatusContext', context, description: `${context} ${state.toLowerCase()}`, state, targetUrl: 'https://deploy.example.invalid/7' })
const GREEN_ROLLUP = [checkRun('Changed scopes'), checkRun('Repository checks'), checkRun('Site checks', 'COMPLETED', 'SKIPPED'), statusContext('deploy/docs', 'SUCCESS')]
const IGNORED_ROLLUP = [...GREEN_ROLLUP, checkRun('build (macOS)', 'IN_PROGRESS', ''), checkRun('CI gate', 'COMPLETED', 'FAILURE')]
// The run's jobs, read when a test runs: `view` and `job` are the helpers of merge-check::REQ-013 below
const macJobs = () => view([job('build (ubuntu)'), job('build (macOS)', 'in_progress', '', 22), job('CI gate', 'completed', 'failure', 23)], { status: 'in_progress', conclusion: '' })()
const unstable = (rollup, state = 'UNSTABLE') => facts({ ...withPr({ mergeStateStatus: state, statusCheckRollup: rollup }), runView: macJobs })
const MAC = () => opts({ ignoreJob: parsed('--ignore-job', 'build \\(macOS\\)', '--ignore-job', 'CI gate').ignoreJob })

test('pr-mergeable passes UNSTABLE when every entry that is not passing is a check run of an ignored job', async () => {
  const r = await check('before', unstable(IGNORED_ROLLUP), MAC())
  assert.match(r.out, /^PASS pr-mergeable: mergeable MERGEABLE, mergeStateStatus UNSTABLE$/m, r.out)
  assert.match(r.out, /^ {4}pr-mergeable: mergeStateStatus UNSTABLE$/m)
  assert.match(r.out, /^ {4}pr-mergeable: accepted statusCheckRollup: check run build \(macOS\) IN_PROGRESS\/-$/m)
  assert.match(r.out, /^ {4}pr-mergeable: accepted statusCheckRollup: check run CI gate COMPLETED\/FAILURE$/m)
  assert.doesNotMatch(r.out, /accepted statusCheckRollup: (check run (Changed scopes|Repository checks|Site checks)|status context)/)
})

for (const [what, o] of [['no --ignore-job', () => opts()], ['an --ignore-job that matched no job of the runs', () => opts({ ignoreJob: parsed('--ignore-job', 'deploy').ignoreJob })]]) {
  test(`pr-mergeable fails UNSTABLE with ${what}`, async () => {
    const r = await check('before', unstable([...GREEN_ROLLUP, checkRun('deploy', 'COMPLETED', 'FAILURE'), statusContext('deploy/preview', 'ERROR')]), o())
    assert.match(r.out, /^FAIL pr-mergeable: mergeable MERGEABLE, mergeStateStatus UNSTABLE\n {4}statusCheckRollup: check run deploy COMPLETED\/FAILURE\n {4}statusCheckRollup: status context deploy\/preview ERROR$/m, r.out)
  })
}

for (const entry of [checkRun('lint', 'COMPLETED', 'FAILURE'), checkRun('build (macOS) arm', 'QUEUED', ''), checkRun('Build (macos)', 'COMPLETED', 'CANCELLED')]) {
  test(`pr-mergeable fails UNSTABLE on a check run no --ignore-job matches: ${entry.name}`, async () => {
    const r = await check('before', unstable([...IGNORED_ROLLUP, entry]), MAC())
    assert.match(r.out, /^FAIL pr-mergeable: mergeable MERGEABLE, mergeStateStatus UNSTABLE$/m, r.out)
    assert.match(r.out, new RegExp(`^ {4}statusCheckRollup: check run ${entry.name.replace(/[()]/g, '\\$&')} ${entry.status}/${entry.conclusion || '-'}$`, 'm'))
    assert.doesNotMatch(r.out, /^ {4}statusCheckRollup: check run (build \(macOS\) IN_PROGRESS|CI gate COMPLETED)\//m, 'an accepted entry is not evidence')
  })
}

test('pr-mergeable fails UNSTABLE on a status context that is not passing, whatever its name, and on an entry of another kind', async () => {
  const r = await check('before', unstable([...IGNORED_ROLLUP, statusContext('deploy/preview', 'FAILURE'), statusContext('build (macOS)', 'PENDING'), { __typename: 'Other', name: 'CI gate' }]), MAC())
  assert.match(r.out, /^FAIL pr-mergeable: /m, r.out)
  assert.match(r.out, /^ {4}statusCheckRollup: status context deploy\/preview FAILURE$/m)
  assert.match(r.out, /^ {4}statusCheckRollup: status context build \(macOS\) PENDING$/m)
  assert.match(r.out, /^ {4}statusCheckRollup: Other \{"__typename":"Other","name":"CI gate"\}$/m)
  assert.doesNotMatch(r.out, /status context deploy\/docs/)
})

test('pr-mergeable fails an UNSTABLE that no entry of the rollup explains', async () => {
  const r = await check('before', unstable(GREEN_ROLLUP), MAC())
  assert.match(r.out, /^FAIL pr-mergeable: mergeable MERGEABLE, mergeStateStatus UNSTABLE\n {4}statusCheckRollup: no entry that is not passing$/m, r.out)
})

for (const state of ['BLOCKED', 'BEHIND', 'DIRTY']) {
  test(`pr-mergeable fails ${state} even where only ignored jobs are not passing`, async () => {
    const r = await check('before', unstable(IGNORED_ROLLUP, state), MAC())
    assert.match(r.out, new RegExp(`^FAIL pr-mergeable: mergeable MERGEABLE, mergeStateStatus ${state}$`, 'm'), r.out)
  })
}

test('pr-mergeable is an ERROR when the runs it matches --ignore-job against cannot be read', async () => {
  const r = await check('before', facts({ ...withPr({ mergeStateStatus: 'UNSTABLE', statusCheckRollup: IGNORED_ROLLUP }), ciRuns: errs }), MAC())
  assert.match(r.out, /^ERROR pr-mergeable: gh: HTTP 502$/m, r.out)
})

// merge-check::REQ-006/AC-01
for (const [where, over] of [
  ['a commit message', { commits: () => [{ sha: COMMIT, authorEmail: NOREPLY, committerEmail: NOREPLY, message: 'Draw it\n\nfix #3' }] }],
  ['a body line that only mentions a number after a keyword', withPr({ body: 'Closes #12\nNot fixed: #125' })],
  ['a reference to another repository', withPr({ body: 'Closes #12\nThis fixes other-org/demo#5' })],
  ['an upper-case keyword with a colon', withPr({ body: 'Closes #12\nCLOSES: #3' })],
  ['a Closes line that is not the exact form', withPr({ body: 'Closes #12\ncloses #12' })],
  ['the squash body', { squashBody: () => 'Resolved #12 here\nCloses #12' }],
]) {
  test(`closing-keywords fails on a closing reference in ${where}`, async () => {
    const r = await check('before', facts(over))
    assert.equal(r.status('closing-keywords'), 'FAIL', r.out)
  })
}

test('closing-keywords accepts Closes lines of the body and squash body, surrounding whitespace aside', async () => {
  const r = await check('before', facts({ ...withPr({ body: 'Adds it.\r\nCloses #12\r\n' }), squashBody: () => 'Adds it.\n  Closes #12  \n' }))
  assert.equal(r.status('closing-keywords'), 'PASS', r.out)
})

// merge-check::REQ-007
for (const [what, over, line] of [
  ['an issue GitHub will close that no Closes line names', withPr({ body: 'Adds it.', closingIssuesReferences: [ref(12)] }), /closingIssuesReferences: #12 is named by no Closes line of the body/],
  ['a Closes line GitHub does not link', withPr({ body: 'Closes #12\nCloses #13' }), /body:2: Closes #13 is not in closingIssuesReferences/],
  ['an issue of another repository', withPr({ closingIssuesReferences: [ref(12), ref(5, 'other-org', 'demo')] }), /closingIssuesReferences: other-org\/demo#5 is not an issue of example-org\/demo/],
  ['a squash-body Closes line GitHub does not link', { squashBody: () => 'Closes #12\nCloses #14' }, /squash-body:2: Closes #14 is not in closingIssuesReferences/],
]) {
  test(`closing-links fails on ${what}`, async () => {
    const r = await check('before', facts(over))
    assert.equal(r.status('closing-links'), 'FAIL', r.out)
    assert.match(r.out, line)
  })
}

test('closing-links accepts a squash body that closes fewer issues than the body', async () => {
  const r = await check('before', facts({ ...withPr({ body: 'Closes #12\nCloses #13', closingIssuesReferences: [ref(12), ref(13)] }), squashBody: () => 'Closes #13' }))
  assert.equal(r.status('closing-links'), 'PASS', r.out)
})

test('closing-links fails on a landed Closes line GitHub did not link', async () => {
  const r = await check('after', merged({ landedMessage: () => 'Add it (#7)\n\nCloses #12\nCloses #15' }))
  assert.match(r.out, /^ {4}message:4: Closes #15 is not in closingIssuesReferences$/m)
})

// merge-check::REQ-005/AC-01, REQ-016/AC-05: the landed message after the merge, and commit messages before it
for (const [id, text, over] of [
  ['closing-keywords', 'fixes #12', {}],
  ['privacy', 'Moved from /srv/mc-home/x', {}],
  ['attribution', 'Co-Authored-By: a tool', {}],
  ['forbidden-words', 'A secret step', { forbid: parsed('--forbid', 'secret').forbid }],
  ['bare-refs', 'See #404', {}],
]) {
  test(`${id} reads the landed message after the merge`, async () => {
    const r = await check('after', merged({ landedMessage: () => `Add the widget (#7)\n\n${text}\nCloses #12\n` }), opts(over))
    assert.match(r.out, new RegExp(`^FAIL ${id}: .*\\n {4}message:3: `, 'm'), r.out)
  })
}
for (const [id, text, over] of [['privacy', 'Moved from /srv/mc-home/x', {}], ['forbidden-words', 'A secret step', { forbid: parsed('--forbid', 'secret').forbid }]]) {
  test(`${id} reads the commit messages before the merge`, async () => {
    const r = await check('before', facts({ commits: () => [{ sha: COMMIT, authorEmail: NOREPLY, committerEmail: NOREPLY, message: `Add it\n\n${text}` }] }), opts(over))
    assert.match(r.out, new RegExp(`^FAIL ${id}: .*\\n {4}commit ddddddd: `, 'm'), r.out)
  })
}

test('the checks of the messages leave added lines and paths alone, and closing-links the title and commit messages', async () => {
  const text = 'Fixes #404, Closes #13, Co-Authored-By: a tool'
  const files = [{ status: 'A', path: 'notes/Generated with x.md', binary: false }, { status: 'A', path: 'Closes #13', binary: false }]
  const diff = () => ({ files, added: [{ path: 'notes/a.md', line: 1, text }, { path: 'notes/a.md', line: 2, text: 'Closes #13' }] })
  const r = await check('before', facts({ diff }))
  for (const id of ['closing-keywords', 'closing-links', 'attribution', 'bare-refs']) assert.equal(r.status(id), 'PASS', `${id}\n${r.out}`)
  const titled = await check('before', facts({ ...withPr({ title: 'Closes #13' }), commits: () => [{ sha: COMMIT, authorEmail: NOREPLY, committerEmail: NOREPLY, message: 'Add it\n\nCloses #13' }] }))
  assert.equal(titled.status('closing-links'), 'PASS', titled.out)
})

// merge-check::REQ-008
const leak = (text) => ({ diff: () => ({ files: [{ status: 'A', path: 'notes.txt', binary: false }], added: [{ path: 'notes.txt', line: 2, text }] }) })
for (const [what, over, line] of [
  ['$HOME in any case', leak('see /SRV/MC-HOME/notes'), /diff notes\.txt:\+2: \$HOME: see/],
  ['$USER written with another of _ - .', leak('owner mc-Tester'), /diff notes\.txt:\+2: \$USER: owner mc-Tester/],
  ['an address of user.email', withPr({ body: 'Closes #12\nmail Person@Example.invalid' }), /body:2: user\.email \(global\): /],
  ['the local part of an address', { squashBody: () => 'Closes #12\nby person' }, /squash-body:2: local part of user\.email \(global\): by person/],
  ['a value in a file path', { diff: () => ({ files: [{ status: 'A', path: 'docs/mc_tester.md', binary: false }], added: [] }) }, /path docs\/mc_tester\.md: \$USER: /],
  ['a value in the title', withPr({ title: 'From /srv/mc-home' }), /title: \$HOME: /],
]) {
  test(`privacy fails on ${what}`, async () => {
    const r = await check('before', facts(over))
    assert.equal(r.status('privacy'), 'FAIL', r.out)
    assert.match(r.out, line)
  })
}

test('privacy leaves out the noreply address, and the local part that is the login', async () => {
  const env = { home: '/srv/mc-home', user: 'mc_tester', emails: [{ scope: 'global', value: 'octo-test@example.invalid' }, { scope: 'local', value: NOREPLY }] }
  const r = await check('before', facts({ environment: () => env, ...withPr({ body: `Closes #12\nby octo-test, ${NOREPLY}` }) }))
  assert.equal(r.status('privacy'), 'PASS', r.out)
})

test('privacy lists generic home paths for review and does not fail on them', async () => {
  const r = await check('before', facts(leak('cd ~/work; ls /Users/; ls /HOME/x')))
  assert.equal(r.status('privacy'), 'PASS', r.out)
  assert.match(r.out, /^ {4}privacy: generic path: diff notes\.txt:\+2: cd ~\/work; ls \/Users\/; ls \/HOME\/x$/m)
})

for (const [what, env, reason] of [
  ['$HOME unset', { home: undefined, user: 'mc_tester', emails: [] }, /\$HOME is unset or empty/],
  ['$USER empty', { home: '/srv/mc-home', user: '', emails: [] }, /\$USER is unset or empty/],
  ['a local part of 2 characters', { home: '/srv/mc-home', user: 'mc_tester', emails: [{ scope: 'global', value: 'ab@example.invalid' }] }, /local part of user\.email \(global\) is shorter than 3 characters/],
]) {
  test(`privacy errs on ${what}`, async () => {
    const r = await check('before', facts({ environment: () => env }))
    assert.equal(r.status('privacy'), 'ERROR', r.out)
    assert.match(r.out, reason)
  })
}

// merge-check::REQ-009
test('attribution fails in a commit message and leaves added lines alone', async () => {
  const r = await check('before', facts({ commits: () => [{ sha: COMMIT, authorEmail: NOREPLY, committerEmail: NOREPLY, message: 'Draw it\n\nCo-Authored-By: a tool' }] }))
  assert.match(r.out, /^FAIL attribution: .*\n {4}commit ddddddd: Co-Authored-By: a tool$/m)
  const added = await check('before', facts(leak('const banner = "Generated with care"')))
  assert.equal(added.status('attribution'), 'PASS', added.out)
})

// merge-check::REQ-010
test('forbidden-words reads added lines and paths, and skips without --forbid', async () => {
  const forbid = parsed('--forbid', 'intern(al)?').forbid
  const diff = () => ({ files: [{ status: 'A', path: 'docs/Intern-plan.md', binary: false }], added: [{ path: 'docs/Intern-plan.md', line: 2, text: 'an INTERNAL note' }] })
  const r = await check('before', facts({ diff }), opts({ forbid }))
  assert.match(r.out, /^ {4}diff docs\/Intern-plan\.md:\+2: --forbid intern\(al\)\?: an INTERNAL note$/m)
  assert.match(r.out, /^ {4}path docs\/Intern-plan\.md: --forbid intern\(al\)\?: docs\/Intern-plan\.md$/m)
  const none = await check('before', facts())
  assert.match(none.out, /^SKIP forbidden-words: no --forbid given$/m)
})

// merge-check::REQ-011: the shape of gh's answers (a 404 prints the error JSON on stdout and exits 1)
test('an issue lookup reads exit 0 as the issue, a 404 as none, and any other failure as an error', () => {
  assert.deepEqual(issueAnswer({ status: 0, stdout: JSON.stringify({ number: 7, state: 'closed', title: 'Add it', pull_request: {} }), stderr: '' }, 'call'), { exists: true, state: 'closed', title: 'Add it' })
  assert.deepEqual(issueAnswer({ status: 1, stdout: '{"message":"Not Found","documentation_url":"https://docs.github.com/rest/issues/issues#get-an-issue","status":"404"}', stderr: 'gh: Not Found (HTTP 404)\n' }, 'call'), { exists: false })
  assert.throws(() => issueAnswer({ status: 1, stdout: '{"message":"Server Error","status":"502"}', stderr: 'gh: HTTP 502\n' }, 'gh api x'), /^Error: gh api x exited 1: gh: HTTP 502$/)
  assert.throws(() => issueAnswer({ status: 1, stdout: '', stderr: 'error connecting to api.github.com\n' }, 'gh api x'), /exited 1: error connecting to api\.github\.com$/)
})

// merge-check::REQ-011
test('bare-refs looks up only bare references and lists the ones that exist for review', async () => {
  const looked = []
  const issue = (n) => { looked.push(n); return { exists: true, state: 'open', title: `Issue ${n}` } }
  const r = await check('before', facts({ issue, ...withPr({ body: 'Closes #12\n&#123; a#1 x/#2 #3abc _#4 ##5 (#6)' }) }))
  assert.deepEqual(looked.sort((a, b) => a - b), [6, 12])
  assert.match(r.out, /^ {4}bare-refs: #12 open: Issue 12$/m)
})

// merge-check::REQ-005/AC-01: the cells of the check × text table no other case drives, each with a hit in that text only
const IN_TEXT = {
  title: (x) => withPr({ title: x }),
  body: (x) => withPr({ body: `Closes #12\n${x}` }),
  commit: (x) => ({ commits: () => [{ sha: COMMIT, authorEmail: NOREPLY, committerEmail: NOREPLY, message: `Draw it\n\n${x}` }] }),
  squash: (x) => ({ squashBody: () => `Closes #12\n${x}` }),
}
const SOURCE = { title: 'title', body: 'body:2', commit: 'commit ddddddd', squash: 'squash-body:2' }
const HIT = { attribution: ['Generated with a tool', []], 'forbidden-words': ['a secret plan', ['--forbid', 'secret']], 'bare-refs': ['See #404.', []] }
for (const [id, kind] of [['attribution', 'title'], ['attribution', 'squash'], ['forbidden-words', 'body'], ['forbidden-words', 'squash'], ['bare-refs', 'title'], ['bare-refs', 'commit'], ['bare-refs', 'squash']]) {
  test(`${id} fails on a hit in the ${kind}`, async () => {
    const [text, args] = HIT[id]
    const r = await check('before', facts(IN_TEXT[kind](text)), opts({ forbid: parsed(...args).forbid }))
    assert.match(r.out, new RegExp(`^FAIL ${id}: .*\\n {4}${SOURCE[kind]}: `, 'm'), r.out)
  })
}

// merge-check::REQ-012
test('commit-identity fails on a committer that is not the noreply address and prints the address expected', async () => {
  const r = await check('before', facts({ commits: () => [{ sha: COMMIT, authorEmail: NOREPLY, committerEmail: 'person@example.invalid', message: 'x' }] }))
  assert.match(r.out, /^FAIL commit-identity: 1 commit\(s\) not by 1234\+octo-test@users\.noreply\.github\.com\n {4}commit ddddddd: author 1234\+octo-test@users\.noreply\.github\.com, committer person@example\.invalid$/m)
})

// merge-check::REQ-013
const run = (over = {}) => ({ databaseId: 11, event: 'pull_request', workflowName: 'CI', workflowDatabaseId: 101, createdAt: '2026-01-02T03:00:00Z', status: 'completed', conclusion: 'success', headSha: HEAD, ...over })
const job = (name, status = 'completed', conclusion = 'success', databaseId = 21) => ({ databaseId, name, status, conclusion })
const view = (jobs, over = {}) => () => ({ headSha: HEAD, status: 'completed', conclusion: 'success', jobs, ...over })
const ci = async (over, o = opts()) => { const r = await check('before', facts(over), o); return { ...r, line: r.out.split('\n').find((l) => / ci: /.test(l)) } }

test('ci skips without runs and workflows, and fails without runs while workflows exist', async () => {
  assert.equal((await ci({ ciRuns: () => [], workflowsAtHead: () => false })).line, 'SKIP ci: no CI workflow')
  assert.match((await ci({ ciRuns: () => [run({ event: 'push' })] })).line, /^FAIL ci: no pull_request run on the head/)
})

for (const [what, over, summary, line] of [
  ['a run of another head', { runView: view([job('checks')], { headSha: OTHER }) }, /problem/, /run 11 \(CI\): headSha c{40} is not the head/],
  ['a run in progress', { runView: view([job('checks', 'in_progress', '')], { status: 'in_progress', conclusion: '' }) }, /not finished: wait with watch-ci\.sh, then rerun/, /status in_progress/],
  ['a run that failed', { runView: view([job('checks')], { conclusion: 'failure' }) }, /problem/, /conclusion failure/],
  ['a merge into an older tip', { jobLog: () => jobLog(HEAD, OTHER) }, /the CI tested the head against an older default branch/, /merged the head into ccccccc, not the current tip bbbbbbb/],
  ['a merge of another head', { jobLog: () => jobLog(OTHER, TIP) }, /problem/, /merged ccccccc, not the head/],
  ['no merge line', { jobLog: () => 'no checkout here' }, /problem/, /no job that is not ignored or skipped has a line/],
]) {
  test(`ci fails on ${what}`, async () => {
    const r = await ci(over)
    assert.match(r.line, /^FAIL ci: /)
    assert.match(r.line, summary)
    assert.match(r.out, line)
  })
}

test('ci leaves an ignored job and the run status out, and holds the other jobs to completed', async () => {
  const jobs = [job('build (ubuntu)', 'completed', 'success', 21), job('build (macOS)', 'in_progress', '', 22), job('CI gate', 'in_progress', '', 23), job('site', 'completed', 'skipped', 24)]
  const logs = { 21: jobLog(HEAD, TIP) }
  const o = opts({ ignoreJob: parsed('--ignore-job', 'build \\(macOS\\)', '--ignore-job', 'CI gate', '--ignore-job', 'deploy').ignoreJob })
  // The log of the skipped job 24 cannot be read, and those of the ignored jobs merged another head
  const jobLogOf = (id) => { if (id === 24) throw new Error('gh: the log of a skipped job'); return logs[id] ?? jobLog(OTHER, OTHER) }
  const r = await ci({ runView: view(jobs, { status: 'in_progress', conclusion: '' }), jobLog: jobLogOf }, o)
  assert.match(r.line, /^PASS ci: /, r.out)
  assert.match(r.out, /^ {4}ci: run 11 \(CI\): ignored job build \(macOS\): in_progress\/-$/m)
  assert.match(r.out, /^ {4}ci: run 11 \(CI\): run status in_progress, conclusion -$/m)
  assert.match(r.out, /^ {4}ci: run 11 \(CI\): --ignore-job CI gate matched CI gate$/m)
  assert.match(r.out, /^ {4}ci: run 11 \(CI\): --ignore-job deploy matched none$/m)
  const pending = await ci({ runView: view([job('build (macOS)', 'completed', 'success', 22), job('build'), job('CI gate', 'in_progress', '', 23)], { status: 'in_progress' }) }, opts({ ignoreJob: parsed('--ignore-job', 'build \\(macOS\\)').ignoreJob }))
  assert.match(pending.line, /not finished/)
  assert.match(pending.out, /^ {4}run 11 \(CI\): job CI gate is in_progress$/m)
  const failing = await ci({ runView: view([job('build', 'completed', 'failure'), job('mac', 'in_progress', '', 22)], { status: 'in_progress' }) }, opts({ ignoreJob: parsed('--ignore-job', 'mac').ignoreJob }))
  assert.match(failing.out, /job build concluded failure/)
})

test('ci fails when every job is ignored, and matches a job name whole and with its case', async () => {
  const all = await ci({ runView: view([job('CI gate')]) }, opts({ ignoreJob: parsed('--ignore-job', 'CI gate').ignoreJob }))
  assert.match(all.out, /no job that is not ignored or skipped has a line/)
  const jobs = [job('CI gate (ubuntu)', 'completed', 'failure', 21), job('ci gate', 'completed', 'failure', 22)]
  const exact = await ci({ runView: view(jobs) }, opts({ ignoreJob: parsed('--ignore-job', 'CI gate').ignoreJob }))
  assert.match(exact.out, /job CI gate \(ubuntu\) concluded failure/)
  assert.match(exact.out, /job ci gate concluded failure/)
})

// gh lists the newest run first; the other order shows that the order does not choose the run
for (const order of ['newest first', 'oldest first']) test(`ci judges the latest run of each workflow, listed ${order}`, async () => {
  const newestFirst = [
    run({ databaseId: 11, createdAt: '2026-01-02T03:00:00Z' }),
    run({ databaseId: 10, createdAt: '2026-01-02T02:00:00Z' }),
    run({ databaseId: 30, workflowName: 'Docs', workflowDatabaseId: 102, createdAt: '2026-01-02T01:00:00Z' }),
    run({ databaseId: 29, workflowName: 'Docs', workflowDatabaseId: 102, createdAt: '2026-01-02T01:00:00Z' }),
  ]
  const runs = order === 'newest first' ? newestFirst : [...newestFirst].reverse()
  const viewed = []
  const runView = (id) => { viewed.push(id); return view([job('checks')], id === 10 || id === 29 ? { conclusion: 'failure' } : {})() }
  const r = await ci({ ciRuns: () => runs, runView })
  assert.match(r.line, /^PASS ci: 2 run\(s\)/, r.out)
  assert.deepEqual(viewed.sort(), [11, 30])
})

// merge-check::REQ-013: a workflow is its workflowDatabaseId; two workflow files may share a name
test('ci judges each of two workflows that share a name', async () => {
  const runs = [run({ databaseId: 11, createdAt: '2026-01-02T03:00:00Z' }), run({ databaseId: 10, workflowDatabaseId: 103, createdAt: '2026-01-02T02:59:55Z' })]
  const r = await ci({ ciRuns: () => runs, runView: (id) => view([job('checks')], id === 10 ? { conclusion: 'failure' } : {})() })
  assert.match(r.line, /^FAIL ci: /, r.out)
  assert.match(r.out, /^ {4}run 10 \(CI\): conclusion failure$/m)
})

// merge-check::REQ-014
const changing = (...paths) => ({ diff: () => ({ files: paths.map((path) => ({ status: 'M', path, binary: false })), added: [] }) })
const scripts = (codes) => { const calls = []; return { calls, runScript: (name, args) => { calls.push([name, ...args].join(' ')); return { code: codes[name] ?? 0, out: `${name} said\nFor review: a line` } } } }

test('the document checks run on the paths they own and map 0, 1 and anything else', async () => {
  const s = scripts({ 'check-spec.mjs': 0, 'check-adr.mjs': 1, 'check-action-pins.mjs': 7 })
  const r = await check('before', facts({ ...changing('docs/specs/area.md', '.github/workflows/ci.yml'), adrAtHead: () => true, runScript: s.runScript }))
  assert.match(r.out, /^PASS spec-check: check-spec\.mjs exited 0\n {4}check-spec\.mjs said\n {4}For review: a line$/m)
  assert.match(r.out, /^FAIL adr-check: check-adr\.mjs exited 1$/m)
  assert.match(r.out, /^ERROR action-pins: check-action-pins\.mjs gave no verdict \(exit 7\)$/m)
  assert.deepEqual(s.calls.sort(), [`change-scope.mjs --base ${TIP}`, 'check-action-pins.mjs', `check-adr.mjs --base ${TIP}`, `check-spec.mjs --base ${TIP}`])
  const missing = await check('before', facts({ ...changing('docs/specs/area.md'), runScript: () => ({ code: null, error: 'check-spec.mjs is missing', out: '' }) }))
  assert.match(missing.out, /^ERROR spec-check: check-spec\.mjs gave no verdict \(check-spec\.mjs is missing\)$/m)
})

test('action-pins skips a head that leaves no workflow file, and runs no script', async () => {
  const s = scripts({})
  const r = await check('before', facts({ ...changing('.github/workflows/ci.yml'), workflowFilesAtHead: () => false, runScript: s.runScript }))
  assert.match(r.out, /^SKIP action-pins: no workflow file at the head$/m, r.out)
  assert.ok(!s.calls.includes('check-action-pins.mjs'), s.calls.join('; '))
})

test('the document checks skip the paths they do not own, and adr-check a repository without docs/adr', async () => {
  const s = scripts({})
  const r = await check('before', facts({ ...changing('docs/specs/area.md'), runScript: s.runScript }))
  assert.match(r.out, /^SKIP adr-check: no docs\/adr$/m)
  assert.match(r.out, /^SKIP action-pins: /m)
  const adr = await check('before', facts({ ...changing('docs/adr/0002-x.md'), adrAtHead: () => true, runScript: s.runScript }))
  assert.match(adr.out, /^SKIP spec-check: /m)
  assert.match(adr.out, /^PASS adr-check: /m)
  const none = await check('before', facts({ ...changing('src/a.js'), adrAtHead: () => true }))
  assert.match(none.out, /^SKIP adr-check: the diff changes nothing under docs\/specs\/ or docs\/adr\/$/m)
})

// merge-check::REQ-015
test('lists changed files, rules files at any depth, binary files and the documents-only verdict for review', async () => {
  const files = [{ status: 'M', path: 'AGENTS.md', binary: false }, { status: 'A', path: 'app/CLAUDE.md', binary: false }, { status: 'A', path: 'site/logo.png', binary: true }, { status: 'D', path: 'old.txt', binary: false }]
  const r = await check('before', facts({ diff: () => ({ files, added: [] }), runScript: (n) => ({ code: 0, out: '' }) }))
  for (const line of ['changed-files: M AGENTS.md', 'changed-files: D old.txt', 'changed-files: rules file changed: AGENTS.md', 'changed-files: rules file changed: app/CLAUDE.md', 'changed-files: binary file: site/logo.png', 'documents-only: documents only: no executable change (change-scope.mjs exit 0)']) {
    assert.ok(r.out.includes(`\n    ${line}\n`), `${line}\n${r.out}`)
  }
  assert.equal(exitCode(r.results), 0, 'the review block leaves the exit code alone')
  const code = await check('before', facts({ diff: () => ({ files, added: [] }), runScript: (n) => ({ code: 1, out: '' }) }))
  assert.match(code.out, /^ {4}documents-only: not documents only: executable change \(change-scope\.mjs exit 1\)$/m)
})

// merge-check::REQ-016
// merge-check::REQ-016/AC-06: an entry of another repository is read in its own repository
test('issues-closed reads a closing issue of another repository there', async () => {
  const pr = { ...merged().pr(), closingIssuesReferences: [ref(12), ref(5, 'other-org', 'demo')] }
  const issueState = (owner, name, n) => (owner === 'other-org' && name === 'demo' && n === 5 ? 'open' : 'closed')
  const r = await check('after', merged({ pr: () => pr, issueState }))
  assert.match(r.out, /^FAIL issues-closed: 1 closing issue\(s\) still open after 30 s\n {4}other-org\/demo#5 is open$/m, r.out)
})

test('issues-closed reads an open issue again and passes once it closes within 30 s', async () => {
  const states = ['open', 'open', 'closed']
  const o = opts()
  const r = await check('after', merged({ issueState: () => states.shift() }), o)
  assert.equal(r.status('issues-closed'), 'PASS', r.out)
  const late = opts()
  const never = await check('after', merged({ issueState: () => 'open' }), late)
  assert.match(never.out, /^FAIL issues-closed: 1 closing issue\(s\) still open after 30 s\n {4}example-org\/demo#12 is open$/m)
  assert.equal(late.slept.reduce((a, b) => a + b, 0), 30000)
})

test('after the merge, the head checks and the merge commit are held to the head, and the committer is not judged', async () => {
  const r = await check('after', merged({ fetchedHead: () => OTHER }))
  assert.match(r.out, /^BLOCKED merged-tree: not run, head-ref failed$/m)
  assert.equal(r.status('merge-author'), 'PASS')
  const open = await check('after', merged(withPr({ state: 'OPEN', mergeCommit: null })))
  for (const id of ['merge-author', 'closing-keywords', 'privacy', 'issues-closed']) assert.equal(open.status(id), 'BLOCKED', id)
})

// --- The command line, against scratch repositories and a stub gh ---

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'merge-check.mjs')
const { scratch, env: gitEnv, git } = scratchRepos('merge-check-test-')

const STUB = `#!/usr/bin/env node
const { appendFileSync, readFileSync } = require('node:fs')
const args = process.argv.slice(2)
appendFileSync(process.env.MC_STUB_LOG, JSON.stringify(args) + '\\n')
const rules = JSON.parse(readFileSync(process.env.MC_STUB_FIXTURE, 'utf8'))
const hit = rules.find((r) => new RegExp(r.match).test(args.join(' ')))
if (!hit) { process.stderr.write('stub gh: no answer for: ' + args.join(' ') + '\\n'); process.exit(97) }
if (hit.exec) require('node:child_process').execFileSync(hit.exec[0], hit.exec.slice(1), { stdio: 'ignore' })
if (hit.makeRef) require('node:child_process').execFileSync('git', ['-C', hit.makeRef.dir, 'update-ref', hit.makeRef.prefix + process.ppid, hit.makeRef.oid])
if (hit.signalParent) process.kill(process.ppid, hit.signalParent)
const stdout = hit.stdout ?? ''
if (args[0] === 'pr' && args[1] === 'view' && !hit.code) {
  const fields = args[args.indexOf('--json') + 1].split(',')
  const response = JSON.parse(stdout)
  for (const field of fields) if (!Object.hasOwn(response, field)) {
    process.stderr.write('Unknown JSON field: ' + field)
    process.exit(1)
  }
  process.stdout.write(JSON.stringify(Object.fromEntries(fields.map((key) => [key, response[key]]))))
} else process.stdout.write(stdout)
process.stderr.write(hit.stderr ?? '')
process.exit(hit.code ?? 0)
`
const CAPABILITIES = 'working-language = "en"\n'
const WORKFLOW = 'name: CI\non:\n  pull_request:\njobs:\n  checks:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n'

/** Commits `files` in `cwd` as the noreply address, or as `email` */
function commitAs(root, cwd, files, message, email = NOREPLY, committer = email) {
  write(cwd, files)
  const e = { ...gitEnv, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_EMAIL: committer }
  for (const args of [['add', '-A'], ['commit', '-q', '-m', message]]) {
    const r = spawnSync('git', args, { cwd, env: e, encoding: 'utf8' })
    assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`)
  }
  return git(cwd, 'rev-parse', 'HEAD')
}

/**
 * An origin with main and refs/pull/7/head, and a checkout of it named `checkout`; `base` and `branch` are the files
 * of main and of the pull request's one commit. Returns the paths and the shas.
 */
function project({ base = { 'capabilities.toml': CAPABILITIES, '.github/workflows/ci.yml': WORKFLOW, 'README.md': '# Demo\n' }, branch = { 'docs/specs/area.md': '# Area\n\nThe area holds one widget.\n' }, main = 'main' } = {}) {
  const root = scratch()
  const origin = join(root, 'origin.git')
  const checkout = join(root, 'checkout')
  git(root, 'init', '-q', '--bare', '-b', main, origin)
  git(root, 'clone', '-q', origin, checkout)
  git(checkout, 'checkout', '-q', '-b', main)
  const tip = commitAs(root, checkout, base, 'Start the demo')
  git(checkout, 'push', '-q', 'origin', main)
  git(checkout, 'checkout', '-q', '-b', 'area')
  const head = commitAs(root, checkout, branch, 'Write the area spec')
  git(checkout, 'push', '-q', 'origin', 'HEAD:refs/pull/7/head')
  git(checkout, 'checkout', '-q', main)
  const home = join(root, 'home')
  mkdirSync(home)
  // What a fetch of the user's own left behind
  writeFileSync(join(checkout, '.git', 'FETCH_HEAD'), `${tip}\t\tbranch 'topic' of elsewhere\n`)
  return { root, origin, checkout, home, tip, head, main }
}

const prJson = (p, over = {}) => JSON.stringify({ number: 7, title: 'Write the area spec', body: 'Writes the area spec.\n\nCloses #12\n', state: 'OPEN', headRefOid: p.head, baseRefName: p.main, mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', statusCheckRollup: [], closingIssuesReferences: [ref(12)], mergeCommit: null, ...over })

const restRun = (head, id, workflow = 101) => ({ id, workflow_id: workflow, name: 'CI', event: 'pull_request', head_sha: head, created_at: '2026-01-02T02:59:55Z' })
const runPage = (head, page) => `^api repos/example-org/demo/actions/runs\\?head_sha=${head}&event=pull_request&per_page=100&page=${page}$`
const pageBody = (total, runs) => JSON.stringify({ total_count: total, workflow_runs: runs })

const oneFullPage = (head) => Array.from({ length: 100 }, (_, i) => restRun(head, 1000 + i))

// merge-check::REQ-013/AC-07
for (const [problem, pages, reason] of [
  ['missing total', [{ workflow_runs: [] }], /invalid total_count/],
  ['missing run list', [{ total_count: 0 }], /invalid total_count or workflow_runs/],
  ['search ceiling', [{ total_count: 1000, workflow_runs: oneFullPage(HEAD) }], /search limit of 1000/],
  ['short final page', [{ total_count: 1, workflow_runs: [] }], /expected 1 runs, received 0/],
  ['changing total', [{ total_count: 101, workflow_runs: oneFullPage(HEAD) }, { total_count: 100, workflow_runs: [] }], /page 2: total_count changed/],
  ['repeated run across pages', [{ total_count: 101, workflow_runs: oneFullPage(HEAD) }, { total_count: 101, workflow_runs: [restRun(HEAD, 1000)] }], /page 2: repeated run 1000/],
  ...[
    ['different event', { event: 'push' }, /outside the requested event or head/],
    ['different head', { head_sha: OTHER }, /outside the requested event or head/],
    ['missing run id', { id: null }, /invalid run or workflow id/],
    ['missing workflow id', { workflow_id: null }, /invalid run or workflow id/],
    ['missing creation time', { created_at: null }, /invalid created_at/],
  ].map(([problem, fields, reason]) => [problem, [{ total_count: 1, workflow_runs: [{ ...restRun(HEAD, 11), ...fields }] }], reason]),
]) test(`the filtered run list rejects a ${problem}`, () => {
  assert.throws(() => readWorkflowRuns(HEAD, (page) => pages[page - 1]), reason)
})

/** The stub's answers for a pull request `p` that passes every check; `first` answers before them */
function answers(p, first = []) {
  return [
    ...first,
    { match: '^repo view --json nameWithOwner,defaultBranchRef$', stdout: JSON.stringify({ nameWithOwner: 'example-org/demo', defaultBranchRef: { name: p.main } }) },
    { match: '^pr view 7 -R example-org/demo --json ', stdout: prJson(p) },
    { match: '^api user$', stdout: JSON.stringify({ login: 'octo-test', id: 1234, type: 'User' }) },
    { match: '^api repos/example-org/demo/issues/12$', stdout: JSON.stringify({ number: 12, state: 'open', title: 'Write the area' }) },
    { match: '^api repos/example-org/demo/issues/7$', stdout: JSON.stringify({ number: 7, state: 'closed', title: 'Write the area spec', pull_request: {} }) },
    { match: '^api repos/example-org/demo/issues/\\d+$', code: 1, stdout: '{"message":"Not Found","documentation_url":"https://docs.github.com/rest/issues/issues#get-an-issue","status":"404"}', stderr: 'gh: Not Found (HTTP 404)\n' },
    { match: runPage(p.head, 1), stdout: pageBody(1, [restRun(p.head, 11)]) },
    { match: '^run view 11 -R example-org/demo --json headSha,status,conclusion,jobs$', stdout: JSON.stringify({ headSha: p.head, status: 'completed', conclusion: 'success', jobs: [{ databaseId: 21, name: 'checks', status: 'completed', conclusion: 'success', steps: [], url: 'https://github.com/example-org/demo/actions/runs/11/job/21' }] }) },
    { match: '^api repos/example-org/demo/actions/jobs/21/logs --allow-escape-sequences$', stdout: jobLog(p.head, p.tip) + '\n' },
  ]
}

/** Runs the script in the checkout with the stub gh first on PATH and the given environment */
function cli(p, args, { gh = answers(p), env = {}, squash = 'Writes the area spec.\n\nCloses #12\n', cwd = p.checkout, leftRefs = /^$/ } = {}) {
  const bin = join(p.root, 'bin')
  mkdirSync(bin, { recursive: true })
  writeFileSync(join(bin, 'gh'), STUB)
  chmodSync(join(bin, 'gh'), 0o755)
  writeFileSync(join(p.root, 'gh.json'), JSON.stringify(gh))
  const log = join(p.root, 'gh.log')
  writeFileSync(log, '')
  writeFileSync(join(p.root, 'squash.txt'), squash)
  const fullArgs = args[0] === 'before' ? [...args, '--squash-body', join(p.root, 'squash.txt')] : args
  const fetched = `refs/remotes/origin/${p.main}`
  const fetchHead = join(p.checkout, '.git', 'FETCH_HEAD')
  // `leftRefs` names refs the stub makes during the run, which the run must leave as they are
  const refs = () => [git(p.origin, 'for-each-ref'), git(p.checkout, 'for-each-ref').split('\n').filter((l) => !l.endsWith(`\t${fetched}`) && !leftRefs.test(l.split('\t')[1] ?? '')).join('\n'), existsSync(fetchHead) ? readFileSync(fetchHead, 'utf8') : null]
  const before = refs()
  const r = spawnSync(process.execPath, [SCRIPT, ...fullArgs], {
    cwd,
    encoding: 'utf8',
    env: { ...gitEnv, HOME: p.home, USER: 'mc_tester', PATH: `${bin}:${dirname(process.execPath)}:${process.env.PATH}`, MC_STUB_FIXTURE: join(p.root, 'gh.json'), MC_STUB_LOG: log, ...env },
  })
  const calls = readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).join(' '))
  // merge-check::CON-001: every gh call only reads, and no ref of origin changes; CON-002/AC-01: nor any ref of the
  // checkout but the fetched default branch, the run's own ref removed again, nor its FETCH_HEAD
  for (const call of calls) assert.ok(READ_ONLY.some((re) => re.test(call)), `not a read-only gh call: ${call}`)
  assert.deepEqual(refs(), before, 'the refs of origin and the checkout, the fetched default branch aside, and FETCH_HEAD')
  return { code: r.status, signal: r.signal, out: r.stdout, err: r.stderr, calls }
}
const beforeArgs = (p, head = p.head) => ['before', '--repo', 'example-org/demo', '--pr', '7', '--head', head]
const worktreeOf = (p) => join(p.home, 'worktrees', 'checkout', 'pr7-merge-check')

/** Nothing the run made is left in the checkout or under $HOME (merge-check::CON-002/AC-03) */
function assertCleanedUp(p) {
  assert.equal(git(p.checkout, 'for-each-ref', 'refs/merge-check/'), '')
  assert.equal(git(p.checkout, 'worktree', 'list', '--porcelain').split('\n').filter((l) => l.startsWith('worktree ')).length, 1)
  assert.ok(!existsSync(join(p.home, 'worktrees')), 'the directories made for the worktree are removed')
}
// merge-check::CON-001: the gh commands that only read
const READ_ONLY = [/^repo view --json \S+$/, /^pr view 7 -R example-org\/demo --json \S+$/, /^api user$/, /^api repos\/[\w.-]+\/[\w.-]+\/issues\/\d+$/, /^api repos\/[\w.-]+\/[\w.-]+\/actions\/runs\?head_sha=[0-9a-f]{40}&event=pull_request&per_page=100&page=[1-9]\d*$/, /^run view \d+ -R \S+ --json \S+$/, /^api repos\/\S+\/actions\/jobs\/\d+\/logs --allow-escape-sequences$/]

// merge-check::REQ-001, REQ-014/AC-01, REQ-015, CON-001, CON-002/AC-03
test('before passes a pull request that holds every rule, runs the real document checks and leaves nothing behind', () => {
  const p = project()
  git(p.checkout, 'config', '--add', 'remote.origin.fetch', '+refs/pull/*/head:refs/remotes/origin/pr/*')
  const r = cli(p, beforeArgs(p))
  assert.equal(r.code, 0, r.out + r.err)
  assert.match(r.out, /^PASS spec-check: check-spec\.mjs exited 0$/m)
  assert.match(r.out, /^SKIP adr-check: no docs\/adr$/m)
  assert.match(r.out, /^PASS ci: 1 run\(s\) tested the head merged into /m)
  assert.match(r.out, /^PASS bare-refs: /m)
  assert.match(r.out, /^ {4}documents-only: documents only: no executable change \(change-scope\.mjs exit 0\)$/m)
  assert.match(r.out, /^ {4}changed-files: A docs\/specs\/area\.md$/m)
  assertCleanedUp(p)
  assert.ok(r.calls.length > 0)
})

// merge-check::CON-002/AC-01
test('before leaves initialized submodule refs alone even when the checkout fetches recursively', () => {
  const p = project()
  const upstream = join(p.root, 'library')
  git(p.root, 'init', '-q', '-b', 'main', upstream)
  const original = commitAs(p.root, upstream, { 'lib.txt': 'one' }, 'Start library')
  git(p.checkout, 'clone', '-q', upstream, 'dep')
  git(p.checkout, 'submodule', 'add', '-q', upstream, 'dep')
  commitAs(p.root, p.checkout, {}, 'Use the library locally')
  git(p.checkout, 'config', 'fetch.recurseSubmodules', 'true')
  commitAs(p.root, upstream, { 'lib.txt': 'two' }, 'Update library')
  const r = cli(p, beforeArgs(p))
  assert.equal(r.code, 0, r.out + r.err)
  assert.equal(git(join(p.checkout, 'dep'), 'rev-parse', 'origin/main'), original)
})

// merge-check::REQ-003/AC-06: the first read of the pull request and the read again after UNKNOWN each ask for the rollup
// they are judged with; a read that does not ask gets the CLEAN of the stub's general answer, or UNKNOWN again
for (const [which, first] of [['first read', () => []], ['read after UNKNOWN', (p) => [{ match: '^pr view 7 -R example-org/demo --json number,', stdout: prJson(p, { mergeable: 'UNKNOWN', mergeStateStatus: 'UNKNOWN' }) }, { match: '^pr view 7 -R example-org/demo --json mergeable,mergeStateStatus$', stdout: prJson(p, { mergeable: 'UNKNOWN', mergeStateStatus: 'UNKNOWN' }) }]]]) test(`before reads statusCheckRollup with the mergeability on the ${which} and passes an UNSTABLE of ignored jobs`, () => {
  const p = project()
  const pr = prJson(p, { mergeStateStatus: 'UNSTABLE', statusCheckRollup: IGNORED_ROLLUP })
  const jobs = [{ databaseId: 21, name: 'checks', status: 'completed', conclusion: 'success', steps: [], url: 'https://github.com/example-org/demo/actions/runs/11/job/21' }, { databaseId: 22, name: 'build (macOS)', status: 'in_progress', conclusion: '', steps: [], url: 'https://github.com/example-org/demo/actions/runs/11/job/22' }, { databaseId: 23, name: 'CI gate', status: 'completed', conclusion: 'failure', steps: [], url: 'https://github.com/example-org/demo/actions/runs/11/job/23' }]
  const gh = answers(p, [
    ...first(p),
    { match: '^pr view 7 -R example-org/demo --json \\S*statusCheckRollup', stdout: pr },
    { match: '^run view 11 ', stdout: JSON.stringify({ headSha: p.head, status: 'in_progress', conclusion: '', jobs }) },
  ])
  const r = cli(p, [...beforeArgs(p), '--ignore-job', 'build \\(macOS\\)', '--ignore-job', 'CI gate'], { gh })
  assert.equal(r.code, 0, r.out + r.err)
  assert.match(r.out, /^PASS pr-mergeable: mergeable MERGEABLE, mergeStateStatus UNSTABLE$/m)
  assert.match(r.out, /^ {4}pr-mergeable: accepted statusCheckRollup: check run CI gate COMPLETED\/FAILURE$/m)
  assertCleanedUp(p)
})

// merge-check::REQ-014/AC-03: the head's workflow files are the *.yml and *.yaml directly in .github/workflows/
test('before skips action-pins on a head whose .github/workflows/ holds no workflow file of its own', () => {
  const p = project({ base: { 'capabilities.toml': CAPABILITIES, 'README.md': '# Demo\n' }, branch: { '.github/workflows/README.md': '# Workflows\n', '.github/workflows/templates.yml/ci.yml': WORKFLOW } })
  const r = cli(p, beforeArgs(p))
  assert.equal(r.code, 0, r.out + r.err)
  assert.match(r.out, /^SKIP action-pins: no workflow file at the head$/m)
  assertCleanedUp(p)
})

// merge-check::REQ-014/AC-03: git quotes a path that is not ASCII unless told not to
test('before runs action-pins on a workflow file whose name is not ASCII', () => {
  const p = project({ base: { 'capabilities.toml': CAPABILITIES, 'README.md': '# Demo\n' }, branch: { '.github/workflows/构建.yml': WORKFLOW, '.github/workflows/templates.yml/nested.yml': 'uses: demo/placeholder@main' } })
  const r = cli(p, beforeArgs(p))
  assert.equal(r.code, 0, r.out + r.err)
  assert.match(r.out, /^PASS action-pins: check-action-pins\.mjs exited 0$/m)
  assertCleanedUp(p)
})

// merge-check::REQ-002/AC-01, REQ-005: a diff configuration of the user's does not move the line or path of an added line
test('before names an added line by its path and line under the user\'s diff.noprefix and diff.interHunkContext', () => {
  const p = project({ base: { 'capabilities.toml': CAPABILITIES, '.github/workflows/ci.yml': WORKFLOW, 'b/g.txt': '1\n2\n3\n4\n5\n6\n' }, branch: { 'b/g.txt': '1\nA\n3\n4\nthe secret plan\n6\n' } })
  git(p.checkout, 'config', 'diff.noprefix', 'true')
  git(p.checkout, 'config', 'diff.interHunkContext', '5')
  const r = cli(p, [...beforeArgs(p), '--forbid', 'secret'])
  assert.equal(r.code, 1, r.out + r.err)
  assert.match(r.out, /^FAIL forbidden-words: 1 forbidden word\(s\)\n {4}diff b\/g\.txt:\+5: --forbid secret: the secret plan$/m)
  assertCleanedUp(p)
})

// merge-check::REQ-001/AC-02
test('stops before any check when the checkout is another repository', () => {
  const p = project()
  const r = cli(p, beforeArgs(p), { gh: answers(p, [{ match: '^repo view ', stdout: JSON.stringify({ nameWithOwner: 'example-org/other', defaultBranchRef: { name: 'main' } }) }]) })
  assert.equal(r.code, 2, r.out + r.err)
  assert.match(r.err, /is example-org\/other, not --repo example-org\/demo/)
  assert.equal(r.out, '')
})

// merge-check::CON-002/AC-01: the stub, a child of the run, makes the run's own ref before the run looks for it
test('stops before any check when the ref of the run\'s own name exists, and leaves it as it was', () => {
  const p = project()
  const gh = answers(p).map((a) => (a.match.startsWith('^repo view ') ? { ...a, makeRef: { dir: p.checkout, prefix: 'refs/merge-check/pr7-', oid: p.tip } } : a))
  const r = cli(p, beforeArgs(p), { gh, leftRefs: /^refs\/merge-check\/pr7-\d+$/ })
  assert.equal(r.code, 2, r.out + r.err)
  assert.match(r.err, /refs\/merge-check\/pr7-\d+ exists already; remove it once no other run uses it/)
  assert.equal(r.out, '')
  const left = git(p.checkout, 'for-each-ref', '--format=%(refname) %(objectname)', 'refs/merge-check/')
  assert.match(left, new RegExp(`^refs/merge-check/pr7-\\d+ ${p.tip}$`))
})

// merge-check::CON-002/AC-02
test('stops before any check when the worktree path exists, and leaves it as it was', () => {
  const p = project()
  write(worktreeOf(p), { 'left.txt': 'an earlier run\n' })
  const r = cli(p, beforeArgs(p))
  assert.equal(r.code, 2, r.out + r.err)
  assert.match(r.err, /pr7-merge-check exists already/)
  assert.equal(r.out, '')
  assert.equal(readFileSync(join(worktreeOf(p), 'left.txt'), 'utf8'), 'an earlier run\n')
})

// merge-check::CON-002/AC-02, AC-03, failure mode 10: another run makes the worktree after this one checked the path
test('a worktree another run makes at the path while this one runs is left to that run', () => {
  const p = project()
  const other = worktreeOf(p)
  const make = ['git', '-C', p.checkout, 'worktree', 'add', '--detach', '--quiet', other, p.head]
  const r = cli(p, beforeArgs(p), { gh: answers(p).map((a) => (a.match === runPage(p.head, 1) ? { ...a, exec: make } : a)) })
  assert.equal(r.code, 2, r.out + r.err)
  assert.match(r.out, /^ERROR spec-check: .*already exists/m)
  assert.ok(existsSync(join(other, 'docs', 'specs', 'area.md')), r.out)
  assert.equal(git(p.checkout, 'worktree', 'list', '--porcelain').split('\n').filter((l) => l.startsWith('worktree ')).length, 2)
  assert.equal(git(p.checkout, 'for-each-ref', 'refs/merge-check/'), '')
})

// merge-check::REQ-002/AC-04, CON-002/AC-03: the run takes the signal while issues-closed waits to read an open issue again
for (const signal of ['SIGTERM', 'SIGINT']) test(`a run that ${signal} ends exits 2 and removes the ref it made`, () => {
  const p = project()
  git(p.checkout, 'merge', '-q', '--squash', 'area')
  const oid = commitAs(p.root, p.checkout, {}, 'Write the area spec (#7)\n\nCloses #12', NOREPLY, 'noreply@github.com')
  git(p.checkout, 'push', '-q', 'origin', 'main')
  const gh = answers(p, [
    { match: '^pr view 7 ', stdout: prJson(p, { state: 'MERGED', mergeCommit: { oid } }) },
    { match: '^api repos/example-org/demo/issues/12$', stdout: JSON.stringify({ number: 12, state: 'open', title: 'Write the area' }), signalParent: signal },
  ])
  const r = cli(p, ['after', '--repo', 'example-org/demo', '--pr', '7', '--head', p.head], { gh })
  assert.equal(r.code, 2, r.out + r.err)
  assert.match(r.err, new RegExp(`^merge-check: stopped by ${signal}$`, 'm'))
  assert.ok(r.calls.some((c) => c.startsWith('api repos/example-org/demo/issues/12')), 'the signal came after the fetch')
  assertCleanedUp(p)
})

// merge-check::REQ-002/AC-04: a signal before any check runs does not end the process by the signal
test('a SIGTERM during the first gh call leaves the run its exit code and removes what it made', () => {
  const p = project()
  const r = cli(p, beforeArgs(p), { gh: answers(p).map((a) => (a.match.startsWith('^repo view ') ? { ...a, signalParent: 'SIGTERM' } : a)) })
  assert.equal(r.signal, null, r.out + r.err)
  assert.equal(r.code, 0, r.out + r.err)
  assertCleanedUp(p)
})

// merge-check::REQ-002/AC-04: an error no check catches
test('the script failing outside every check exits 2', () => {
  const p = project()
  const r = cli(p, beforeArgs(p), { gh: answers(p, [{ match: '^repo view ', stdout: 'null' }]) })
  assert.equal(r.code, 2, r.out + r.err)
  assert.match(r.err, /^merge-check: TypeError: /m)
})

// merge-check::REQ-004/AC-01, REQ-003/AC-05
test('a fetched head that is not --head fails head-ref, blocks the head checks and is cleaned up', () => {
  const p = project()
  const reviewed = 'f'.repeat(40)
  const r = cli(p, beforeArgs(p, reviewed), { gh: answers(p, [{ match: '^pr view 7 ', stdout: prJson(p, { headRefOid: reviewed }) }]) })
  assert.equal(r.code, 1, r.out + r.err)
  assert.match(r.out, new RegExp(`^FAIL head-ref: pull/7/head is ${p.head}, not --head ${reviewed}$`, 'm'))
  assert.match(r.out, /^BLOCKED privacy: not run, head-ref failed$/m)
  assert.match(r.out, /^PASS cleanup: /m)
  assertCleanedUp(p)
})

// merge-check::REQ-008 from the environment of the run
test('privacy derives its values from $HOME, $USER and the configured user.email', () => {
  const p = project()
  const config = join(p.root, 'gitconfig')
  writeFileSync(config, '[user]\n\temail = priv.person@example.invalid\n')
  const branchFile = 'notes.txt'
  git(p.checkout, 'checkout', '-q', 'area')
  const head = commitAs(p.root, p.checkout, { [branchFile]: `kept in ${p.home}/x by mc-tester, priv.person\n` }, 'Add notes')
  git(p.checkout, 'push', '-q', '-f', 'origin', 'HEAD:refs/pull/7/head')
  git(p.checkout, 'checkout', '-q', 'main')
  const q = { ...p, head }
  const r = cli(q, beforeArgs(q), { env: { GIT_CONFIG_GLOBAL: config } })
  assert.equal(r.code, 1, r.out + r.err)
  assert.match(r.out, /^ {4}diff notes\.txt:\+1: \$HOME: /m)
  assert.match(r.out, /^ {4}diff notes\.txt:\+1: \$USER: /m)
  assert.match(r.out, /^ {4}diff notes\.txt:\+1: local part of user\.email \(global\): /m)
})

// merge-check::REQ-016
test('after passes a squash merge whose tree is the head and whose author is the noreply address', () => {
  const p = project()
  git(p.checkout, 'merge', '-q', '--squash', 'area')
  const oid = commitAs(p.root, p.checkout, {}, 'Write the area spec (#7)\n\nCloses #12', NOREPLY, 'noreply@github.com')
  git(p.checkout, 'push', '-q', 'origin', 'main')
  const gh = answers(p, [
    { match: '^pr view 7 ', stdout: prJson(p, { state: 'MERGED', mergeCommit: { oid } }) },
    { match: '^api repos/example-org/demo/issues/12$', stdout: JSON.stringify({ number: 12, state: 'closed', title: 'Write the area' }) },
  ])
  const r = cli(p, ['after', '--repo', 'example-org/demo', '--pr', '7', '--head', p.head], { gh })
  assert.equal(r.code, 0, r.out + r.err)
  assert.match(r.out, /^PASS merged-tree: /m)
  assert.match(r.out, /^PASS merge-author: author 1234\+octo-test@users\.noreply\.github\.com\n {4}committer noreply@github\.com \(not judged\)$/m)
  assert.match(r.out, /^PASS issues-closed: /m)
  assertCleanedUp(p)
})

// merge-check::REQ-016/AC-04: a showSignature the user configured does not reach what the run reads with git log
test('after reads the author of a signed merge commit while the checkout shows signatures', () => {
  const p = project()
  const key = join(p.root, 'signing-key')
  assert.equal(spawnSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', key]).status, 0, 'ssh-keygen')
  git(p.checkout, 'merge', '-q', '--squash', 'area')
  const signed = spawnSync('git', ['-c', 'gpg.format=ssh', '-c', `user.signingkey=${key}`, 'commit', '-q', '-S', '-m', 'Write the area spec (#7)\n\nCloses #12'], { cwd: p.checkout, env: { ...gitEnv, GIT_AUTHOR_EMAIL: NOREPLY, GIT_COMMITTER_EMAIL: 'noreply@github.com' }, encoding: 'utf8' })
  assert.equal(signed.status, 0, signed.stderr)
  const oid = git(p.checkout, 'rev-parse', 'HEAD')
  git(p.checkout, 'push', '-q', 'origin', 'main')
  git(p.checkout, 'config', 'log.showSignature', 'true')
  const gh = answers(p, [
    { match: '^pr view 7 ', stdout: prJson(p, { state: 'MERGED', mergeCommit: { oid } }) },
    { match: '^api repos/example-org/demo/issues/12$', stdout: JSON.stringify({ number: 12, state: 'closed', title: 'Write the area' }) },
  ])
  const r = cli(p, ['after', '--repo', 'example-org/demo', '--pr', '7', '--head', p.head], { gh })
  assert.equal(r.code, 0, r.out + r.err)
  assert.match(r.out, /^PASS merge-author: author 1234\+octo-test@users\.noreply\.github\.com\n/m)
  assertCleanedUp(p)
})

test('before judges a failing workflow first seen on the last page, even under a shared name', () => {
  const p = project()
  const first = oneFullPage(p.head)
  first[0] = { ...restRun(p.head, 11), created_at: '2026-01-02T03:00:00Z' }
  const gh = answers(p, [
    { match: runPage(p.head, 1), stdout: pageBody(101, first) },
    { match: runPage(p.head, 2), stdout: pageBody(101, [restRun(p.head, 10, 103)]) },
    { match: '^run view 10 ', stdout: JSON.stringify({ headSha: p.head, status: 'completed', conclusion: 'failure', jobs: [{ databaseId: 31, name: 'checks', status: 'completed', conclusion: 'failure', steps: [], url: 'https://github.com/example-org/demo/actions/runs/10/job/31' }] }) },
    { match: '^api repos/example-org/demo/actions/jobs/31/logs ', stdout: jobLog(p.head, p.tip) + '\n' },
  ])
  const r = cli(p, [...beforeArgs(p), '--ignore-job', 'optional'], { gh })
  assert.equal(r.code, 1, r.out + r.err)
  assert.match(r.out, /^ {4}run 10 \(CI\): conclusion failure$/m)
  assert.match(r.out, /^ {4}ci: run 11 \(CI\): --ignore-job optional matched none$/m)
  assertCleanedUp(p)
})

// merge-check::REQ-013/AC-07, merge-check::REQ-002/AC-04
test('a later workflow run page that cannot be read gives no CI verdict', () => {
  const p = project()
  const gh = answers(p, [
    { match: runPage(p.head, 1), stdout: pageBody(101, oneFullPage(p.head)) },
    { match: runPage(p.head, 2), code: 1, stderr: 'gh: Service Unavailable (HTTP 503)\n' },
  ])
  const r = cli(p, beforeArgs(p), { gh })
  assert.equal(r.code, 2, r.out + r.err)
  assert.match(r.out, /^ERROR ci: .*page=2 exited 1: gh: Service Unavailable \(HTTP 503\)$/m)
  assertCleanedUp(p)
})

// merge-check::REQ-014/AC-04
test('a document check that gives no verdict is an ERROR and the run exits 2', () => {
  const p = project({ base: { '.github/workflows/ci.yml': WORKFLOW, 'README.md': '# Demo\n' } })
  const r = cli(p, beforeArgs(p))
  assert.equal(r.code, 2, r.out + r.err)
  assert.match(r.out, /^ERROR spec-check: check-spec\.mjs gave no verdict \(exit 2\)\n {4}.*capabilities\.toml/m)
  assertCleanedUp(p)
})

// Failure mode 11
test('gh failing to read the pull request is an ERROR and the run exits 2', () => {
  const p = project()
  const r = cli(p, beforeArgs(p), { gh: answers(p, [{ match: '^pr view 7 ', code: 1, stderr: 'HTTP 502: Bad Gateway\n' }]) })
  assert.equal(r.code, 2, r.out + r.err)
  assert.match(r.out, /^ERROR pr-open: gh pr view 7 .* exited 1: HTTP 502: Bad Gateway$/m)
  assertCleanedUp(p)
})

// merge-check::REQ-004/AC-02
test('a head that does not contain the tip of the default branch fails up-to-date', () => {
  const p = project()
  const publisher = join(p.root, 'publisher')
  git(p.root, 'clone', '-q', p.origin, publisher)
  commitAs(p.root, publisher, { 'README.md': '# Demo, moved on\n' }, 'Move main on')
  git(publisher, 'push', '-q', 'origin', 'main')
  const r = cli(p, beforeArgs(p))
  assert.equal(r.code, 1, r.out + r.err)
  assert.match(r.out, /^FAIL up-to-date: origin\/main [0-9a-f]{7} is not in the head: merge or rebase onto it$/m)
  assert.match(r.out, /^FAIL ci: the CI tested the head against an older default branch$/m)
})

// merge-check::REQ-001/AC-02, AC-03
test('takes the top level of the repository of the current directory, and the default branch gh names', () => {
  const p = project({ main: 'trunk' })
  mkdirSync(join(p.checkout, 'sub'))
  // With no CI run, ci looks for the workflow files of the head, which only the top level finds
  const r = cli(p, beforeArgs(p), { cwd: join(p.checkout, 'sub'), gh: answers(p, [{ match: runPage(p.head, 1), stdout: pageBody(0, []) }]) })
  assert.equal(r.code, 1, r.out + r.err)
  assert.match(r.out, /^FAIL ci: no pull_request run on the head, although the head has workflow files/m)
  assert.match(r.out, /^PASS pr-base: base is trunk$/m)
  assert.match(r.out, /^PASS up-to-date: origin\/trunk [0-9a-f]{7} is in the head$/m)
  assertCleanedUp(p)
  const nowhere = cli(p, beforeArgs(p), { cwd: p.home })
  assert.equal(nowhere.code, 2, nowhere.out + nowhere.err)
  assert.match(nowhere.err, /is in no git repository/)
  assert.equal(nowhere.out, '')
  const noHome = cli(p, beforeArgs(p), { env: { HOME: '' } })
  assert.equal(noHome.code, 2, noHome.err)
  assert.equal(noHome.out, '')
  assert.match(noHome.err, /no place for the worktree/)
})

// merge-check::REQ-011: the issue lookup's answer reaches bare-refs
test('bare-refs fails on a reference gh answers 404 for', () => {
  const p = project()
  const body = (n) => [{ match: '^pr view 7 ', stdout: prJson(p, { body: `Writes the area spec.\nSee #${n}.\n\nCloses #12\n` }) }]
  const missing = cli(p, beforeArgs(p), { gh: answers(p, body(99)) })
  assert.equal(missing.code, 1, missing.out + missing.err)
  assert.match(missing.out, /^FAIL bare-refs: .*\n {4}body:2: #99 does not exist in example-org\/demo: See #99\.$/m)
})

// merge-check::REQ-001/AC-01, AC-04
test('--list exits 0 and an unreadable --squash-body stops the run with a usage message', () => {
  const list = spawnSync(process.execPath, [SCRIPT, '--list'], { encoding: 'utf8' })
  assert.equal(list.status, 0)
  assert.equal(list.stdout.trim().split('\n').length, CHECKS.length)
  const p = project()
  const r = spawnSync(process.execPath, [SCRIPT, ...beforeArgs(p), '--squash-body', join(p.root, 'missing.txt')], { cwd: p.checkout, encoding: 'utf8', env: gitEnv })
  assert.equal(r.status, 2)
  assert.match(r.stderr, /cannot read --squash-body .*missing\.txt: ENOENT\nUsage:/)
})
