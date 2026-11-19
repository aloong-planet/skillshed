// Tests for check-spec.mjs, the spec check of the project-documents spec (its size cap and its check script):
//   node --test to-spec/project-documents-spec-check.test.mjs
// The rules are tested on the functions the script exports. The command-line cases run the script in throwaway git
// repositories, so no file of this repository but the script is read. The spec fixture follows the shape of a real
// project's spec: requirements as headings with a title, acceptance criteria as list items opening with the full
// identifier and a colon, and an index README.md beside it. Chinese characters are built from code points, so this
// file holds no Chinese text.
// Gap: no case reaches the exit 2 for an error the script does not expect, since no input is known to raise one, for a
// git command that fails once the repository and the base are known good, or for a python3 missing or older than 3.11.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scratchRepos, write } from '../scripts/test-support/scratch-repos.mjs'
import { addedLines, CannotCheck, capFor, checkSpecs, citationsIn, definesIn, isSpecFile, parseArgs, reviewReasons, size } from './check-spec.mjs'

test('measures a spec in Unicode code points, markup and line endings included', () => {
  assert.equal(size('# A\n\n- b\n'), 9)
  assert.equal(size(`${String.fromCodePoint(0x1f600)}ab`), 3)
  assert.equal(size('a\r\nb'), 4)
})

test('has no cap for a working language other than en and zh', () => {
  assert.equal(capFor('fr'), null)
})

const spec = (n) => `# A\n\n${'x'.repeat(n - 6)}\n`
const check = (current, base = {}, language = 'en', hits = []) =>
  checkSpecs({ language, current: new Map(Object.entries(current)), base: new Map(Object.entries(base)), hits })
const messages = (r) => r.violations.map((v) => `${v.path}:${v.line}: ${v.message}`)

for (const [language, cap] of [['en', 50000], ['zh', 18000]]) {
  test(`passes a new ${language} spec at the cap and reports one a code point over`, () => {
    assert.deepEqual(messages(check({ 'docs/specs/a.md': spec(cap) }, {}, language)), [])
    assert.deepEqual(messages(check({ 'docs/specs/a.md': spec(cap + 1) }, {}, language)),
      [`docs/specs/a.md:1: ${(cap + 1).toLocaleString('en-US')} code points, over the cap of ${cap.toLocaleString('en-US')}, in a new spec`])
  })
}

for (const [what, before, now, expected] of [
  ['over the cap and longer than at the base', 50005, 50006, ['docs/specs/a.md:1: 50,006 code points, over the cap of 50,000, and 1 longer than at the base']],
  ['under the cap at the base and over it now', 49000, 50001, ['docs/specs/a.md:1: 50,001 code points, over the cap of 50,000, and 1,001 longer than at the base']],
  ['over the cap and as long as at the base', 50005, 50005, []],
  ['over the cap and shorter than at the base', 50005, 50002, []],
  ['under the cap and longer than at the base', 100, 50000, []],
]) {
  test(`${expected.length ? 'reports' : 'passes'} a kept spec ${what}`, () => {
    assert.deepEqual(messages(check({ 'docs/specs/a.md': spec(now) }, { 'docs/specs/a.md': spec(before) })), expected)
  })
}

test('reports each spec\'s size, its cap and how much it grew or shrank, and the specs deleted since the base', () => {
  const r = check(
    { 'docs/specs/a.md': spec(100), 'docs/specs/b.md': spec(60), 'docs/specs/c.md': spec(50) },
    { 'docs/specs/a.md': spec(90), 'docs/specs/b.md': spec(70), 'docs/specs/d.md': spec(10) },
  )
  assert.equal(r.cap, 50000)
  assert.deepEqual(r.sizes, [
    { path: 'docs/specs/a.md', size: 100, delta: 10 },
    { path: 'docs/specs/b.md', size: 60, delta: -10 },
    { path: 'docs/specs/c.md', size: 50, delta: null },
  ])
  assert.deepEqual(r.deleted, ['docs/specs/d.md'])
})

