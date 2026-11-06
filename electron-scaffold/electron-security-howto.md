# Electron 安全清单 · 适配手册

配合 [electron-security.md](./electron-security.md)(清单与判据)使用:那篇回答"要做什么、怎么算做到",本篇回答"**具体怎么改**"。

内容来自一次真实的全条过检实践(只读桌面查看器,contextIsolation+sandbox,渲染本地 markdown)。**每条给:改哪里 → 可抄的实现 → 怎么验 → 踩过的坑**。代码是示意骨架,按项目调整命名。

---

## 通用原则(先读这三条,能省掉大部分返工)

1. **判定层与接线层分开**。凡是"要不要放行"的逻辑写成**纯函数**(无 Electron 依赖),接线层只做挂载。理由:纯函数能单测,而单测是这类问题**唯一可靠的门禁**——官方运行时警告不覆盖导航/新窗口/webview,主流 SAST 已停更且有已证实的漏报分支。
2. **守卫挂在 `app.on('web-contents-created')`,不要挂单个窗口**。挂窗口只能护住你记得挂的那个;挂全局则**新建的任何 webContents 自动受管**。
3. **凡是"逐个地方加一行"的防护,改成包装器**。逐个加必然漏——把注册入口收成一个函数,让"新增的自动受保护"成为默认。

---

## #13 / #14 / #15 · 导航、新窗口、外链(一组,一起改)

**改哪里**:主进程,一个 `security.ts` + 一处 `app.on('web-contents-created')`。

<!-- asset -->
```ts
// ── Decision layer: pure functions, unit-testable ──
export function isAppUrl(url: string, appBase: string | undefined): boolean {
  let u: URL
  try { u = new URL(url) } catch { return false }   // anything unparsable is never allowed
  if (appBase === undefined) return u.protocol === 'app:' || u.protocol === 'file:'  // prod
  try { return u.origin === new URL(appBase).origin } catch { return false }         // dev
}

export function externalOpenTarget(raw: string): string | null {
  let u: URL
  try { u = new URL(raw) } catch { return null }
  return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null  // allow-list
}

// ── Wiring layer ──
export function installNavigationGuards(contents: WebContents, appBase: string | undefined): void {
  const guard = (e: { preventDefault: () => void }, url: string): void => {
    if (isAppUrl(url, appBase)) return
    e.preventDefault()
    const ext = externalOpenTarget(url)
    if (ext) void shell.openExternal(ext)
  }
  contents.on('will-navigate', guard)
  contents.on('will-frame-navigate', (details) => guard(details, details.url))  // different signature!
  contents.setWindowOpenHandler(({ url }) => {
    const ext = externalOpenTarget(url)
    if (ext) setImmediate(() => void shell.openExternal(ext))
    return { action: 'deny' }        // the unconditional deny comes after every branch
  })
  contents.on('will-attach-webview', (e, webPreferences) => {   // #12, preventive
    delete webPreferences.preload
    webPreferences.nodeIntegration = false
    e.preventDefault()
  })
}
```

**怎么验**:单测覆盖绕过向量——origin 前缀相似(`localhost:5173.attacker.com`、`localhost:51730`)、协议不同的同名 host、大小写(`JaVaScRiPt:`)、userinfo(`https://good.com@evil.com`)、不可解析输入。e2e 断言"文档内链接点击后**窗口 URL 不变**"。

**踩过的坑**
- ⚠️ **`will-frame-navigate` 的签名与 `will-navigate` 不同**:它是**单参数事件对象**(`details.url`),不是 `(e, url)`。写成两参数会 typecheck 报一个看不懂的错(`not assignable to type 'zoom-changed'`)。
- ⚠️ **官方清单只提 `will-navigate`,而它只管主框架**(API 文档明载)。子框架要 `will-frame-navigate`,两个都得挂。
- ⚠️ **官方示例自己用了 `startsWith` 比较 URL**,与它在同一页对 `startsWith` 的告诫矛盾。一律 `new URL()` 比 origin。
- ⚠️ **`shell.openExternal` 用协议白名单而非黑名单**。黑名单必漏(`smb:`、`vscode:`、各种自定义 scheme);把未校验内容丢给它 = 让文档内容驱动本机。

---

## #17 · IPC sender 校验

**改哪里**:IPC 注册处,收成一个包装器。

