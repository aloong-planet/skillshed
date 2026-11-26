#!/usr/bin/env node
// The mechanical checks before a pull request is merged and after it (docs/specs/merge-check.md).
//
// Usage:
//   merge-check.mjs before --repo <owner/repo> --pr <N> --head <sha> --squash-body <file> [--checkout <dir>]
//                          [--forbid <regex>]... [--ignore-job <regex>]...
//   merge-check.mjs after  --repo <owner/repo> --pr <N> --head <sha> [--checkout <dir>] [--forbid <regex>]...
//   merge-check.mjs --list     print every check and report with its modes, dependencies and rule
//
// It only reads: it never merges, never deletes a branch and never writes to GitHub. The local state it makes, a ref
// refs/merge-check/pr<N>-<pid> and in before a worktree under $HOME/worktrees/, it removes on every way it ends.
//
// Exit codes: 0 every check PASS or SKIP; 1 a check FAIL or BLOCKED; 2 a check ERROR, or the run stopped before any
// check (a usage error, a checkout of another repository, a ref or worktree path left by an earlier run).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, rmdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export class UsageError extends Error {}

const USAGE = `Usage:
  merge-check.mjs before --repo <owner/repo> --pr <N> --head <sha> --squash-body <file> [--checkout <dir>] [--forbid <regex>]... [--ignore-job <regex>]...
  merge-check.mjs after  --repo <owner/repo> --pr <N> --head <sha> [--checkout <dir>] [--forbid <regex>]...
  merge-check.mjs --list`

const SINGLE = ['--repo', '--pr', '--head', '--squash-body', '--checkout']
const REPEATED = ['--forbid', '--ignore-job']

/** The arguments as an object; a UsageError for anything merge-check::REQ-001/AC-01 rejects */
export function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === '--list') return { list: true }
  const [mode, ...rest] = argv
  if (mode !== 'before' && mode !== 'after') throw new UsageError('the first argument must be before, after or --list')
  const single = {}
  const repeated = { '--forbid': [], '--ignore-job': [] }
  for (let i = 0; i < rest.length; i += 2) {
    const name = rest[i]
    if (!SINGLE.includes(name) && !REPEATED.includes(name)) throw new UsageError(`unknown argument ${name}`)
    if (i + 1 >= rest.length) throw new UsageError(`${name} needs a value`)
    const value = rest[i + 1]
    if (REPEATED.includes(name)) repeated[name].push(value)
    else if (name in single) throw new UsageError(`${name} is given twice`)
    else single[name] = value
  }
  for (const name of ['--repo', '--pr', '--head']) if (!(name in single)) throw new UsageError(`${name} is required`)
  if (mode === 'before' && !('--squash-body' in single)) throw new UsageError('--squash-body is required in before')
  if (mode === 'after' && '--squash-body' in single) throw new UsageError('--squash-body is only for before')
  if (mode === 'after' && repeated['--ignore-job'].length) throw new UsageError('--ignore-job is only for before')
  if (!/^[\w.-]+\/[\w.-]+$/.test(single['--repo'])) throw new UsageError('--repo must be <owner>/<repo>')
  if (!/^[1-9][0-9]*$/.test(single['--pr'])) throw new UsageError('--pr must be a pull request number')
  if (!/^[0-9a-f]{40}$/i.test(single['--head'])) throw new UsageError('--head must be 40 hexadecimal digits, the full SHA of the reviewed commit')
  const compile = (name, source, flags) => {
    try {
      return { source, re: new RegExp(name === '--ignore-job' ? `^(?:${source})$` : source, flags) }
    } catch {
      throw new UsageError(`${name} "${source}" is not a valid regular expression`)
    }
  }
  return {
    mode,
    repo: single['--repo'],
    pr: Number(single['--pr']),
    // git and gh write a SHA in lower case
    head: single['--head'].toLowerCase(),
    squashBody: single['--squash-body'],
    checkout: single['--checkout'],
    forbid: repeated['--forbid'].map((s) => compile('--forbid', s, 'i')),
    ignoreJob: repeated['--ignore-job'].map((s) => compile('--ignore-job', s, '')),
  }
}

/** merge-check::REQ-002/AC-04: 2 on any ERROR, 0 when every check is PASS or SKIP, 1 otherwise; a report counts only when it errs */
export function exitCode(results) {
  if (results.some((r) => r.status === 'ERROR')) return 2
  return results.filter((r) => r.kind === 'check').every((r) => r.status === 'PASS' || r.status === 'SKIP') ? 0 : 1
}

const HEAD_NEEDS = ['pr-head', 'head-ref']
const both = (needs) => ({ before: needs, after: needs })

