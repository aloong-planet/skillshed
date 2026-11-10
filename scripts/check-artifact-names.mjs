#!/usr/bin/env node
// Checks that skills can be followed in a repository whose working language is not Chinese.
// Rules: repo-scaffold/artifact-names.md. Run from the repository root:
//   node scripts/check-artifact-names.mjs
// Exit 0 when every check passes, 1 when any fails. The report quantifies what was scanned.
//
//  A. Vocabulary tables: one table per defining file under repo-scaffold/artifact-names/, its file name
//     derived from that file's path (`<skill>.md` for `<skill>/SKILL.md`, `<skill>.<name>.md` for
//     `<skill>/<name>.md`). Every row has a Chinese and an English name; names are unique in both columns
//     across all tables; each table points back to the rules; each defining file contains its Chinese
//     names and links its table; the rules file holds no table of its own.
//  B. Template completeness: in every template, each fixed name (headings, table cells, bold leads,
//     labels and their values) must be a table name or a placeholder. Anything left is unmapped. The
//     template's file must link the table of every name it uses.
//  C. Seed texts: the files listed in the rules file's seed section exist; repo-scaffold links the rules.
//  D. Assets: asset files and code blocks marked `<!-- asset -->` contain no Chinese; in the asset-bearing
//     documents every code block that contains Chinese carries `<!-- example -->` (it is not copied).
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'

const RULES = 'repo-scaffold/artifact-names.md'
const TABLE_DIR = 'repo-scaffold/artifact-names'
const CJK = /[㐀-鿿豈-﫿]/
const CJK_G = /[㐀-鿿豈-﫿]/g

// Where templates live. `fence`: fenced blocks with these info strings; `tag`: <tag>…</tag> blocks;
// `tables`: the header row of the tables whose first header cell is in `headerOf`, and the first column of
// the body rows of those in `firstColumnOf`.
const TEMPLATES = [
  { file: 'to-spec/SKILL.md', kind: 'fence', langs: ['md'] },
  { file: 'to-tickets/feature-checklist.md', kind: 'tag', tags: ['checklist-template'] },
  { file: 'to-tickets/ticket-templates.md', kind: 'tag', tags: ['local-ticket-template', 'closeout-ticket-template', 'issue-template'] },
  // Only the parts written into tickets: the sync checklist's header row and the process-acceptance item names
  { file: 'to-tickets/ticket-artifacts.md', kind: 'tables', headerOf: ['同步事项及触发时点'], firstColumnOf: ['验收项'] },
  { file: 'features-catalog/SKILL.md', kind: 'fence', langs: ['md'] },
  { file: 'domain-modeling/ADR-FORMAT.md', kind: 'fence', langs: ['md'] },
  { file: 'domain-modeling/CONTEXT-FORMAT.md', kind: 'fence', langs: ['md'] },
  { file: 'repo-scaffold/scaffolding.md', kind: 'fence', langs: ['markdown'] }
]
// Copied into projects whole: every file under ASSET_DIRS, and every file under ASSET_SKILL_DIRS but its
// Markdown documents and dotfiles, read from the directory so that an asset added there is checked without
// a change here.
const ASSET_DIRS = ['electron-scaffold/assets', 'github-ops/assets']
const ASSET_SKILL_DIRS = ['prototype']
// Documents whose code blocks may be copied into projects; every Chinese-bearing block must be classified.
const ASSET_DOC_DIRS = ['electron-scaffold', 'prototype']
const ASSET_DOC_FILES = ['github-ops/checks-gate.md']

const errors = []
const report = {}
const read = (f) => readFileSync(f, 'utf8')
const cjkLines = (s) => s.split('\n').filter((l) => CJK.test(l)).length

// ---- A. tables --------------------------------------------------------------------------------------
function parseTable(text) {
  const lines = text.split('\n')
  const start = lines.findIndex((l) => /^\|.*中文规范名.*\|/.test(l))
  if (start < 0) return null
  const rows = []
  for (let i = start + 2; i < lines.length && lines[i].startsWith('|'); i++) {
    const cells = lines[i].split('|').slice(1, -1).map((c) => c.trim())
    rows.push({ line: i + 1, zh: cells[0], en: cells[1] ?? '' })
  }
  return rows
}
/** `to-spec.md` → `to-spec/SKILL.md`; `to-tickets.ticket-artifacts.md` → `to-tickets/ticket-artifacts.md` */
function definingFileOf(table) {
  const stem = table.replace(/\.md$/, ''), dot = stem.indexOf('.')
  return dot < 0 ? `${stem}/SKILL.md` : `${stem.slice(0, dot)}/${stem.slice(dot + 1)}.md`
}