<!-- asset -->
```ts
export function assertTrustedSender(senderUrl: string | undefined, appBase: string | undefined): void {
  if (senderUrl === undefined || !isAppUrl(senderUrl, appBase)) {   // reuse the same criterion
    throw new Error(`untrusted IPC caller: ${senderUrl ?? '(no sender)'}`)
  }
}

function handle<T>(channel: string, fn: (e: IpcMainInvokeEvent, arg: unknown) => T): void {
  ipcMain.handle(channel, (e, arg: unknown) => {
    // Safe only because a packaged build refuses this variable at launch (#21): otherwise a launcher chooses who is trusted
    assertTrustedSender(e.senderFrame?.url, process.env['ELECTRON_RENDERER_URL'])
    return fn(e, arg)
  })
}
// From here on register everything with handle(...), never ipcMain.handle directly
```

**怎么验**:单测三例(本 app 页面放行 / 外部页面抛错 / 无 sender 视为不可信);e2e 跑通全部真实 IPC 链路确认没误伤。

**踩过的坑**
- **与导航守卫复用同一个 `isAppUrl`**,否则两处口径会漂移(改了一处忘另一处,校验就成了摆设)。
- 批量替换后**确认没有漏网的 `ipcMain.handle`**(grep 一遍)。

---

## #5 · 权限

```ts
session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))
session.defaultSession.setPermissionCheckHandler(() => false)
```

本地只读应用直接全 deny,零成本。需要个别权限的应用按 `permission` 分支白名单。

---

## #7 · CSP

**改哪里**:`session.webRequest.onHeadersReceived` 注入(比 `<meta>` 可靠,meta 对部分指令无效)。

<!-- asset -->
```ts
export function cspFor(isDev: boolean): string {
  const base = [
    "default-src 'self'",
    "img-src 'self' data:",      // no http(s): external tracking images in documents never call out
    "font-src 'self' data:",
    "object-src 'none'", "frame-src 'none'", "base-uri 'none'", "form-action 'none'"
  ]
  return isDev
    ? [...base, "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
       "style-src 'self' 'unsafe-inline'", "connect-src 'self' ws: http://localhost:*"].join('; ')
    : [...base, "script-src 'self'", "style-src 'self' 'unsafe-inline'", "connect-src 'self'"].join('; ')
}
```

**怎么验**:单测断言 prod 档无 `unsafe-eval`/无 inline script、`img-src` 不含 http(s)、两档都禁 object/frame/base-uri/form-action。

**踩过的坑**
- ⚠️ **必须两档**。dev 的 HMR 需要 inline script + eval + ws,严格策略下**开发环境直接跑不起来**。放宽只影响 dev,打包产物用严格档。
- `style-src` 的 `'unsafe-inline'` 通常去不掉(多数 UI 框架注入内联样式),这是已知取舍,记进台账。

---

## #19 · Fuses

**改哪里**:打包配置(electron-builder 用 `electronFuses` 段)。

<!-- asset -->
```yaml
electronFuses:
  runAsNode: false                          # forbid ELECTRON_RUN_AS_NODE
  enableNodeCliInspectArguments: false      # forbid --inspect injection
  enableNodeOptionsEnvironmentVariable: false
  onlyLoadAppFromAsar: true
  enableCookieEncryption: true
  enableEmbeddedAsarIntegrityValidation: true
  grantFileProtocolExtraPrivileges: false   # precondition: the code loads no file:// page (see #18)
```

**怎么验**——**这条的判据是读产物,不是看配置**。配置写对不代表生效(版本/平台/配置段位置错都会静默跳过)。写个脚本读二进制的 fuse wire:

<!-- asset -->
```js
const SENTINEL = Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX', 'utf8')  // @electron/fuses sentinel
const NAMES = ['runAsNode','cookieEncryption','nodeOptions','nodeCliInspect',
               'asarIntegrity','onlyLoadAppFromAsar','v8Snapshot','fileProtocolPrivileges',
               'wasmTrapHandlers']            // index 8 exists since Electron 41
const buf = readFileSync('<app>/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework')
const i = buf.indexOf(SENTINEL) + SENTINEL.length
const count = buf[i + 1]
// buf[i+2+k]: 0x31=ENABLED, 0x30=DISABLED, anything else=REMOVED
```

**踩过的坑**
- ⚠️ **fuse wire 会随版本增长**(E41 追加 `wasmTrapHandlers`,长度 8→9)。但 `fuses.json5` 明载"**只追加不重排**",所以**按下标读长期安全**;名称表要跟着补,否则新项回落成 `fuseN`。
- ⚠️ 升级 Electron 后**必须重跑这个校验**——我们就因为想当然说"结构未变"而写错过文档,实测才发现长度变了。
- `grantFileProtocolExtraPrivileges: false` 有前提:确认代码内无 `file://` 页面加载。**主进程内 `net.fetch(file://…)` 读盘是另一条路径,不受该 fuse 约束**——我们实测确认(关闭后 e2e 全绿,含按需读盘用例)。

