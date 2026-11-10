// Tests for check-action-pins.mjs. Each case writes workflow files into a throwaway directory and runs the
// script as a project would, reading its exit code and output:
//   node --test github-ops/check-action-pins.test.mjs
// The base workflow follows the shape of a real project workflow (a list item that starts with `uses`, and
// a `uses` key after `name` in the same step).
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'check-action-pins.mjs')

const A = 'a'.repeat(40)
const B = 'b'.repeat(40)
const C = 'c'.repeat(40)

const dirs = []
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }) })

/** Run the script in a fresh project holding `files` under .github/workflows; no directory is made when `files` is null */
function run(files) {
  const root = mkdtempSync(join(tmpdir(), 'check-action-pins-test-'))
  dirs.push(root)
  if (files) {
    mkdirSync(join(root, '.github/workflows'), { recursive: true })
    for (const [name, text] of Object.entries(files)) writeFileSync(join(root, '.github/workflows', name), text)
  }
  const r = spawnSync(process.execPath, [SCRIPT], { cwd: root, encoding: 'utf8' })
  return { code: r.status, out: r.stdout, err: r.stderr }
}

/** A workflow whose steps are the given lines, in the shape of a real project workflow */
const workflow = (...steps) => `name: Checks

on:
  pull_request:

jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
${steps.map((s) => `      ${s}`).join('\n')}
      - run: pnpm test
`

const PINNED_STEPS = [
  `- uses: actions/checkout@${A} # v6.0.1`,
  `- name: Set up Node`,
  `  uses: actions/setup-node@${B} # v6.1.0`,
  `  with:`,
  `    node-version: 22`,
]

test('passes when every reference is pinned with its release', () => {
  const r = run({ 'ci.yml': workflow(...PINNED_STEPS) })
  assert.equal(r.code, 0, r.out + r.err)
  assert.match(r.out, /1 workflow file\(s\), 2 action reference\(s\) checked, 0 local or docker reference\(s\) not checked: 0 violation\(s\)\./)
})

const NOT_PINNED = /not pinned to a full commit/
const NO_RELEASE = /the line does not end with the release comment/
// Each step uses a repository the pinned steps do not, so the only possible violation is the one named
for (const [what, step, why] of [
  ['a tag', `- uses: actions/cache@v6`, NOT_PINNED],
  ['a short commit', `- uses: actions/cache@${C.slice(0, 7)} # v6.0.1`, NOT_PINNED],
  ['a commit without the release comment', `- uses: actions/cache@${C}`, NO_RELEASE],
  ['a commit with a major-only release comment', `- uses: actions/cache@${C} # v6`, NO_RELEASE],
]) {
  test(`reports ${what}`, () => {
    const r = run({ 'ci.yml': workflow(...PINNED_STEPS, step) })
    assert.equal(r.code, 1, r.out + r.err)
    // the extra step is line 15 of the file
    assert.match(r.out, new RegExp(`\\.github/workflows/ci\\.yml:15: ${why.source}`))
    assert.match(r.out, / 1 violation\(s\)\./)
  })
}

test('accepts a quoted pinned reference and a pinned reusable workflow', () => {
  const r = run({
    'ci.yml': workflow(`- uses: 'actions/checkout@${A}' # v6.0.1`),
    'release.yml': `jobs:\n  build:\n    uses: some-org/shared/.github/workflows/build.yml@${C} # v2.3.4\n`,
  })
  assert.equal(r.code, 0, r.out + r.err)
  assert.match(r.out, /2 workflow file\(s\), 2 action reference\(s\) checked/)
})

test('reads a quoted uses key', () => {
  const r = run({ 'ci.yml': workflow(`- "uses": actions/cache@v6`, `- { 'uses': actions/cache@v6 }`) })
  assert.equal(r.code, 1, r.out + r.err)
  assert.match(r.out, /ci\.yml:10: not pinned to a full commit/)
  assert.match(r.out, /ci\.yml:11: `uses` in a flow mapping/)
})

test('does not check local actions and docker references', () => {
  const r = run({ 'ci.yml': workflow(...PINNED_STEPS, `- uses: ./.github/actions/setup`, `- uses: docker://alpine:3.20`) })
  assert.equal(r.code, 0, r.out + r.err)
  assert.match(r.out, /2 action reference\(s\) checked, 2 local or docker reference\(s\) not checked/)
})

test('does not check a same-repository reusable workflow written with $/', () => {
  const r = run({ 'ci.yml': `jobs:\n  build:\n    uses: $/.github/workflows/build.yml\n` })
  assert.equal(r.code, 0, r.out + r.err)
  assert.match(r.out, /0 action reference\(s\) checked, 1 local or docker reference\(s\) not checked/)
})

test('ignores commented-out steps', () => {
  const r = run({ 'ci.yml': workflow(...PINNED_STEPS, `# - uses: actions/cache@v6`, `# - { uses: actions/cache@v6 }`) })
  assert.equal(r.code, 0, r.out + r.err)
  assert.match(r.out, /2 action reference\(s\) checked/)
})

test('reports one repository pinned to two commits, across files, sub-paths and letter case', () => {
  const r = run({
    'a.yml': workflow(`- uses: github/codeql-action/init@${A} # v3.1.0`),
    'b.yaml': workflow(`- uses: GitHub/codeql-action/analyze@${B} # v3.1.0`),
  })
  assert.equal(r.code, 1, r.out + r.err)
  assert.match(r.out, /b\.yaml:10: github\/codeql-action is pinned to a different commit at \.github\/workflows\/a\.yml:10/)
  assert.match(r.out, / 1 violation\(s\)\./)
})

test('accepts one repository pinned to the same commit on several lines', () => {
  const r = run({
    'a.yml': workflow(`- uses: github/codeql-action/init@${A} # v3.1.0`, `- uses: github/codeql-action/analyze@${A} # v3.1.0`),
  })
  assert.equal(r.code, 0, r.out + r.err)
})

test('reports a uses key it cannot read instead of passing over it', () => {
  const r = run({ 'ci.yml': workflow(`- { uses: actions/checkout@v6 }`, `- uses: >-`, `    actions/setup-node@v6`) })
  assert.equal(r.code, 1, r.out + r.err)
  assert.match(r.out, /ci\.yml:10: `uses` in a flow mapping/)
  assert.match(r.out, /ci\.yml:11: /)
  assert.match(r.out, / 2 violation\(s\)\./)
})

test('exits 2 when there is no workflows directory', () => {
  const r = run(null)
  assert.equal(r.code, 2, r.out + r.err)
  assert.match(r.err, /Cannot read the workflows directory/)
})

test('exits 2 when the directory holds no workflow file', () => {
  const r = run({ 'notes.txt': 'uses: actions/checkout@v6\n' })
  assert.equal(r.code, 2, r.out + r.err)
  assert.match(r.err, /No workflow file/)
})
