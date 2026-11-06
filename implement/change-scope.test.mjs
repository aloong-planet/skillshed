// Tests for change-scope.mjs. Each case builds a throwaway git repository, changes its working directory
// and runs the script as the gateway does. Needs python3 on PATH:
//   node --test implement/change-scope.test.mjs
// The repositories hold no typescript package unless a case writes one, so every JS/TS case also checks
// that the script needs none from the project.
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'change-scope.mjs')
// Without python3 every Python case would come out changed for the wrong reason: fail, never skip
if (spawnSync('python3', ['--version']).status !== 0) throw new Error('python3 is not runnable')

const dirs = []
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }) })

function write(dir, files) {
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, p)), { recursive: true })
    writeFileSync(join(dir, p), c)
  }
}

/** A repository whose first commit holds `files`; `force` are added despite the ignore rules */
function repo(files, { force = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'change-scope-test-'))
  dirs.push(dir)
  const g = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' })
  g('init', '-q')
  g('config', 'user.email', 'test@example.com')
  g('config', 'user.name', 'test')
  g('config', 'commit.gpgsign', 'false')
  write(dir, { '.gitignore': 'node_modules\nignored/\n', ...files, ...force })
  g('add', '-A')
  for (const p of Object.keys(force)) g('add', '-f', p)
  g('commit', '-qm', 'base', '--no-verify')
  return { dir, g, base: g('rev-parse', 'HEAD').trim() }
}

function run(r, args, { sub = '', env = {} } = {}) {
  const out = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: join(r.dir, sub), encoding: 'utf8', env: { ...process.env, ...env } })
  return { code: out.status, out: out.stdout, err: out.stderr }
}
const scope = (r, opts) => run(r, ['--base', r.base], opts)

/** The verdict printed for `path`, or undefined when the path is not listed */
function verdictOf(out, path) {
  const l = out.split('\n').find((x) => x.split(/\s+/)[1] === path)
  return l?.split(/\s+/)[0]
}

const TS = [
  'export function f(a: number): number {',
  '  // add one',
  '  return a + 1 // trailing',
  '}',
  'export const s = `// not a comment`',
  'export const v = /*#__PURE__*/ make()',
  'declare function make(): number',
  ''
].join('\n')
const PY = [
  '"""Module doc."""',
  'import os  # stdlib',
  '',
  '',
  'def f(a):',
  '    """Add one."""',
  '    # add one',
  '    return a + 1',
  ''
].join('\n')
const BASE = { 'src/a.ts': TS, 'src/b.ts': 'export const b = 1\n', 'src/m.py': PY, 'docs/a.md': '# A\n', 'docs-old/a.json': '{}\n' }
const edit = (r, path, fn) => write(r.dir, { [path]: fn(path.endsWith('.py') ? PY : TS) })

test('nothing changed: skip', () => {
  const r = repo(BASE)
  const { code, out } = scope(r)
  assert.equal(code, 0, out)
  assert.match(out, /verdict: skip \(0 files differ from the base\)/)
})

test('changes under docs/ and to Markdown files anywhere, tracked or new: skip', () => {
  const r = repo({ ...BASE, 'README.md': '# R\n', 'src/notes/HOWTO.MD': '# H\n' })
  write(r.dir, {
    'docs/a.md': '# A, revised\n',
    'docs/new.json': '{}\n',
    'README.md': '# R, revised\n',
    'src/notes/HOWTO.MD': '# H, revised\n',
    'packages/x/CHANGELOG.md': '# New\n'
  })
  const { code, out } = scope(r)
  assert.equal(code, 0, out)
  for (const p of ['docs/a.md', 'docs/new.json', 'README.md', 'src/notes/HOWTO.MD', 'packages/x/CHANGELOG.md']) {
    assert.equal(verdictOf(out, p), 'inert', p)
  }
})