---

## #18 · file:// → 自定义协议(难度最高,给完整步骤)

**为什么值得做**:`file://` 是 opaque origin,一次注入就能读全盘;自定义协议把可读范围**锁死在渲染产物目录**。附带收益:非 opaque origin 让 localStorage 走快路径(`file://` 下首访可卡数秒,electron#24441)。

### 第 1 步:注册特权(必须在 app ready **之前**,模块顶层)

<!-- asset -->
```ts
protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: {
    standard: true,          // not an opaque origin — the core switch (secure context + storage fast path)
    secure: true,            // equivalent to https
    supportFetchAPI: true    // needed by modulepreload / fetch
  }
}])
```

### 第 2 步:路径解析(纯函数,含穿越防护)

<!-- asset -->
```ts
export const APP_HOST = 'bundle'

export function resolveAppPath(rendererRoot: string, url: string): string | null {
  let u: URL
  try { u = new URL(url) } catch { return null }
  if (u.hostname !== APP_HOST) return null
  let p = decodeURIComponent(u.pathname).replace(/^\/+/, '')   // decoding tolerates non-ASCII characters and spaces
  if (p === '') p = 'index.html'
  const abs = normalize(join(rendererRoot, p))
  const rootNorm = normalize(rendererRoot)
  const rootPrefix = rootNorm.endsWith(sep) ? rootNorm : rootNorm + sep
  if (abs !== rootNorm && !abs.startsWith(rootPrefix)) return null   // traversal guard
  return abs
}
```

### 第 3 步:handler(app ready 后,**建窗之前**)

<!-- asset -->
```ts
export function registerAppProtocol(rendererRoot: string): void {
  protocol.handle('app', async (req) => {
    const abs = resolveAppPath(rendererRoot, req.url)
    if (!abs) return new Response('Not found', { status: 404 })
    try {
      return await net.fetch(pathToFileURL(abs).toString())   // the await is required; see the pitfall
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}
```

### 第 4 步:改加载方式

<!-- asset -->
```ts
// Safe only because a packaged build refuses this variable at launch (#21): otherwise a launcher chooses the page
if (process.env['ELECTRON_RENDERER_URL']) {
  win.loadURL(process.env['ELECTRON_RENDERER_URL'])     // dev still uses http
} else {
  win.loadURL(`app://${APP_HOST}/index.html`)           // prod no longer uses loadFile
}
```

### 第 5 步:同步导航/IPC 的放行判据 ⚠️ **最容易漏的一步**

切协议后 `isAppUrl` 的 prod 分支若还只认 `file:`,**会把自家页面判成不可信 → 导航守卫拦下自己、IPC 全部抛错 → 应用直接瘫痪**。必须同步:

```ts
if (appBase === undefined) return u.protocol === 'app:' || u.protocol === 'file:'
```

**怎么验**:单测覆盖路径解析;**e2e 断言打包版 `win.url()` 以 `app://` 开头**(回退到 `file://` 会静默丢掉保护,只有断言协议才拦得住);跑通全部 IPC 链路确认第 5 步没漏。

**踩过的坑**
- ⚠️ **`net.fetch` 必须 `await`**。某些输入(如路径含 `\0`)会 **reject 而非返 404**,直接 `return promise` 会漏成 unhandled rejection / errored request。
- ⚠️ **明文 `..` 不是主要威胁**:WHATWG URL 解析器在 URL 层就把它钳进根内(结果安全)。显式前缀检查**真正拦住的是编码穿越**(`%2e%2e%2f`)——URL 层不解码,`decodeURIComponent` 之后才变成 `../`。写测试时别把明文 `..` 断言成"应拒绝",那是假断言。
- ⚠️ **handler 必须在建窗前注册**,否则首次 `loadURL('app://…')` 直接失败。
- ⚠️ 读盘交给 `net.fetch(file://)` 可**免维护 MIME 表**(Electron 自动补 Content-Type、处理 404、支持 Range)。自己读文件再猜 MIME 是常见的过度实现。
- 切换后加载时序会变,可能**暴露既有的测试竞态**(我们就有一个用例没等样式表应用就读 CSS 变量,一直潜伏,切协议后才稳定失败)。这类失败要按"测试缺等待"处理,不是产品回归。

---

## #20 · preload 暴露面

判据是**回调不得把 `IpcRendererEvent` 传给渲染层**(它带 `sender`):

