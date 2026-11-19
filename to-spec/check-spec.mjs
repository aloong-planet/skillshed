#!/usr/bin/env node
// Check a project's specs against to-spec's spec-writing.md: the size cap, what a spec leaves out that a script can
// see, and the citations of full identifiers.
//
// Usage, from the repository root (needs node, and python3 3.11 or later to read capabilities.toml):
//   check-spec.mjs --base <commit>
// <commit> is the branch's fork point from the default branch, `git merge-base HEAD origin/<default branch>`. The base
// side is that commit; the current side is the working tree, uncommitted and untracked files included. A spec is a
// Markdown file directly under docs/specs/ other than the index README.md; it is new when its path is not at the base.
//
// A spec's size is the number of Unicode code points in its file, Markdown markup and line endings included. The cap
// is 50,000 when working-language, read from capabilities.toml with a TOML parser, is en, and 18,000 when it is zh; a
// spec is over the cap when its size is more than that. The output gives each spec's size, the cap and how much the
// spec grew or shrank since the base, or that it is new, and each spec deleted since the base.
//
// A violation is:
//   - a spec over the cap that is longer than at the base, or a new spec over the cap;
//   - on a line of a spec that the change added: struck-through text, a `~~` with no `~` next to it outside fenced
//     code and inline code; or a path into the working records, `docs/.workings` or `../.workings` followed by
//     anything but a letter, a digit, `_` or `-`, inside code too. Lines the change did not add are left alone, since a
//     change does not edit a section it does not rewrite only to remove such content;
//   - a full identifier `<slug>::<local number>` on a line of a file git grep searches (tracked files and untracked
//     ones, ignored files left out) whose spec docs/specs/<slug>.md has no primary definition of it, or whose spec was
//     at the base and is gone. The local number is `<letters>-<digits>`, optionally followed by `/AC-<digits>`, with no
//     letter, digit, `_` or `/` after it. A primary definition is a heading or a list item, outside fenced code, whose
//     text opens with the identifier, followed by anything but a letter, a digit, `_` or `/`. A citation whose slug has
//     a spec neither now nor at the base is not checked, and the output counts the citations checked and not checked.
// The lines a change added are those of the spec now outside a longest common subsequence of its lines and the lines
// of the spec at the base, line endings read alike; every line of a new spec.
//
// For review, printed after the violations and leaving the exit code alone, each line a change added to a spec that
// holds one of these, with the names of those it holds:
//   date                        `NNNN-NN-NN` with no digit next to it
//   percentage                  a digit, an optional space and `%` or the full-width percent sign U+FF05
//   count N of M                a digit, `of` and a digit, spaces between; or a digit, U+4E2A U+4E2D U+7684 and a
//                               digit, with optional spaces between, as the Chinese form of "M of N" is written
//   path with a line number     a letter, digit, `_` or `-`, then `.`, a letter, letters or digits, `:` and a digit
//   identifier in backticks     an inline code span holding a lower-case letter or digit before an upper-case letter
//                               (camel case), or `_` between letters or digits (snake case)
//   code block                  a line of fenced code, its fence lines included
//   provisional marker or TODO  the microscope emoji U+1F52C, TODO, FIXME, `provisional` in any case, or U+6682
//                               U+5B9A, the Chinese for "provisional"
//   test seam or fixture        the word seam, seams, fixture or fixtures, in any case
//   ticket number               `#` and digits, with no letter, digit, `_`, `&`, `#` or `/` before it
//   prototype                   `prototyp` in any case, or U+539F U+578B, the Chinese for "prototype"
// Whoever runs it judges each against the rules of spec-writing.md, section 4.
//
// Exit codes: no violation -> 0; any violation -> 1; could not check -> 2, with the reason, which is one of: no
// --base, a --base with no commit after it, or an unknown argument; not run at the root of a git repository;
// capabilities.toml unreadable, python3 missing or older than 3.11, or no working-language string; a working language
// with no cap, for which the writer asks the user for one; a --base that is not a commit; no spec found, now or at the
// base; a failed read of docs/specs or of a spec, other than the absence of docs/specs; a git command that fails; any
// error the script does not expect. It never passes what it could not check.
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const CAPS = { en: 50000, zh: 18000 }

/** The cap on a spec's size for `language`, or null when that working language has none */
export function capFor(language) {
  return Object.hasOwn(CAPS, language) ? CAPS[language] : null
}

/** A spec's size: the Unicode code points of its file, markup and line endings included */
export function size(text) {
  return [...text].length
}

/** A check that could not be made; the script exits with 2 */
export class CannotCheck extends Error {}

const SPECS = 'docs/specs'
const n = (x) => x.toLocaleString('en-US')

