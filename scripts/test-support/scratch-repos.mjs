// Throwaway directories and git repositories for the command-line cases of the repository's check scripts. Git runs
// with no global or system configuration, so the user's settings change no output. Call `scratchRepos` at the top
// level of a test file: it registers the cleanup that runs once the file's cases end.
import { after } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * `scratch()` makes a directory named after `prefix`, `lock(path)` makes `path` unreadable, both undone when the cases
 * end; `env` is the environment to run git and the script under, and `git(cwd, ...args)` runs git under it, failing
 * the case when git fails, and returns its trimmed output.
 */
export function scratchRepos(prefix) {
  const dirs = []
  const locked = []
  after(() => {
    for (const p of locked) chmodSync(p, 0o755)
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
  })
  const scratch = () => { const d = mkdtempSync(join(tmpdir(), prefix)); dirs.push(d); return d }
  const lock = (path) => { chmodSync(path, 0o000); locked.push(path) }
  const config = join(scratch(), 'gitconfig')
  writeFileSync(config, '')
  const env = { ...process.env, GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid' }
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) delete env[k]
  const git = (cwd, ...args) => {
    const r = spawnSync('git', args, { cwd, env, encoding: 'utf8' })
    assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`)
    return r.stdout.trim()
  }
  return { scratch, lock, env, git }
}

/** Writes each of `files`, a path under `root` mapped to its text, or deletes it where the text is null */
export function write(root, files) {
  for (const [path, text] of Object.entries(files)) {
    if (text === null) { unlinkSync(join(root, path)); continue }
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
}
