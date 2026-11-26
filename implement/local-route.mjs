#!/usr/bin/env node
// Decide whether a full local test command runs for a clean delivery commit (implement/full-verification-gate.md).
// Without CI path routing, use tracked command/input pairs from the repository root:
//   node local-route.mjs --local-inputs --base <fork point> --command <command>
// Skip a declared command only when its inputs and the selection machinery are unchanged and all unowned changes are inert.
//
// With CI routing, run from anywhere inside the clean checkout:
//   node local-route.mjs --base <fork point> --router <path> --command <command>
// <path> is the routing script, from the repository root, and must be a file tracked there; <command> is passed to
// the routing as given, and the routing compares it with its declarations.
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
// Tests: local-route.test.mjs next to this file for its rules, delivery-flow.test.mjs for its command line; each
// header says how to run it.
import { spawnSync } from 'node:child_process'
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import nativePath, { join, posix, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isInert } from './inert-path.mjs'

const ROUTING_TIMEOUT_MS = 120_000

class Usage extends Error {}

function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, maxBuffer: 1 << 30 })
  if (r.error) throw r.error
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} exited ${r.status}: ${r.stderr.toString().trim()}`)
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(r.stdout)
}

/** Parse an explicit routing mode and its required arguments. */
export function parseArgs(argv) {
  const local = argv[0] === '--local-inputs'
  const flags = local ? { '--base': null, '--command': null } : { '--base': null, '--router': null, '--command': null }
  const usage = local ? 'expected "--local-inputs --base <fork point> --command <command>"' : 'expected "--base <fork point> --router <path> --command <command>", each once'
  for (let i = local ? 1 : 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]]
    if (!Object.hasOwn(flags, flag) || flags[flag] !== null || value === undefined || value === '') {
      throw new Usage(usage)
    }
    flags[flag] = value
  }
  if (Object.values(flags).includes(null)) throw new Usage(usage)
  return { base: flags['--base'], router: flags['--router'], command: flags['--command'] }
}

/** GITHUB_OUTPUT as the routing wrote it: each scope true or false, and the scope it declares the command under. */
export function readOutput(text) {
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

/** The exit code for GITHUB_OUTPUT as readOutput reads it: 0 where it declares a scope it writes false for, else 1. */
export function decision({ scopes, declared }) {
  return declared === null || scopes.get(declared) ? 1 : 0
}

const MANIFEST = 'local-test-inputs.json'

export function readInputs(text, pathSyntax = nativePath) {
  const rows = JSON.parse(text)
  if (!Array.isArray(rows)) throw new Error(`${MANIFEST} must contain an array of command/input pairs`)
  const declarations = new Map()
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== 2) throw new Error(`invalid pair in ${MANIFEST}`)
    const [command, inputs] = row
    if (typeof command !== 'string' || !command.trim() || declarations.has(command)) throw new Error(`invalid or duplicate command in ${MANIFEST}`)
    if (!Array.isArray(inputs) || !inputs.length || new Set(inputs).size !== inputs.length || inputs.some(path =>
      typeof path !== 'string' || path.includes('\0') || pathSyntax.parse(path).root !== '' ||
      (pathSyntax.sep !== '/' && path.includes(pathSyntax.sep)) || path.split('/').some(part => ['', '.', '..'].includes(part))
    )) throw new Error(`invalid or duplicate input for ${JSON.stringify(command)} in ${MANIFEST}`)
    declarations.set(command, inputs)
  }
  return declarations
}

function deletedAlias(parent, removed, expected) {
  if (removed === expected) return true
  if (removed.normalize('NFD').toUpperCase() !== expected.normalize('NFD').toUpperCase()) return false
  const probe = mkdtempSync(join(tmpdir(), 'local-route-name-'))
  try {
    if (lstatSync(probe).dev !== lstatSync(parent).dev) throw new Error('cannot compare deleted filename aliases on the checkout filesystem')
    mkdirSync(join(probe, removed), { recursive: true })
    return lstatSync(join(probe, expected), { throwIfNoEntry: false }) !== undefined
  } finally {
    rmSync(probe, { recursive: true, force: true })
  }
}

function selectorPaths(root, entry, present, deleted) {
  const paths = new Set()
  const componentsOnDisk = new Set()
  const missing = new Set()
  function trace(absolute) {
    let current = nativePath.parse(absolute).root
    const parts = absolute.slice(current.length).split(sep)
    let links = 0
    while (parts.length) {
      current = join(current, parts.shift())
      const stat = lstatSync(current, { throwIfNoEntry: false, bigint: true })
      if (!stat) {
        const name = relative(root, current).split(sep).join('/')
        if (!posix.isAbsolute(name) && name !== '..' && !name.startsWith('../') && !nativePath.isAbsolute(name)) missing.add(name)
        continue
      }
      componentsOnDisk.add(`${stat.dev}:${stat.ino}`)
      if (!stat.isSymbolicLink()) {
        current = realpathSync.native(current)
        continue
      }
      paths.add(relative(root, current).split(sep).join('/'))
      if (++links > 64) throw new Error(`too many symbolic links in ${absolute}`)
      const target = readlinkSync(current)
      const targetRoot = nativePath.parse(target).root
      current = targetRoot || nativePath.dirname(current)
      parts.unshift(...target.slice(targetRoot.length).split(sep))
    }
    paths.add(relative(root, current).split(sep).join('/'))
    return current
  }
  const dir = nativePath.dirname(trace(entry))
  trace(join(dir, 'inert-path.mjs'))
  const gateDir = nativePath.dirname(trace(join(dir, 'change-scope.mjs')))
  for (const file of ['inert-path.mjs', 'vendor/typescript/typescript.cjs']) trace(join(gateDir, file))
  for (const path of present) {
    const stat = lstatSync(join(root, path), { throwIfNoEntry: false, bigint: true })
    if (stat && componentsOnDisk.has(`${stat.dev}:${stat.ino}`)) paths.add(path)
  }
  for (const path of deleted) {
    let parent = nativePath.dirname(join(root, path))
    while (!lstatSync(parent, { throwIfNoEntry: false })?.isDirectory()) parent = nativePath.dirname(parent)
    const canonical = join(realpathSync.native(parent), relative(parent, join(root, path)))
    const name = relative(root, canonical).split(sep).join('/')
    if ([...paths].some(file => file === name || file.startsWith(`${name}/`)) || [...missing].some(file => deletedAlias(parent, name, file))) paths.add(path)
  }
  return paths
}

const selectorDependencies = ['change-scope.mjs', 'inert-path.mjs', 'vendor/typescript/typescript.cjs']

export function localRunReason(declarations, changed, command, scriptPath, resolvedPaths = [], changedContainers = new Set()) {
  const inputs = declarations.get(command)
  if (!inputs) return 'the command has no declaration'
  const skillDir = posix.dirname(scriptPath)
  const machinery = [MANIFEST, scriptPath, ...selectorDependencies.map(file => posix.join(skillDir, file)), ...resolvedPaths]
  const owned = new Set([...declarations.values()].flat())
  for (const path of changed) {
    if (machinery.some(file => file === path || file.startsWith(`${path}/`))) return `selection changed at ${JSON.stringify(path)}`
    if (!owned.has(path) && !isInert(path)) return `no command owns ${JSON.stringify(path)}`
    if (inputs.includes(path) || (changedContainers.has(path) && inputs.some(input => input.startsWith(`${path}/`)))) return `input changed at ${JSON.stringify(path)}`
  }
  return null
}

function main(argv) {
  const { base, router, command } = parseArgs(argv)
  const root = realpathSync(git(['rev-parse', '--show-toplevel']).trim())
  const status = ['status', '--porcelain', '--untracked-files=all', '--ignore-submodules=none']
  const dirty = git(status, root) || git(['submodule', '--quiet', 'foreach', '--recursive', `git ${status.join(' ')}`], root)
  if (dirty !== '') throw new Error(`the checkout has uncommitted changes, so HEAD is not what is delivered:\n${dirty.trimEnd()}`)
  let baseSha
  try {
    baseSha = git(['rev-parse', '--verify', '--quiet', `${base}^{commit}`], root).trim()
  } catch {
    throw new Error(`the fork point ${JSON.stringify(base)} is not a commit`)
  }
  const head = git(['rev-parse', '--verify', 'HEAD^{commit}'], root).trim()
  if (router === undefined) {
    git(['merge-base', '--is-ancestor', baseSha, head], root)
    if (!/^100(?:644|755) blob /.test(git(['ls-tree', head, '--', MANIFEST], root))) throw new Error(`${MANIFEST} is not a regular tracked file`)
    const declarations = readInputs(git(['show', `${head}:${MANIFEST}`], root))
    const entries = git(['ls-tree', '-rdz', head], root).split('\0')
    const directories = new Set(entries.filter(entry => entry.startsWith('040000 tree ')).map(entry => entry.slice(entry.indexOf('\t') + 1)))
    for (const inputs of declarations.values()) {
      for (const input of inputs) {
        const absolute = join(root, input)
        if (!directories.has(input)) {
          try {
            if (!lstatSync(absolute, { throwIfNoEntry: false })?.isDirectory()) continue
          } catch (error) {
            if (error.code === 'ENOTDIR') continue
            throw error
          }
          const entry = git(['--literal-pathspecs', 'ls-tree', 'HEAD', '--', nativePath.basename(absolute)], nativePath.dirname(absolute))
          if (entry.startsWith('160000 commit ')) continue
        }
        throw new Error(`${MANIFEST} names a directory as an input: ${JSON.stringify(input)}`)
      }
    }
    const diff = git(['diff', '--raw', '--no-renames', '--ignore-submodules=none', '-z', baseSha, head, '--'], root).split('\0').slice(0, -1)
    const changed = [], present = [], deleted = [], containers = new Set()
    for (let i = 0; i < diff.length; i += 2) {
      const [before, after] = diff[i].slice(1).split(' ')
      const path = diff[i + 1]
      changed.push(path)
      if (after === '000000') deleted.push(path)
      else present.push(path)
      if ([before, after].some(mode => mode === '120000' || mode === '160000')) containers.add(path)
    }
    const scriptPath = relative(root, realpathSync(fileURLToPath(import.meta.url))).split(sep).join('/')
    const reason = localRunReason(declarations, changed, command, scriptPath, selectorPaths(root, process.argv[1], present, deleted), containers)
    console.log(`local-route: ${MANIFEST}, ${JSON.stringify(command)}: ${reason ?? 'no input changed'}; ${reason === null ? 'it does not run' : 'it runs'}`)
    return reason === null ? 0 : 1
  }
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
    const written = readOutput(text)
    const code = decision(written)
    const { declared } = written
    console.log(declared === null
      ? `local-route: ${router} declares no scope for ${JSON.stringify(command)}: it runs`
      : `local-route: ${router} declares ${JSON.stringify(command)} under ${declared}, and ${declared}=${written.scopes.get(declared)}: ${code === 1 ? 'it runs' : 'it does not run'}`)
    return code
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// Both sides resolved: through a symbolic link they would differ, main would not run, and the exit code 0 would
// read as "does not run"
if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    process.exitCode = main(process.argv.slice(2))
  } catch (e) {
    console.error(`local-route: ${e instanceof Usage ? 'usage' : 'error'}: ${e.message}; no decision, so the command runs`)
    process.exitCode = 2
  }
}