<!-- asset -->
```ts
// ✅ Right: drop the event object
const listener = (_e: unknown, payload: unknown): void => cb(checked(payload))
ipcRenderer.on(EVT.x, listener)

// ❌ Wrong: cb receives the event
ipcRenderer.on(EVT.x, cb)
```

暴露的是包装函数而非 `ipcRenderer` 本身。多数项目本来就是对的,**5 分钟核实即可**,不要预设要改。

---

## #21 · 打包版不接受启动入口

**改哪里**:主进程一个纯函数,加一个由主模块第一个 import 的小模块。

<!-- asset -->
```ts
// launch-inputs.ts ── Decision layer: pure function, unit-testable ──
// Whole arguments, compared exactly as given (electron-security.md #21): the settings directory, which runs nothing, and
// the -psn_ token older macOS launches carry, which is not a Chromium switch
const ACCEPTED_ARGUMENT_STARTS = ['--user-data-dir=', '-psn_']
const SEAM_PREFIX = 'MYAPP_'                             // every test seam of this project takes this prefix
const DEV_SERVER_URL = 'ELECTRON_RENDERER_URL'           // whatever the project's template reads in development

// The name only, since a value could hold anything; an argument that is not a switch is not quoted at all
const refusedName = (arg: string): string => {
  const trimmed = arg.trimStart()
  return trimmed.startsWith('-') ? trimmed.split('=')[0] : 'an argument that is not a switch'
}

export function refusedLaunchInputs(args: readonly string[], env: Readonly<Record<string, string | undefined>>): string[] {
  const refusedArguments = args
    .filter((arg) => !ACCEPTED_ARGUMENT_STARTS.some((start) => arg.startsWith(start)))
    .map(refusedName)
  const variables = Object.keys(env).filter((name) => {
    const upper = name.toUpperCase()                     // Windows reads the environment in any case
    return upper === DEV_SERVER_URL || upper.startsWith(SEAM_PREFIX)
  })
  return [...refusedArguments, ...variables]
}

// launch-guard.ts ── Wiring: imported first by the main module ──
import { app } from 'electron'
import { refusedLaunchInputs } from './launch-inputs'

if (app.isPackaged) {
  const refused = refusedLaunchInputs(process.argv.slice(1), process.env)
  if (refused.length > 0) {
    console.error(`MyApp: an installed copy does not start with ${refused.join(', ')}.`)
    app.exit(64)
  }
}
```

**怎么验**:单测覆盖 electron-security.md「固化」节列出的启动入口绕过向量。接线只能实跑打包产物:打包资产每次打包都做(`macos-signing.md` 第 6 节)。

**踩过的坑**
- ⚠️ **必须在主模块加载时同步判定,不得放进 `whenReady`**。实测(前提:Electron 43.2.0、ESM 主模块):模块加载时调试端口还没开、其他进程还没起,`app.exit` 当场结束进程,其后的代码一行不跑;等到 ready,端口已经开了。
- ⚠️ **必须用 `app.isPackaged` 判定,不必为符号链接另设防**:实测(前提同上)经名为 `electron` 的符号链接启动、或直接运行 Helper 可执行文件,它都仍为真,守卫照常拒绝。把可执行文件改名的副本会读成未打包,但签名已失效,不再是 macOS 信任的那个应用(未实测)。
- ⚠️ **`--type=<进程类型>` 到不了这段代码,不得指望它返回 64**:Chromium 在任何 JS 之前读它,加不加守卫都一样崩溃,不开端口、不运行程序(实测,前提同上;没有父进程的管道,子进程起不来)。值为空的 `--type=` 仍进入主进程,按其他开关拒绝。
- ⚠️ **这条实测于 macOS**。新增打包平台时按 electron-security.md「何时过这份清单」重过:Chromium 在各平台认开关的方式不同(第 21 条)。
- 打包版从此不能经调试端口驱动,也不能注入 fixture 数据根:要驱动发布版代码,必须从该 tag 构建后以未打包方式运行。

---

## 收尾:把结果记成台账

清单过完后在项目里留一份 `docs/ops/electron-security.md`(或等价位置),逐条记:**状态 / 位置 / 怎么验**,外加两节:

- **已知取舍**(如 CSP 的 dev 档放宽、`isAppUrl` 同时接受两种协议的理由)
- **待办与归宿**(当下不做的项,写明影响面与建议处理,别留在对话里)

台账的价值在于:下次改主进程配置或升 Electron 时,**有个东西可以对着核**,而不是重新推一遍。
