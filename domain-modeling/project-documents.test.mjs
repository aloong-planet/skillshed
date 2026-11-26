// Tests for check-adr.mjs, the ADR check of the project-documents spec:
//   node --test domain-modeling/project-documents.test.mjs
// The rules are tested on the functions the script exports, with hand-written maps of fixed names. The command-line
// cases copy the script into a throwaway skill tree beside a names table the test writes, and run it in throwaway git
// repositories, so no file of this repository but the script is read. The entry fixture follows the shape of a real
// project's ADR: hard-wrapped lines, options as bold-led numbered items with indented continuation lines, consequences
// labelled by kind, and a Decision section holding a paragraph and a list; the entries read for the index follow the
// status lines of entries written under the earlier rules. Chinese punctuation is built from code points, and the zh
// map holds made-up names, so this file holds no Chinese text.
// Gap: no case reaches the exit 2 for an error the script does not expect, since no input is known to raise one.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scratchRepos, write } from '../scripts/test-support/scratch-repos.mjs'
import {
  CannotCheck, changedBeyondNumbers, checkEntry, checkIndex, countChars, countSentences, entryFiles, parseNames, readEntry,
} from './check-adr.mjs'

const ch = (...codes) => String.fromCharCode(...codes)
const [P, E, Q, LP, RP] = [ch(0x3002), ch(0xff01), ch(0xff1f), ch(0xff08), ch(0xff09)]
const HAN = ch(0x7532, 0x4e59, 0x4e19, 0x4e01)
const [A, B, C, D] = [...HAN]

for (const [what, text, expected] of [
  ['versions and decimals', 'Version 1.2.3 ships. Decimals like 0.3 s stay.', 2],
  ['inline code', 'Run `pnpm test. Now` first. Then stop.', 2],
  ['a link target', 'See [the spec](docs/a.b. C.md) here. Then stop.', 2],
  ['parentheses', 'A rule (see X. It holds.) applies. Then stop.', 2],
  ['abbreviations', 'Use e.g. Node or i.e. Deno vs. Bun here. Then stop.', 2],
  ['file names', 'Edit ADR-FORMAT.md and check-adr.mjs now. Then stop.', 2],
  ['a closing quote after the stop', 'He said "stop." Then we left.', 2],
  ['three end marks', 'One. Two? Three!', 3],
  ['no final stop', 'No final stop', 1],
  ['empty text', '', 0],
  ['a sentence opening with a digit', 'It took 2 s. 3 runs failed.', 2],
  ['fenced code', 'Before.\n```\nA. B. C.\n```\nAfter.', 2],
  ['code fenced with tildes', 'Before.\n~~~\nA. B. C.\n~~~\nAfter.', 2],
  ['parentheses that do not balance', 'Note (see below. Then two. Three.', 3],
  ['a closing parenthesis without its opening one', 'Stray) (see. Two.) Three.', 2],
  ['Chinese end marks', `${A}${P}${B}${E}${C}${Q}`, 3],
  ['Chinese end marks inside full-width parentheses', `${A}${LP}${B}${P}${C}${RP}${D}${P}`, 1],
  ['Chinese end marks in a row', `${A}${Q}${E}${B}${P}`, 2],
]) {
  test(`counts sentences: ${what}`, () => {
    assert.equal(countSentences(text), expected)
  })
}

test('counts characters without the title and status lines, trimmed, in code points', () => {
  const head = '# ADR-0001: A title\n\n- Status: Proposed\n\n'
  assert.equal(countChars(`${head}abc\n`, 'Status'), 3)
  assert.equal(countChars(`${head}  abc  \n\n`, 'Status'), 3)
  assert.equal(countChars(`${head}${String.fromCodePoint(0x1f600)}ab`, 'Status'), 3)
  assert.equal(countChars(head.replace(/\n/g, '\r\n') + 'ab\r\ncd', 'Status'), 5)
})

const EN = {
  Status: 'Status', Proposed: 'Proposed', Accepted: 'Accepted', Context: 'Context', Options: 'Options',
  Decision: 'Decision', Consequences: 'Consequences', Sources: 'Sources', Positive: 'Positive', Negative: 'Negative',
  Neutral: 'Neutral', 'Retired numbers': 'Retired numbers',
}
const ZH = {
  Status: 'Zt', Proposed: 'Zprop', Accepted: 'Zacc', Context: 'Zctx', Options: 'Zopt', Decision: 'Zdec',
  Consequences: 'Zcons', Sources: 'Zsrc', Positive: 'Zpos', Negative: 'Zneg', Neutral: 'Zneu', 'Retired numbers': 'Zret',
}

