#!/usr/bin/env node
// Check a project's ADRs and their index against domain-modeling's ADR-FORMAT.md.
//
// Usage, from the repository root (needs node, and python3 3.11 or later to read capabilities.toml):
//   check-adr.mjs                  check the entries the branch touched since its fork point
//   check-adr.mjs --base <commit>  the same, against <commit> in place of the fork point
//   check-adr.mjs --all            check every entry, and list nothing for review
//
// The fork point is `git merge-base HEAD <default branch>`, the default branch being what refs/remotes/origin/HEAD
// points to. The base side is that commit; the current side is the working tree, uncommitted and untracked files
// included. An entry is a file docs/adr/NNNN-*.md, and the two sides' entries are paired by NNNN.
//
// Entries checked: those added since the base, and those whose text differs from the base's once these are blanked
// out on both sides and line endings are read alike: every `ADR-NNNN`; every file name an entry has now, had at the
// base or had in the history of HEAD; and every four-digit number, standing between characters that are not letters
// or digits, that is the number of such an entry. With --all, every entry.
//
// For each entry checked, a violation is:
//   - a first line that is not `# ADR-NNNN: <title>`, or whose NNNN is not the file name's;
//   - no status line `- Status: <value>` after the title, a value other than `Proposed` or `Accepted` followed by
//     its date in parentheses, written YYYY-MM-DD with nothing else, such as `Accepted (2026-11-12)`, or any text
//     but blank lines between the title and the first section besides the status line;
//   - sections, the `## ` headings outside fenced code, other than Context, Options, Decision, Consequences and
//     Sources, in that order, or one of them empty;
//   - a Context of more than 3 sentences;
//   - in Options, a line outside a numbered item (`1. `), or an item of more than 2 sentences;
//   - in Consequences, a line outside a `- ` item, an item that does not open with `Positive:`, `Negative:` or
//     `Neutral:`, an item of more than 2 sentences, or one of the three kinds with no item;
//   - more than 1,800 characters when working-language is zh, or 5,000 otherwise.
// A line belongs to the item above it when it is indented, or when it follows the item with no blank line between
// and opens no list item or heading. The fixed names used here, Status, Proposed, Accepted, the five section names,
// Positive, Negative, Neutral and Retired numbers, are the en column of
// repo-scaffold/artifact-names/domain-modeling.ADR-FORMAT.md; the script reads the project's working-language from
// capabilities.toml and takes each name from that language's column of the table when it runs, zh's being the
// first column. `:` may be the full-width colon, and the parentheses full-width ones.
//
// Whatever entries are checked, a violation is:
//   - docs/adr/README.md missing, or holding no `| # | Decision | Status |` table;
//   - in such a table, a row whose first cell is not `[NNNN](NNNN-slug.md)` linking to an entry file, a second
//     row for one number, or an entry file with no row;
//   - a row whose Decision cell, `\|` read as `|`, is not the entry's title after `ADR-NNNN:`, or whose status cell
//     does not name the entry's state. What a status value, or a status cell, names is Proposed or Accepted when it
//     opens with that name, and otherwise the text without a trailing parenthetical.
//     Here an entry's title is read from a first line `# ADR-NNNN:`, with or without spaces around the colon, and
//     its status value from the first line before the first section that reads `Status:`, with or without a list
//     marker; where the title or the status value cannot be read, that cell is not compared, and the output names
//     the cell instead, so an entry written under the earlier rules is not edited to make its row pass;
//   - a number that had an entry file in the history of HEAD and has none now, but is not listed under the
//     README's heading `Retired numbers` (an item there stands for the first four-digit number in it);
//   - a number listed there that has an entry file;
//   - for each retired number, one that is listed there or had a file in the history, and has no entry file now,
//     a line holding `ADR-NNNN` or one of the file names that number had, in a file git grep searches (tracked
//     files and untracked ones, ignored files left out), outside the README's Retired numbers section. A bare
//     number or any other form is not searched for, and the output says so.
// A second entry file for one number is reported too, and the first file name in sorted order is taken as the entry.
//
// For review, printed after the violations when there is a base and leaving the exit code alone: the options and
// negative consequences of every entry deleted or checked, at the base, and of every entry added or checked, now;
// each checked entry's status line that changed; and each line, outside the entry's own file, that holds
// `ADR-NNNN` or one of the file names of an entry added, deleted or checked. Entries changed only in ADR numbers
// and entry file names are listed as not checked and are left out of the review.
//
// How sentences are counted, for a section or for an item without its leading `1. ` or `- `:
//   1. Fenced code and inline code are taken out (an inline code span leaves a placeholder that opens with a
//      backtick), so is the target `(...)` of each link `[...](...)`, and line breaks count as spaces.
//   2. Nothing inside parentheses, ASCII or full-width and at any depth, ends a sentence. When the parentheses of
//      the text do not balance, a closing one without its opening one included, they protect nothing.
//   3. `.`, `!` or `?` ends a sentence when what follows it, after any closing quotation marks, `]`, `*` and further
//      end marks, is the end of the text, or a space and then an upper-case letter, a digit, a quotation mark, a
//      backtick, `*`, `(` or `[`. A `.` that ends e.g., i.e., vs., etc. or cf. ends none.
//   4. The full-width marks for a full stop, `!` and `?` end a sentence whatever follows; marks in a row end one.
//   5. Text after the last sentence end that holds a letter or a digit is one more sentence.
// How characters are counted: the entry without its title line and its status line, line endings read as one
// character, whitespace at both ends taken off, in Unicode code points.
//
// Exit codes: no violation -> 0; any violation -> 1; could not check -> 2, with the reason, which is one of: not run
// at the root of a git repository; no docs/adr; a shallow clone; capabilities.toml unreadable, python3 missing or
// older than 3.11, or no working-language string; the names table unreadable, without its en column or a column for
// the working-language, or without one of the names; an unknown argument, or --base with --all; a --base that is not
// a commit; no --base and no refs/remotes/origin/HEAD; a git command that fails; docs/adr, an entry file or a
// README.md that exists but cannot be read; any error the script does not expect.
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ZH_PERIOD = String.fromCharCode(0x3002)
const ZH_EXCLAMATION = String.fromCharCode(0xff01)
const ZH_QUESTION = String.fromCharCode(0xff1f)
const ZH_OPEN_PAREN = String.fromCharCode(0xff08)
const ZH_CLOSE_PAREN = String.fromCharCode(0xff09)
const ZH_COLON = String.fromCharCode(0xff1a)