let names = []
const tableOf = new Map() // Chinese name → table file name
if (!existsSync(RULES)) errors.push(`A: ${RULES} does not exist`)
else if (parseTable(read(RULES))) errors.push(`A: ${RULES} holds a table with a 中文规范名 column; names belong in ${TABLE_DIR}/`)
if (!existsSync(TABLE_DIR)) {
  errors.push(`A: ${TABLE_DIR} does not exist`)
} else {
  const seenZh = new Map(), seenEn = new Map()
  const tables = readdirSync(TABLE_DIR).sort()
  let rowCount = 0
  for (const name of tables) {
    const file = `${TABLE_DIR}/${name}`
    if (!name.endsWith('.md')) { errors.push(`A: ${file} is not a .md table`); continue }
    const text = read(file)
    if (!text.includes('](../artifact-names.md)')) errors.push(`A: ${file} does not point back to the rules (../artifact-names.md)`)
    const rows = parseTable(text)
    if (!rows || rows.length === 0) { errors.push(`A: ${file} has no rows under a 中文规范名 column`); continue }
    const def = definingFileOf(name)
    const defText = existsSync(def) ? read(def) : null
    if (defText === null) errors.push(`A: ${file} names defining file ${def}, which does not exist`)
    else if (!defText.includes(`artifact-names/${name}`)) errors.push(`A: ${def} does not link its table artifact-names/${name}`)
    for (const r of rows) {
      const where = `${file}:${r.line}`
      if (!r.zh || !CJK.test(r.zh)) errors.push(`A: ${where} Chinese name missing or not Chinese: "${r.zh}"`)
      if (!r.en || CJK.test(r.en)) errors.push(`A: ${where} English name missing or contains Chinese: "${r.en}"`)
      if (seenZh.has(r.zh)) errors.push(`A: ${where} duplicate Chinese name "${r.zh}" (also ${seenZh.get(r.zh)})`)
      if (seenEn.has(r.en.toLowerCase())) errors.push(`A: ${where} duplicate English name "${r.en}" (also ${seenEn.get(r.en.toLowerCase())})`)
      seenZh.set(r.zh, where); seenEn.set(r.en.toLowerCase(), where)
      tableOf.set(r.zh, name)
      if (defText !== null && !defText.includes(r.zh)) errors.push(`A: ${where} "${r.zh}" does not appear in its defining file ${def}`)
    }
    rowCount += rows.length
  }
  names = [...tableOf.keys()].sort((a, b) => b.length - a.length)
  report.tables = tables.length
  report.tableRows = rowCount
}