/** A conforming entry in the shape of a real one, its fixed names taken from `N` */
const realEntry = (N, status = `${N.Accepted} (2026-11-12)`) => `# ADR-0003: A scan runs on one worker thread

- ${N.Status}: ${status}

## ${N.Context}

Most of a scan is synchronous work, from the walk of the session trees to the aggregation, so on the main
process's thread it holds the window (Sources). Scans start on a timer and when the window gains focus (see e.g.
token-stats E1), so the freeze falls as the user comes back. The cache also holds every session's question index
(ADR-0011), which \`search.ts\` reads between scans.

## ${N.Options}

1. **One worker thread, kept for the run, owns the token engine and runs the whole scan** — chosen.
2. Only cut the scan's cost on the main process — rejected as the whole answer: one stretch of about 0.3 s is
   left and grows with the data (token-stats::QR-002).
3. A separate process — rejected: the same boundary plus a process to start, watch and stop. A failing worker
   already isolates a crash by handing its work back.

## ${N.Decision}

We adopt **option 1**.

- **The scan worker owns the token engine (ADR-0004)**, with every step that reads the agents' data. The main
  process keeps the triggers.

## ${N.Consequences}

- ${N.Positive}: a rescan no longer freezes the window, held to no stretch over 100 ms on the main process
  (token-stats::QR-001).
- ${N.Negative}: every use of the engine is a message to another thread. An index read waits for the step under way.
- ${N.Neutral}: the triggers and their intervals do not depend on where a scan runs.

## ${N.Sources}

Measured on 2026-11-11 under Electron 43.2.0, with 3,047 rollouts. A rescan held the main process for 1.4 s.
Postmortem \`2026-11-12-the-quits-flush\`.
`

/** `text` with `from` replaced by `to`; fails when `from` is not there, so a mutation always lands */
function mutate(text, from, to) {
  assert.ok(text.includes(from), `fixture lacks ${JSON.stringify(from)}`)
  return text.replace(from, to)
}

const tenOptions = mutate(realEntry(EN), /## Options\n\n[\s\S]*?\n\n## Decision/.exec(realEntry(EN))[0],
  `## Options\n\n${Array.from({ length: 10 }, (_, i) => `${i + 1}. Option ${i + 1} — rejected. It costs more.`).join('\n')}\n\n## Decision`)

for (const [what, text] of [['an entry in the shape of a real one', realEntry(EN)], ['ten options of two sentences', tenOptions]]) {
  test(`passes ${what}`, () => {
    assert.deepEqual(checkEntry('0003-scan-worker.md', text, EN, 'en'), [])
  })
}

const REAL = realEntry(EN)
const SOURCES = /## Sources\n[\s\S]*$/.exec(REAL)[0]
/** A minimal conforming entry whose text outside the title and status lines is `size` characters long */
function sized(N, size) {
  const head = `# ADR-0003: T\n\n- ${N.Status}: ${N.Accepted} (2026-11-12)\n\n`
  const body = `## ${N.Context}\n\nA.\n\n## ${N.Options}\n\n1. A.\n\n## ${N.Decision}\n\nA.\n\n## ${N.Consequences}\n\n` +
    `- ${N.Positive}: a.\n- ${N.Negative}: b.\n- ${N.Neutral}: c.\n\n## ${N.Sources}\n\n`
  return `${head}${body}${'x'.repeat(size - body.length)}\n`
}

