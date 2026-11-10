#!/usr/bin/env node
// Which product scopes a CI run selects (the github-ops skill, checks-gate.md "Route checks by changed paths").
// Copied unchanged into a repository's .github/ci/; the repository's own rules are routing.json beside it.
//
// Fixed, and not configurable:
//   - push: every scope, and nothing is compared. A newer push to the same ref cancels the unfinished run, so
//     every default-branch run has to check what the run it cancels would have; a push routed by its own paths
//     leaves a cancelled run's changes unchecked.
//   - pull_request: the paths of merge base...head, NUL-delimited, with renames off, so a move counts at both ends
//     and a deletion counts. Each path takes the first rule that matches it.
//   - a path under .github/ (workflows, these scripts, routing.json) selects every scope.
//   - a path no rule matches selects every scope.
//   - any other event, a malformed event or routing.json, or a failed Git command: exit 1, and no output is written.
//
// routing.json:
//   { "scopes": { "<scope>": ["<job id>", ...], ... },
//     "rules": [ { "reason": "<text>", "select": "all" | ["<scope>", ...], "paths": ["<pattern>", ...] }, ... ] }
//   A scope name is [a-z][a-z0-9_]* and becomes the output `<scope>=true|false` of the `changes` job. Its job ids
//   are the jobs ci-gate.mjs requires when the scope is selected. `"select": []` selects no scope: repository
//   policy still runs.
//   A pattern is a path from the repository root. `*` matches any characters but `/`; `**` as a whole segment
//   matches any number of segments, none included at the start or middle and at least one at the end. No other
//   character is special, and a pattern under .github/ is refused: that directory is fixed above.
//
// Usage, in a workflow step at the repository root: node .github/ci/ci-scope.mjs
// It reads GITHUB_EVENT_NAME, GITHUB_EVENT_PATH, GITHUB_OUTPUT and, when set, GITHUB_STEP_SUMMARY.
import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SCOPE_NAME = /^[a-z][a-z0-9_]*$/
const FIXED_DIR = '.github/'

function fail(message) {
  throw new Error(`routing.json: ${message}`)
}

function validPath(path) {
  return typeof path === 'string' && path !== '' && !path.includes('\0') && !path.startsWith('/') &&
    path.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
}

function compilePattern(pattern) {
  if (!validPath(pattern)) fail(`invalid pattern ${JSON.stringify(pattern)}`)
  if (/[?[\]{}!\\]/.test(pattern)) fail(`pattern ${JSON.stringify(pattern)} uses a character that is not special here`)
  if (pattern.startsWith(FIXED_DIR)) fail(`pattern ${JSON.stringify(pattern)} is under ${FIXED_DIR}, which selects every scope`)
  const segments = pattern.split('/')
  let source = ''
  segments.forEach((segment, i) => {
    const last = i === segments.length - 1
    if (segment === '**') {
      source += last ? '[^]+' : '(?:[^/]+/)*'
      return
    }
    if (segment.includes('**')) fail(`pattern ${JSON.stringify(pattern)}: ** must be a whole segment`)
    source += segment.split('*').map((part) => part.replace(/[.+^$()|]/g, '\\$&')).join('[^/]*') + (last ? '' : '/')
  })
  return new RegExp(`^${source}$`)
}

/** The parsed routing.json; throws on anything but the documented shape. */
export function parseConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('must be an object')
  for (const key of Object.keys(value)) if (key !== 'scopes' && key !== 'rules') fail(`unknown key ${JSON.stringify(key)}`)
  const { scopes, rules } = value
  if (!scopes || typeof scopes !== 'object' || Array.isArray(scopes) || Object.keys(scopes).length === 0) fail('scopes must name at least one scope')
  const jobs = new Map()
  for (const [name, ids] of Object.entries(scopes)) {
    if (!SCOPE_NAME.test(name)) fail(`scope name ${JSON.stringify(name)} must match ${SCOPE_NAME}`)
    if (!Array.isArray(ids) || ids.length === 0) fail(`scope ${name} must list at least one job id`)
    for (const id of ids) {
      if (typeof id !== 'string' || id === '') fail(`scope ${name} has an invalid job id`)
      if (id === 'changes') fail(`scope ${name} lists the classification job itself`)
    }
    if (new Set(ids).size !== ids.length) fail(`scope ${name} lists a job twice`)
    jobs.set(name, [...ids])
  }
  if (!Array.isArray(rules)) fail('rules must be an array')
  const compiled = rules.map((rule, i) => {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) fail(`rule ${i} must be an object`)
    for (const key of Object.keys(rule)) if (!['reason', 'select', 'paths'].includes(key)) fail(`rule ${i} has an unknown key ${JSON.stringify(key)}`)
    if (typeof rule.reason !== 'string' || rule.reason.trim() === '') fail(`rule ${i} needs a reason`)
    let select
    if (rule.select === 'all') select = [...jobs.keys()]
    else if (Array.isArray(rule.select)) {
      for (const name of rule.select) if (!jobs.has(name)) fail(`rule ${i} selects an unknown scope ${JSON.stringify(name)}`)
      if (new Set(rule.select).size !== rule.select.length) fail(`rule ${i} selects a scope twice`)
      select = [...rule.select]
    } else fail(`rule ${i}: select must be "all" or a list of scopes`)
    if (!Array.isArray(rule.paths) || rule.paths.length === 0) fail(`rule ${i} needs at least one pattern`)
    return { reason: rule.reason, select, patterns: rule.paths.map((pattern) => ({ pattern, regex: compilePattern(pattern) })) }
  })
  return { scopes: jobs, rules: compiled }
}