// The one list of the checks and reports (merge-check::REQ-001/AC-04), in the order they run.
export const CHECKS = [
  { id: 'pr-open', kind: 'check', modes: ['before'], needs: both([]), rule: 'the pull request is OPEN' },
  { id: 'pr-merged', kind: 'check', modes: ['after'], needs: both([]), rule: 'the pull request is MERGED and names its merge commit' },
  { id: 'pr-head', kind: 'check', modes: ['before', 'after'], needs: both([]), rule: 'headRefOid is --head' },
  { id: 'pr-base', kind: 'check', modes: ['before'], needs: both([]), rule: 'baseRefName is the default branch' },
  { id: 'pr-mergeable', kind: 'check', modes: ['before'], needs: both(['pr-open']), rule: 'mergeable is MERGEABLE and mergeStateStatus CLEAN, or UNSTABLE where --ignore-job matched a job of the ci runs and every statusCheckRollup entry not passing is a check run it matches; read up to 5 times 3 s apart while UNKNOWN' },
  { id: 'head-ref', kind: 'check', modes: ['before', 'after'], needs: both([]), rule: 'pull/<N>/head fetched from origin is --head' },
  { id: 'up-to-date', kind: 'check', modes: ['before'], needs: both(HEAD_NEEDS), rule: 'the fetched tip of origin/<default branch> is an ancestor of the head or the head' },
  { id: 'merged-tree', kind: 'check', modes: ['after'], needs: both(['pr-merged', ...HEAD_NEEDS]), rule: "the merge commit's tree is the head's tree" },
  { id: 'merge-author', kind: 'check', modes: ['after'], needs: both(['pr-merged']), rule: "the merge commit's author email is the expected noreply address" },
  { id: 'closing-keywords', kind: 'check', modes: ['before', 'after'], needs: { before: HEAD_NEEDS, after: ['pr-merged'] }, rule: 'no closing reference outside a `Closes #N` line of the body, squash body or landed message' },
  { id: 'closing-links', kind: 'check', modes: ['before', 'after'], needs: { before: [], after: ['pr-merged'] }, rule: 'closingIssuesReferences are the issues of --repo the body\'s `Closes` lines name; squash body and landed message close no other' },
  { id: 'privacy', kind: 'check', modes: ['before', 'after'], needs: { before: HEAD_NEEDS, after: ['pr-merged'] }, rule: 'no $HOME, $USER, user.email or its local part in the texts' },
  { id: 'attribution', kind: 'check', modes: ['before', 'after'], needs: { before: HEAD_NEEDS, after: ['pr-merged'] }, rule: 'no "co-authored" or "generated with" in the texts' },
  { id: 'forbidden-words', kind: 'check', modes: ['before', 'after'], needs: { before: HEAD_NEEDS, after: ['pr-merged'] }, rule: 'no --forbid match in the texts' },
  { id: 'bare-refs', kind: 'check', modes: ['before', 'after'], needs: { before: HEAD_NEEDS, after: ['pr-merged'] }, rule: 'every bare #N in the texts is an issue or pull request of --repo' },
  { id: 'commit-identity', kind: 'check', modes: ['before'], needs: both(HEAD_NEEDS), rule: 'every commit of the branch is authored and committed with the expected noreply address' },
  { id: 'ci', kind: 'check', modes: ['before'], needs: both(HEAD_NEEDS), rule: "the latest pull_request run of each workflow tested the head merged into the current tip and passed" },
  { id: 'spec-check', kind: 'check', modes: ['before'], needs: both(HEAD_NEEDS), rule: 'check-spec.mjs exits 0 when the diff changes docs/specs/' },
  { id: 'adr-check', kind: 'check', modes: ['before'], needs: both(HEAD_NEEDS), rule: 'check-adr.mjs exits 0 when docs/adr/ exists at the head and the diff changes docs/specs/ or docs/adr/' },
  { id: 'action-pins', kind: 'check', modes: ['before'], needs: both(HEAD_NEEDS), rule: 'check-action-pins.mjs exits 0 when the diff changes .github/workflows/ and the head has a *.yml or *.yaml directly in it' },
  { id: 'issues-closed', kind: 'check', modes: ['after'], needs: both(['pr-merged']), rule: 'every closingIssuesReferences entry reads closed, re-read for up to 30 s' },
  { id: 'closing-issues', kind: 'report', modes: ['before'], needs: both([]), rule: 'lists closingIssuesReferences' },
  { id: 'changed-files', kind: 'report', modes: ['before'], needs: both(HEAD_NEEDS), rule: 'lists every changed file with its change type, every AGENTS.md and CLAUDE.md, every binary file' },
  { id: 'documents-only', kind: 'report', modes: ['before'], needs: both(HEAD_NEEDS), rule: 'reports whether change-scope.mjs judges the change documents only' },
  { id: 'cleanup', kind: 'check', modes: ['before', 'after'], needs: both([]), rule: 'the ref, the worktree and the directories the run made are removed' },
]

/** The lines `--list` prints, one per check and report */
export function listLines() {
  return CHECKS.map((c) => {
    const needs = c.modes.map((m) => `${m}: ${c.needs[m].join(', ') || '-'}`).join('; ')
    return `${c.id} (${c.kind}; ${c.modes.join(', ')}; needs ${needs}): ${c.rule}`
  })
}

const STATUSES = ['PASS', 'FAIL', 'SKIP', 'ERROR', 'BLOCKED', 'REPORT']
const result = (status, summary, evidence = [], review = []) => ({ status, summary, evidence, review })
const short = (sha) => String(sha).slice(0, 7)
const lower = (s) => String(s ?? '').toLowerCase()