/** The lines of a text, line endings read alike, without the empty line after a final line ending */
function linesOf(text) {
  const lines = text.split(/\r\n?|\n/)
  if (lines.length && lines[lines.length - 1] === '') lines.pop()
  return lines
}

/** The 1-based numbers of the lines of `current` that the change added to `base`: all of them when `base` is null */
export function addedLines(base, current) {
  const now = linesOf(current)
  if (base === null) return new Set(now.map((_, i) => i + 1))
  const before = linesOf(base)
  let start = 0
  while (start < now.length && start < before.length && now[start] === before[start]) start++
  let end = 0
  while (end < now.length - start && end < before.length - start && now[now.length - 1 - end] === before[before.length - 1 - end]) end++
  const a = before.slice(start, before.length - end)
  const b = now.slice(start, now.length - end)
  // longest common subsequence of the middle parts; a line of b outside it is added
  const width = b.length + 1
  const table = new Uint32Array((a.length + 1) * width)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * width + j] = a[i] === b[j] ? table[(i + 1) * width + j + 1] + 1 : Math.max(table[(i + 1) * width + j], table[i * width + j + 1])
    }
  }
  const added = new Set()
  let i = 0
  let j = 0
  while (j < b.length) {
    if (i < a.length && a[i] === b[j]) { i++; j++ }
    else if (i < a.length && table[(i + 1) * width + j] >= table[i * width + j + 1]) i++
    else { added.add(start + j + 1); j++ }
  }
  return added
}