const ZH_ENDS = new Set([ZH_PERIOD, ZH_EXCLAMATION, ZH_QUESTION])
const OPEN_PARENS = new Set(['(', ZH_OPEN_PAREN])
const CLOSE_PARENS = new Set([')', ZH_CLOSE_PAREN])
const ENDS = new Set(['.', '!', '?'])
const RIGHT_QUOTES = String.fromCharCode(0x201d, 0x2019)
const LEFT_QUOTES = String.fromCharCode(0x201c, 0x2018)
const CLOSERS = new Set(['"', "'", ...RIGHT_QUOTES, ']', '*'])
const OPENER = new RegExp(`[\\p{Lu}\\p{N}"'${LEFT_QUOTES}\`*(\\[]`, 'u')
const ABBREVIATION = /(?:^|[^\p{L}])(?:e\.g|i\.e|vs|etc|cf)$/iu
const WORD = /[\p{L}\p{N}]/u

/** The text with fenced code and link targets taken out, each inline code span a placeholder, and every run of whitespace one space */
function plain(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const fenced = lineMarks(lines)
  return lines
    .filter((_, i) => !fenced[i])
    .join('\n')
    .replace(/(`+)[\s\S]*?\1/g, '`x`')
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/\s+/g, ' ')
    .trim()
}

function sentences(chars, guarded) {
  let depth = 0
  let stray = false
  let count = 0
  let open = false
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]
    if (guarded && OPEN_PARENS.has(c)) { depth++; continue }
    if (guarded && CLOSE_PARENS.has(c)) { if (depth > 0) depth--; else stray = true; continue }
    if (depth === 0 && ZH_ENDS.has(c)) {
      while (i + 1 < chars.length && ZH_ENDS.has(chars[i + 1])) i++
      count++
      open = false
      continue
    }
    if (depth === 0 && ENDS.has(c)) {
      let j = i + 1
      while (j < chars.length && (CLOSERS.has(chars[j]) || ENDS.has(chars[j]))) j++
      const ends = j === chars.length || (chars[j] === ' ' && j + 1 < chars.length && OPENER.test(chars[j + 1]))
      const abbreviated = c === '.' && ABBREVIATION.test(chars.slice(Math.max(0, i - 8), i).join(''))
      if (ends && !abbreviated) {
        count++
        open = false
        i = j - 1
        continue
      }
    }
    if (WORD.test(c)) open = true
  }
  return { count: count + (open ? 1 : 0), balanced: depth === 0 && !stray }
}

/** The number of sentences in `text`, counted as the header says */
export function countSentences(text) {
  const chars = [...plain(text)]
  const guarded = sentences(chars, true)
  return guarded.balanced ? guarded.count : sentences(chars, false).count
}

/** The number of characters in an entry, the title line and the status line excluded, counted as the header says */
export function countChars(text, statusName) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const title = lines.findIndex((l) => l.startsWith('# '))
  if (title >= 0) lines.splice(title, 1)
  const status = lines.findIndex((l) => isStatusLine(l, statusName))
  if (status >= 0) lines.splice(status, 1)
  return [...lines.join('\n').trim()].length
}

function isStatusLine(line, statusName) {
  return line.startsWith(`- ${statusName}:`) || line.startsWith(`- ${statusName}${ZH_COLON}`)
}

/** A check that could not be made; the script exits with 2 */
export class CannotCheck extends Error {}

/** The keys of the fixed names the script uses: the en column of the names table */
export const NAME_KEYS = [
  'Status', 'Proposed', 'Accepted', 'Context', 'Options', 'Decision', 'Consequences', 'Sources',
  'Positive', 'Negative', 'Neutral', 'Retired numbers',
]

function cells(line) {
  return line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim())
}

/** The fixed names in `language`, read from the text of the names table: zh is its first column, any other language the column headed by it */
export function parseNames(text, language) {
  const rows = text.split(/\r?\n/).filter((l) => l.trim().startsWith('|')).map(cells)
  const header = rows[0] ?? []
  const en = header.indexOf('en')
  if (en < 0) throw new CannotCheck('the names table has no "en" column')
  const column = language === 'zh' ? 0 : header.indexOf(language)
  if (column < 0) throw new CannotCheck(`the names table has no column for working-language "${language}"`)
  const names = {}
  for (const key of NAME_KEYS) {
    const row = rows.slice(1).find((r) => r[en] === key)
    if (!row || !row[column]) throw new CannotCheck(`the names table has no "${language}" name for "${key}"`)
    names[key] = row[column]
  }
  return names
}

/** For each line, whether it is a fence line of fenced code (3 or more backticks or tildes) or inside one */
function lineMarks(lines) {
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

/** An entry split into its lines, the lines before the first section, and its sections in order */
function parseEntry(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const fenced = lineMarks(lines)
  const head = []
  const sections = []
  let current = null
  lines.forEach((text, line) => {
    if (!fenced[line] && text.startsWith('## ')) {
      current = { name: text.slice(3).trim(), line, body: [] }
      sections.push(current)
    } else (current ? current.body : head).push({ text, line })
  })
  return { lines, head, sections }
}

const LIST_MARKER = /^(?:[-*+]|\d+[.)])\s/

/** The items of a section body that `marker` opens, and the lines that belong to no item */
function items(body, marker) {
  const found = []
  const loose = []
  let item = null
  let blank = false
  for (const { text, line } of body) {
    if (text.trim() === '') { blank = true; continue }
    const m = marker.exec(text)
    if (m) {
      item = { line, label: m[1] ?? null, text: text.slice(m[0].length) }
      found.push(item)
    } else if (item && (/^\s/.test(text) || (!blank && !LIST_MARKER.test(text) && !text.startsWith('#')))) {
      item.text += '\n' + text
    } else {
      loose.push(line)
      item = null
    }
    blank = false
  }
  return { found, loose }
}

function statusValue(head, names) {
  for (const { text, line } of head) {
    if (isStatusLine(text, names.Status)) return { line, text, value: text.slice(`- ${names.Status}:`.length).trim() }
  }
  return null
}

const TRAILING_PARENTHETICAL = new RegExp(`\\s*[(${ZH_OPEN_PAREN}][^()${ZH_OPEN_PAREN}${ZH_CLOSE_PAREN}]*[)${ZH_CLOSE_PAREN}]\\s*$`)

/** The state a status value or a status cell names: Proposed or Accepted when it opens with that name, otherwise the text without a trailing parenthetical */
function stateOf(value, names) {
  for (const state of [names.Proposed, names.Accepted]) {
    if (value.startsWith(state)) return state
  }
  return value.replace(TRAILING_PARENTHETICAL, '').trim()
}

const LOOSE_TITLE = new RegExp(`^#\\s+ADR-(\\d{4})\\s*[:${ZH_COLON}]\\s*(.*?)\\s*$`)

/** The first line before the first section, after the title, that reads as a status line, with or without its list marker */
function looseStatus(head, names) {
  const line = new RegExp(`^(?:[-*+]\\s+)?${escapeRegExp(names.Status)}\\s*[:${ZH_COLON}]\\s*(.*?)\\s*$`)
  for (const { text } of head.slice(1)) {
    const m = line.exec(text)
    if (m) return { text, value: m[1] }
  }
  return null
}

/**
 * The number, the title after `ADR-NNNN:`, the status line, the state, the options and the negative consequences of
 * an entry; null where the entry has none. The title and the status line are read with or without the template's
 * spacing and list marker, as an entry written under the earlier rules may have them.
 */
export function readEntry(text, names) {
  const { lines, head, sections } = parseEntry(text)
  const title = LOOSE_TITLE.exec(lines[0])
  const status = looseStatus(head, names)
  const section = (name) => sections.find((s) => s.name === name)
  const options = section(names.Options)
  const consequences = section(names.Consequences)
  const kinds = consequences && items(consequences.body, consequenceMarker(names))
  return {
    number: title?.[1] ?? null,
    title: title?.[2] || null,
    statusLine: status?.text ?? null,
    state: status ? stateOf(status.value, names) : null,
    options: options ? items(options.body, OPTION_MARKER).found.map((i) => i.text.replace(/\s*\n\s*/g, ' ')) : null,
    negatives: kinds ? kinds.found.filter((i) => i.label === names.Negative).map((i) => i.text.replace(/\s*\n\s*/g, ' ').trim()) : null,
  }
}

const OPTION_MARKER = /^(\d+)\.\s+/
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
function consequenceMarker(names) {
  const kinds = [names.Positive, names.Negative, names.Neutral].map(escapeRegExp).join('|')
  return new RegExp(`^-\\s+(?:(${kinds})[:${ZH_COLON}]\\s*)?`)
}

/** The violations of one entry, each `{ line, message }` with a 1-based line; `language` is the project's working-language */
export function checkEntry(fileName, text, names, language) {
  const found = []
  const add = (line, message) => found.push({ line: line + 1, message })
  const { lines, head, sections } = parseEntry(text)

  const fileNumber = /^(\d{4})-/.exec(fileName)?.[1]
  const title = /^# ADR-(\d{4}): \S/.exec(lines[0])
  if (!title) add(0, 'the first line is not `# ADR-NNNN: <title>`')
  else if (title[1] !== fileNumber) add(0, `the title's number ${title[1]} is not the file name's ${fileNumber}`)

  const rest = head.slice(1).filter((h) => h.text.trim() !== '')
  const status = statusValue(rest, names)
  if (!status) add(rest[0]?.line ?? 0, `no status line \`- ${names.Status}: ...\` between the title and the first section`)
  else {
    const date = '\\d{4}-\\d{2}-\\d{2}'
    const accepted = new RegExp(`^${escapeRegExp(names.Accepted)}\\s*(?:\\(${date}\\)|${ZH_OPEN_PAREN}${date}${ZH_CLOSE_PAREN})$`)
    if (status.value !== names.Proposed && !accepted.test(status.value)) {
      add(status.line, `the status is neither "${names.Proposed}" nor "${names.Accepted} (YYYY-MM-DD)": "${status.value}"`)
    }
  }
  for (const h of rest) if (h.line !== status?.line) add(h.line, 'text outside the status line and the five sections')

  const expected = [names.Context, names.Options, names.Decision, names.Consequences, names.Sources]
  const actual = sections.map((s) => s.name)
  if (actual.join('\n') !== expected.join('\n')) {
    add(sections[0]?.line ?? 0, `the sections are ${actual.map((s) => `"${s}"`).join(', ') || 'none'}; expected ${expected.map((s) => `"${s}"`).join(', ')}, in that order`)
  }
  const section = (name) => sections.find((s) => s.name === name)
  for (const name of expected) {
    const s = section(name)
    if (s && s.body.every((b) => b.text.trim() === '')) add(s.line, `the ${name} section is empty`)
  }

  const context = section(names.Context)
  if (context) {
    const n = countSentences(context.body.map((b) => b.text).join('\n'))
    if (n > 3) add(context.line, `${names.Context} has ${n} sentences; at most 3`)
  }

  const options = section(names.Options)
  if (options) {
    const { found: opts, loose } = items(options.body, OPTION_MARKER)
    for (const line of loose) add(line, `a line in ${names.Options} outside a numbered option`)
    for (const o of opts) {
      const n = countSentences(o.text)
      if (n > 2) add(o.line, `the option has ${n} sentences; at most 2`)
    }
  }

  const consequences = section(names.Consequences)
  if (consequences) {
    const { found: cons, loose } = items(consequences.body, consequenceMarker(names))
    for (const line of loose) add(line, `a line in ${names.Consequences} outside a \`- \` item`)
    for (const c of cons) {
      if (!c.label) add(c.line, `a consequence that does not open with "${names.Positive}:", "${names.Negative}:" or "${names.Neutral}:"`)
      const n = countSentences(c.text)
      if (n > 2) add(c.line, `the consequence has ${n} sentences; at most 2`)
    }
    for (const kind of [names.Positive, names.Negative, names.Neutral]) {
      if (!cons.some((c) => c.label === kind)) add(consequences.line, `no "${kind}" consequence`)
    }
  }

  const limit = language === 'zh' ? 1800 : 5000
  const chars = countChars(text, names.Status)
  if (chars > limit) add(0, `${chars} characters, the title and status lines excluded; at most ${limit} for working-language "${language}"`)
  return found
}

const ADR_NUMBER = /ADR-\d{4}/g
const BARE_NUMBER = /(?<![\p{L}\p{N}])\d{4}(?![\p{L}\p{N}])/gu

/**
 * Whether two texts of an entry differ in more than ADR numbers and entry file names. `known` holds `numbers` and
 * `fileNames`, those of the entries at the base, now and in the history: each of those file names, every
 * `ADR-NNNN`, and each of those numbers standing alone are blanked out on both sides.
 */
export function changedBeyondNumbers(base, current, known) {
  const fileNames = [...known.fileNames].sort((a, b) => b.length - a.length).map(escapeRegExp)
  const fileName = fileNames.length ? new RegExp(fileNames.join('|'), 'g') : null
  const blank = (t) => {
    const text = t.replace(/\r\n?/g, '\n')
    return (fileName ? text.replace(fileName, '####.md') : text)
      .replace(ADR_NUMBER, 'ADR-####')
      .replace(BARE_NUMBER, (n) => (known.numbers.has(n) ? '####' : n))
  }
  return blank(base) !== blank(current)
}

/**
 * The violations of the index, each `{ line, message }` with a 1-based line of the README; the cells not compared,
 * each `NNNN (<cell names>)`; and the retired numbers. `entries` maps each number with an entry file now to
 * `{ fileName, title, state }` (title and state null when the entry has none that can be read); `history` holds every
 * number that had an entry file in the history.
 */
export function checkIndex(readme, entries, history, names) {
  const found = []
  const uncompared = []
  const add = (line, message) => found.push({ line: line + 1, message })
  if (readme === null) return { violations: [{ line: 1, message: 'docs/adr has no README.md' }], uncompared, retired: new Set(), retiredLines: new Set() }
  const lines = readme.replace(/\r\n?/g, '\n').split('\n')
  const header = ['#', names.Decision, names.Status].join('\n')
  const rows = new Map()
  let tables = 0
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!lines[i].trim().startsWith('|') || cells(lines[i]).join('\n') !== header) continue
    if (!cells(lines[i + 1]).every((c) => /^:?-+:?$/.test(c))) continue
    tables++
    for (i += 2; i < lines.length && lines[i].trim().startsWith('|'); i++) {
      const [link, decision, status] = cells(lines[i])
      const m = /^\[(\d{4})\]\(((\d{4})-[^)/]*\.md)\)$/.exec(link ?? '')
      if (!m || m[1] !== m[3]) { add(i, 'the row\'s first cell is not `[NNNN](NNNN-slug.md)`'); continue }
      const [, number, file] = m
      if (rows.has(number)) { add(i, `a second row for ${number}`); continue }
      rows.set(number, i)
      const entry = entries.get(number)
      if (!entry || entry.fileName !== file) { add(i, `the row links to ${file}, which is not an entry file`); continue }
      const cell = (decision ?? '').replace(/\\\|/g, '|')
      const notCompared = []
      if (entry.title === null) notCompared.push(names.Decision)
      else if (cell !== entry.title) add(i, `the ${names.Decision} cell is not the title of ${number}: "${cell}" against "${entry.title}"`)
      if (entry.state === null) notCompared.push(names.Status)
      else if (stateOf(status ?? '', names) !== entry.state) add(i, `the ${names.Status} cell "${status ?? ''}" is not the state of ${number}, "${entry.state}"`)
      if (notCompared.length) uncompared.push(`${number} (${notCompared.join(', ')})`)
    }
  }
  if (tables === 0) add(0, `the index has no \`| # | ${names.Decision} | ${names.Status} |\` table`)
  for (const [number, entry] of entries) if (!rows.has(number)) add(0, `${entry.fileName} has no row in the index`)

  const listed = new Map()
  const retiredLines = new Set()
  const heading = lines.findIndex((l) => /^#{2,}\s/.test(l) && l.replace(/^#+\s+/, '').trim() === names['Retired numbers'])
  if (heading >= 0) {
    const level = /^#+/.exec(lines[heading])[0].length
    for (let i = heading; i < lines.length; i++) {
      const h = /^(#+)\s/.exec(lines[i])
      if (i > heading && h && h[1].length <= level) break
      retiredLines.add(i + 1)
      const n = /^\s*[-*+]\s.*?(\d{4})/.exec(lines[i])
      if (n && !listed.has(n[1])) listed.set(n[1], i)
    }
  }
  for (const [number, line] of listed) {
    if (entries.has(number)) add(line, `${number} is among the ${names['Retired numbers']} but has the entry file ${entries.get(number).fileName}`)
  }
  for (const number of [...history].sort()) {
    if (!entries.has(number) && !listed.has(number)) {
      add(heading >= 0 ? heading : 0, `${number} had an entry file in the history and has none now, but is not among the ${names['Retired numbers']}`)
    }
  }
  const retired = new Set([...[...listed.keys()].filter((n) => !entries.has(n)), ...[...history].filter((n) => !entries.has(n))])
  return { violations: found, uncompared, retired, retiredLines }
}

const USAGE = 'Usage, from the repository root: check-adr.mjs [--base <commit> | --all]'
const ADR_DIR = 'docs/adr'
const ENTRY_FILE = /^(\d{4})-[^/]*\.md$/

function git(args) {
  const r = spawnSync('git', ['-c', 'core.quotePath=false', '-c', 'color.ui=never', '-c', 'log.showSignature=false', ...args], {
    encoding: 'utf8',
    maxBuffer: 1 << 30,
  })
  if (r.error) throw new CannotCheck(`cannot run git: ${r.error.message}`)
  return r
}

function gitOut(args, what) {
  const r = git(args)
  if (r.status !== 0) throw new CannotCheck(`${what}: ${(r.stderr || r.stdout).trim() || `git exited with ${r.status}`}`)
  return r.stdout
}

function parseArgs(argv) {
  const opts = { base: null, all: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--all') opts.all = true
    else if (argv[i] === '--base' && i + 1 < argv.length) opts.base = argv[++i]
    else throw new CannotCheck(`unknown argument "${argv[i]}". ${USAGE}`)
  }
  if (opts.all && opts.base !== null) throw new CannotCheck(`--base and --all cannot be given together. ${USAGE}`)
  return opts
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
  if (typeof value !== 'string') throw new CannotCheck('capabilities.toml has no working-language string')
  return value
}

function readNames(language) {
  const table = join(dirname(realpathSync(fileURLToPath(import.meta.url))), '..', 'repo-scaffold', 'artifact-names', 'domain-modeling.ADR-FORMAT.md')
  let text
  try {
    text = readFileSync(table, 'utf8')
  } catch (e) {
    throw new CannotCheck(`cannot read the names table ${table}: ${e.code ?? e.message}`)
  }
  return parseNames(text, language)
}

/** The fork point, or the commit given with --base */
function baseCommit(given) {
  if (given !== null) {
    const r = git(['rev-parse', '--verify', '--quiet', `${given}^{commit}`])
    if (r.status !== 0) throw new CannotCheck(`--base "${given}" is not a commit`)
    return r.stdout.trim()
  }
  const head = git(['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'])
  if (head.status !== 0) throw new CannotCheck('refs/remotes/origin/HEAD is not set, so the fork point is unknown; give --base <commit>')
  const branch = head.stdout.trim().replace(/^refs\/remotes\//, '')
  return gitOut(['merge-base', 'HEAD', branch], `cannot find the fork point of HEAD and ${branch}`).trim()
}

/** The text of the file at `path`; a file that cannot be read is a check that cannot be made */
function readText(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch (e) {
    throw new CannotCheck(`cannot read ${path}: ${e.code ?? e.message}`)
  }
}

/** The entry files among the file names of docs/adr: for each number the first in sorted order, and every other file of a number */
export function entryFiles(names) {
  const entries = new Map()
  const duplicates = []
  for (const name of [...names].sort()) {
    const m = ENTRY_FILE.exec(name)
    if (!m) continue
    if (entries.has(m[1])) duplicates.push(name)
    else entries.set(m[1], name)
  }
  return { entries, duplicates }
}

function currentEntries() {
  let names
  try {
    names = readdirSync(ADR_DIR)
  } catch (e) {
    throw new CannotCheck(`cannot read ${ADR_DIR}: ${e.code ?? e.message}`)
  }
  const { entries, duplicates } = entryFiles(names)
  return {
    entries: new Map([...entries].map(([n, name]) => [n, { fileName: name, text: readText(join(ADR_DIR, name)) }])),
    duplicates,
  }
}

function baseEntries(base) {
  const entries = new Map()
  const out = gitOut(['ls-tree', '-z', '--name-only', base, `${ADR_DIR}/`], `cannot list ${ADR_DIR} at ${base}`)
  for (const path of out.split('\0').filter(Boolean)) {
    const name = path.slice(ADR_DIR.length + 1)
    const m = ENTRY_FILE.exec(name)
    if (!m || entries.has(m[1])) continue
    entries.set(m[1], { fileName: name, text: gitOut(['show', `${base}:${path}`], `cannot read ${path} at ${base}`) })
  }
  return entries
}

/** Each number that had an entry file in the history of HEAD, with every file name it had */
function historyNames() {
  const names = new Map()
  const out = gitOut(['log', 'HEAD', '--no-renames', '--diff-filter=A', '--name-only', '--format=', '-z', '--', `${ADR_DIR}/`], 'cannot read the history of HEAD')
  for (const path of out.split(/[\0\n]/).filter(Boolean)) {
    if (!path.startsWith(`${ADR_DIR}/`)) continue
    const name = path.slice(ADR_DIR.length + 1)
    const m = ENTRY_FILE.exec(name)
    if (!m) continue
    if (!names.has(m[1])) names.set(m[1], new Set())
    names.get(m[1]).add(name)
  }
  return names
}

/** The lines of tracked and untracked files, ignored files left out, holding any of `patterns`, as `{ path, line, text }` */
function grep(patterns) {
  const r = git(['grep', '-n', '-I', '-z', '--untracked', '-F', ...patterns.flatMap((p) => ['-e', p])])
  if (r.status === 1) return []
  if (r.status !== 0) throw new CannotCheck(`git grep failed: ${r.stderr.trim()}`)
  return r.stdout.split('\n').filter(Boolean).map((l) => {
    const [path, line, ...text] = l.split('\0')
    return { path, line: Number(line), text: text.join('\0') }
  })
}

const citationForms = (number, fileNames) => [`ADR-${number}`, ...[...fileNames].sort()]

function main(argv) {
  const opts = parseArgs(argv)
  const top = git(['rev-parse', '--show-toplevel'])
  if (top.status !== 0 || realpathSync(top.stdout.trim()) !== realpathSync(process.cwd())) {
    throw new CannotCheck(`not run at the root of a git repository. ${USAGE}`)
  }
  let isDir = false
  try {
    isDir = statSync(ADR_DIR).isDirectory()
  } catch (e) {
    if (e.code !== 'ENOENT' && e.code !== 'ENOTDIR') throw new CannotCheck(`cannot read ${ADR_DIR}: ${e.code ?? e.message}`)
  }
  if (!isDir) throw new CannotCheck(`no ${ADR_DIR} directory here`)
  if (gitOut(['rev-parse', '--is-shallow-repository'], 'cannot tell whether the clone is shallow').trim() === 'true') {
    throw new CannotCheck('a shallow clone: its history cannot show which numbers were retired; fetch the full history')
  }
  const language = workingLanguage()
  const names = readNames(language)
  const base = opts.all ? null : baseCommit(opts.base)

  const { entries: current, duplicates } = currentEntries()
  const before = base ? baseEntries(base) : new Map()
  const added = [...current.keys()].filter((n) => !before.has(n))
  const deleted = [...before.keys()].filter((n) => !current.has(n))
  const kept = [...current.keys()].filter((n) => before.has(n))
  const history = historyNames()
  const known = {
    numbers: new Set([...current.keys(), ...before.keys(), ...history.keys()]),
    fileNames: new Set([...[...current.values(), ...before.values()].map((e) => e.fileName), ...duplicates, ...[...history.values()].flatMap((s) => [...s])]),
  }
  const changed = kept.filter((n) => changedBeyondNumbers(before.get(n).text, current.get(n).text, known))
  const renumbered = kept.filter((n) => !changed.includes(n) && before.get(n).text !== current.get(n).text)
  const checked = opts.all ? [...current.keys()] : [...added, ...changed].sort()

  const violations = []
  for (const name of duplicates) violations.push(`${ADR_DIR}/${name}:1: a second entry file for number ${name.slice(0, 4)}`)
  for (const n of checked) {
    const { fileName, text } = current.get(n)
    for (const v of checkEntry(fileName, text, names, language)) violations.push(`${ADR_DIR}/${fileName}:${v.line}: ${v.message}`)
  }

  const read = new Map([...current].map(([n, e]) => [n, { fileName: e.fileName, ...readEntry(e.text, names) }]))
  let readme = null
  try {
    readme = readFileSync(join(ADR_DIR, 'README.md'), 'utf8')
  } catch (e) {
    if (e.code !== 'ENOENT') throw new CannotCheck(`cannot read ${ADR_DIR}/README.md: ${e.code ?? e.message}`)
  }
  const index = checkIndex(readme, read, new Set(history.keys()), names)
  for (const v of index.violations) violations.push(`${ADR_DIR}/README.md:${v.line}: ${v.message}`)

  for (const n of [...index.retired].sort()) {
    const forms = citationForms(n, history.get(n) ?? [])
    for (const hit of grep(forms)) {
      if (hit.path === `${ADR_DIR}/README.md` && index.retiredLines.has(hit.line)) continue
      violations.push(`${hit.path}:${hit.line}: cites the retired number ${n} (${forms.filter((f) => hit.text.includes(f)).join(', ')})`)
    }
  }

  const out = []
  out.push(base
    ? `Base ${base}. Entries checked (added, or changed in more than ADR numbers and entry file names): ${checked.join(', ') || 'none'}.`
    : `Every entry checked: ${checked.join(', ') || 'none'}.`)
  if (renumbered.length) out.push(`Not checked, changed only in ADR numbers or entry file names: ${renumbered.join(', ')}.`)
  out.push(`Citations of retired numbers searched for as ADR-NNNN and as the file names each number had; other forms, such as a bare number, were not searched. Retired: ${[...index.retired].sort().join(', ') || 'none'}.`)
  if (index.uncompared.length) out.push(`Index cells not compared, since the entry's title or status line could not be read: ${index.uncompared.join(', ')}.`)
  out.push(...violations)
  out.push(`${violations.length} violation(s).`)

  if (base) out.push('', ...forReview({ base, before, current, names, added, deleted, changed, history }))
  console.log(out.join('\n'))
  return violations.length ? 1 : 0
}

function reviewLines(label, entry, names) {
  const r = readEntry(entry.text, names)
  const lines = [`  ${label}:`]
  if (r.options === null) lines.push(`    no "${names.Options}" section; compare the whole entry`)
  else r.options.forEach((o, i) => lines.push(`    ${names.Options} ${i + 1}: ${o}`))
  if (r.negatives === null) lines.push(`    no "${names.Consequences}" section; compare the whole entry`)
  else if (r.negatives.length === 0) lines.push(`    no "${names.Negative}" consequence`)
  else for (const n of r.negatives) lines.push(`    ${names.Negative}: ${n}`)
  return lines
}

function forReview({ base, before, current, names, added, deleted, changed, history }) {
  const lines = ['For review (judge each difference against ADR-FORMAT; this list does not affect the exit code):']
  lines.push(`Options and negative consequences at the base ${base.slice(0, 12)}:`)
  const baseSide = [...deleted, ...changed].sort()
  if (baseSide.length === 0) lines.push('  none')
  for (const n of baseSide) lines.push(...reviewLines(`${before.get(n).fileName}${deleted.includes(n) ? ' (deleted)' : ''}`, before.get(n), names))
  lines.push('Options and negative consequences now:')
  const nowSide = [...added, ...changed].sort()
  if (nowSide.length === 0) lines.push('  none')
  for (const n of nowSide) lines.push(...reviewLines(`${current.get(n).fileName}${added.includes(n) ? ' (added)' : ''}`, current.get(n), names))
  lines.push('Status lines changed:')
  const statuses = changed
    .map((n) => [n, readEntry(before.get(n).text, names).statusLine, readEntry(current.get(n).text, names).statusLine])
    .filter(([, a, b]) => a !== b)
  if (statuses.length === 0) lines.push('  none')
  for (const [n, a, b] of statuses) lines.push(`  ${n}: ${a ?? '(none)'} -> ${b ?? '(none)'}`)
  lines.push('Lines citing these entries:')
  const touched = [...new Set([...added, ...deleted, ...changed])].sort()
  let cited = 0
  for (const n of touched) {
    const own = current.get(n) && `${ADR_DIR}/${current.get(n).fileName}`
    const fileNames = new Set([...(history.get(n) ?? []), ...[current.get(n), before.get(n)].filter(Boolean).map((e) => e.fileName)])
    for (const hit of grep(citationForms(n, fileNames))) {
      if (hit.path === own) continue
      lines.push(`  ${hit.path}:${hit.line}: ${hit.text.trim()}`)
      cited++
    }
  }
  if (cited === 0) lines.push('  none')
  return lines
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2))
  } catch (e) {
    console.error(`Could not check: ${e instanceof CannotCheck ? e.message : `an error the script does not expect: ${e?.stack ?? e}`}`)
    process.exitCode = 2
  }
}