for (const [what, text, expected, line, N = EN, language = 'en'] of [
  ['a title number that is not the file name\'s', mutate(REAL, '# ADR-0003:', '# ADR-0004:'), /title's number 0004 is not the file name's 0003/, 1],
  ['Proposed, which is no longer a state', mutate(REAL, 'Accepted (2026-11-12)', 'Proposed'), /status is not "Accepted \(YYYY-MM-DD\)": "Proposed"/, 3],
  ['Accepted without a parenthetical', mutate(REAL, 'Accepted (2026-11-12)', 'Accepted'), /status is not "Accepted \(YYYY-MM-DD\)"/, 3],
  ['a state outside the template', mutate(REAL, 'Accepted (2026-11-12)', 'Superseded (2026-11-12)'), /status is not "Accepted \(YYYY-MM-DD\)"/, 3],
  ['Accepted with a note in place of the date', mutate(REAL, 'Accepted (2026-11-12)', 'Accepted (v0.5.2 released, verified on the wire)'), /status is not "Accepted \(YYYY-MM-DD\)"/, 3],
  ['Accepted with a note after the date', mutate(REAL, 'Accepted (2026-11-12)', 'Accepted (2026-11-12; verified later)'), /status is not "Accepted \(YYYY-MM-DD\)"/, 3],
  ['text between the status line and the first section', mutate(REAL, '(2026-11-12)\n', '(2026-11-12)\n\nSupersedes ADR-0002.\n'), /text outside the status line/, 5],
  ['a missing section', mutate(REAL, SOURCES, ''), /the sections are .*; expected/, 5],
  ['sections out of order', mutate(mutate(REAL, SOURCES, ''), '## Decision', `${SOURCES}\n## Decision`), /the sections are .*; expected/, 5],
  ['an extra section', `${REAL}\n## Notes\n\nMore.\n`, /the sections are .*; expected/, 5],
  ['an empty section', mutate(REAL, 'We adopt **option 1**.\n\n- **The scan worker owns the token engine (ADR-0004)**, with every step that reads the agents\' data. The main\n  process keeps the triggers.\n', ''), /the Decision section is empty/, 20],
  ['a Context over three sentences', mutate(REAL, 'reads between scans.', 'reads between scans. One more.'), /Context has 4 sentences; at most 3/, 5],
  ['an option over two sentences', mutate(REAL, 'handing its work back.', 'handing its work back. It restarts.'), /option has 3 sentences; at most 2/, 17],
  ['a consequence over two sentences', mutate(REAL, 'the step under way.', 'the step under way. It is copied.'), /consequence has 3 sentences; at most 2/, 31],
  ['text in Options outside an option', mutate(REAL, 'its work back.\n', 'its work back.\n\nSee also the list above.\n'), /line in Options outside a numbered option/, 20],
  ['options written as bullets', mutate(REAL, '2. Only cut', '- Only cut'), /line in Options outside a numbered option/, 15],
  ['text in Consequences outside an item', mutate(REAL, 'where a scan runs.\n', 'where a scan runs.\n\nSee also the list above.\n'), /line in Consequences outside a `- ` item/, 34],
  ['no status line', mutate(REAL, '- Status: Accepted (2026-11-12)\n\n', ''), /no status line `- Status: \.\.\.` between the title and the first section/, 1],
  ['a first line that is not a title', mutate(REAL, '# ADR-0003: A scan', 'ADR-0003: A scan'), /the first line is not `# ADR-NNNN: <title>`/, 1],
  ['a consequence without its kind', mutate(REAL, '- Neutral: the triggers', '- Neutral: the triggers do not move.\n- Also: the triggers'), /does not open with "Positive:", "Negative:" or "Neutral:"/, 33],
  ['no neutral consequence', mutate(REAL, '- Neutral: the triggers and their intervals do not depend on where a scan runs.\n', ''), /no "Neutral" consequence/, 27],
  ['an en entry over 5,000 characters', sized(EN, 5001), /5001 characters, .*at most 5000 for working-language "en"/, 1],
  ['a zh entry over 1,800 characters', sized(ZH, 1801), /1801 characters, .*at most 1800 for working-language "zh"/, 1, ZH, 'zh'],
]) {
  test(`reports ${what}`, () => {
    const found = checkEntry('0003-scan-worker.md', text, N, language)
    assert.ok(found.some((v) => expected.test(v.message) && v.line === line), JSON.stringify(found))
  })
}

test('passes an entry at its working language\'s limit', () => {
  assert.deepEqual(checkEntry('0003-t.md', sized(EN, 5000), EN, 'en'), [])
  assert.deepEqual(checkEntry('0003-t.md', sized(ZH, 1800), ZH, 'zh'), [])
})

test('reads the entry\'s fixed names in the working language', () => {
  const zh = realEntry(ZH, `${ZH.Accepted}${LP}2026-11-12${RP}`).replace('- Zt: ', `- Zt${ch(0xff1a)}`)
  assert.deepEqual(checkEntry('0003-scan-worker.md', zh, ZH, 'zh'), [])
  assert.ok(checkEntry('0003-scan-worker.md', zh, EN, 'en').some((v) => /the sections are/.test(v.message)))
})

const TABLE = `# Names\n\n| canonical | en | fr |\n|---|---|---|\n` +
  Object.keys(EN).map((k) => `| Z-${k} | ${k} | F-${k} |`).join('\n') + '\n'

test('reads the fixed names from the table: zh from its first column, another language from the column it heads', () => {
  assert.equal(parseNames(TABLE, 'zh')['Retired numbers'], 'Z-Retired numbers')
  assert.equal(parseNames(TABLE, 'en').Options, 'Options')
  assert.equal(parseNames(TABLE, 'fr').Neutral, 'F-Neutral')
})

for (const [what, table, language, reason] of [
  ['a language with no column', TABLE, 'de', /no column for working-language "de"/],
  ['a name missing from the table', TABLE.replace(/^\| Z-Sources .*\n/m, ''), 'en', /no "en" name for "Sources"/],
]) {
  test(`cannot check with ${what}`, () => {
    assert.throws(() => parseNames(table, language), (e) => e instanceof CannotCheck && reason.test(e.message))
  })
}