test('a directory that only begins like docs/ is not inert', () => {
  const r = repo(BASE)
  write(r.dir, { 'docs-old/a.json': '{ "a": 1 }\n' })
  const { code, out } = scope(r)
  assert.equal(code, 1, out)
  assert.equal(verdictOf(out, 'docs-old/a.json'), 'changed')
})

test('MDX is code, not Markdown', () => {
  const r = repo({ ...BASE, 'site/page.mdx': '# Page\n' })
  write(r.dir, { 'site/page.mdx': '# Page, revised\n' })
  const { code, out } = scope(r)
  assert.equal(code, 1, out)
  assert.equal(verdictOf(out, 'site/page.mdx'), 'changed')
})

test('a file moved into an inert path is a deletion outside it', () => {
  const r = repo(BASE)
  renameSync(join(r.dir, 'src/b.ts'), join(r.dir, 'docs/b.ts'))
  const { code, out } = scope(r)
  assert.equal(code, 1, out)
  assert.match(out, /changed src\/b\.ts {2}\(deleted\)/)
  assert.equal(verdictOf(out, 'docs/b.ts'), 'inert')
})

test('a new untracked file is changed; an ignored one is not listed', () => {
  const r = repo(BASE)
  write(r.dir, { 'src/new.ts': '// only a comment\n', 'ignored/x.ts': 'export const x = 1\n' })
  const { code, out } = scope(r)
  assert.equal(code, 1, out)
  assert.match(out, /changed src\/new\.ts {2}\(added\)/)
  assert.equal(verdictOf(out, 'ignored/x.ts'), undefined)
})

test('an ignored file staged with git add -f is compared', () => {
  const r = repo(BASE)
  write(r.dir, { 'ignored/new.ts': 'export const n = 1\n' })
  r.g('add', '-f', 'ignored/new.ts')
  const { code, out } = scope(r)
  assert.equal(code, 1, out)
  assert.match(out, /changed ignored\/new\.ts {2}\(added\)/)
})

test('an unchanged tracked file that matches an ignore rule is not reported as deleted', () => {
  const r = repo(BASE, { force: { 'ignored/keep.ts': 'export const k = 1\n' } })
  const { code, out } = scope(r)
  assert.equal(code, 0, out)
  assert.match(out, /0 files differ/)
})

test('a deleted file: run', () => {
  const r = repo(BASE)
  unlinkSync(join(r.dir, 'src/b.ts'))
  const { code, out } = scope(r)
  assert.equal(code, 1, out)
  assert.match(out, /changed src\/b\.ts {2}\(deleted\)/)
})

test('a mode change: run', () => {
  const r = repo(BASE)
  chmodSync(join(r.dir, 'src/b.ts'), 0o755)
  const { code, out } = scope(r)
  assert.equal(code, 1, out)
  assert.match(out, /changed src\/b\.ts {2}\(mode 100644 -> 100755\)/)
})

test('a submodule entry whose commit is not in the repository: run, not a git error', () => {
  const r = repo(BASE)
  r.g('update-index', '--add', '--cacheinfo', `160000,${'a'.repeat(40)},vendor/lib`)
  r.g('commit', '-qm', 'submodule', '--no-verify')
  const base = r.g('rev-parse', 'HEAD').trim()
  const { code, out, err } = run(r, ['--base', base])
  assert.equal(code, 1, `${out}${err}`)
  assert.equal(verdictOf(out, 'vendor/lib'), 'changed')
})

test('JS/TS: changed comments of every kind, including ones other tools read, are same', () => {
  const r = repo(BASE)
  edit(r, 'src/a.ts', (t) => [
    '// @vitest-environment jsdom',
    '/** @param a the number */',
    t.replace('add one', 'increment by one').replace(' // trailing', '').replace('/*#__PURE__*/ ', '')
  ].join('\n'))
  const { code, out } = scope(r)
  assert.equal(code, 0, out)
  assert.equal(verdictOf(out, 'src/a.ts'), 'same')
})

