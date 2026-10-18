#!/usr/bin/env node
// 主题变量探针 —— 执行 SKILL.md 第 5 节的判据:按维度实测,不数定义处数。
//
// 用法:
//   node theme-vars.mjs <主题CSS路径> [--dim 名称=选择器模板:取值,取值,…] [--dark-media]
//
// 例(三套配色 × 明暗,配色经 html 上的属性选择器,明暗经 prefers-color-scheme):
//   node theme-vars.mjs <主题CSS> \
//        --dim theme='html[data-theme="{v}"]':purple,blue,amber --dark-media
//
//   属性名与取值照项目实际写(上面的 data-theme / purple 只是示例)。默认取值若在 CSS 里靠
//   :root 而非属性选择器给出,写成 `-` 即可:
//        --dim theme='html[data-theme="{v}"]':-,blue,amber
//
// **为什么必须用浏览器**:判据要的是「某个主题态下这个变量最终解析成什么」。这牵涉级联、
// 特异性、继承与 media query 求值。手写解析器能对付受限子集,但一旦 CSS 里出现选择器组、
// 省略末尾分号、非明暗的 @media 或 var() 引用就会静默算错——而"算错"与"算对"在输出上
// 长得一模一样。所以这里只用浏览器,缺依赖时明确报错,不退回近似实现。
//   (jsdom 不行:它没有 matchMedia,也不对 @media 规则求值,深色态无从模拟。已实测。)

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

function usage(msg) {
  if (msg) console.error(`\n错误:${msg}\n`)
  console.error(`用法: node theme-vars.mjs <主题CSS路径> [--dim 名称='选择器{v}':取值,…] [--dark-media]

  --dim         一个由选择器承载的维度。{v} 是取值占位符;取值写 - 表示"该取值不加选择器"
                (默认值常常直接写在 :root 里)。可重复,表示多个正交维度。
  --dark-media  额外加一个由 prefers-color-scheme 承载的明暗维度。

至少要给一个维度,否则没有可比对的状态。`)
  process.exit(2)
}