// ---- B. templates -----------------------------------------------------------------------------------
/** Blank out placeholders ({…} and <…>, nested, across lines) and code spans, keeping line breaks. */
function mask(text) {
  let out = '', depth = 0, tick = false
  for (const ch of text) {
    if (ch === '`') { tick = !tick; out += ' '; continue }
    if (!tick && (ch === '{' || ch === '<')) depth++
    const hidden = tick || depth > 0
    if (!tick && (ch === '}' || ch === '>') && depth > 0) depth--
    out += ch === '\n' ? '\n' : hidden ? ' ' : ch
  }
  return out
}
function blocksOf(t) {
  const lines = read(t.file).split('\n'), out = []
  if (t.kind === 'tables') {
    lines.forEach((l, i) => {
      if (!/^\|/.test(l) || !/^\|[\s:|-]+\|$/.test(lines[i + 1] ?? '')) return
      const first = l.split('|')[1].trim()
      if (t.headerOf.includes(first)) out.push({ start: i + 1, lines: [l] })
      if (t.firstColumnOf.includes(first)) {
        for (let j = i + 2; j < lines.length && lines[j].startsWith('|'); j++) out.push({ start: j + 1, lines: [`| ${lines[j].split('|')[1].trim()} |`] })
      }
    })
    return out
  }
  let cur = null
  lines.forEach((l, i) => {
    if (t.kind === 'fence') {
      const m = l.match(/^\s*```+\s*(\S*)/)
      if (m && !cur && t.langs.includes(m[1])) { cur = { start: i + 2, lines: [] }; return }
      if (m && cur) { out.push(cur); cur = null; return }
    } else {
      const open = t.tags.find((g) => l.trim() === `<${g}>`), close = t.tags.find((g) => l.trim() === `</${g}>`)
      if (open) { cur = { start: i + 2, lines: [] }; return }
      if (close && cur) { out.push(cur); cur = null; return }
    }
    if (cur) cur.lines.push(l)
  })
  return out.map((b) => ({ ...b, lines: mask(b.lines.join('\n')).split('\n') }))
}
/** The parts of a template line that are fixed names (prose and placeholders excluded). */
function namePartsOf(line) {
  const s = line.replace(/\]\([^)]*\)/g, ']')
  if (/^\s*\|/.test(s)) return /^\|[\s:|-]+\|$/.test(s.trim()) ? [] : s.split('|').slice(1, -1)
  if (/^\s*#{1,6}\s/.test(s)) return [s.replace(/^\s*#+\s*/, '')]
  const bold = s.match(/^\s*(?:[-*>]\s*)?\*\*([^*]+)\*\*/)
  if (bold) return [bold[1]]
  const label = s.match(/^\s*(?:[-*>]\s*)?([^\s|*][^:：|]{0,30})[:：](.*)$/)
  if (label) return [label[1], ...label[2].split('|')]
  return []
}
let elements = 0, unmapped = 0, links = 0
for (const t of TEMPLATES) {
  if (!existsSync(t.file)) { errors.push(`B: template source ${t.file} does not exist`); continue }
  const used = new Set()
  for (const b of blocksOf(t)) {
    b.lines.forEach((l, k) => {
      for (const part of namePartsOf(l)) {
        if (!CJK.test(part)) continue
        elements++
        let rest = part
        for (const n of names) {
          if (rest.includes(n)) used.add(tableOf.get(n))
          rest = rest.split(n).join(' ')
        }
        const left = (rest.match(CJK_G) ?? []).length
        if (left) { unmapped++; errors.push(`B: ${t.file}:${b.start + k} unmapped fixed name in "${part.trim()}"`) }
      }
    })
  }
  // A reader writing the template must be led to every table its names come from
  const text = read(t.file)
  for (const table of used) {
    links++
    if (!text.includes(`artifact-names/${table}`)) errors.push(`B: ${t.file} uses names from artifact-names/${table} but does not link it`)
  }
}
report.templateElements = elements
report.unmappedElements = unmapped
report.templateTableLinks = links

// ---- C. seed texts ----------------------------------------------------------------------------------
if (existsSync(RULES)) {
  const t = read(RULES)
  const seeds = [...t.matchAll(/^- `([^`]+\.md)`.*种子/gm)].map((m) => m[1])
  if (seeds.length === 0) errors.push(`C: ${RULES} lists no seed texts`)
  for (const f of seeds) if (!existsSync(f)) errors.push(`C: seed text ${f} does not exist`)
  report.seedTexts = seeds.length
}
if (!read('repo-scaffold/SKILL.md').includes('artifact-names.md')) errors.push('C: repo-scaffold/SKILL.md does not link artifact-names.md')

// ---- D. assets --------------------------------------------------------------------------------------
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p] })
// Dotfiles (.DS_Store and the like) in a skill directory are not assets
const skillAssets = (d) => walk(d).filter((f) => !f.endsWith('.md') && !basename(f).startsWith('.'))
const assetFiles = [...ASSET_DIRS.flatMap(walk), ...ASSET_SKILL_DIRS.flatMap(skillAssets)]
let assetCjk = 0
for (const f of assetFiles) {
  const n = cjkLines(read(f)); assetCjk += n
  if (n) errors.push(`D: asset ${f} has ${n} line(s) with Chinese`)
}
report.assetFiles = assetFiles.length
report.assetCjkLines = assetCjk

const docs = [...ASSET_DOC_DIRS.flatMap((d) => readdirSync(d).filter((n) => n.endsWith('.md')).map((n) => join(d, n))), ...ASSET_DOC_FILES]
let blocks = 0, assetBlocks = 0, exampleBlocks = 0
for (const f of docs) {
  const lines = read(f).split('\n')
  let inBlock = false, start = 0, mark = '', body = []
  lines.forEach((l, i) => {
    if (/^\s*```/.test(l)) {
      if (!inBlock) {
        inBlock = true; start = i + 1; body = []
        const prev = lines.slice(0, i).reverse().find((x) => x.trim() !== '') ?? ''
        mark = /<!--\s*asset\s*-->/.test(prev) ? 'asset' : /<!--\s*example\s*-->/.test(prev) ? 'example' : ''
      } else {
        inBlock = false; blocks++
        const n = body.filter((x) => CJK.test(x)).length
        if (mark === 'asset') { assetBlocks++; if (n) errors.push(`D: ${f}:${start} block marked asset has ${n} line(s) with Chinese`) }
        else if (mark === 'example') exampleBlocks++
        else if (n) errors.push(`D: ${f}:${start} block has Chinese but is not classified (<!-- asset --> or <!-- example -->)`)
      }
      return
    }
    if (inBlock) body.push(l)
  })
}
report.assetDocBlocks = blocks
report.assetBlocks = assetBlocks
report.exampleBlocks = exampleBlocks

// ---- report -----------------------------------------------------------------------------------------
console.log('artifact-names check')
for (const [k, v] of Object.entries(report)) console.log(`  ${k}: ${v}`)
if (errors.length) {
  console.log(`\n${errors.length} problem(s):`)
  for (const e of errors) console.log(`  ${e}`)
  process.exit(1)
}
console.log('\nall checks passed')
