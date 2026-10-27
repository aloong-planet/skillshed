#!/usr/bin/env node
// Change scope for the full verification gateway in implement/full-verification-gate.md: whether any file changed
// since a baseline commit in a way that can change what the gateway's test commands do.
//
// Usage, from anywhere inside the repository:
//   node change-scope.mjs --base <commit>
// Compares the working directory with <commit> file by file: tracked files as they are now, untracked files that
// are not ignored, and files staged with `git add -f` although ignored. Prints one line per file that differs,
// with the verdict the steps below give it (inert, same, or changed with the reason), then the overall verdict.
//
// Exit codes: 0 no file is changed (verdict skip); 1 some file is changed (verdict run); 2 usage or git error.
//
// How a file is judged, in order:
//   1. Renames are compared as a deletion plus an addition (--no-renames): a file moved into an inert path
//      is still a file deleted outside it.
//   2. Under docs/ (whole path segments: docs/a.json, not docs-old/a.json) or ending in .md, in any case: inert.
//   3. Added, deleted, a mode change, a symlink or a submodule: changed.
//   4. JS/TS (JS_TS below): both versions are parsed with the project's TypeScript, resolved from the working
//      directory, and printed without comments. TypeScript not resolvable, a parse error in either version, a
//      changed shebang, or different printed code: changed. Otherwise same.
//   5. Python (PYTHON below): both versions are parsed with the ast module of python3, or of the interpreter
//      that CHANGE_SCOPE_PYTHON names (a project's virtual environment, for syntax newer than the python3 on
//      PATH), and their dumps compared. Comments are not in the tree; docstrings are, so a changed docstring is
//      changed. The interpreter failing to run, a syntax error in either version, or different dumps: changed.
//      Otherwise same.
//   6. Any other type: changed.
//
// A comment is compared as a comment whatever reads it, so the changes below come out same although they can
// change what a test command does. The gateway never skips lint or typecheck, and reusing a result requires both
// to pass, so the comments those tools read are checked; the rest are left to the pull request's CI:
//   - Comments other tools read: a test runner's environment (@vitest-environment), bundler annotations
//     (#__PURE__, webpackChunkName), coverage ignores (c8 ignore, # pragma: no cover).
//   - A file a test reads as text, where comments and spacing are content.
//   - Positions: code moved to other lines, which a test asserting stack-trace line numbers would notice;
//     function source read at run time (Function.prototype.toString) includes comments.
// Nor does it see ignored files that are not staged, or content as it is on disk rather than as `git add`
// stores it (after line-ending normalization and clean filters).
//
// Tests: change-scope.test.mjs next to this file; its header says how to run it.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

// The inert files of implement/full-verification-gate.md; docs/ holds the documentation and process records of the
// layout /repo-scaffold sets up. implement/SKILL.md forbids the tests that the gateway's test commands run from
// reading them, and the gateway never skips a command that reads one.
const isInert = (path) => path === 'docs' || path.startsWith('docs/') || extname(path).toLowerCase() === '.md'

const JS_TS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts'])
const PYTHON = new Set(['.py', '.pyi'])

// Reads [old, new] pairs of base64-encoded sources as JSON from stdin and prints, as JSON, 'same' or the reason
// for each. Sources are parsed as bytes so that an encoding declaration is honoured.
const PY_COMPARE = `
import ast, base64, json, sys
def verdict(pair):
    trees = []
    for which, src in zip(('old', 'new'), pair):
        try:
            trees.append(ast.dump(ast.parse(base64.b64decode(src))))
        except (SyntaxError, ValueError):
            return 'syntax error in the %s version' % which
    return 'same' if trees[0] == trees[1] else 'code changed'
print(json.dumps([verdict(p) for p in json.load(sys.stdin)]))
`

class Usage extends Error {}