const KNOWN = {
  numbers: new Set(['0001', '0002', '0003', '0005', '0013', '0014', '0020']),
  fileNames: new Set(['0002-old.md', '0005-new-name.md', '0002-Old_Name.md', '0005-new.md']),
}
for (const [what, base, current, expected, known = KNOWN] of [
  ['an ADR number and an entry file name repointed', 'See ADR-0002 and [it](0002-old.md).\n', 'See ADR-0005 and [it](0005-new-name.md).\n', false],
  ['an entry number written bare, repointed', 'As 0001 says.\n', 'As 0003 says.\n', false],
  ['the second number of ADR-0013/0014, repointed', 'See ADR-0013/0014.\n', 'See ADR-0013/0020.\n', false],
  ['an entry file name outside lower-case letters, digits and hyphens, repointed', '[it](0002-Old_Name.md)\n', '[it](0005-new.md)\n', false],
  ['a word added', 'See ADR-0002.\n', 'See ADR-0002 now.\n', true],
  ['a four-digit figure that is no entry\'s number', 'It holds 1024 rows.\n', 'It holds 2048 rows.\n', true],
  ['a dated file name that is no entry\'s, replaced', 'See 2026-11-12-where-the-memory-goes.md.\n', 'See 2026-11-14-a-different-finding.md.\n', true],
  ['an ADR number repointed, with no entry known', 'See ADR-0002.\n', 'See ADR-0005.\n', false, { numbers: new Set(), fileNames: new Set() }],
]) {
  test(`takes ${what} for ${expected ? 'a change' : 'no change'}`, () => {
    assert.equal(changedBeyondNumbers(base, current, known), expected)
  })
}

test('takes the first file of a number, in sorted order, as its entry and reports every other', () => {
  const { entries, duplicates } = entryFiles(['0002-x.md', '0001-b.md', 'README.md', '0001-a.md', 'notes.txt'])
  assert.deepEqual([...entries], [['0001', '0001-a.md'], ['0002', '0002-x.md']])
  assert.deepEqual(duplicates, ['0001-b.md'])
})

const ENTRIES = new Map([
  ['0001', { fileName: '0001-first.md', title: 'First rule', state: 'Accepted' }],
  ['0003', { fileName: '0003-pipes.md', title: 'Pipes a | b, kept', state: 'Accepted' }],
])
const README = `# ADR index

Conventions for this repository.

## General

| # | Decision | Status |
|---|---|---|
| [0001](0001-first.md) | First rule | Accepted |

## Usage

| # | Decision | Status |
|---|---|---|
| [0003](0003-pipes.md) | Pipes a \\| b, kept | Accepted (2026-11-12) |

## Retired numbers

- 0002: merged into 0003
`
const ROW1 = '| [0001](0001-first.md) | First rule | Accepted |'

test('passes an index in step with its entries and their history', () => {
  const { violations, retired } = checkIndex(README, ENTRIES, new Set(['0001', '0002', '0003']), EN)
  assert.deepEqual(violations, [])
  assert.deepEqual([...retired], ['0002'])
})

for (const [what, readme, expected, line] of [
  ['an entry without a row', mutate(README, `${ROW1}\n`, ''), /0001-first\.md has no row/, 1],
  ['a row linking to no entry file', mutate(README, `${ROW1}\n`, `${ROW1}\n| [0004](0004-x.md) | X | Accepted |\n`), /links to 0004-x\.md, which is not an entry file/, 10],
  ['a row that is not a link to its entry', mutate(README, ROW1, '| 0001 | First rule | Accepted |'), /first cell is not/, 9],
  ['a Decision cell that is not the title', mutate(README, '| First rule |', '| First rules |'), /Decision cell is not the title of 0001/, 9],
  ['a status cell that is not the state', mutate(README, ROW1, ROW1.replace('Accepted', 'Proposed')), /Status cell "Proposed" is not the state of 0001/, 9],
  ['a table under another header', mutate(README, '| # | Decision | Status |\n|---|---|---|\n| [0001]', '| # | Title | Status |\n|---|---|---|\n| [0001]'), /0001-first\.md has no row/, 1],
  ['two rows for one number', mutate(README, `${ROW1}\n`, `${ROW1}\n${ROW1}\n`), /a second row for 0001/, 10],
  ['a retired number that has a file', mutate(README, '- 0002: merged into 0003\n', '- 0002: merged into 0003\n- 0001: withdrawn\n'), /0001 is among the Retired numbers but has the entry file 0001-first\.md/, 20],
  ['a number gone from the history but not retired', mutate(README, '- 0002: merged into 0003\n', ''), /0002 had an entry file in the history and has none now/, 17],
  ['no README', null, /docs\/adr has no README\.md/, 1],
]) {
  test(`reports ${what}`, () => {
    const { violations } = checkIndex(readme, ENTRIES, new Set(['0001', '0002', '0003']), EN)
    assert.ok(violations.some((v) => expected.test(v.message) && v.line === line), JSON.stringify(violations))
  })
}

