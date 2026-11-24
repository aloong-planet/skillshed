// The rules of local-route.mjs: its arguments, how it reads what the routing wrote, and the exit code that follows.
// Run: node --test implement/local-route.test.mjs. Its command line is tested in delivery-flow.test.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decision, parseArgs, readOutput } from './local-route.mjs'

test('the arguments are the fork point, the routing and the command, each given once with a value', () => {
  assert.deepEqual(parseArgs(['--command', 'pnpm smoke', '--base', 'abc', '--router', 'ci.mjs']), { base: 'abc', router: 'ci.mjs', command: 'pnpm smoke' })
  const all = ['--base', 'abc', '--router', 'ci.mjs', '--command', 'pnpm smoke']
  const cases = [
    ['no --base', all.slice(2)],
    ['no --router', [...all.slice(0, 2), ...all.slice(4)]],
    ['no --command', all.slice(0, 4)],
    ['an empty value', [...all.slice(0, 5), '']],
    ['a flag with no value', all.slice(0, 5)],
    ['an unknown flag', [...all, '--scope', 'app']],
    ['a flag twice', [...all, '--command', 'pnpm e2e']]
  ]
  for (const [what, argv] of cases) assert.throws(() => parseArgs(argv), /^Error: expected "--base <fork point> --router <path> --command <command>", each once$/, what)
})

test('the output is a line per scope and at most one declaration of a scope it has a line for', () => {
  assert.deepEqual(readOutput('app=false\nsite=true\nlocal-scope=app\n'), { scopes: new Map([['app', false], ['site', true]]), declared: 'app' })
  assert.deepEqual(readOutput('app=true\n'), { scopes: new Map([['app', true]]), declared: null })
  const cases = [
    ['no line break at the end', 'app=false\nlocal-scope=app', /does not end with a line break/],
    ['nothing written', '', /no line for any scope/],
    ['a declared scope with no line', 'app=true\nlocal-scope=web\n', /under web, which has no line/],
    ['a value other than true or false', 'app=maybe\nlocal-scope=app\n', /a line of another form: "app=maybe"/],
    ['a line of another form', 'app=false\nlocal-scope=app\nnote\n', /a line of another form: "note"/],
    ['a scope twice', 'app=true\napp=false\nlocal-scope=app\n', /wrote app twice/],
    ['two declarations', 'app=false\nsite=true\nlocal-scope=app\nlocal-scope=site\n', /wrote local-scope twice/]
  ]
  for (const [what, text, message] of cases) assert.throws(() => readOutput(text), message, what)
})

test('the command does not run only where the routing declares it under a scope it writes false for', () => {
  const cases = [
    // [the scopes written, the scope declared, the exit code]
    [[['app', false]], null, 1],
    [[['app', true], ['site', false]], 'app', 1],
    [[['app', false], ['site', true]], 'app', 0]
  ]
  for (const [scopes, declared, code] of cases) assert.equal(decision({ scopes: new Map(scopes), declared }), code, `${declared}: ${scopes}`)
})