// merge-check::REQ-006
const CLOSING = /(close[sd]?|fix(e[sd])?|resolve[sd]?):? *([\w.-]+\/[\w.-]+)?#[0-9]+/i
const closesNumber = (line) => /^Closes #(\d+)$/.exec(line.trim())?.[1]
// merge-check::REQ-009
const ATTRIBUTION = /co-authored|generated with/i
// merge-check::REQ-011: the ticket number of to-spec/check-spec.mjs
const BARE_REF = /(?<![\w&#/])#(\d+)(?!\w)/g
// merge-check::REQ-008/AC-03
const GENERIC_PATH = /\/Users\/|\/home\/|~\//i
// merge-check::REQ-013
const MERGE_LINE = /HEAD is now at \S+ Merge ([0-9a-f]{40}) into ([0-9a-f]{40})/
const NOT_FINISHED = 'not finished: wait with watch-ci.sh, then rerun'

// merge-check::REQ-005: which texts each check reads
const ALL_TEXTS = ['title', 'body', 'commit', 'squash', 'added', 'path', 'landed']
const MESSAGE_TEXTS = ['title', 'body', 'commit', 'squash', 'landed']

/** The noreply address of merge-check::REQ-012 */
export const noreplyOf = (user) => `${user.id}+${user.login}@users.noreply.github.com`

/** Every line of the texts of `kinds` the mode has, with its source as merge-check::REQ-002/AC-01 writes it */
function textsFor(mode, facts, kinds) {
  const lines = (kind, label, text) => String(text ?? '').split(/\r?\n/).map((t, i) => ({ kind, source: `${label}:${i + 1}`, text: t }))
  const read = {
    title: () => [{ kind: 'title', source: 'title', text: facts.pr().title ?? '' }],
    body: () => lines('body', 'body', facts.pr().body),
    commit: () => facts.commits().flatMap((c) => c.message.split(/\r?\n/).map((t) => ({ kind: 'commit', source: `commit ${short(c.sha)}`, text: t }))),
    squash: () => lines('squash', 'squash-body', facts.squashBody()),
    added: () => facts.diff().added.map((a) => ({ kind: 'added', source: `diff ${a.path}:+${a.line}`, text: a.text })),
    path: () => facts.diff().files.filter((f) => f.status !== 'D').map((f) => ({ kind: 'path', source: `path ${f.path}`, text: f.path })),
    landed: () => lines('landed', 'message', facts.landedMessage()),
  }
  const inMode = mode === 'after' ? ['landed'] : ALL_TEXTS.filter((k) => k !== 'landed')
  return kinds.filter((k) => inMode.includes(k)).flatMap((k) => read[k]())
}

const where = (t) => `${t.source}: ${t.text.trim()}`

/**
 * merge-check::REQ-008: the private values derived from the environment, each with a label and a case-insensitive
 * pattern; an Error where a value is missing or too short to search for
 */
export function privacyValues({ home, user, emails, login, noreply }) {
  if (!home) throw new Error('$HOME is unset or empty: no value to check against')
  if (!user) throw new Error('$USER is unset or empty: no value to check against')
  const escape = (s) => s.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&')
  const values = [
    { label: '$HOME', value: home, re: new RegExp(escape(home), 'i') },
    { label: '$USER', value: user, re: new RegExp([...user].map((ch) => ('_-.'.includes(ch) ? '[_.-]' : escape(ch))).join(''), 'i') },
  ]
  for (const { scope, value } of emails) {
    if (lower(value) === lower(noreply)) continue
    values.push({ label: `user.email (${scope})`, value, re: new RegExp(escape(value), 'i') })
    const local = value.includes('@') ? value.slice(0, value.lastIndexOf('@')) : value
    if (lower(local) !== lower(login)) values.push({ label: `local part of user.email (${scope})`, value: local, re: new RegExp(escape(local), 'i') })
  }
  for (const v of values) if (v.value.length < 3) throw new Error(`${v.label} is shorter than 3 characters: too short to search for`)
  return values
}

const ourRef = (repo) => {
  const [owner, name] = repo.split('/').map(lower)
  return (r) => lower(r.repository?.owner?.login) === owner && lower(r.repository?.name) === name
}
const refName = (r) => `${r.repository?.owner?.login}/${r.repository?.name}#${r.number}`
const closesLines = (texts) => texts.flatMap((t) => (closesNumber(t.text) ? [{ ...t, n: Number(closesNumber(t.text)) }] : []))

function scriptResult(facts, name, args) {
  const r = facts.runScript(name, args)
  const evidence = r.out ? [r.out.replace(/\s+$/, '')] : []
  if (r.code === 0) return result('PASS', `${name} exited 0`, evidence)
  if (r.code === 1) return result('FAIL', `${name} exited 1`, evidence)
  return result('ERROR', `${name} gave no verdict (${r.code === null ? r.error ?? 'did not run' : `exit ${r.code}`})`, evidence)
}

const changed = (facts, ...prefixes) => facts.diff().files.some((f) => prefixes.some((p) => f.path.startsWith(p)))

/** The runs `ci` judges: the latest pull_request run of each workflow, by its id (merge-check::REQ-013) */
function latestRuns(facts) {
  const latest = new Map()
  for (const r of facts.ciRuns().filter((r) => r.event === 'pull_request')) {
    const seen = latest.get(r.workflowDatabaseId)
    if (!seen || r.createdAt > seen.createdAt || (r.createdAt === seen.createdAt && r.databaseId > seen.databaseId)) latest.set(r.workflowDatabaseId, r)
  }
  return latest
}

async function ciRule(facts, opts) {
  const latest = latestRuns(facts)
  if (latest.size === 0) {
    if (!facts.workflowsAtHead()) return result('SKIP', 'no CI workflow')
    return result('FAIL', 'no pull_request run on the head, although the head has workflow files under .github/workflows/')
  }
  const tip = facts.tip()
  const evidence = []
  const review = []
  let notFinished = false
  let olderTip = false
  for (const listed of latest.values()) {
    const run = facts.runView(listed.databaseId)
    const name = `run ${listed.databaseId} (${listed.workflowName})`
    if (run.headSha !== opts.head) evidence.push(`${name}: headSha ${run.headSha} is not the head`)
    const jobs = run.jobs ?? []
    const ignored = (j) => opts.ignoreJob.some((p) => p.re.test(j.name))
    for (const p of opts.ignoreJob) {
      const names = jobs.filter((j) => p.re.test(j.name)).map((j) => j.name)
      review.push(`${name}: --ignore-job ${p.source} matched ${names.length ? names.join(', ') : 'none'}`)
    }
    const kept = jobs.filter((j) => !ignored(j))
    for (const j of jobs.filter(ignored)) review.push(`${name}: ignored job ${j.name}: ${j.status}/${j.conclusion || '-'}`)
    let finished
    if (kept.length === jobs.length) {
      finished = run.status === 'completed'
      if (!finished) evidence.push(`${name}: status ${run.status}`)
      else if (run.conclusion !== 'success') evidence.push(`${name}: conclusion ${run.conclusion}`)
    } else {
      review.push(`${name}: run status ${run.status}, conclusion ${run.conclusion || '-'}`)
      const pending = kept.filter((j) => j.status !== 'completed')
      finished = pending.length === 0
      for (const j of pending) evidence.push(`${name}: job ${j.name} is ${j.status}`)
    }
    if (!finished) { notFinished = true; continue }
    for (const j of kept) if (j.conclusion !== 'success' && j.conclusion !== 'skipped') evidence.push(`${name}: job ${j.name} concluded ${j.conclusion}`)
    let merges = 0
    for (const j of kept.filter((j) => j.conclusion !== 'skipped')) {
      for (const line of facts.jobLog(j.databaseId).split(/\r?\n/)) {
        const m = MERGE_LINE.exec(line)
        if (!m) continue
        merges++
        if (m[1] !== opts.head) evidence.push(`${name}: job ${j.name} merged ${short(m[1])}, not the head`)
        else if (m[2] !== tip) { olderTip = true; evidence.push(`${name}: job ${j.name} merged the head into ${short(m[2])}, not the current tip ${short(tip)}`) }
      }
    }
    if (merges === 0) evidence.push(`${name}: no job that is not ignored or skipped has a line "HEAD is now at <x> Merge <head> into <tip>"`)
  }
  if (notFinished) return result('FAIL', NOT_FINISHED, evidence, review)
  if (olderTip) return result('FAIL', 'the CI tested the head against an older default branch', evidence, review)
  if (evidence.length) return result('FAIL', `${evidence.length} problem(s) in the CI runs`, evidence, review)
  return result('PASS', `${latest.size} run(s) tested the head merged into ${short(tip)} and passed`, [], review)
}

/** Whether an --ignore-job pattern matched a job of the runs `ci` judges (merge-check::REQ-003/AC-06) */
function ignoredJobMatched(facts, opts) {
  if (!opts.ignoreJob.length) return false
  return [...latestRuns(facts).values()].some((r) => (facts.runView(r.databaseId).jobs ?? []).some((j) => opts.ignoreJob.some((p) => p.re.test(j.name))))
}

const passing = (e) => (e.__typename === 'CheckRun' ? e.status === 'COMPLETED' && ['SUCCESS', 'SKIPPED'].includes(e.conclusion) : e.__typename === 'StatusContext' && e.state === 'SUCCESS')
const entryName = (e) => (e.__typename === 'CheckRun' ? `check run ${e.name} ${e.status}/${e.conclusion || '-'}` : e.__typename === 'StatusContext' ? `status context ${e.context} ${e.state}` : `${e.__typename ?? 'entry'} ${JSON.stringify(e)}`)

/**
 * UNSTABLE passes only when the entries not passing are check runs of ignored jobs, `patterns` being the --ignore-job
 * patterns where one matched a job of the ci runs and none otherwise (merge-check::REQ-003/AC-06)
 */
function unstableResult(state, rollup, patterns) {
  const notPassing = rollup.filter((e) => !passing(e))
  if (!notPassing.length) return result('FAIL', state, ['statusCheckRollup: no entry that is not passing'])
  const accepted = (e) => e.__typename === 'CheckRun' && patterns.some((p) => p.re.test(e.name))
  const others = notPassing.filter((e) => !accepted(e))
  if (others.length) return result('FAIL', state, others.map((e) => `statusCheckRollup: ${entryName(e)}`))
  return result('PASS', state, [], ['mergeStateStatus UNSTABLE', ...notPassing.map((e) => `accepted statusCheckRollup: ${entryName(e)}`)])
}

const RULES = {
  'pr-open': (f) => (f.pr().state === 'OPEN' ? result('PASS', 'state is OPEN') : result('FAIL', `state is ${f.pr().state}`)),
  'pr-merged': (f) => {
    const pr = f.pr()
    if (pr.state === 'MERGED' && pr.mergeCommit?.oid) return result('PASS', `merged as ${short(pr.mergeCommit.oid)}`)
    return result('FAIL', `state is ${pr.state}${pr.mergeCommit?.oid ? '' : ', no merge commit'}`)
  },
  'pr-head': (f, o) => {
    const oid = f.pr().headRefOid
    return oid === o.head ? result('PASS', `headRefOid is ${short(o.head)}`) : result('FAIL', `headRefOid is ${oid}, not --head ${o.head}`)
  },
  'pr-base': (f) => {
    const base = f.pr().baseRefName
    return base === f.defaultBranch ? result('PASS', `base is ${base}`) : result('FAIL', `base is ${base}, not the default branch ${f.defaultBranch}`)
  },
  'pr-mergeable': async (f, o) => {
    let m = f.pr()
    let reads = 1
    while ((m.mergeable === 'UNKNOWN' || m.mergeStateStatus === 'UNKNOWN') && reads < 5) {
      await o.sleep(3000)
      m = f.mergeability()
      reads++
    }
    const state = `mergeable ${m.mergeable}, mergeStateStatus ${m.mergeStateStatus}`
    if (m.mergeable === 'UNKNOWN' || m.mergeStateStatus === 'UNKNOWN') return result('ERROR', `${state} after ${reads} reads 3 s apart`)
    if (m.mergeable !== 'MERGEABLE') return result('FAIL', state)
    if (m.mergeStateStatus === 'CLEAN') return result('PASS', state)
    if (m.mergeStateStatus !== 'UNSTABLE') return result('FAIL', state)
    return unstableResult(state, m.statusCheckRollup ?? [], ignoredJobMatched(f, o) ? o.ignoreJob : [])
  },
  'head-ref': (f, o) => {
    const got = f.fetchedHead()
    return got === o.head ? result('PASS', `pull/${o.pr}/head is ${short(got)}`) : result('FAIL', `pull/${o.pr}/head is ${got}, not --head ${o.head}`)
  },
  'up-to-date': (f) => {
    const tip = f.tip()
    return f.tipIsAncestor()
      ? result('PASS', `origin/${f.defaultBranch} ${short(tip)} is in the head`)
      : result('FAIL', `origin/${f.defaultBranch} ${short(tip)} is not in the head: merge or rebase onto it`)
  },
  'merged-tree': (f) => {
    const [merged, head] = [f.mergeTree(), f.headTree()]
    return merged === head ? result('PASS', `tree ${short(head)}`) : result('FAIL', `the merge commit's tree ${merged} is not the head's tree ${head}`)
  },
  'merge-author': (f) => {
    const expected = noreplyOf(f.user())
    const { author, committer } = f.mergeIdentity()
    const evidence = [`committer ${committer} (not judged)`]
    return lower(author) === lower(expected)
      ? result('PASS', `author ${author}`, evidence)
      : result('FAIL', `author ${author}, expected ${expected}`, evidence)
  },
  'closing-keywords': (f, o, mode) => {
    const hits = textsFor(mode, f, MESSAGE_TEXTS).filter((t) => CLOSING.test(t.text) && !(['body', 'squash', 'landed'].includes(t.kind) && closesNumber(t.text)))
    return hits.length ? result('FAIL', `${hits.length} closing reference(s) outside a Closes line`, hits.map(where)) : result('PASS', 'every closing reference is on a Closes line')
  },
  'closing-links': (f, o, mode) => {
    const refs = f.pr().closingIssuesReferences ?? []
    const ours = ourRef(o.repo)
    const numbers = new Set(refs.filter(ours).map((r) => r.number))
    const texts = textsFor(mode, f, ['body', 'squash', 'landed'])
    const evidence = []
    if (mode === 'before') {
      const body = new Set(closesLines(texts.filter((t) => t.kind === 'body')).map((c) => c.n))
      for (const r of refs) {
        if (!ours(r)) evidence.push(`closingIssuesReferences: ${refName(r)} is not an issue of ${o.repo}`)
        else if (!body.has(r.number)) evidence.push(`closingIssuesReferences: #${r.number} is named by no Closes line of the body`)
      }
    }
    for (const c of closesLines(texts)) if (!numbers.has(c.n)) evidence.push(`${c.source}: Closes #${c.n} is not in closingIssuesReferences`)
    return evidence.length
      ? result('FAIL', `${evidence.length} closing link(s) GitHub does not agree with`, evidence)
      : result('PASS', numbers.size ? `closes ${[...numbers].map((n) => `#${n}`).join(', ')}` : 'closes no issue')
  },
  privacy: (f, o, mode) => {
    const user = f.user()
    const values = privacyValues({ ...f.environment(), login: user.login, noreply: noreplyOf(user) })
    const texts = textsFor(mode, f, ALL_TEXTS)
    const evidence = []
    for (const t of texts) for (const v of values) if (v.re.test(t.text)) evidence.push(`${t.source}: ${v.label}: ${t.text.trim()}`)
    const review = texts.filter((t) => GENERIC_PATH.test(t.text)).map((t) => `generic path: ${where(t)}`)
    return evidence.length
      ? result('FAIL', `${evidence.length} occurrence(s) of a private value`, evidence, review)
      : result('PASS', `none of ${values.length} private value(s) in the texts`, [], review)
  },
  attribution: (f, o, mode) => {
    const hits = textsFor(mode, f, MESSAGE_TEXTS).filter((t) => ATTRIBUTION.test(t.text))
    return hits.length ? result('FAIL', `${hits.length} AI attribution line(s)`, hits.map(where)) : result('PASS', 'no AI attribution')
  },
  'forbidden-words': (f, o, mode) => {
    if (!o.forbid.length) return result('SKIP', 'no --forbid given')
    const evidence = []
    for (const t of textsFor(mode, f, ALL_TEXTS)) for (const p of o.forbid) if (p.re.test(t.text)) evidence.push(`${t.source}: --forbid ${p.source}: ${t.text.trim()}`)
    return evidence.length ? result('FAIL', `${evidence.length} forbidden word(s)`, evidence) : result('PASS', `no match of ${o.forbid.length} --forbid pattern(s)`)
  },
  'bare-refs': (f, o, mode) => {
    const first = new Map()
    for (const t of textsFor(mode, f, MESSAGE_TEXTS)) for (const m of t.text.matchAll(BARE_REF)) if (!first.has(m[1])) first.set(m[1], t)
    const evidence = []
    const review = []
    for (const [n, t] of first) {
      const issue = f.issue(Number(n))
      if (!issue.exists) evidence.push(`${t.source}: #${n} does not exist in ${o.repo}: ${t.text.trim()}`)
      else review.push(`#${n} ${issue.state}: ${issue.title}`)
    }
    return evidence.length
      ? result('FAIL', `${evidence.length} reference(s) to no issue or pull request`, evidence, review)
      : result('PASS', `${first.size} reference(s), each to an issue or pull request`, [], review)
  },
  'commit-identity': (f) => {
    const expected = noreplyOf(f.user())
    const commits = f.commits()
    const bad = commits.filter((c) => lower(c.authorEmail) !== lower(expected) || lower(c.committerEmail) !== lower(expected))
    return bad.length
      ? result('FAIL', `${bad.length} commit(s) not by ${expected}`, bad.map((c) => `commit ${short(c.sha)}: author ${c.authorEmail}, committer ${c.committerEmail}`))
      : result('PASS', `${commits.length} commit(s) by ${expected}`)
  },
  ci: ciRule,
  'spec-check': (f) => (changed(f, 'docs/specs/') ? scriptResult(f, 'check-spec.mjs', ['--base', f.forkPoint()]) : result('SKIP', 'the diff changes nothing under docs/specs/')),
  'adr-check': (f) => {
    if (!f.adrAtHead()) return result('SKIP', 'no docs/adr')
    return changed(f, 'docs/specs/', 'docs/adr/') ? scriptResult(f, 'check-adr.mjs', ['--base', f.forkPoint()]) : result('SKIP', 'the diff changes nothing under docs/specs/ or docs/adr/')
  },
  'action-pins': (f) => {
    if (!changed(f, '.github/workflows/')) return result('SKIP', 'the diff changes nothing under .github/workflows/')
    return f.workflowFilesAtHead() ? scriptResult(f, 'check-action-pins.mjs', []) : result('SKIP', 'no workflow file at the head')
  },
  'issues-closed': async (f, o) => {
    let open = f.pr().closingIssuesReferences ?? []
    if (!open.length) return result('PASS', 'the pull request closes no issue')
    const start = o.now()
    for (;;) {
      open = open.filter((r) => lower(f.issueState(r.repository.owner.login, r.repository.name, r.number)) !== 'closed')
      if (!open.length) return result('PASS', 'every closing issue is closed')
      if (o.now() - start >= 30000) return result('FAIL', `${open.length} closing issue(s) still open after 30 s`, open.map((r) => `${refName(r)} is open`))
      await o.sleep(3000)
    }
  },
  'closing-issues': (f) => {
    const refs = f.pr().closingIssuesReferences ?? []
    return result('REPORT', '', [], refs.length ? refs.map((r) => `closes ${refName(r)} ${r.url ?? ''}`.trim()) : ['closes no issue'])
  },
  'changed-files': (f) => {
    const { files } = f.diff()
    return result('REPORT', '', [], [
      ...files.map((x) => `${x.status} ${x.path}`),
      ...files.filter((x) => ['AGENTS.md', 'CLAUDE.md'].includes(basename(x.path))).map((x) => `rules file changed: ${x.path}`),
      ...files.filter((x) => x.binary).map((x) => `binary file: ${x.path}`),
    ])
  },
  'documents-only': (f) => {
    const r = f.runScript('change-scope.mjs', ['--base', f.forkPoint()])
    if (r.code === 0) return result('REPORT', '', [], ['documents only: no executable change (change-scope.mjs exit 0)'])
    if (r.code === 1) return result('REPORT', '', [], ['not documents only: executable change (change-scope.mjs exit 1)'])
    return result('ERROR', `change-scope.mjs gave no verdict (${r.code === null ? r.error ?? 'did not run' : `exit ${r.code}`})`, r.out ? [r.out.replace(/\s+$/, '')] : [])
  },
  cleanup: (f) => {
    const { left } = f.cleanup()
    return left.length ? result('ERROR', `could not remove: ${left.join('; ')}`) : result('PASS', 'nothing the run made is left')
  },
}

/** Runs the checks of the mode in order against `facts` (merge-check::REQ-002) */
export async function runChecks(mode, facts, opts) {
  const done = new Map()
  for (const c of CHECKS.filter((c) => c.modes.includes(mode))) {
    let r
    const dep = c.needs[mode].map((id) => done.get(id)).find((d) => !d || !['PASS', 'SKIP'].includes(d.status))
    if (dep) {
      r = result('BLOCKED', `not run, ${dep.id} ${dep.status === 'FAIL' ? 'failed' : dep.status === 'ERROR' ? 'errored' : 'was blocked'}`)
    } else {
      try {
        r = await RULES[c.id]?.(facts, opts, mode)
      } catch (e) {
        r = result('ERROR', e.message)
      }
      if (!r || !STATUSES.includes(r.status) || r.status === 'BLOCKED') r = result('ERROR', 'the check did not run, although every check it depends on passed')
    }
    done.set(c.id, { id: c.id, kind: c.kind, ...r })
  }
  return [...done.values()]
}

/** The printed output of merge-check::REQ-002 */
export function render(results) {
  const out = []
  const printed = results.filter((r) => r.kind === 'check' || r.status === 'ERROR')
  for (const r of printed) {
    out.push(`${r.status} ${r.id}: ${r.summary}`)
    for (const e of r.evidence) for (const line of e.split('\n')) out.push(`    ${line}`)
  }
  const review = results.flatMap((r) => [
    ...(r.kind === 'report' && r.status === 'BLOCKED' ? [`${r.id}: ${r.summary}`] : []),
    ...r.review.map((line) => `${r.id}: ${line}`),
  ])
  out.push(review.length ? 'For review:' : 'For review: nothing')
  for (const line of review) out.push(`    ${line}`)
  const count = (s) => printed.filter((r) => r.status === s).length
  out.push(`Result: ${['PASS', 'FAIL', 'SKIP', 'ERROR', 'BLOCKED'].map((s) => `${count(s)} ${s}`).join(', ')}`)
  return out.join('\n') + '\n'
}

// --- The facts, read with gh and git ---

const HERE = dirname(fileURLToPath(import.meta.url))
const SCRIPTS = {
  'check-spec.mjs': '../to-spec/check-spec.mjs',
  'check-adr.mjs': '../domain-modeling/check-adr.mjs',
  'check-action-pins.mjs': 'check-action-pins.mjs',
  'change-scope.mjs': '../implement/change-scope.mjs',
}
const PR_FIELDS = 'number,title,body,state,headRefOid,baseRefName,mergeable,mergeStateStatus,statusCheckRollup,closingIssuesReferences,mergeCommit'

/** A stop before any check: exit 2 with the reason */
class Stop extends Error {}

const lastLine = (s) => String(s ?? '').trim().split('\n').pop()
function spawn(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 })
  if (r.error) throw new Error(`${cmd} ${args.join(' ')}: ${r.error.message}`)
  return r
}
function out(cmd, args, cwd) {
  const r = spawn(cmd, args, cwd)
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} exited ${r.status}: ${lastLine(r.stderr) || lastLine(r.stdout)}`)
  return r.stdout
}
const json = (cmd, args, cwd) => JSON.parse(out(cmd, args, cwd))
/** A memo that keeps a thrown error as well, so a failing command is not run again for every check */
function memo(fn) {
  let done = false
  let value
  let error
  return () => {
    if (!done) { try { value = fn() } catch (e) { error = e } done = true }
    if (error) throw error
    return value
  }
}

/** `memo` for a function of one key: each key is read once a run */
function memoBy(fn) {
  const seen = new Map()
  return (key) => {
    if (!seen.has(key)) seen.set(key, memo(() => fn(key)))
    return seen.get(key)()
  }
}

/** merge-check::REQ-001/AC-02, merge-check::CON-002: what the run needs before any check, or a Stop */
function preflight(args) {
  const dir = args.checkout ?? process.cwd()
  const top = spawn('git', ['-C', dir, 'rev-parse', '--show-toplevel'])
  if (top.status !== 0) throw new Stop(`${dir} is in no git repository`)
  const checkout = top.stdout.trim()
  let view
  try {
    view = json('gh', ['repo', 'view', '--json', 'nameWithOwner,defaultBranchRef'], checkout)
  } catch (e) {
    throw new Stop(`cannot read the checkout's repository with gh: ${e.message}`)
  }
  if (lower(view.nameWithOwner) !== lower(args.repo)) throw new Stop(`the checkout ${checkout} is ${view.nameWithOwner}, not --repo ${args.repo}`)
  const defaultBranch = view.defaultBranchRef?.name
  if (!defaultBranch) throw new Stop(`gh repo view names no default branch for ${args.repo}`)
  const ref = `refs/merge-check/pr${args.pr}-${process.pid}`
  if (spawn('git', ['show-ref', '--verify', '--quiet', ref], checkout).status === 0) throw new Stop(`${ref} exists already; remove it once no other run uses it`)
  let worktree
  if (args.mode === 'before') {
    if (!process.env.HOME) throw new Stop('$HOME is unset: no place for the worktree')
    const main = /^worktree (.*)$/m.exec(out('git', ['worktree', 'list', '--porcelain'], checkout))?.[1]
    if (!main) throw new Stop('git worktree list names no main checkout')
    worktree = join(process.env.HOME, 'worktrees', basename(main), `pr${args.pr}-merge-check`)
    if (existsSync(worktree)) throw new Stop(`${worktree} exists already: an earlier run left it, or another run is in progress`)
  }
  return { checkout, defaultBranch, ref, worktree }
}