for (const [what, text, expected] of [
  ['a status value with text after its date, wrapped', realEntry(EN, 'Accepted (2026-08-18). Supersedes in part the clause of ADR-0005 and the\n  matching clause of ADR-0006.'), { title: 'A scan runs on one worker thread', state: 'Accepted' }],
  ['a status line without its list marker', mutate(REAL, '- Status: Accepted', 'Status: Accepted'), { title: 'A scan runs on one worker thread', state: 'Accepted' }],
  ['a title without a space after its colon', mutate(REAL, '# ADR-0003: A scan', '# ADR-0003:A scan'), { title: 'A scan runs on one worker thread', state: 'Accepted' }],
  ['a proposed entry with a note after its state', realEntry(EN, 'Proposed; it awaits the in-app measurement'), { title: 'A scan runs on one worker thread', state: 'Proposed' }],
  ['a state the rules no longer have', realEntry(EN, 'Superseded by ADR-0005 (the total rule)'), { title: 'A scan runs on one worker thread', state: 'Superseded by ADR-0005' }],
  ['a status line under another label', mutate(REAL, '- Status:', '- State:'), { title: 'A scan runs on one worker thread', state: null }],
]) {
  test(`reads the title and state of an entry for the index: ${what}`, () => {
    const { title, state } = readEntry(text, EN)
    assert.deepEqual({ title, state }, expected)
  })
}

test('names the index cells it cannot compare and reports nothing about them', () => {
  const entries = new Map([
    ['0001', { ...ENTRIES.get('0001'), state: null }],
    ['0003', { ...ENTRIES.get('0003'), title: null, state: null }],
  ])
  const { violations, uncompared } = checkIndex(README, entries, new Set(['0001', '0002', '0003']), EN)
  assert.deepEqual(violations, [])
  assert.deepEqual(uncompared, ['0001 (Status)', '0003 (Decision, Status)'])
})

test('reports an index with no index table at all', () => {
  const readme = README.replaceAll('| # | Decision | Status |', '| # | Title | Status |')
  const { violations } = checkIndex(readme, ENTRIES, new Set(['0001', '0002', '0003']), EN)
  assert.ok(violations.some((v) => /no `\| # \| Decision \| Status \|` table/.test(v.message)), JSON.stringify(violations))
})

// Command-line cases.
const { scratch, lock, env: ENV, git } = scratchRepos('check-adr-test-')

const SKILLS = scratch()
mkdirSync(join(SKILLS, 'domain-modeling'))
mkdirSync(join(SKILLS, 'repo-scaffold/artifact-names'), { recursive: true })
copyFileSync(join(dirname(fileURLToPath(import.meta.url)), 'check-adr.mjs'), join(SKILLS, 'domain-modeling/check-adr.mjs'))
writeFileSync(join(SKILLS, 'repo-scaffold/artifact-names/domain-modeling.ADR-FORMAT.md'),
  `| canonical | en |\n|---|---|\n${Object.keys(EN).map((k) => `| ${ZH[k]} | ${k} |`).join('\n')}\n`)
const SCRIPT = join(SKILLS, 'domain-modeling/check-adr.mjs')

function commit(root, files, message = 'change') {
  write(root, files)
  git(root, 'add', '-A')
  git(root, 'commit', '-q', '-m', message)
  return git(root, 'rev-parse', 'HEAD')
}
/** A repository on branch main holding `files` in one commit */
function project(files, language = '"working-language" = "en"\n') {
  const root = scratch()
  git(root, 'init', '-q', '-b', 'main')
  commit(root, { 'capabilities.toml': language, ...files }, 'start')
  return root
}
function run(cwd, args = [], script = SCRIPT) {
  const r = spawnSync(process.execPath, [script, ...args], { cwd, env: ENV, encoding: 'utf8' })
  return { code: r.status, out: r.stdout, err: r.stderr }
}

/** A conforming entry: `context` may add sentences, `option` replaces the second option */
const minimal = (n, title, { context = '', option = 'Two — rejected.', status = 'Accepted (2026-11-01)', negative = 'it costs.', N = EN } = {}) =>
  `# ADR-${n}: ${title}\n\n- ${N.Status}: ${status === 'Accepted (2026-11-01)' ? `${N.Accepted} (2026-11-01)` : status}\n\n## ${N.Context}\n\nThe problem.${context}\n\n` +
  `## ${N.Options}\n\n1. **One** — chosen.\n2. ${option}\n\n## ${N.Decision}\n\nWe adopt **option 1**.\n\n## ${N.Consequences}\n\n` +
  `- ${N.Positive}: it works.\n- ${N.Negative}: ${negative}\n- ${N.Neutral}: nothing else.\n\n## ${N.Sources}\n\nNone.\n`
const OVER = ' Two. Three. Four.'
const slug = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
/** The README for entries `[number, title, status]`, and the retired items */
const readme = (rows, retired = [], N = EN) =>
  `# ADR index\n\nConventions.\n\n| # | ${N.Decision} | ${N.Status} |\n|---|---|---|\n` +
  rows.map(([n, t, s = N.Accepted]) => `| [${n}](${n}-${slug(t)}.md) | ${t} | ${s} |`).join('\n') + '\n' +
  (retired.length ? `\n## ${N['Retired numbers']}\n\n${retired.map((r) => `- ${r}`).join('\n')}\n` : '')
const file = (n, title) => `docs/adr/${n}-${slug(title)}.md`
const reported = (out) => [...out.matchAll(/^docs\/adr\/(\d{4})-[^:]*:\d+: /gm)].map((m) => m[1]).filter((n, i, a) => a.indexOf(n) === i).sort()