for (const [what, before, now, expected] of [
  ['a new file', null, 'a\nb\n', [1, 2]],
  ['a line inserted', 'a\nb\nc\n', 'a\nx\nb\nc\n', [2]],
  ['a line changed', 'a\nb\nc\n', 'a\nB\nc\n', [2]],
  ['lines moved down by an insertion above them, and one appended', 'a\nb\n', 'x\ny\na\nb\nz\n', [1, 2, 5]],
  ['a line deleted', 'a\nb\nc\n', 'a\nc\n', []],
  ['line endings read alike', 'a\r\nb\r\n', 'a\nb\n', []],
]) {
  test(`takes the lines the change added: ${what}`, () => {
    assert.deepEqual([...addedLines(before, now)], expected)
  })
}

const KEPT = '# A\n\nIntro.\n\nKept ~~old~~ and docs/.workings/a/x.md.\n'
for (const [what, now, expected] of [
  ['struck-through text on an added line', `${KEPT}New ~~gone~~ text.\n`, ['docs/specs/a.md:6: struck-through text']],
  ['a path into docs/.workings/ on an added line', `${KEPT}See docs/.workings/a/notes.md.\n`, ['docs/specs/a.md:6: a path into the working records, docs/.workings/']],
  ['a relative path into the working records', `${KEPT}See [n](../.workings/a/n.md).\n`, ['docs/specs/a.md:6: a path into the working records, docs/.workings/']],
  ['a path into the working records inside inline code', `${KEPT}See \`docs/.workings/a\`.\n`, ['docs/specs/a.md:6: a path into the working records, docs/.workings/']],
  ['both on unchanged lines only', KEPT, []],
  ['tildes inside inline code', `${KEPT}Run \`a ~~b~~\` now.\n`, []],
  ['a code block fenced with tildes holding them', `${KEPT}~~~\nx ~~y~~\n~~~\n`, []],
]) {
  test(`${expected.length ? 'reports' : 'passes'} ${what}`, () => {
    assert.deepEqual(messages(check({ 'docs/specs/a.md': now }, { 'docs/specs/a.md': KEPT })), expected)
  })
}

test('checks every line of a new spec for struck-through text and paths into the working records', () => {
  assert.deepEqual(messages(check({ 'docs/specs/a.md': KEPT })),
    ['docs/specs/a.md:5: struck-through text', 'docs/specs/a.md:5: a path into the working records, docs/.workings/'])
})

// the two shapes a primary definition takes in real specs: a heading with a title, and a list item with a colon
const DEFINING = '# A\n\n## Functional Requirements\n\n### a::REQ-001 A title\n\n- a::REQ-001/AC-01: It holds.\n\n' +
  '```\n### a::REQ-009 In a code block\n```\n'

test('takes as primary definitions the headings and list items that open with a full identifier', () => {
  assert.deepEqual([...definesIn(DEFINING)].sort(), ['a::REQ-001', 'a::REQ-001/AC-01'])
  assert.deepEqual([...definesIn('1. a::US-002: numbered.\n  * a::CON-003 nested.\n')].sort(), ['a::CON-003', 'a::US-002'])
})

for (const [what, text] of [
  ['an identifier mid-sentence', 'As a::REQ-002 says.\n'],
  ['a longer number', '- a::REQ-0021: x\n'],
  ['an acceptance criterion of the requirement', '- a::REQ-002/AC-01: x\n'],
  ['a list item whose text opens elsewhere', '- See a::REQ-002.\n'],
]) {
  test(`does not take ${what} for a definition of a::REQ-002`, () => {
    assert.equal(definesIn(text).has('a::REQ-002'), false)
  })
}

test('finds every full identifier a line cites, each once', () => {
  assert.deepEqual(citationsIn('See a::REQ-001/AC-02, b-c::US-010 and a::REQ-001/AC-02 again; not <spec-slug>::US-001 or x::y.'),
    ['a::REQ-001/AC-02', 'b-c::US-010'])
})