/** For each line, whether it is a fence line of fenced code (3 or more backticks or tildes) or inside one */
function fencedLines(lines) {
  const fenced = []
  let fence = null
  for (const line of lines) {
    const m = /^ {0,3}(`{3,}|~{3,})/.exec(line)
    if (fence) {
      fenced.push(true)
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null
    } else if (m) {
      fenced.push(true)
      fence = m[1]
    } else fenced.push(false)
  }
  return fenced
}

const IDENTIFIER = '([A-Za-z0-9][\\w-]*)::([A-Z]+-\\d+(?:/AC-\\d+)?)(?![\\w/])'
const CITATION = new RegExp(`(?<![\\w-])${IDENTIFIER}`, 'g')
const DEFINITION = new RegExp(`^(?:#{1,6}|\\s*(?:[-*+]|\\d+[.)]))\\s+${IDENTIFIER}`)

/** The full identifiers `<slug>::<local number>` a line cites, each once, in order */
export function citationsIn(line) {
  return [...new Set([...line.matchAll(CITATION)].map((m) => `${m[1]}::${m[2]}`))]
}

/** The full identifiers a spec gives a primary definition: a heading or list item, outside fenced code, opening with one */
export function definesIn(text) {
  const lines = linesOf(text)
  const fenced = fencedLines(lines)
  const defined = new Set()
  lines.forEach((line, i) => {
    const m = !fenced[i] && DEFINITION.exec(line)
    if (m) defined.add(`${m[1]}::${m[2]}`)
  })
  return defined
}

/** Whether a file directly under docs/specs is a spec: a Markdown file other than the index README.md */
export const isSpecFile = (name) => name.endsWith('.md') && name !== 'README.md'

const ch = (...codes) => String.fromCodePoint(...codes)
const REVIEW = [
  ['date', /(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)/],
  ['percentage', new RegExp(`\\d\\s?[%${ch(0xff05)}]`)],
  ['count N of M', new RegExp(`\\d\\s+of\\s+\\d|\\d\\s*${ch(0x4e2a, 0x4e2d, 0x7684)}\\s*\\d`, 'i')],
  ['path with a line number', /[\w-]\.[A-Za-z]\w*:\d/],
  ['identifier in backticks', { test: (line) => [...line.matchAll(/(`+)([\s\S]*?)\1/g)].some((m) => /[a-z0-9][A-Z]|[A-Za-z0-9]_[A-Za-z0-9]/.test(m[2])) }],
  ['code block', null],
  ['provisional marker or TODO', new RegExp(`${ch(0x1f52c)}|\\bTODO\\b|\\bFIXME\\b|provisional|${ch(0x6682, 0x5b9a)}`, 'iu')],
  ['test seam or fixture', /\bseams?\b|\bfixtures?\b/i],
  ['ticket number', /(?<![\w&#/])#\d+(?!\w)/],
  ['prototype', new RegExp(`prototyp|${ch(0x539f, 0x578b)}`, 'i')],
]

/** Why a line the change added to a spec is listed for review, in the order of the header; `fenced` when it is fenced code */
export function reviewReasons(line, fenced) {
  return REVIEW.filter(([name, form]) => (form === null ? fenced : form.test(line))).map(([name]) => name)
}

const STRUCK = /(?<!~)~~(?!~)/
const WORKING_RECORDS = /(?:docs|\.\.)\/\.workings(?![\w-])/
const withoutInlineCode = (line) => line.replace(/(`+)[\s\S]*?\1/g, '`x`')

/**
 * The check of the specs. `current` and `base` map each spec's path to its text, now and at the base; `hits` are the
 * lines `{ path, line, text }` of the searched files that hold a full identifier. Returns the cap, each current spec's
 * `{ path, size, delta }` (delta null for a new spec), the specs deleted since the base, the violations
 * `{ path, line, message }`, the lines for review and the citation counts.
 */
export function checkSpecs({ language, current, base, hits }) {
  const cap = capFor(language)
  if (cap === null) throw new CannotCheck(`working-language "${language}" has no cap on a spec's size; ask the user for one`)
  const sizes = []
  const violations = []
  const review = []
  for (const path of [...current.keys()].sort()) {
    const text = current.get(path)
    const now = size(text)
    const before = base.has(path) ? size(base.get(path)) : null
    sizes.push({ path, size: now, delta: before === null ? null : now - before })
    if (now > cap && before === null) violations.push({ path, line: 1, message: `${n(now)} code points, over the cap of ${n(cap)}, in a new spec` })
    if (now > cap && before !== null && now > before) {
      violations.push({ path, line: 1, message: `${n(now)} code points, over the cap of ${n(cap)}, and ${n(now - before)} longer than at the base` })
    }
    const lines = linesOf(text)
    const fenced = fencedLines(lines)
    for (const line of addedLines(base.get(path) ?? null, text)) {
      const t = lines[line - 1]
      if (!fenced[line - 1] && STRUCK.test(withoutInlineCode(t))) violations.push({ path, line, message: 'struck-through text' })
      if (WORKING_RECORDS.test(t)) violations.push({ path, line, message: 'a path into the working records, docs/.workings/' })
      const reasons = reviewReasons(t, fenced[line - 1])
      if (reasons.length) review.push({ path, line, reasons, text: t })
    }
  }
  const deleted = [...base.keys()].filter((p) => !current.has(p)).sort()

  const defined = new Map()
  const citations = { checked: 0, skipped: 0 }
  for (const hit of hits) {
    for (const id of citationsIn(hit.text)) {
      const path = `${SPECS}/${id.slice(0, id.indexOf('::'))}.md`
      if (!current.has(path) && !base.has(path)) { citations.skipped++; continue }
      citations.checked++
      if (!current.has(path)) {
        violations.push({ path: hit.path, line: hit.line, message: `cites ${id}, whose spec ${path} was at the base and is gone` })
        continue
      }
      if (!defined.has(path)) defined.set(path, definesIn(current.get(path)))
      if (!defined.get(path).has(id)) {
        violations.push({ path: hit.path, line: hit.line, message: `cites ${id}, which ${path} does not define in a heading or list item opening with it` })
      }
    }
  }
  return { cap, sizes, deleted, violations, review, citations }
}

const USAGE = 'Usage, from the repository root: check-spec.mjs --base <commit>'

/** The options of the command line: `--base <commit>`, which is required */
export function parseArgs(argv) {
  let base = null
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== '--base') throw new CannotCheck(`unknown argument "${argv[i]}". ${USAGE}`)
    base = i + 1 < argv.length ? argv[++i] : null
  }
  if (base === null) throw new CannotCheck(`--base <commit> is required, the commit being the branch's fork point from the default branch. ${USAGE}`)
  return { base }
}

function git(args) {
  const r = spawnSync('git', ['-c', 'core.quotePath=false', '-c', 'color.ui=never', ...args], { encoding: 'utf8', maxBuffer: 1 << 30 })
  if (r.error) throw new CannotCheck(`cannot run git: ${r.error.message}`)
  return r
}

function gitOut(args, what) {
  const r = git(args)
  if (r.status !== 0) throw new CannotCheck(`${what}: ${(r.stderr || r.stdout).trim() || `git exited with ${r.status}`}`)
  return r.stdout
}

const READ_LANGUAGE = [
  'import json, sys, tomllib',
  'with open(sys.argv[1], "rb") as f:',
  '    print(json.dumps(tomllib.load(f).get("working-language")))',
].join('\n')

function workingLanguage() {
  const r = spawnSync('python3', ['-I', '-c', READ_LANGUAGE, 'capabilities.toml'], { encoding: 'utf8' })
  if (r.error) throw new CannotCheck(`cannot run python3 to read capabilities.toml: ${r.error.message}`)
  if (r.status !== 0) throw new CannotCheck(`cannot read capabilities.toml: ${r.stderr.trim().split('\n').pop()}`)
  const value = JSON.parse(r.stdout)
  if (typeof value !== 'string') throw new CannotCheck('capabilities.toml declares no working-language string')
  return value
}

/** The specs in the working tree, untracked ones included, each path mapped to its text */
function currentSpecs() {
  let entries
  try {
    entries = readdirSync(SPECS, { withFileTypes: true })
  } catch (e) {
    if (e.code === 'ENOENT') return new Map()
    throw new CannotCheck(`cannot read ${SPECS}: ${e.code ?? e.message}`)
  }
  const specs = new Map()
  for (const entry of entries.filter((e) => e.isFile() && isSpecFile(e.name)).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const path = `${SPECS}/${entry.name}`
    try {
      specs.set(path, readFileSync(path, 'utf8'))
    } catch (e) {
      throw new CannotCheck(`cannot read ${path}: ${e.code ?? e.message}`)
    }
  }
  return specs
}

/** The specs at `base`, each path mapped to its text */
function baseSpecs(base) {
  const specs = new Map()
  const out = gitOut(['ls-tree', '-z', base, `${SPECS}/`], `cannot list ${SPECS} at ${base}`)
  for (const entry of out.split('\0').filter(Boolean)) {
    const [meta, path] = entry.split('\t')
    if (meta.split(' ')[1] !== 'blob' || !isSpecFile(path.slice(SPECS.length + 1))) continue
    specs.set(path, gitOut(['show', `${base}:${path}`], `cannot read ${path} at ${base}`))
  }
  return specs
}

/** The lines of tracked and untracked files, ignored files left out, that hold a full identifier, as `{ path, line, text }` */
function citingLines() {
  const r = git(['grep', '-n', '-I', '-z', '--untracked', '-E', '[A-Za-z0-9][A-Za-z0-9_-]*::[A-Z]+-[0-9]+'])
  if (r.status === 1) return []
  if (r.status !== 0) throw new CannotCheck(`git grep failed: ${r.stderr.trim()}`)
  return r.stdout.split('\n').filter(Boolean).map((l) => {
    const [path, line, ...text] = l.split('\0')
    return { path, line: Number(line), text: text.join('\0') }
  })
}

const signed = (d) => (d < 0 ? `-${n(-d)}` : `+${n(d)}`)

function main(argv) {
  const opts = parseArgs(argv)
  const top = git(['rev-parse', '--show-toplevel'])
  if (top.status !== 0 || realpathSync(top.stdout.trim()) !== realpathSync(process.cwd())) {
    throw new CannotCheck(`not run at the root of a git repository. ${USAGE}`)
  }
  const language = workingLanguage()
  const verified = git(['rev-parse', '--verify', '--quiet', `${opts.base}^{commit}`])
  if (verified.status !== 0) throw new CannotCheck(`--base "${opts.base}" is not a commit`)
  const base = verified.stdout.trim()

  const current = currentSpecs()
  const before = baseSpecs(base)
  if (current.size === 0 && before.size === 0) throw new CannotCheck(`no spec found: no Markdown file but README.md directly under ${SPECS}, now or at the base`)
  const r = checkSpecs({ language, current, base: before, hits: citingLines() })

  const out = [`Base ${base}. Working language "${language}": a spec over ${n(r.cap)} code points is over the cap.`]
  for (const s of r.sizes) out.push(`${s.path}: ${n(s.size)} code points, cap ${n(r.cap)}, ${s.delta === null ? 'new' : `${signed(s.delta)} since the base`}.`)
  for (const path of r.deleted) out.push(`${path}: deleted since the base.`)
  out.push(`Full identifiers cited in tracked and untracked files, ignored ones left out: ${r.citations.checked} checked; ` +
    `${r.citations.skipped} not checked, their slug having a spec neither now nor at the base.`)
  for (const v of r.violations) out.push(`${v.path}:${v.line}: ${v.message}`)
  out.push(`${r.violations.length} violation(s).`)
  out.push('', 'For review (judge each line against to-spec/spec-writing.md, section 4; this list does not affect the exit code):')
  if (r.review.length === 0) out.push('  none')
  for (const l of r.review) out.push(`  ${l.path}:${l.line} [${l.reasons.join(', ')}]: ${l.text.trim()}`)
  console.log(out.join('\n'))
  return r.violations.length ? 1 : 0
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2))
  } catch (e) {
    console.error(`Could not check: ${e instanceof CannotCheck ? e.message : `an error the script does not expect: ${e?.stack ?? e}`}`)
    process.exitCode = 2
  }
}