function git(args, { env, input, buffer, cwd } = {}) {
  const r = spawnSync('git', args, { cwd, env: env ?? process.env, input, maxBuffer: 1 << 30, encoding: buffer ? null : 'utf8' })
  if (r.error) throw r.error
  if (r.status !== 0) {
    const err = buffer ? r.stderr.toString() : r.stderr
    throw new Error(`git ${args.join(' ')} exited ${r.status}: ${String(err).trim()}`)
  }
  return r.stdout
}

/** The working directory as a tree, holding the files listed under Usage above */
function snapshot() {
  const top = git(['rev-parse', '--show-toplevel']).trim()
  // Read from the real index before GIT_INDEX_FILE points elsewhere: additions staged with `git add -f`,
  // which `add -A` skips because an ignore rule matches them
  const forced = git(['diff', '--cached', '--name-only', '-z', '--diff-filter=A', 'HEAD'], { cwd: top })
    .split('\0').filter((p) => p && existsSync(join(top, p)))
  const dir = mkdtempSync(join(tmpdir(), 'change-scope-'))
  try {
    const env = { ...process.env, GIT_INDEX_FILE: join(dir, 'index') }
    // Seeded from HEAD so tracked files that match an ignore rule stay in the tree; an empty index would
    // leave them out and they would show up as deleted.
    git(['read-tree', 'HEAD'], { env, cwd: top })
    git(['add', '-A'], { env, cwd: top })
    if (forced.length) git(['add', '-f', '--pathspec-from-file=-', '--pathspec-file-nul'], { env, cwd: top, input: forced.join('\0') })
    return git(['write-tree'], { env, cwd: top }).trim()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** `git diff --raw -z` entries: { oldMode, newMode, oldSha, newSha, status, path } */
function changes(base, tree) {
  const out = git(['diff', '--raw', '-z', '--no-renames', '--no-abbrev', '--no-ext-diff', base, tree])
  const parts = out.split('\0')
  const list = []
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const meta = parts[i]
    if (!meta) break
    const [oldMode, newMode, oldSha, newSha, status] = meta.replace(/^:/, '').split(' ')
    list.push({ oldMode, newMode, oldSha, newSha, status, path: parts[i + 1] })
  }
  return list
}

/** Blob contents by sha, read in one `git cat-file --batch` */
function blobs(shas) {
  const out = new Map()
  if (shas.length === 0) return out
  const buf = git(['cat-file', '--batch'], { input: shas.join('\n') + '\n', buffer: true })
  let at = 0
  while (at < buf.length) {
    const nl = buf.indexOf(10, at)
    const [sha, type, size] = buf.subarray(at, nl).toString().split(' ')
    if (type === 'missing') throw new Error(`git object missing: ${sha}`)
    const n = Number(size)
    out.set(sha, buf.subarray(nl + 1, nl + 1 + n))
    at = nl + 1 + n + 1
  }
  return out
}

function loadTypeScript() {
  try {
    const req = createRequire(pathToFileURL(join(process.cwd(), 'noop.js')))
    return req(req.resolve('typescript'))
  } catch {
    return null
  }
}

function scriptKind(ts, path) {
  const e = extname(path)
  if (e === '.tsx') return ts.ScriptKind.TSX
  if (e === '.jsx') return ts.ScriptKind.JSX
  if (e === '.ts' || e === '.mts' || e === '.cts') return ts.ScriptKind.TS
  return ts.ScriptKind.JS
}

function parse(ts, path, text) {
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, scriptKind(ts, path))
  if (!Array.isArray(sf.parseDiagnostics)) throw new Error('this TypeScript does not expose parse diagnostics')
  return sf.parseDiagnostics.length ? null : sf
}

function compareJsTs(ts, path, before, after) {
  if (!ts) return { verdict: 'changed', reason: 'TypeScript is not resolvable from the working directory' }
  if (ts.getShebang(before) !== ts.getShebang(after)) return { verdict: 'changed', reason: 'shebang changed' }
  const a = parse(ts, path, before)
  const b = parse(ts, path, after)
  if (!a || !b) return { verdict: 'changed', reason: `parse error in the ${a ? 'new' : 'old'} version` }
  const printer = ts.createPrinter({ removeComments: true })
  return printer.printFile(a) === printer.printFile(b) ? { verdict: 'same' } : { verdict: 'changed', reason: 'code changed' }
}

