#!/usr/bin/env node
// The skill-policy gate: the mechanically checkable clauses of skill-policy/SKILL.md, run over every
// tracked skill in this repository. A clause that only lives in prose is enforced by review; these four
// are enforced here, so violating them goes red before it lands.
//
// What it checks (clause → check):
//   §3 "description 必须第三人称,出现「我 / 你」即违反"      → desc-third-person
//   §3 "必须同时写明「做什么」与「何时触发」"                  → desc-has-trigger
//   §3 "不得概括正文的规则、流程或步骤"                        → desc-no-flow(箭头链是该违规的实测形态)
//   §2 "skill 内不得保留「某日发生过某事」式内容"              → body-date-narrative
//
// What it cannot check: everything not listed above — derive it by inverting this list rather than
// enumerating clauses here, since an enumeration rots as the body grows and the omitted clause never
// announces itself. Note also that each check catches a *shape*, not the whole clause: a flow summary
// written without arrows still lands. Those remaining shapes stay with review.
//
// ── Exemptions are predicates, never counts ──
// Same rule as every gate in this toolset (see review-code/false-greens.md, form seven): an exemption
// states what *shape* is permitted and why, it never carries a count or a snapshot. An exemption that
// matches nothing is dead weight and is reported as such.

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Anchor to the repository THIS SCRIPT LIVES IN, before anything else — derived from the script's own
// path, never from the caller's cwd. Both wrong anchors were measured, not assumed:
//   - cwd as-is: `git ls-files` scopes to the current directory, so a run from inside a skill directory
//     printed "✓ 0 skills checked, all clauses hold" — a green over an empty scope;
//   - cwd's git toplevel: a run from any *other* repository that happens to contain a SKILL.md audits
//     that repository and reports green about it, while claiming to be this repository's gate.
// The gate polices the repo it ships in; the caller's location must not be able to change the subject.
process.chdir(join(dirname(fileURLToPath(import.meta.url)), '..'))

/** Scope: tracked markdown only. Symlinked third-party skills are link objects in git, so their content
 * is naturally out of scope — this repository only vouches for what it versions. */
const tracked = execSync('git ls-files "*.md"', { encoding: 'utf8' }).trim().split('\n').filter(Boolean)

/** Frontmatter fields that make up the selector (description + when_to_use), single-line values. */
function selectorText(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/)
  if (!m) return null
  const fields = []
  for (const key of ['description', 'when_to_use']) {
    const f = m[1].match(new RegExp(`^${key}:[ \\t]*(.+)$`, 'm'))
    if (f) fields.push(f[1].replace(/^["']|["']$/g, ''))
  }
  return fields.length ? fields.join(' ') : null
}

/** Trigger markers: the shapes "何时触发" takes in practice, zh and en. */
const TRIGGER = /激活|使用|必经|跑一次|过一遍|调用|重跑|时用|use when|Activate|Run (it |once )/i
/** A flow summary in a selector: an arrow chain (the measured shape of this violation). */
const FLOW = /→[^→\n]*→/
/** A dated incident narrative: an ISO date sharing a line with narrative markers. Dates alone are
 * provenance ("2026-08-01 定案") and stay legal — narrative words are what turn them into storytelling.
 * Keep the markers generic: a phrase lifted verbatim from one incident ("错三次") only ever matches that
 * incident's own retelling, so it reads as coverage while detecting nothing. */
const DATE = /\d{4}-\d{2}-\d{2}/
const NARRATIVE = /踩过|当时的|当初|那次|后来|连错|事故经过/

/** Empty today: the policy quotes forbidden shapes without ISO dates, so nothing needs shielding. An
 * entry added later must state what shape is permitted and why — and it dies (reported below) the moment
 * it stops shielding anything. */
const EXEMPT = []
const exempted = (check, file) => EXEMPT.find((e) => e.check === check && e.match(file))

const problems = []
const hitsPerExempt = new Map(EXEMPT.map((e) => [e, 0]))

for (const file of tracked) {
  const text = readFileSync(file, 'utf8')

  if (file.endsWith('/SKILL.md')) {
    const sel = selectorText(text)
    if (sel === null) {
      problems.push(`${file}: no frontmatter description — the selector is what lets a model pick this skill`)
      continue
    }
    if (/[我你]/.test(sel) && !exempted('desc-third-person', file)) {
      problems.push(`${file}: selector uses first/second person (我/你) — skill-policy §3 requires third person`)
    }
    if (!TRIGGER.test(sel) && !exempted('desc-has-trigger', file)) {
      problems.push(`${file}: selector has no trigger marker — say when to use it, not only what it does (§3)`)
    }
    if (FLOW.test(sel) && !exempted('desc-no-flow', file)) {
      problems.push(`${file}: selector contains an arrow-chain flow summary — flows belong in the body (§3)`)
    }
  }

  for (const [i, line] of text.split('\n').entries()) {
    if (DATE.test(line) && NARRATIVE.test(line)) {
      const ex = exempted('body-date-narrative', file)
      if (ex) hitsPerExempt.set(ex, hitsPerExempt.get(ex) + 1)
      else problems.push(`${file}:${i + 1}: dated incident narrative — abstract the rule, move the story to memory or a postmortem (§2)`)
    }
  }
}

for (const [ex, hits] of hitsPerExempt) {
  // Dead = shields zero hits. "Matches a file" is not enough — an exemption earns its place by being the
  // only thing between a real line and a red gate, and this one no longer stands between anything.
  if (hits === 0) problems.push(`exemption shields nothing and is now dead: ${ex.why}`)
}

if (problems.length) {
  console.error(`✗ skill-policy: ${problems.length} problem(s)\n`)
  for (const p of problems) console.error(`    ${p}`)
  console.error('\nFix the text, or — if the shape is genuinely required — widen an exemption predicate in scripts/check-skill-policy.mjs, stating why. Never a count.')
  process.exit(1)
}
const checked = tracked.filter((f) => f.endsWith('/SKILL.md')).length
if (checked === 0) {
  // A universal claim over an empty set is not a pass. This is a skills repository — zero skills scanned
  // means the invocation is broken, never that everything complies.
  console.error('✗ skill-policy: scanned zero skills — the scope is broken, refusing to report green')
  process.exit(1)
}
console.log(`✓ skill-policy: ${checked} skills checked, all clauses hold`)