/** Base: three entries breaking a rule each; now: 0002 repointed only, 0003 edited, 0005 new and untracked */
function touchedSet() {
  const root = project({
    [file('0001', 'Old one')]: minimal('0001', 'Old one', { context: OVER }),
    [file('0002', 'Old two')]: minimal('0002', 'Old two', { context: OVER, option: 'See ADR-0001, 0001 and [it](0001-old-one.md) — rejected.' }),
    [file('0003', 'Old three')]: minimal('0003', 'Old three', { context: OVER }),
    'docs/adr/README.md': readme([['0001', 'Old one'], ['0002', 'Old two'], ['0003', 'Old three']]),
  })
  const base = git(root, 'rev-parse', 'HEAD')
  write(root, {
    [file('0002', 'Old two')]: minimal('0002', 'Old two', { context: OVER, option: 'See ADR-0003, 0003 and [it](0003-old-three.md) — rejected.' }),
    [file('0003', 'Old three')]: minimal('0003', 'Old three', { context: OVER + ' Five.' }),
    [file('0005', 'New five')]: minimal('0005', 'New five', { context: OVER }),
    'docs/adr/README.md': readme([['0001', 'Old one'], ['0002', 'Old two'], ['0003', 'Old three'], ['0005', 'New five']]),
  })
  return { root, base }
}

for (const [what, args, expected] of [
  ['added and edited entries since the base, untracked ones included', (base) => ['--base', base], ['0003', '0005']],
  ['every entry with --all', () => ['--all'], ['0001', '0002', '0003', '0005']],
]) {
  test(`checks ${what}`, () => {
    const { root, base } = touchedSet()
    const r = run(root, args(base))
    assert.equal(r.code, 1, r.out + r.err)
    assert.deepEqual(reported(r.out), expected, r.out)
  })
}

test('takes the fork point from origin/HEAD by default', () => {
  const upstream = project({
    [file('0001', 'Old one')]: minimal('0001', 'Old one', { context: OVER }),
    'docs/adr/README.md': readme([['0001', 'Old one']]),
  })
  const bare = scratch()
  git(bare, 'clone', '-q', '--bare', upstream, join(bare, 'origin.git'))
  const clone = join(scratch(), 'clone')
  git(dirname(clone), 'clone', '-q', join(bare, 'origin.git'), clone)
  git(clone, 'switch', '-q', '-c', 'feature')
  commit(clone, {
    [file('0002', 'New two')]: minimal('0002', 'New two', { context: OVER }),
    'docs/adr/README.md': readme([['0001', 'Old one'], ['0002', 'New two']]),
  })
  // the default branch moves on after the fork, changing 0001, which the branch does not touch
  git(upstream, 'remote', 'add', 'origin', join(bare, 'origin.git'))
  commit(upstream, { [file('0001', 'Old one')]: minimal('0001', 'Old one', { context: OVER + ' Five.' }) })
  git(upstream, 'push', '-q', 'origin', 'main')
  git(clone, 'fetch', '-q')
  const r = run(clone)
  assert.equal(r.code, 1, r.out + r.err)
  assert.deepEqual(reported(r.out), ['0002'], r.out)
})

test('reads the history for a number gone but not retired', () => {
  const root = project({
    [file('0001', 'One')]: minimal('0001', 'One'),
    [file('0002', 'Two')]: minimal('0002', 'Two'),
    'docs/adr/README.md': readme([['0001', 'One'], ['0002', 'Two']]),
  })
  write(root, { [file('0002', 'Two')]: null, 'docs/adr/README.md': readme([['0001', 'One']]) })
  const r = run(root, ['--all'])
  assert.equal(r.code, 1, r.out + r.err)
  assert.match(r.out, /^docs\/adr\/README\.md:\d+: 0002 had an entry file in the history and has none now/m)
})

test('reports a docs/adr without README.md', () => {
  const root = project({ [file('0001', 'One')]: minimal('0001', 'One') })
  const r = run(root, ['--all'])
  assert.equal(r.code, 1, r.out + r.err)
  assert.match(r.out, /^docs\/adr\/README\.md:1: docs\/adr has no README\.md$/m)
})

test('reports a second entry file for one number', () => {
  const root = project({
    [file('0001', 'One')]: minimal('0001', 'One'),
    [file('0001', 'Two')]: minimal('0001', 'Two'),
    'docs/adr/README.md': readme([['0001', 'One']]),
  })
  const r = run(root, ['--all'])
  assert.equal(r.code, 1, r.out + r.err)
  assert.match(r.out, /^docs\/adr\/0001-two\.md:1: a second entry file for number 0001$/m)
})