test('JS/TS: formatting only is same', () => {
  const r = repo(BASE)
  edit(r, 'src/a.ts', (t) => t.replace('return a + 1', 'return a+1;').replace('\n}', '\n\n}'))
  const { code, out } = scope(r)
  assert.equal(code, 0, out)
  assert.equal(verdictOf(out, 'src/a.ts'), 'same')
})

test('JS/TS: changed code: run', () => {
  const r = repo(BASE)
  edit(r, 'src/a.ts', (t) => t.replace('a + 1', 'a + 2'))
  const { code, out } = scope(r)
  assert.equal(code, 1, out)
  assert.match(out, /changed src\/a\.ts {2}\(code changed\)/)
})

test('JS/TS: comment-like text inside a template literal is code', () => {
  const r = repo(BASE)
  edit(r, 'src/a.ts', (t) => t.replace('// not a comment', '// still code'))
  const { code, out } = scope(r)
  assert.equal(code, 1, out)
  assert.match(out, /changed src\/a\.ts {2}\(code changed\)/)
})

const JSX = 'export const C = () => <div>{/* a */}<p>// shown</p></div>\n'

test('JS/TS: a comment in JSX is same', () => {
  const r = repo({ ...BASE, 'src/c.tsx': JSX })
  write(r.dir, { 'src/c.tsx': JSX.replace('/* a */', '/* b */') })
  const { code, out } = scope(r)
  assert.equal(code, 0, out)
  assert.equal(verdictOf(out, 'src/c.tsx'), 'same')
})

test('JS/TS: JSX text that looks like a comment is code', () => {
  const r = repo({ ...BASE, 'src/c.tsx': JSX })
  write(r.dir, { 'src/c.tsx': JSX.replace('// shown', '// other') })
  const { code, out } = scope(r)
  assert.equal(code, 1, out)
  assert.match(out, /changed src\/c\.tsx {2}\(code changed\)/)
})

test('JS/TS: a parse error: run', () => {
  const r = repo(BASE)
  edit(r, 'src/a.ts', (t) => `${t}export const broken = (\n`)
  const { code, out } = scope(r)
  assert.equal(code, 1, out)
  assert.match(out, /parse error in the new version/)
})

test('JS/TS: a changed shebang: run', () => {
  const r = repo({ ...BASE, 'bin/cli.mjs': '#!/usr/bin/env node\nconsole.log(1)\n' })
  write(r.dir, { 'bin/cli.mjs': '#!/usr/bin/env -S node --no-warnings\nconsole.log(1)\n' })
  const { code, out } = scope(r)
  assert.equal(code, 1, out)
  assert.match(out, /changed bin\/cli\.mjs {2}\(shebang changed\)/)
})

// The shape of the typescript package in its 7.x releases: its main entry exports the version and no compiler API
const TS_WITHOUT_API = {
  'node_modules/typescript/package.json': JSON.stringify({ name: 'typescript', version: '7.0.2', type: 'module', exports: { '.': './lib/version.cjs' } }),
  'node_modules/typescript/lib/version.cjs': 'const { version } = require("../package.json");\nexports.version = version;\nexports.versionMajorMinor = "7.0";\n'
}

test('JS/TS: a project whose typescript package has no compiler API still has comments compared', () => {
  const r = repo(BASE)
  write(r.dir, TS_WITHOUT_API)
  edit(r, 'src/a.ts', (t) => t.replace('add one', 'increment by one'))
  const { code, out, err } = scope(r)
  assert.equal(code, 0, `${out}${err}`)
  assert.equal(verdictOf(out, 'src/a.ts'), 'same')
})

test('JS/TS: run from a subdirectory, a file is still compared', () => {
  const r = repo(BASE)
  edit(r, 'src/a.ts', (t) => t.replace('add one', 'increment by one'))
  const { code, out } = scope(r, { sub: 'src' })
  assert.equal(code, 0, out)
  assert.equal(verdictOf(out, 'src/a.ts'), 'same')
})

