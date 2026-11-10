#!/usr/bin/env node
// The one required check of a routed CI workflow (the github-ops skill, checks-gate.md "Route checks by changed
// paths"). Copied unchanged into a repository's .github/ci/, beside ci-scope.mjs and routing.json.
//
// It reads the results of the jobs its own job needs (NEEDS_JSON: ${{ toJSON(needs) }}) and fails when:
//   - the classification job `changes` did not succeed, or a scope's output is not exactly "true" or "false"
//     (that scope's jobs are then required, as if selected);
//   - a job of a selected scope did not succeed: failure, cancellation, an unexpected skip or no result;
//   - a job of an unselected scope did anything but succeed or be skipped;
//   - any other needed job did not succeed: a job no scope lists always runs and is always required;
//   - a job routing.json lists is not among the needs, which would let it fail unseen.
// A job listed by two scopes is required when either scope is selected.
//
// Usage, in the gate's step: node .github/ci/ci-gate.mjs. Exit 0 when every required job passed, 1 otherwise.
import { isMain, readConfig } from './ci-scope.mjs'

export function gateFailures(needs, config) {
  if (!needs || typeof needs !== 'object' || Array.isArray(needs)) return ['Missing job results']
  const errors = []
  const classified = needs.changes
  if (classified?.result !== 'success') errors.push(`changes: ${classified?.result ?? 'missing'}`)
  const selected = new Map()
  for (const [scope, jobs] of config.scopes) {
    const flag = classified?.outputs?.[scope]
    if (flag !== 'true' && flag !== 'false') errors.push(`Invalid ${scope} classification: ${JSON.stringify(flag ?? null)}`)
    for (const id of jobs) selected.set(id, selected.get(id) === true || flag !== 'false')
  }
  for (const id of selected.keys()) {
    if (!Object.hasOwn(needs, id)) errors.push(`${id}: listed in routing.json but not among the gate's needs`)
  }
  for (const [id, need] of Object.entries(needs)) {
    if (id === 'changes') continue
    const result = need?.result
    const conditional = selected.has(id)
    const required = !conditional || selected.get(id)
    if (result === 'success' || (!required && result === 'skipped')) continue
    errors.push(`${id}: ${result ?? 'missing'} (${conditional ? (required ? 'selected' : 'not selected') : 'always required'})`)
  }
  return errors
}

if (isMain(import.meta.url)) {
  try {
    let needs
    try {
      needs = JSON.parse(process.env.NEEDS_JSON ?? 'null')
    } catch (error) {
      throw new Error(`NEEDS_JSON is not JSON (${error.message})`)
    }
    const errors = gateFailures(needs, readConfig())
    if (errors.length) throw new Error(errors.join('\n'))
    console.log('Every required CI job passed')
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
