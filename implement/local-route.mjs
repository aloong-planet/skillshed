#!/usr/bin/env node
// Whether a test command the CI workflow does not carry runs before a delivery, for the run rules in
// implement/full-verification-gate.md: the project's CI routing is run once on the change from the fork point to
// HEAD, and the command runs unless the routing declares it under a scope that the change does not select.
//
// Usage, from anywhere inside the repository, on a checkout with nothing uncommitted:
//   node local-route.mjs --base <fork point> --router <path> --command <command>
// <path> is the Node script that the CI workflow's `changes` job runs, from the repository root as the workflow
// names it, and a file tracked there; <command> is the test command exactly as it is run.
//
// The routing is run as a GitHub Actions run of a pull request runs it, with one argument added: `node <path>
// --local-command <command>` from the repository root, with GITHUB_EVENT_NAME=pull_request, GITHUB_EVENT_PATH a file
// whose pull_request names the fork point as base.sha and HEAD as head.sha, GITHUB_OUTPUT an empty file, and no
// other GITHUB_ variable. It writes `<scope>=true` or `<scope>=false` for each scope into GITHUB_OUTPUT, and
// `local-scope=<scope>` where it declares the command under that scope. Its own output is printed as it is,
// followed by what it wrote into GITHUB_OUTPUT and the decision.
//
// Exit codes: 0 the command does not run: the routing declares it under a scope and writes `<scope>=false`.
// 1 it runs: the scope is selected, or the routing declares no scope for the command. 2 no decision, so it runs: a
// usage error, uncommitted changes, a fork point that is not a commit, a router that is not a tracked file, the
// routing exiting with another code, killed or not finishing in time, or GITHUB_OUTPUT with a line of another form,
// a key written twice, no line for any scope, or a declared scope with no line.
//
// Tests: local-route.test.mjs next to this file; its header says how to run it.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'

const ROUTING_TIMEOUT_MS = 120_000

class Usage extends Error {}

function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 30 })
  if (r.error) throw r.error
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} exited ${r.status}: ${r.stderr.trim()}`)
  return r.stdout
}

function parseArgs(argv) {
  const flags = { '--base': null, '--router': null, '--command': null }
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]]
    if (!Object.hasOwn(flags, flag) || flags[flag] !== null || value === undefined || value === '') {
      throw new Usage('expected "--base <fork point> --router <path> --command <command>", each once')
    }
    flags[flag] = value
  }
  if (Object.values(flags).includes(null)) throw new Usage('expected "--base <fork point> --router <path> --command <command>", each once')
  return { base: flags['--base'], router: flags['--router'], command: flags['--command'] }
}

/** GITHUB_OUTPUT as the routing wrote it: each scope true or false, and the scope it declares the command under. */
function readOutput(text) {
  if (text !== '' && !text.endsWith('\n')) throw new Error('the routing output does not end with a line break')
  const scopes = new Map()
  let declared = null
  for (const line of text === '' ? [] : text.slice(0, -1).split('\n')) {
    const scope = /^([a-z][a-z0-9_]*)=(true|false)$/.exec(line)
    const local = /^local-scope=([a-z][a-z0-9_]*)$/.exec(line)
    if (scope) {
      if (scopes.has(scope[1])) throw new Error(`the routing wrote ${scope[1]} twice`)
      scopes.set(scope[1], scope[2] === 'true')
    } else if (local) {
      if (declared !== null) throw new Error('the routing wrote local-scope twice')
      declared = local[1]
    } else throw new Error(`the routing wrote a line of another form: ${JSON.stringify(line)}`)
  }
  if (scopes.size === 0) throw new Error('the routing wrote no line for any scope')
  if (declared !== null && !scopes.has(declared)) throw new Error(`the routing declares the command under ${declared}, which has no line`)
  return { scopes, declared }
}

function main(argv) {
  const { base, router, command } = parseArgs(argv)
  const root = realpathSync(git(['rev-parse', '--show-toplevel']).trim())
  const dirty = git(['status', '--porcelain', '--untracked-files=all'], root)
  if (dirty !== '') throw new Error(`the checkout has uncommitted changes, so HEAD is not what is delivered:\n${dirty.trimEnd()}`)
  let baseSha
  try {
    baseSha = git(['rev-parse', '--verify', '--quiet', `${base}^{commit}`], root).trim()
  } catch {
    throw new Error(`the fork point ${JSON.stringify(base)} is not a commit`)
  }
  const head = git(['rev-parse', '--verify', 'HEAD^{commit}'], root).trim()
  let script
  try {
    script = realpathSync(resolve(root, router))
  } catch (e) {
    throw new Error(`the router ${router} cannot be read (${e.code ?? e.message})`)
  }
  git(['--literal-pathspecs', 'ls-files', '--error-unmatch', '--', relative(root, script)], root)

  const dir = mkdtempSync(join(tmpdir(), 'local-route-'))
  try {
    const event = join(dir, 'event.json')
    const output = join(dir, 'output')
    writeFileSync(event, JSON.stringify({ pull_request: { base: { sha: baseSha }, head: { sha: head } } }))
    writeFileSync(output, '')
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GITHUB_')))
    Object.assign(env, { GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: event, GITHUB_OUTPUT: output })
    const r = spawnSync(process.execPath, [script, '--local-command', command], {
      cwd: root, env, encoding: 'utf8', timeout: ROUTING_TIMEOUT_MS, maxBuffer: 1 << 30
    })
    process.stdout.write(r.stdout ?? '')
    process.stderr.write(r.stderr ?? '')
    if (r.error) throw new Error(`the routing did not finish: ${r.error.message}`)
    if (r.status !== 0) throw new Error(`the routing exited ${r.status === null ? `on ${r.signal}` : r.status}`)
    const text = readFileSync(output, 'utf8')
    console.log(`local-route: ${router} wrote into GITHUB_OUTPUT ${JSON.stringify(text)}`)
    const { scopes, declared } = readOutput(text)
    if (declared === null) {
      console.log(`local-route: ${router} declares no scope for ${JSON.stringify(command)}: it runs`)
      return 1
    }
    const on = scopes.get(declared)
    console.log(`local-route: ${router} declares ${JSON.stringify(command)} under ${declared}, and ${declared}=${on}: ${on ? 'it runs' : 'it does not run'}`)
    return on ? 1 : 0
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

try {
  process.exitCode = main(process.argv.slice(2))
} catch (e) {
  console.error(`local-route: ${e instanceof Usage ? 'usage' : 'error'}: ${e.message}; no decision, so the command runs`)
  process.exitCode = 2
}