/** One verdict per [before, after] pair of Python sources, compared in a single interpreter run */
function comparePython(pairs) {
  if (pairs.length === 0) return []
  const python = process.env.CHANGE_SCOPE_PYTHON || 'python3'
  const input = JSON.stringify(pairs.map((p) => p.map((buf) => buf.toString('base64'))))
  const r = spawnSync(python, ['-c', PY_COMPARE], { input, encoding: 'utf8', maxBuffer: 1 << 30 })
  let verdicts = null
  try { verdicts = JSON.parse(r.stdout) } catch {}
  if (r.error || r.status !== 0 || !Array.isArray(verdicts) || verdicts.length !== pairs.length) {
    const why = r.error ? r.error.message : `exited ${r.status}: ${String(r.stderr).trim().split('\n').pop()}`
    return pairs.map(() => ({ verdict: 'changed', reason: `${python} cannot compare: ${why}` }))
  }
  return verdicts.map((v) => (v === 'same' ? { verdict: 'same' } : { verdict: 'changed', reason: v }))
}

function main(argv) {
  if (argv.length !== 2 || argv[0] !== '--base') throw new Usage('expected "--base <commit>"')
  const base = argv[1]
  git(['rev-parse', '--verify', '--quiet', `${base}^{tree}`])
  const list = changes(base, snapshot())
  const compared = []
  const results = list.map((c) => {
    const { path } = c
    if (isInert(path)) return { path, verdict: 'inert' }
    if (c.status === 'A') return { path, verdict: 'changed', reason: 'added' }
    if (c.status === 'D') return { path, verdict: 'changed', reason: 'deleted' }
    if (c.oldMode !== c.newMode) return { path, verdict: 'changed', reason: `mode ${c.oldMode} -> ${c.newMode}` }
    if (c.newMode === '120000' || c.newMode === '160000') return { path, verdict: 'changed', reason: c.newMode === '120000' ? 'symlink' : 'submodule' }
    const ext = extname(path)
    if (!JS_TS.has(ext) && !PYTHON.has(ext)) return { path, verdict: 'changed', reason: 'no syntax tree comparison for this type' }
    const r = { path }
    compared.push({ r, ext, oldSha: c.oldSha, newSha: c.newSha })
    return r
  })

  const contents = blobs([...new Set(compared.flatMap((c) => [c.oldSha, c.newSha]))])
  const ts = compared.some((c) => JS_TS.has(c.ext)) ? loadTypeScript() : null
  const python = []
  for (const { r, ext, oldSha, newSha } of compared) {
    const before = contents.get(oldSha)
    const after = contents.get(newSha)
    if (before.includes(0) || after.includes(0)) Object.assign(r, { verdict: 'changed', reason: 'binary content' })
    else if (JS_TS.has(ext)) Object.assign(r, compareJsTs(ts, r.path, before.toString('utf8'), after.toString('utf8')))
    else python.push({ r, pair: [before, after] })
  }
  comparePython(python.map((p) => p.pair)).forEach((v, i) => Object.assign(python[i].r, v))

  for (const r of results) console.log(`${r.verdict.padEnd(7)} ${r.path}${r.reason ? `  (${r.reason})` : ''}`)
  const code = results.some((r) => r.verdict === 'changed') ? 1 : 0
  console.log(`verdict: ${code ? 'run' : 'skip'} (${results.length} ${results.length === 1 ? 'file differs' : 'files differ'} from the base)`)
  return code
}

try {
  process.exitCode = main(process.argv.slice(2))
} catch (e) {
  console.error(e instanceof Usage ? `usage: ${e.message}` : `error: ${e.message}`)
  process.exitCode = 2
}
