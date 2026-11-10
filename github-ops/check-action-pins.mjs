#!/usr/bin/env node
// Check that every action a workflow uses is pinned to a full commit (the github-ops skill: pin every action).
//
// For each `uses:` line in the workflow files under .github/workflows of the current directory:
//   - the reference must be `owner/repo[/path]@<40 lower-case hex digits>`, and the line must end with `# v<x.y.z>`;
//   - one `owner/repo` must be pinned to the same commit on every line, across all files;
//   - local actions (`./...`) and `docker://` references are not checked.
//
// The check is line-based on purpose: the release comment is not part of the YAML data, so a YAML parser
// cannot see it. A `uses` key written in a form the line reader does not understand (a flow mapping such as
// `- { uses: ... }`, or a value continued on the next line) is reported as a violation, never passed over.
// A line reading `uses: ...` inside a `run: |` block is checked like any other.
//
// What it cannot check: whether the commit is the release the comment names, and whether that release is
// current. Both need the action's own repository.
//
// Usage, from the repository root:
//   check-action-pins.mjs
//
// Exit codes: every reference pinned → 0; any violation → 1; the directory is missing, unreadable or holds
// no workflow file → 2.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

if (process.argv.length > 2) {
  console.error('Usage: check-action-pins.mjs   (takes no arguments; run it from the repository root)')
  process.exit(2)
}
const dir = '.github/workflows'

let files
try {
  files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort()
} catch (e) {
  console.error(`Cannot read the workflows directory "${dir}": ${e.code ?? e.message}`)
  process.exit(2)
}
if (files.length === 0) {
  console.error(`No workflow file (*.yml, *.yaml) in "${dir}": nothing was checked.`)
  process.exit(2)
}

// `uses` as a block-mapping key, optionally the first key of a list item.
const USES_KEY = /^\s*(?:-\s+)?(?:uses|"uses"|'uses')\s*:(.*)$/
// `uses` as a key anywhere else on the line (a flow mapping).
const USES_ELSEWHERE = /[{,]\s*(?:uses|"uses"|'uses')\s*:/
// A scalar value, quoted or plain, then an optional comment.
const VALUE = /^\s*(?:"([^"]*)"|'([^']*)'|([^\s#"'][^\s#]*))\s*(?:#(.*))?$/
const PINNED = /^([\w.-]+\/[\w.-]+)(?:\/[^@\s]*)?@([0-9a-f]{40})$/
const RELEASE = /^\s*v\d+\.\d+\.\d+\s*$/

const violations = []
const firstPin = new Map() // owner/repo (lower case) → { sha, where }
let checked = 0
let skipped = 0

for (const file of files) {
  const path = join(dir, file)
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch (e) {
    console.error(`Cannot read "${path}": ${e.code ?? e.message}`)
    process.exit(2)
  }
  text.split(/\r?\n/).forEach((line, i) => {
    if (/^\s*#/.test(line)) return
    const where = `${path}:${i + 1}`
    const report = (why) => violations.push(`${where}: ${why}\n    ${line.trim()}`)

    const key = USES_KEY.exec(line)
    if (!key) {
      if (USES_ELSEWHERE.test(line)) report('`uses` in a flow mapping is not understood by this check; write it as a block key')
      return
    }
    const value = VALUE.exec(key[1])
    if (!value) return report('the value of `uses` is not a single scalar on this line')
    const ref = value[1] ?? value[2] ?? value[3]
    const comment = value[4]

    if (ref.startsWith('./') || ref.startsWith('docker://')) { skipped++; return }
    checked++

    const pinned = PINNED.exec(ref)
    if (!pinned) return report('not pinned to a full commit (expected owner/repo@<40 hex digits>)')
    if (comment === undefined || !RELEASE.test(comment)) report('the line does not end with the release comment `# v<x.y.z>`')

    const repo = pinned[1].toLowerCase()
    const sha = pinned[2]
    const first = firstPin.get(repo)
    if (!first) firstPin.set(repo, { sha, where })
    else if (first.sha !== sha) report(`${repo} is pinned to a different commit at ${first.where}`)
  })
}

for (const v of violations) console.log(v)
console.log(
  `${files.length} workflow file(s), ${checked} action reference(s) checked, ${skipped} local or docker reference(s) not checked: ` +
  `${violations.length} violation(s).`,
)
process.exit(violations.length === 0 ? 0 : 1)