const cited = (path, line, text) => ({ path, line, text })
for (const [what, hits, expected] of [
  ['a citation of an identifier its spec defines', [cited('notes.md', 1, 'Per a::REQ-001/AC-01.')], []],
  ['a citation of an identifier its spec does not define', [cited('notes.md', 3, 'Per a::REQ-002.')],
    ['notes.md:3: cites a::REQ-002, which docs/specs/a.md does not define in a heading or list item opening with it']],
  ['a citation whose spec was at the base and is gone', [cited('src/x.ts', 7, '// gone::REQ-001')],
    ['src/x.ts:7: cites gone::REQ-001, whose spec docs/specs/gone.md was at the base and is gone']],
  ['a citation whose slug has a spec neither now nor at the base', [cited('notes.md', 1, 'Per other::REQ-001.')], []],
]) {
  test(`${expected.length ? 'reports' : 'passes'} ${what}`, () => {
    const r = check({ 'docs/specs/a.md': DEFINING }, { 'docs/specs/a.md': DEFINING, 'docs/specs/gone.md': '# Gone\n' }, 'en', hits)
    assert.deepEqual(messages(r), expected)
  })
}

test('counts the citations checked and those skipped for a slug with no spec now or at the base', () => {
  const r = check({ 'docs/specs/a.md': DEFINING }, { 'docs/specs/gone.md': '# Gone\n' }, 'en', [
    cited('n.md', 1, 'a::REQ-001 and a::REQ-002'), cited('n.md', 2, 'gone::US-001, other::REQ-001 and more::QR-001'),
  ])
  assert.deepEqual(r.citations, { checked: 3, skipped: 2 })
})

test('takes the Markdown files directly under docs/specs for specs, the index README.md left out', () => {
  assert.deepEqual(['a.md', 'README.md', 'notes.txt', 'b.md'].filter(isSpecFile), ['a.md', 'b.md'])
})

const ch = (...codes) => String.fromCodePoint(...codes)
for (const [line, expected, fenced = false] of [
  ['Measured on 2026-11-11 under Electron 43.', ['date']],
  ['A scan takes 40% of the time.', ['percentage']],
  ['3 of 20 specs are over the cap.', ['count N of M']],
  [`3 ${ch(0x4e2a, 0x4e2d, 0x7684)} 2 ${ch(0x4e2a)}`, ['count N of M']],
  ['The chunk size is set in jsonl.ts:120.', ['path with a line number']],
  ['It reads `totalInput` first.', ['identifier in backticks']],
  ['It reads `cache_write` first.', ['identifier in backticks']],
  ['const x = 1', ['code block'], true],
  [`${ch(0x1f52c)} to be measured.`, ['provisional marker or TODO']],
  ['TODO: settle the wording.', ['provisional marker or TODO']],
  ['FIXME later.', ['provisional marker or TODO']],
  ['The figure is provisional.', ['provisional marker or TODO']],
  [`${ch(0x6682, 0x5b9a)}`, ['provisional marker or TODO']],
  ['A test seam stands in for the clock.', ['test seam or fixture']],
  ['The fixtures copy a real sample.', ['test seam or fixture']],
  ['Fixed in #123.', ['ticket number']],
  ['As the prototype showed.', ['prototype']],
  [`${ch(0x539f, 0x578b)}`, ['prototype']],
  ['On 2026-11-11 the prototype ran 3 of 4 cases.', ['date', 'count N of M', 'prototype']],
  ['A plain rule: the list keeps `ADR-FORMAT.md` and `check-spec.mjs` in order.', []],
]) {
  test(`lists for review ${expected.join(', ') || 'nothing'}: ${JSON.stringify(line)}`, () => {
    assert.deepEqual(reviewReasons(line, fenced), expected)
  })
}

test('lists for review only lines the change added, and fails on none of them', () => {
  const before = '# A\n\nOn 2026-01-01 it held.\n'
  const r = check({ 'docs/specs/a.md': `${before}On 2026-02-02 the prototype ran.\n\`\`\`\nx\n\`\`\`\n` }, { 'docs/specs/a.md': before })
  assert.deepEqual(r.violations, [])
  assert.deepEqual(r.review, [
    { path: 'docs/specs/a.md', line: 4, reasons: ['date', 'prototype'], text: 'On 2026-02-02 the prototype ran.' },
    { path: 'docs/specs/a.md', line: 5, reasons: ['code block'], text: '```' },
    { path: 'docs/specs/a.md', line: 6, reasons: ['code block'], text: 'x' },
    { path: 'docs/specs/a.md', line: 7, reasons: ['code block'], text: '```' },
  ])
})