test('Python: changed comments and formatting are same', () => {
  const r = repo(BASE)
  edit(r, 'src/m.py', (t) => t.replace('# add one', '# increment by one').replace('  # stdlib', '').replace('a + 1', 'a+1').replace('\n\n\n', '\n\n'))
  const { code, out } = scope(r)
  assert.equal(code, 0, out)
  assert.equal(verdictOf(out, 'src/m.py'), 'same')
})

test('Python: a changed docstring is changed', () => {
  const r = repo(BASE)
  edit(r, 'src/m.py', (t) => t.replace('Add one.', 'Add one to a.'))
  const { code, out } = scope(r)
  assert.equal(code, 1, out)
  assert.match(out, /changed src\/m\.py {2}\(code changed\)/)
})

test('Python: changed code: run', () => {
  const r = repo(BASE)
  edit(r, 'src/m.py', (t) => t.replace('a + 1', 'a + 2'))
  const { code, out } = scope(r)
  assert.equal(code, 1, out)
  assert.match(out, /changed src\/m\.py {2}\(code changed\)/)
})

test('Python: a syntax error: run', () => {
  const r = repo(BASE)
  edit(r, 'src/m.py', (t) => `${t}def broken(:\n`)
  const { code, out } = scope(r)
  assert.equal(code, 1, out)
  assert.match(out, /changed src\/m\.py {2}\(syntax error in the new version\)/)
})

test('Python: an interpreter that cannot run makes the comparison changed', () => {
  const r = repo(BASE)
  edit(r, 'src/m.py', (t) => t.replace('# add one', '# increment by one'))
  const { code, out } = scope(r, { env: { CHANGE_SCOPE_PYTHON: join(r.dir, 'no-such-python') } })
  assert.equal(code, 1, out)
  assert.match(out, /changed src\/m\.py {2}\(.*no-such-python cannot compare: /)
})

test('other types, even with only a comment or spacing changed: run', () => {
  const r = repo({ ...BASE, 'config.yml': '# one\nkey: 1\n', 'package.json': '{ "name": "x" }\n' })
  write(r.dir, { 'config.yml': '# two\nkey: 1\n', 'package.json': '{"name": "x"}\n' })
  const { code, out } = scope(r)
  assert.equal(code, 1, out)
  assert.match(out, /changed config\.yml {2}\(no syntax tree comparison for this type\)/)
  assert.equal(verdictOf(out, 'package.json'), 'changed')
})

test('one changed file decides the verdict over same ones', () => {
  const r = repo(BASE)
  edit(r, 'src/a.ts', (t) => t.replace('add one', 'increment by one'))
  edit(r, 'src/m.py', (t) => t.replace('a + 1', 'a + 2'))
  const { code, out } = scope(r)
  assert.equal(code, 1, out)
  assert.equal(verdictOf(out, 'src/a.ts'), 'same')
  assert.match(out, /verdict: run \(2 files differ from the base\)/)
})

test('an unknown base: error', () => {
  const r = repo(BASE)
  const { code, err } = run(r, ['--base', 'no-such-ref'])
  assert.equal(code, 2)
  assert.match(err, /^error: /)
})

test('a missing base or an extra argument: usage error', () => {
  const r = repo(BASE)
  for (const args of [[], ['--base'], ['--base', r.base, 'extra'], ['base', r.base]]) {
    const { code, err } = run(r, args)
    assert.equal(code, 2, args.join(' '))
    assert.match(err, /^usage: /)
  }
})

test('outside a git repository: error', () => {
  const dir = mkdtempSync(join(tmpdir(), 'change-scope-test-'))
  dirs.push(dir)
  const out = spawnSync(process.execPath, [SCRIPT, '--base', 'HEAD'], { cwd: dir, encoding: 'utf8' })
  assert.equal(out.status, 2)
  assert.match(out.stderr, /^error: /)
})