function parseArgs(argv) {
  const [cssPath, ...rest] = argv
  if (!cssPath) usage('缺少主题 CSS 路径')
  const dims = []
  let darkMedia = false
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--dark-media') darkMedia = true
    else if (rest[i] === '--dim') {
      const spec = rest[++i]
      if (!spec) usage('--dim 后面缺少定义')
      const m = spec.match(/^([\w-]+)=(.+):([^:]*)$/)
      if (!m) usage(`--dim 格式应为 名称='选择器{v}':取值,取值 —— 收到 ${spec}`)
      const [, name, selectorTpl, values] = m
      const sel = selectorTpl.replace(/^['"]|['"]$/g, '')
      if (!sel.includes('{v}')) usage(`维度 ${name} 的选择器里没有 {v} 占位符`)
      dims.push({ name, selectorTpl: sel, values: values.split(',').map((v) => v.trim()) })
    } else usage(`无法识别的参数 ${rest[i]}`)
  }
  if (!dims.length && !darkMedia) usage('至少要给一个维度(--dim 或 --dark-media)')
  return { cssPath, dims, darkMedia }
}

/**
 * 从**运行目录**解析 playwright,而不是从本脚本所在目录。
 *
 * 这个脚本住在全局 skill 目录里,裸 `import('playwright')` 会沿着 ~/.claude/skills/… 向上找
 * node_modules——那里当然没有,于是在一个明明装了 playwright 的项目里也会报"找不到"。
 * 用 cwd 建 require 才能看见项目自己的依赖。(实测踩过。)
 */
async function loadChromium() {
  const requireFromCwd = createRequire(pathToFileURL(join(process.cwd(), 'noop.js')))
  for (const pkg of ['playwright', '@playwright/test', 'playwright-core']) {
    try {
      const m = await import(pathToFileURL(requireFromCwd.resolve(pkg)).href)
      // playwright 是 CJS,经 import() 取到的命名导出落在 default 上而非顶层
      const chromium = m.chromium ?? m.default?.chromium
      if (chromium) return chromium
    } catch {
      // 换下一个候选
    }
  }
  console.error(`
本检查需要 playwright,当前项目里找不到。

  pnpm add -D @playwright/test     (或 npm i -D playwright)

不提供"退而求其次"的实现:级联、继承与 media query 的求值只有浏览器算得准,
手写近似在遇到选择器组、省略分号、非明暗 @media 或 var() 引用时会**静默算错**,
而算错与算对在输出上无法分辨。宁可不给答案,也不给一个看起来像答案的东西。`)
  process.exit(3)
}

/** 维度取值的笛卡儿积 → 每个主题态 */
function enumerateStates(dims, darkMedia) {
  let states = [{ label: [], selectors: [], dark: false }]
  for (const d of dims) {
    states = states.flatMap((s) =>
      d.values.map((v) => ({
        ...s,
        label: [...s.label, `${d.name}=${v}`],
        selectors: v === '-' ? s.selectors : [...s.selectors, d.selectorTpl.replace('{v}', v)]
      }))
    )
  }
  if (darkMedia) {
    states = states.flatMap((s) => [
      { ...s, label: [...s.label, 'appearance=light'], dark: false },
      { ...s, label: [...s.label, 'appearance=dark'], dark: true }
    ])
  }
  return states.map((s) => ({ ...s, key: s.label.join(' ') }))
}

/**
 * 把选择器还原成根元素上的属性。只支持 html[attr="value"] / [attr="value"] 这一类——
 * 主题维度几乎总是这么承载的;遇到别的形态明确报错,不猜。
 */
function attrsFromSelector(sel) {
  const out = []
  const rx = /\[([\w-]+)\s*=\s*['"]?([^\]'"]+)['"]?\]/g
  let m
  while ((m = rx.exec(sel))) out.push([m[1], m[2]])
  if (!out.length) {
    console.error(`\n错误:无法从选择器 ${sel} 取出属性。`)
    console.error('本脚本只支持由根元素属性承载的维度(形如 html[data-x="v"])。')
    process.exit(4)
  }
  return out
}

const { cssPath, dims, darkMedia } = parseArgs(process.argv.slice(2))
const css = readFileSync(cssPath, 'utf8')
const chromium = await loadChromium()

/**
 * 先用本机已装的 Chrome,再退到 playwright 自带的 chromium。
 * 装了 playwright 不等于下载过它的浏览器(`npx playwright install` 是单独一步),而开发机上
 * 通常本来就有 Chrome——先试它,能让这个检查在"依赖装了但浏览器没下"的常见状态下照样可用。
 */
async function launchBrowser() {
  const attempts = [
    { opts: { channel: 'chrome' }, what: '本机 Chrome' },
    { opts: {}, what: 'playwright 自带的 chromium' }
  ]
  const failures = []
  for (const { opts, what } of attempts) {
    try {
      return await chromium.launch(opts)
    } catch (e) {
      failures.push(`  ${what}:${String(e.message).split('\n')[0]}`)
    }
  }
  console.error(`\n无法启动浏览器,两种方式都失败:\n${failures.join('\n')}\n`)
  console.error('装一个即可:系统 Chrome,或 `npx playwright install chromium`。')
  process.exit(3)
}

const browser = await launchBrowser()
const page = await browser.newPage()
await page.setContent(`<style>${css}</style>`)

const states = enumerateStates(dims, darkMedia)
const readings = {}
for (const st of states) {
  await page.emulateMedia({ colorScheme: st.dark ? 'dark' : 'light' })
  await page.evaluate((sels) => {
    const root = document.documentElement
    for (const a of [...root.attributes]) if (a.name !== 'lang') root.removeAttribute(a.name)
    for (const [k, v] of sels) root.setAttribute(k, v)
  }, st.selectors.flatMap(attrsFromSelector))
  readings[st.key] = await page.evaluate(() => {
    // 只收主题块声明的变量:选择器组里至少有一个选择器不含组合子,且落在根元素上。
    // 「以 :root 开头」是不够的——`:root[data-x] .child` 也以它开头,但那是组件级变量。
    // 选择器组(如 `:root, .theme-light`)先在顶层逗号处拆开、逐个判:整串一起判时,逗号后的空格
    // 被当成后代组合子,整块主题变量一个也收不到,而结果照样是"齐整"。
    const declared = new Set()
    /** 选择器组在顶层逗号处拆开;方括号、圆括号与引号里的逗号不拆 */
    const split = (list) => {
      const out = []
      let cur = ''
      let depth = 0
      let quote = null
      for (const c of list) {
        if (quote) { if (c === quote) quote = null }
        else if (c === '"' || c === "'") quote = c
        else if (c === '(' || c === '[') depth++
        else if (c === ')' || c === ']') depth--
        else if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue }
        cur += c
      }
      out.push(cur.trim())
      return out
    }
    const isThemeBlock = (s) => {
      // ① 含组合子 → 变量作用在后代上,不是主题块(属性选择器与函数式伪类括号里的内容先剔掉再判)
      let bare = s.replace(/\[[^\]]*\]/g, '')
      while (/\([^()]*\)/.test(bare)) bare = bare.replace(/\([^()]*\)/g, '')
      if (/[\s>+~]/.test(bare)) return false
      // ② 根本不指向根元素 → 组件级变量。**这道守卫不可省**:少了它,像 `.app` 这种
      //    永远不命中根元素的选择器,其变量会被收进名单却在每个态都读不出值,报成
      //    "所有态都缺定义"——一条纯粹由工具制造的假警报。
      return /^(:root|html)\b/.test(s)
    }
    const collect = (rules) => {
      for (const r of Array.from(rules)) {
        if (r.constructor.name === 'CSSMediaRule') collect(r.cssRules)
        else if (r.style && r.selectorText) {
          if (!split(r.selectorText).some(isThemeBlock)) continue
          // ③ 是主题块,但当前态不匹配 → 名字要收(别的取值下它有值),值留给命中的那一态
          for (const p of Array.from(r.style)) if (p.startsWith('--')) declared.add(p)
        }
      }
    }
    for (const sh of Array.from(document.styleSheets)) {
      try {
        collect(sh.cssRules)
      } catch {
        // 跨源样式表读不到;本项目的样式表都是内联的,不会走到这里
      }
    }
    const cs = getComputedStyle(document.documentElement)
    return Object.fromEntries([...declared].map((n) => [n, cs.getPropertyValue(n).trim()]))
  })
}
await browser.close()