/** Parses `git diff -U0` output into the lines it adds, each with its path and line number on the head side */
export function addedLines(diff) {
  const added = []
  let path = null
  let line = 0
  let inHunk = false
  for (const text of diff.split('\n')) {
    if (text.startsWith('diff --git ')) { inHunk = false; path = null; continue }
    if (!inHunk && text.startsWith('+++ ')) {
      let p = text.slice(4).replace(/\t$/, '')
      if (p.startsWith('"')) try { p = JSON.parse(p) } catch { /* keep it quoted */ }
      path = p === '/dev/null' ? null : p.replace(/^b\//, '')
      continue
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text)
    if (hunk) { inHunk = true; line = Number(hunk[1]); continue }
    if (inHunk && path && text.startsWith('+')) added.push({ path, line: line++, text: text.slice(1) })
  }
  return added
}

/**
 * merge-check::REQ-011: what `gh api repos/<repo>/issues/<N>` answered, `call` naming it: exit 0 is the issue or pull
 * request, the error JSON with status 404 is none, and anything else an Error
 */
export function issueAnswer({ status, stdout, stderr }, call) {
  if (status === 0) { const i = JSON.parse(stdout); return { exists: true, state: i.state, title: i.title } }
  let code
  try { code = JSON.parse(stdout).status } catch { /* not the JSON of an API error */ }
  if (String(code) === '404') return { exists: false }
  throw new Error(`${call} exited ${status}: ${lastLine(stderr)}`)
}

function realFacts(args, pre, squashBodyText) {
  const { checkout: top, defaultBranch, ref, worktree } = pre
  const origin = `refs/remotes/origin/${defaultBranch}`
  const made = { ref: false, worktree: false, dirs: [] }
  // Settings of the user's that reshape the output parsed here: signature lines before git log's format, quoted paths
  // that are not ASCII, and diff hunks merged across unchanged lines
  const git = (...a) => out('git', ['-c', 'log.showSignature=false', '-c', 'core.quotepath=false', '-c', 'diff.interHunkContext=0', ...a], top)
  const pr = memo(() => json('gh', ['pr', 'view', String(args.pr), '-R', args.repo, '--json', PR_FIELDS], top))
  const fetch = memo(() => {
    made.ref = true
    git('fetch', '--no-tags', '--no-write-fetch-head', '--quiet', 'origin', `+refs/heads/${defaultBranch}:${origin}`, `refs/pull/${args.pr}/head:${ref}`)
  })
  const rev = (r) => { fetch(); return git('rev-parse', '--verify', '--quiet', r).trim() }
  const forkPoint = memo(() => { fetch(); return git('merge-base', ref, origin).trim() })
  // The prefixes given, so diff.noprefix and diff.mnemonicPrefix leave the paths of the patch as addedLines reads them
  const diffArgs = () => ['diff', '--no-renames', '--no-color', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/', forkPoint(), ref]
  const worktreeDir = memo(() => {
    fetch()
    const missing = []
    for (let d = dirname(worktree); !existsSync(d); d = dirname(d)) missing.push(d)
    mkdirSync(dirname(worktree), { recursive: true })
    made.dirs = missing
    // Marked only once the add succeeded: a failed add may have met a worktree another run made at the path
    git('worktree', 'add', '--detach', '--quiet', worktree, ref)
    made.worktree = true
    return worktree
  })
  const user = memo(() => json('gh', ['api', 'user'], top))
  return {
    defaultBranch,
    pr,
    mergeability: () => json('gh', ['pr', 'view', String(args.pr), '-R', args.repo, '--json', 'mergeable,mergeStateStatus,statusCheckRollup'], top),
    fetchedHead: () => rev(`${ref}^{commit}`),
    tip: memo(() => rev(`${origin}^{commit}`)),
    tipIsAncestor: () => {
      fetch()
      const r = spawn('git', ['merge-base', '--is-ancestor', origin, ref], top)
      if (r.status === 0 || r.status === 1) return r.status === 0
      throw new Error(`git merge-base --is-ancestor exited ${r.status}: ${lastLine(r.stderr)}`)
    },
    forkPoint,
    commits: memo(() => git('log', '--format=%H%x00%ae%x00%ce%x00%B%x1e', `${forkPoint()}..${ref}`).split('\x1e').map((s) => s.replace(/^\n/, '')).filter(Boolean).map((s) => {
      const [sha, authorEmail, committerEmail, message] = s.split('\0')
      return { sha, authorEmail, committerEmail, message }
    })),
    diff: memo(() => {
      const statuses = git(...diffArgs(), '--name-status', '-z').split('\0').filter(Boolean)
      const files = []
      for (let i = 0; i + 1 < statuses.length; i += 2) files.push({ status: statuses[i], path: statuses[i + 1], binary: false })
      const binary = new Set(git(...diffArgs(), '--numstat', '-z').split('\0').filter((s) => s.startsWith('-\t-\t')).map((s) => s.slice(4)))
      for (const f of files) f.binary = binary.has(f.path)
      return { files, added: addedLines(git(...diffArgs(), '-U0')) }
    }),
    squashBody: () => squashBodyText,
    environment: memo(() => {
      const r = spawn('git', ['config', '--show-scope', '--get-all', 'user.email'], top)
      if (r.status !== 0 && r.status !== 1) throw new Error(`git config --get-all user.email exited ${r.status}: ${lastLine(r.stderr)}`)
      const emails = r.stdout.split('\n').filter(Boolean).map((l) => { const [scope, ...rest] = l.split('\t'); return { scope, value: rest.join('\t') } })
      return { home: process.env.HOME, user: process.env.USER, emails }
    }),
    user,
    issue: (n) => issueAnswer(spawn('gh', ['api', `repos/${args.repo}/issues/${n}`], top), `gh api repos/${args.repo}/issues/${n}`),
    ciRuns: memo(() => json('gh', ['run', 'list', '-R', args.repo, '--commit', args.head, '--json', 'databaseId,event,status,conclusion,workflowName,workflowDatabaseId,createdAt,headSha', '-L', '100'], top)),
    runView: memoBy((id) => json('gh', ['run', 'view', String(id), '-R', args.repo, '--json', 'headSha,status,conclusion,jobs'], top)),
    jobLog: (id) => out('gh', ['api', `repos/${args.repo}/actions/jobs/${id}/logs`, '--allow-escape-sequences'], top),
    // check-action-pins.mjs's own workflow files: the *.yml and *.yaml entries directly in .github/workflows
    workflowFilesAtHead: memo(() => { fetch(); return git('ls-tree', '--name-only', ref, '--', '.github/workflows/').split('\n').some((p) => /\.ya?ml$/.test(basename(p))) }),
    workflowsAtHead: memo(() => { fetch(); return git('ls-tree', '-r', '--name-only', ref, '--', '.github/workflows/').trim() !== '' }),
    adrAtHead: memo(() => { fetch(); return git('ls-tree', '-d', '--name-only', ref, '--', 'docs/adr').trim() !== '' }),
    runScript: (name, scriptArgs) => {
      const script = join(HERE, SCRIPTS[name])
      if (!existsSync(script)) return { code: null, error: `${name} is missing beside merge-check.mjs`, out: '' }
      const r = spawn(process.execPath, [script, ...scriptArgs], worktreeDir())
      return { code: r.status, error: r.signal ? `killed by ${r.signal}` : undefined, out: `${r.stdout}${r.stderr}` }
    },
    landedMessage: memo(() => { fetch(); return git('log', '-1', '--format=%B', pr().mergeCommit.oid) }),
    mergeTree: () => rev(`${pr().mergeCommit.oid}^{tree}`),
    headTree: () => rev(`${ref}^{tree}`),
    mergeIdentity: () => {
      fetch()
      const [author, committer] = git('log', '-1', '--format=%ae%x00%ce', pr().mergeCommit.oid).trim().split('\0')
      return { author, committer }
    },
    issueState: (owner, name, n) => json('gh', ['api', `repos/${owner}/${name}/issues/${n}`], top).state,
    // merge-check::CON-002/AC-03
    cleanup: () => {
      const left = []
      if (made.worktree && existsSync(worktree)) {
        const r = spawn('git', ['worktree', 'remove', worktree], top)
        if (r.status !== 0) left.push(`worktree ${worktree} (${lastLine(r.stderr)})`)
      }
      for (const d of made.dirs) {
        try { rmdirSync(d) } catch (e) { left.push(`directory ${d} (${e.code})`) }
      }
      if (made.ref && spawn('git', ['show-ref', '--verify', '--quiet', ref], top).status === 0) {
        const r = spawn('git', ['update-ref', '-d', ref], top)
        if (r.status !== 0) left.push(`ref ${ref} (${lastLine(r.stderr)})`)
      }
      Object.assign(made, { ref: false, worktree: false, dirs: [] })
      return { left }
    },
  }
}

export async function main(argv) {
  // From the start, so that no signal ends the process without an exit code (merge-check::REQ-002/AC-04)
  let facts
  const onSignal = (signal) => {
    const left = facts ? facts.cleanup().left : []
    process.stderr.write(`merge-check: stopped by ${signal}${left.length ? `; could not remove: ${left.join('; ')}` : ''}\n`)
    process.exit(2)
  }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)
  let args
  let squashBodyText
  try {
    args = parseArgs(argv)
    if (args.list) { process.stdout.write(listLines().join('\n') + '\n'); return 0 }
    if (args.mode === 'before') {
      try { squashBodyText = readFileSync(args.squashBody, 'utf8') } catch (e) { throw new UsageError(`cannot read --squash-body ${args.squashBody}: ${e.code ?? e.message}`) }
    }
  } catch (e) {
    if (!(e instanceof UsageError)) throw e
    process.stderr.write(`merge-check: ${e.message}\n${USAGE}\n`)
    return 2
  }
  let pre
  try {
    pre = preflight(args)
  } catch (e) {
    if (!(e instanceof Stop)) throw e
    process.stderr.write(`merge-check: ${e.message}\nNo check ran.\n`)
    return 2
  }
  facts = realFacts(args, pre, squashBodyText)
  let results
  try {
    results = await runChecks(args.mode, facts, {
      repo: args.repo, pr: args.pr, head: args.head, forbid: args.forbid, ignoreJob: args.ignoreJob,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now: () => Date.now(),
    })
  } finally {
    facts.cleanup()
  }
  process.stdout.write(render(results))
  return exitCode(results)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  try {
    process.exitCode = await main(process.argv.slice(2))
  } catch (e) {
    // An error no check caught is no verdict on the pull request (merge-check::REQ-002/AC-04), not node's exit 1
    process.stderr.write(`merge-check: ${e?.stack ?? e}\n`)
    process.exitCode = 2
  }
}