/** routing.json beside this script, parsed. */
export function readConfig(url = new URL('./routing.json', import.meta.url)) {
  let text
  try {
    text = readFileSync(url, 'utf8')
  } catch (error) {
    fail(`cannot be read (${error.code ?? error.message})`)
  }
  let value
  try {
    value = JSON.parse(text)
  } catch (error) {
    fail(`is not JSON (${error.message})`)
  }
  return parseConfig(value)
}

/** One path: the scopes it selects, why, and the pattern that matched (null for the fixed cases). */
export function classifyPath(path, config) {
  if (!validPath(path)) throw new Error(`Invalid changed path ${JSON.stringify(path)}`)
  const all = [...config.scopes.keys()]
  if (path.startsWith(FIXED_DIR)) return { select: all, reason: 'CI definition: every scope', pattern: null }
  for (const rule of config.rules) {
    const hit = rule.patterns.find(({ regex }) => regex.test(path))
    if (hit) return { select: rule.select, reason: rule.reason, pattern: hit.pattern }
  }
  return { select: all, reason: 'No rule matches: every scope', pattern: null }
}

/** A list of changed paths: each scope true or false, and one reason per path. */
export function classifyPaths(paths, config) {
  if (!Array.isArray(paths)) throw new Error('Changed paths must be an array')
  const scopes = Object.fromEntries([...config.scopes.keys()].map((name) => [name, false]))
  const reasons = []
  for (const path of paths) {
    const { select, reason } = classifyPath(path, config)
    for (const name of select) scopes[name] = true
    reasons.push(`${reason}: ${JSON.stringify(path)}`)
  }
  return { scopes, reasons: reasons.length ? reasons : ['No changed paths: no scope; repository policy still runs'] }
}

/** The Git range to compare for an event, or null for a push, which is not compared. */
export function comparisonForEvent(name, event) {
  if (name === 'push') return null
  if (name !== 'pull_request') throw new Error(`Unsupported CI event: ${name}`)
  const base = event?.pull_request?.base?.sha
  const head = event?.pull_request?.head?.sha
  if (![base, head].every((sha) => typeof sha === 'string' && /^[0-9a-f]{40}$/.test(sha) && !/^0+$/.test(sha))) {
    throw new Error('A pull_request event must name its base and head commits')
  }
  return `${base}...${head}`
}

export function collectChanges(name, event, config, cwd = process.cwd()) {
  const comparison = comparisonForEvent(name, event)
  if (comparison === null) {
    return {
      scopes: Object.fromEntries([...config.scopes.keys()].map((scope) => [scope, true])),
      reasons: ['Push: every scope runs, whatever it changed']
    }
  }
  // A failed command or an exhausted buffer throws: classification fails and never becomes an empty change set.
  const output = execFileSync('git', ['diff', '--no-renames', '--name-only', '-z', comparison, '--'], {
    cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024
  })
  if (output && !output.endsWith('\0')) throw new Error('Incomplete Git path output')
  return classifyPaths(output ? output.slice(0, -1).split('\0') : [], config)
}

/** Whether a module is the script node was started with. Both sides are resolved: a path through a symbolic link
 * would otherwise compare unequal, and the command would exit 0 having done nothing. */
export function isMain(url) {
  return process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(url))
}

if (isMain(import.meta.url)) {
  try {
    const { GITHUB_EVENT_NAME, GITHUB_EVENT_PATH, GITHUB_OUTPUT, GITHUB_STEP_SUMMARY } = process.env
    if (!GITHUB_EVENT_PATH || !GITHUB_OUTPUT) throw new Error('GITHUB_EVENT_PATH and GITHUB_OUTPUT are required')
    const config = readConfig()
    const result = collectChanges(GITHUB_EVENT_NAME, JSON.parse(readFileSync(GITHUB_EVENT_PATH, 'utf8')), config)
    const lines = Object.entries(result.scopes).map(([name, on]) => `${name}: ${on}`)
    const report = [...lines, ...result.reasons].join('\n')
    console.log(report)
    if (GITHUB_STEP_SUMMARY) appendFileSync(GITHUB_STEP_SUMMARY, `${report}\n`)
    // Outputs are written last, so a failure above leaves none.
    appendFileSync(GITHUB_OUTPUT, Object.entries(result.scopes).map(([name, on]) => `${name}=${on}\n`).join(''))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
