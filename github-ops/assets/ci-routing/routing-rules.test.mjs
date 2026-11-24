// This repository's routing rules (.github/ci/routing.json). Written for the repository from the github-ops
// skill's template; ci-routing.test.mjs beside it tests the fixed behaviour and is not edited.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { classifyPath, localReadFailures, readConfig } from './ci-scope.mjs'

const config = readConfig()

test('each pattern of routing.json routes a real path to the scopes written here', () => {
  // [a tracked path, the scopes it must select], written as the github-ops skill's checks-gate.md, "Write
  // routing.json", says.
  const cases = [
    ['package.json', ['app']],
    ['pnpm-lock.yaml', ['app']],
    ['README.md', []],
    ['README.en.md', []],
    ['LICENSE', []],
    ['AGENTS.md', []],
    ['CLAUDE.md', []],
    ['docs/guide.md', []],
    ['src/index.ts', ['app']],
    ['test/index.test.ts', ['app']],
    ['tsconfig.json', ['app']]
  ]
  const hit = new Set()
  for (const [path, expected] of cases) {
    const { select, pattern } = classifyPath(path, config)
    assert.deepEqual(select, expected, path)
    if (pattern !== null) hit.add(pattern)
  }
  // Every pattern needs a case of its own; a pattern no case reaches is a rule nothing here checks
  const patterns = config.rules.flatMap((rule) => rule.patterns.map(({ pattern }) => pattern))
  assert.ok(patterns.length > 0)
  assert.deepEqual(patterns.filter((pattern) => !hit.has(pattern)), [])
})

test('each command that "local" declares reads only files that select its scope', () => {
  // Write { "<declared command>": ["<pattern>", ...] } for each command "local" declares: which patterns, and the
  // note above each list, as the github-ops skill's checks-gate.md, "Write routing.json", says.
  const reads = {}
  const tracked = execFileSync('git', ['ls-files', '-z', '--full-name', '--', ':/'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  assert.deepEqual(localReadFailures(config, reads, tracked.split('\0').filter((path) => path !== '')), [])
})
