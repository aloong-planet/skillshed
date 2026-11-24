// This repository's routing rules (.github/ci/routing.json). Written for the repository from the github-ops
// skill's template; ci-routing.test.mjs beside it tests the fixed behaviour and is not edited.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyPath, readConfig } from './ci-scope.mjs'

const config = readConfig()

test('each pattern of routing.json routes a real path to the scopes written here', () => {
  // [a tracked path, the scopes it must select]. Take each path from the repository's tracked tree, and write
  // the scopes as literals: computing them from routing.json would only repeat it.
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
  // { "<declared command>": [a tracked path, ...] }: for each command "local" declares, one tracked path for each
  // rule that matches a file the command reads, and each file it reads that no rule matches. Write above each list
  // how it was made complete, as what was enumerated (the command's script and every file it opens, the build it
  // starts and that build's inputs), never from memory: a file it reads that does not select its scope leaves the
  // command out of a change that can break it.
  const reads = {}
  assert.deepEqual(Object.keys(reads).sort(), [...config.local.keys()].sort())
  for (const [command, paths] of Object.entries(reads)) {
    const scope = config.local.get(command)
    assert.ok(paths.length > 0, command)
    for (const path of paths) assert.ok(classifyPath(path, config).select.includes(scope), `${command}: ${path}`)
  }
})