test('passes the index rows of untouched entries written under the earlier rules, naming the cells it cannot compare', () => {
  const root = project({
    [file('0001', 'Old one')]: minimal('0001', 'Old one', { status: 'Accepted (2026-08-18). Supersedes in part ADR-0002 and the' }),
    [file('0002', 'Old two')]: minimal('0002', 'Old two').replace('- Status:', '- State:'),
    'docs/adr/README.md': readme([['0001', 'Old one'], ['0002', 'Old two']]),
  })
  const base = git(root, 'rev-parse', 'HEAD')
  write(root, {
    [file('0003', 'New three')]: minimal('0003', 'New three'),
    'docs/adr/README.md': readme([['0001', 'Old one'], ['0002', 'Old two'], ['0003', 'New three']]),
  })
  const r = run(root, ['--base', base])
  assert.equal(r.code, 0, r.out + r.err)
  assert.match(r.out, /^Index cells not compared, since the entry's title or status line could not be read: 0002 \(Status\)\.$/m)
})

test('reports citations of a retired number in tracked and untracked files, but not in the list of retired numbers', () => {
  const root = project({
    [file('0001', 'One')]: minimal('0001', 'One'),
    [file('0002', 'Old two')]: minimal('0002', 'Old two'),
    'docs/adr/README.md': readme([['0001', 'One'], ['0002', 'Old two']]),
    'docs/specs/a.md': '# A\n\nIntro.\nSee ADR-0002 for why.\n',
    '.gitignore': 'ignored/\n',
  })
  write(root, {
    [file('0002', 'Old two')]: null,
    'docs/adr/README.md': readme([['0001', 'One']], ['0002: merged into 0001 (was ADR-0002)']),
    'notes.md': '[old](docs/adr/0002-old-two.md)\n',
    'ignored/x.md': 'ADR-0002\n',
  })
  const r = run(root, ['--all'])
  assert.equal(r.code, 1, r.out + r.err)
  const cited = [...r.out.matchAll(/^(\S+):(\d+): cites the retired number 0002/gm)].map((m) => `${m[1]}:${m[2]}`).sort()
  assert.deepEqual(cited, ['docs/specs/a.md:4', 'notes.md:1'], r.out)
  assert.match(r.out, /searched for as ADR-NNNN and as the file names each number had; other forms, such as a bare number, were not searched/)
})

test('lists for review the options and negative consequences on both sides of a merge and a split, the status change and the citing lines', () => {
  const root = project({
    [file('0001', 'One')]: minimal('0001', 'One', { option: 'Cites ADR-0003 — rejected.' }),
    [file('0002', 'Two')]: minimal('0002', 'Two', { option: 'Option of two — rejected.', negative: 'two is slow.' }),
    [file('0003', 'Three')]: minimal('0003', 'Three', { option: 'Option of three — rejected.', negative: 'three is big.' }),
    'docs/adr/README.md': readme([['0001', 'One'], ['0002', 'Two'], ['0003', 'Three']]),
    'docs/specs/x.md': '# X\n\nPer ADR-0003, it holds.\n',
  })
  const base = git(root, 'rev-parse', 'HEAD')
  write(root, {
    [file('0002', 'Two')]: null,
    [file('0003', 'Three')]: minimal('0003', 'Three', { option: 'Option of two — rejected.', negative: 'three is big.', status: 'Accepted (2026-11-16)' }),
    [file('0004', 'Four')]: minimal('0004', 'Four', { option: 'Option of three, split off — rejected.', negative: 'four is new.' }),
    'docs/adr/README.md': readme([['0001', 'One'], ['0003', 'Three'], ['0004', 'Four']], ['0002: merged into 0003']),
  })
  const r = run(root, ['--base', base])
  assert.equal(r.code, 0, r.out + r.err)
  const review = r.out.slice(r.out.indexOf('For review'))
  const [atBase, now] = review.split('Options and negative consequences now:')
  assert.ok(atBase.includes('  0002-two.md (deleted):\n    Options 1: **One** — chosen.\n    Options 2: Option of two — rejected.\n    Negative: two is slow.\n'), atBase)
  assert.ok(atBase.includes('  0003-three.md:\n    Options 1: **One** — chosen.\n    Options 2: Option of three — rejected.\n    Negative: three is big.\n'), atBase)
  assert.ok(now.includes('  0003-three.md:\n    Options 1: **One** — chosen.\n    Options 2: Option of two — rejected.\n    Negative: three is big.\n'), now)
  assert.ok(now.includes('  0004-four.md (added):\n    Options 1: **One** — chosen.\n    Options 2: Option of three, split off — rejected.\n    Negative: four is new.\n'), now)
  assert.doesNotMatch(atBase, /0004-four/)
  assert.doesNotMatch(now, /0002-two/)
  assert.match(now, /0003: - Status: Accepted \(2026-11-01\) -> - Status: Accepted \(2026-11-16\)/)
  assert.match(now, /^ {2}docs\/specs\/x\.md:3: Per ADR-0003, it holds\.$/m)
  assert.match(now, /^ {2}docs\/adr\/0001-one\.md:\d+: 2\. Cites ADR-0003/m)
  assert.doesNotMatch(now, /docs\/adr\/0003-three\.md:/)
})

test('reads working-language with a TOML parser, and takes the names and the length cap of that language', () => {
  const root = project({
    [file('0001', 'One')]: minimal('0001', 'One', { N: ZH, status: `${ZH.Accepted} (2026-11-01)` }).replace(`- ${ZH.Status}: `, `- ${ZH.Status}${ch(0xff1a)}`),
    [file('0002', 'Two')]: minimal('0002', 'Two', { N: ZH, status: `${ZH.Accepted} (2026-11-01)` }) + 'x'.repeat(2000) + '\n',
    'docs/adr/README.md': readme([['0001', 'One', ZH.Accepted], ['0002', 'Two', ZH.Accepted]], [], ZH),
  }, '"working-language" = "zh"\n')
  const r = run(root, ['--all'])
  assert.equal(r.code, 1, r.out + r.err)
  const violations = r.out.split('\n').filter((l) => /^\S+:\d+: /.test(l))
  assert.equal(violations.length, 1, r.out)
  assert.match(violations[0], /^docs\/adr\/0002-two\.md:1: \d+ characters, the title and status lines excluded; at most 1800 for working-language "zh"$/)
  assert.doesNotMatch(r.out, /Index cells not compared/)
})

const plainProject = () => project({ [file('0001', 'One')]: minimal('0001', 'One'), 'docs/adr/README.md': readme([['0001', 'One']]) })
for (const [what, setup, reason] of [
  ['in a shallow clone', () => {
    const upstream = plainProject()
    commit(upstream, { 'b.md': 'b\n' })
    const clone = join(scratch(), 'clone')
    git(dirname(clone), 'clone', '-q', '--depth', '1', `file://${upstream}`, clone)
    return { cwd: clone, args: ['--all'] }
  }, /shallow clone/],
  ['below the repository root', () => ({ cwd: join(plainProject(), 'docs'), args: ['--all'] }), /not run at the root/],
  ['without docs/adr', () => ({ cwd: project({ 'a.md': 'a\n' }), args: ['--all'] }), /no docs\/adr directory/],
  ['without capabilities.toml', () => { const root = plainProject(); write(root, { 'capabilities.toml': null }); return { cwd: root, args: ['--all'] } }, /cannot read capabilities\.toml/],
  ['without working-language', () => { const root = plainProject(); write(root, { 'capabilities.toml': '[lint]\nenabled = false\n' }); return { cwd: root, args: ['--all'] } }, /no working-language string/],
  ['with a working-language that has no column', () => { const root = plainProject(); write(root, { 'capabilities.toml': 'working-language = "fr"\n' }); return { cwd: root, args: ['--all'] } }, /no column for working-language "fr"/],
  ['with an unknown argument', () => ({ cwd: plainProject(), args: ['--bogus'] }), /unknown argument "--bogus"/],
  ['with a --base that is not a commit', () => ({ cwd: plainProject(), args: ['--base', 'no-such-commit'] }), /--base "no-such-commit" is not a commit/],
  ['without --base or origin/HEAD', () => ({ cwd: plainProject(), args: [] }), /refs\/remotes\/origin\/HEAD is not set/],
  ['with a docs/adr it cannot list', () => { const root = plainProject(); lock(join(root, 'docs/adr')); return { cwd: root, args: ['--all'] } }, /cannot read docs\/adr: EACCES/],
  ['with a docs it cannot enter', () => { const root = plainProject(); lock(join(root, 'docs')); return { cwd: root, args: ['--all'] } }, /cannot read docs\/adr: EACCES/],
  ['with a file named docs', () => ({ cwd: project({ docs: 'not a directory\n' }), args: ['--all'] }), /no docs\/adr directory/],
  ['with an entry file it cannot read', () => { const root = plainProject(); lock(join(root, file('0001', 'One'))); return { cwd: root, args: ['--all'] } }, /cannot read docs\/adr\/0001-one\.md/],
  ['with a README it cannot read', () => { const root = plainProject(); lock(join(root, 'docs/adr/README.md')); return { cwd: root, args: ['--all'] } }, /cannot read docs\/adr\/README\.md/],
]) {
  test(`cannot check ${what}`, () => {
    const { cwd, args } = setup()
    const r = run(cwd, args)
    assert.equal(r.code, 2, r.out + r.err)
    assert.match(r.err, reason)
  })
}

test('runs through a symbolic link to the skill directory', () => {
  const links = scratch()
  symlinkSync(join(SKILLS, 'domain-modeling'), join(links, 'domain-modeling'))
  const root = project({ [file('0001', 'One')]: minimal('0001', 'One', { context: OVER }), 'docs/adr/README.md': readme([['0001', 'One']]) })
  const r = run(root, ['--all'], join(links, 'domain-modeling/check-adr.mjs'))
  assert.equal(r.code, 1, r.out + r.err)
  assert.deepEqual(reported(r.out), ['0001'], r.out)
})
