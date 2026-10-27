#!/usr/bin/env node
// Checks that every file the prototype skill copies into projects verbatim says so in its leading comment.
// Rules: prototype/SKILL.md, the section on the skill's files. Run from the repository root:
//   node scripts/check-prototype-copies.mjs
// Exit 0 when every check passes, 1 when any fails. The report quantifies what was scanned.
//
// In a project the skill's copies sit beside the project's own prototype pages, with the same extensions,
// and the project's checks tell them apart by the marker. Every file under prototype/ other than Markdown
// must carry the marker on one line of its leading comment (after a `#!` line and a `<!doctype>` line);
// the templates filled in with each prototype's own content are listed below and must not carry it at
// all. A file that is neither marked nor listed is reported, so an asset added or renamed turns this red
// until someone decides which kind it is.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const DIR = 'prototype'
const MARKER = "copied from the prototype skill's template"
// Copied, then filled in with the prototype's own content (LOGIC.md): the project's file is the prototype's own.
const FILLED_IN = ['logic-template.js', 'logic-page-template.html']

const errors = []
// Dotfiles (.DS_Store and the like) are not assets
const walk = (d) => readdirSync(d).filter((n) => !n.startsWith('.')).flatMap((n) => {
  const p = join(d, n)
  return statSync(p).isDirectory() ? walk(p) : [p]
})

/** The lines of the file's first comment, after an optional `#!` line and `<!doctype>` line; none when it opens with code. */
function leadingComment(text) {
  const lines = text.split('\n')
  let i = 0
  if (/^#!/.test(lines[i] ?? '')) i++
  if (/^<!doctype/i.test(lines[i] ?? '')) i++
  const first = (lines[i] ?? '').trim()
  const out = []
  if (first.startsWith('//')) {
    for (; i < lines.length && lines[i].trim().startsWith('//'); i++) out.push(lines[i])
  } else if (first.startsWith('<!--') || first.startsWith('/*')) {
    const end = first.startsWith('<!--') ? '-->' : '*/'
    for (; i < lines.length; i++) {
      out.push(lines[i])
      if (lines[i].includes(end)) break
    }
  }
  return out
}

const files = walk(DIR).filter((f) => !f.endsWith('.md')).sort()
const names = files.map((f) => relative(DIR, f))
for (const name of FILLED_IN) {
  if (!names.includes(name)) errors.push(`${DIR}/${name} is listed as filled in but does not exist`)
}
let marked = 0
for (const f of files) {
  const text = readFileSync(f, 'utf8')
  if (FILLED_IN.includes(relative(DIR, f))) {
    if (text.includes(MARKER)) errors.push(`${f} is filled in with each prototype's own content but carries the marker`)
    continue
  }
  if (leadingComment(text).some((l) => l.includes(MARKER))) { marked++; continue }
  errors.push(`${f} has no "${MARKER}" on one line of its leading comment: a file copied verbatim must carry it, a template filled in with each prototype's own content goes in FILLED_IN`)
}

console.log('prototype-copies check')
console.log(`  files: ${files.length}`)
console.log(`  marked: ${marked}`)
console.log(`  filledIn: ${FILLED_IN.length}`)
if (errors.length) {
  console.log(`\n${errors.length} problem(s):`)
  for (const e of errors) console.log(`  ${e}`)
  process.exit(1)
}
console.log('\nall checks passed')