const names = [...new Set(Object.values(readings).flatMap((r) => Object.keys(r)))].sort()
const dimNames = [...dims.map((d) => d.name), ...(darkMedia ? ['appearance'] : [])]

/**
 * 某变量沿某维度的变化情况。固定其余维度,看该维度的各取值给出几个不同的值。
 *
 * 返回 'all'(每个取值都不同) / 'none'(全同) / 'partial'(有的同有的不同)。
 *
 * **'partial' 是这里最要紧的一档**,也是最初版本看不见的:它只问「是否存在不同」,于是
 * 一个本该逐 theme 取值的变量,漏定义了其中一个 theme(因而继承了别处的值)之后,
 * 剩下的差异照样让它判成"随该维度变化"——检不出。分成三档才能把这种半漏报出来。
 */
function variationAlong(name, dim) {
  const dimSize = dim === 'appearance' ? 2 : dims.find((d) => d.name === dim).values.length
  const groups = new Map()
  for (const st of states) {
    const others = st.label.filter((l) => !l.startsWith(`${dim}=`)).join(' ')
    if (!groups.has(others)) groups.set(others, new Set())
    groups.get(others).add(readings[st.key][name])
  }
  const sizes = [...groups.values()].map((s) => s.size)
  if (sizes.every((n) => n === 1)) return 'none'
  if (sizes.every((n) => n === dimSize)) return 'all'
  return 'partial'
}

const rows = names.map((name) => {
  const missing = states.filter((st) => !readings[st.key][name]).map((st) => st.key)
  const along = Object.fromEntries(dimNames.map((d) => [d, variationAlong(name, d)]))
  return {
    name,
    missing,
    varies: dimNames.filter((d) => along[d] === 'all'),
    partial: dimNames.filter((d) => along[d] === 'partial')
  }
})

const unresolved = rows.filter((r) => r.missing.length)
const partial = rows.filter((r) => !r.missing.length && r.partial.length)
const byVariation = new Map()
for (const r of rows.filter((r) => !r.missing.length && !r.partial.length)) {
  const k = r.varies.length ? r.varies.join(' × ') : '(不随任何维度变化)'
  if (!byVariation.has(k)) byVariation.set(k, [])
  byVariation.get(k).push(r.name)
}

console.log(`主题态 ${states.length} 个 · 变量 ${names.length} 个 · 维度 ${dimNames.join(', ')}\n`)
for (const [k, list] of [...byVariation].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`随「${k}」变化 —— ${list.length} 个`)
  console.log(`  ${list.join(', ')}\n`)
}
if (partial.length) {
  console.log(`✗ 有 ${partial.length} 个变量「变了一半」—— 几乎一定是漏定义:`)
  for (const r of partial) {
    console.log(`  ${r.name}  在维度 ${r.partial.join(', ')} 上,只有部分取值给出了不同的值`)
  }
  console.log('\n这一档最值得先看:某个取值下漏了定义,它会继承别处的值,于是"看起来还是在变",')
  console.log('只是少变了一处。它不会表现为缺值,所以只查"解析得出值"是看不见的。\n')
}
if (unresolved.length) {
  console.log(`✗ 有 ${unresolved.length} 个变量在部分主题态下解析不出值:`)
  for (const r of unresolved) console.log(`  ${r.name}  缺: ${r.missing.join(' / ')}`)
  console.log('')
}
if (!names.length) {
  // 零个变量时下面两类问题自然都是零,但那是什么都没核,不是核过了齐整
  console.log('✗ 一个主题变量都没收到 —— 检查范围为空,不能当作齐整。')
  console.log('  核对 CSS 路径;主题变量必须声明在指向根元素(:root 或 html)、不含组合子的选择器上。\n')
}
if (names.length && !partial.length && !unresolved.length) {
  console.log('✓ 每个变量都在每个主题态下解析出了值,且沿各维度的变化是齐整的。')
  console.log('  最后一步只能人来做:对照上面的分组,确认每个变量的变化维度**与设计意图一致**。')
  console.log('  工具能判"变得齐不齐",判不了"本来该不该变"。')
}
process.exit(!names.length || unresolved.length || partial.length ? 1 : 0)