test('takes the base from --base', () => {
  assert.deepEqual(parseArgs(['--base', 'abc123']), { base: 'abc123' })
})

for (const [what, argv, reason] of [
  ['no --base', [], /--base <commit> is required/],
  ['--base without its commit', ['--base'], /--base <commit> is required/],
  ['an unknown argument', ['--base', 'x', '--all'], /unknown argument "--all"/],
]) {
  test(`cannot check with ${what}`, () => {
    assert.throws(() => parseArgs(argv), (e) => e instanceof CannotCheck && reason.test(e.message))
  })
}

// Command-line cases, run in throwaway git repositories.
const { scratch, lock, env: ENV, git } = scratchRepos('check-spec-test-')
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'check-spec.mjs')
/** A repository on branch main holding `files` in one commit, and that commit */
function project(files, language = '"working-language" = "en"\n') {
  const root = scratch()
  git(root, 'init', '-q', '-b', 'main')
  write(root, { 'capabilities.toml': language, ...files })
  git(root, 'add', '-A')
  git(root, 'commit', '-q', '-m', 'start')
  return { root, base: git(root, 'rev-parse', 'HEAD') }
}
function run(cwd, args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, env: ENV, encoding: 'utf8' })
  return { code: r.status, out: r.stdout, err: r.stderr }
}
const violationLines = (out) => out.split('\n').filter((l) => /^\S+:\d+: /.test(l))

// the shape of a real spec: a requirement heading with a title, its acceptance criteria as list items, and an index
const REAL_SPEC = `# Area

## Problem Statement

A user loses track of what changed.

## Functional Requirements

### area::REQ-001 The list shows each change

- area::REQ-001/AC-01: Each change has a row, measured on 2026-01-01.
- area::REQ-001/AC-02: A row names its author (area::REQ-001/AC-01).
`
const INDEX = '# Specs\n\n| Spec | Scope |\n|---|---|\n| [area](area.md) | The list |\n'

test('passes a change that breaks no rule, reporting the sizes and the added lines for review', () => {
  const { root, base } = project({ 'docs/specs/area.md': REAL_SPEC, 'docs/specs/README.md': INDEX })
  write(root, { 'docs/specs/area.md': `${REAL_SPEC}- area::REQ-001/AC-03: The prototype's order holds.\n` })
  const r = run(root, ['--base', base])
  assert.equal(r.code, 0, r.out + r.err)
  assert.match(r.out, new RegExp(`^Base ${base}\\. Working language "en": a spec over 50,000 code points is over the cap\\.$`, 'm'))
  assert.match(r.out, /^docs\/specs\/area\.md: \d[\d,]* code points, cap 50,000, \+52 since the base\.$/m)
  assert.doesNotMatch(r.out, /README/)
  assert.match(r.out, /^0 violation\(s\)\.$/m)
  const review = r.out.slice(r.out.indexOf('For review'))
  assert.deepEqual(review.split('\n').filter((l) => l.startsWith('  ')), ['  docs/specs/area.md:13 [prototype]: - area::REQ-001/AC-03: The prototype\'s order holds.'])
})

test('reports citations in the files git tracks as they are now, and of a deleted spec, but not in untracked files', () => {
  const { root, base } = project({
    'docs/specs/area.md': REAL_SPEC,
    'docs/specs/old.md': '# Old\n\n- old::REQ-001: It held.\n',
    'src/a.ts': '// area::REQ-001/AC-02\n// area::REQ-002\n',
    'notes.md': 'Nothing yet.\n',
  })
  write(root, { 'docs/specs/old.md': null, 'notes.md': 'See old::REQ-001 and area::US-001.\n', 'draft.md': 'area::REQ-009\n' })
  const r = run(root, ['--base', base])
  assert.equal(r.code, 1, r.out + r.err)
  assert.deepEqual(violationLines(r.out).sort(), [
    'notes.md:1: cites area::US-001, which docs/specs/area.md does not define in a heading or list item opening with it',
    'notes.md:1: cites old::REQ-001, whose spec docs/specs/old.md was at the base and is gone',
    'src/a.ts:2: cites area::REQ-002, which docs/specs/area.md does not define in a heading or list item opening with it',
  ])
  assert.match(r.out, /^docs\/specs\/old\.md: deleted since the base\.$/m)
})

test('takes no Markdown file in a directory under docs/specs for a spec, at the base or now', () => {
  const over = `# Old\n\n${'x'.repeat(50001)}\n`
  const { root, base } = project({ 'docs/specs/area.md': REAL_SPEC, 'docs/specs/archive/old.md': over, 'docs/specs/archive/gone.md': over })
  write(root, { 'docs/specs/archive/old.md': `${over}More ~~struck~~.\n`, 'docs/specs/archive/gone.md': null })
  const r = run(root, ['--base', base])
  assert.equal(r.code, 0, r.out + r.err)
  assert.doesNotMatch(r.out, /archive/)
})

test('reads working-language with a TOML parser and takes the cap of that language, for a new spec not yet added to git', () => {
  const { root, base } = project({ 'docs/specs/README.md': INDEX, 'docs/specs/area.md': REAL_SPEC }, "working-language = 'zh' # the owner's language\n")
  write(root, { 'docs/specs/big.md': `# Big\n\n${'x'.repeat(18000)}\n` })
  const r = run(root, ['--base', base])
  assert.equal(r.code, 1, r.out + r.err)
  assert.deepEqual(violationLines(r.out), ['docs/specs/big.md:1: 18,008 code points, over the cap of 18,000, in a new spec'])
  assert.match(r.out, /^docs\/specs\/big\.md: 18,008 code points, cap 18,000, new\.$/m)
})

for (const [what, setup, reason] of [
  ['without --base', (p) => ({ cwd: p.root, args: [] }), /--base <commit> is required/],
  ['with a --base that is not a commit', (p) => ({ cwd: p.root, args: ['--base', 'no-such-commit'] }), /--base "no-such-commit" is not a commit/],
  ['below the repository root', (p) => ({ cwd: join(p.root, 'docs'), args: ['--base', p.base] }), /not run at the root/],
  ['without capabilities.toml', (p) => { write(p.root, { 'capabilities.toml': null }); return { cwd: p.root, args: ['--base', p.base] } }, /cannot read capabilities\.toml/],
  ['without working-language', (p) => { write(p.root, { 'capabilities.toml': '[lint]\nenabled = false\n' }); return { cwd: p.root, args: ['--base', p.base] } }, /declares no working-language string/],
  ['with a working language that has no cap', (p) => { write(p.root, { 'capabilities.toml': 'working-language = "fr"\n' }); return { cwd: p.root, args: ['--base', p.base] } }, /working-language "fr" has no cap on a spec's size; ask the user for one/],
  ['with no docs/specs now or at the base', () => { const p = project({ 'a.md': 'a\n' }); return { cwd: p.root, args: ['--base', p.base] } }, /no spec found/],
  ['with only the index README.md', () => { const p = project({ 'docs/specs/README.md': INDEX }); return { cwd: p.root, args: ['--base', p.base] } }, /no spec found/],
  ['with a docs/specs it cannot list', (p) => { lock(join(p.root, 'docs/specs')); return { cwd: p.root, args: ['--base', p.base] } }, /cannot read docs\/specs: EACCES/],
  ['with a spec it cannot read', (p) => { lock(join(p.root, 'docs/specs/area.md')); return { cwd: p.root, args: ['--base', p.base] } }, /cannot read docs\/specs\/area\.md: EACCES/],
]) {
  test(`cannot check ${what}`, () => {
    const { cwd, args } = setup(project({ 'docs/specs/area.md': REAL_SPEC }))
    const r = run(cwd, args)
    assert.equal(r.code, 2, r.out + r.err)
    assert.match(r.err, reason)
  })
}
