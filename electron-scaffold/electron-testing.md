# Electron 本地自动测试基建(macOS)

> 配套资产:[assets/quiet-electron.sh](./assets/quiet-electron.sh) · [assets/smoke.sh.template](./assets/smoke.sh.template) · [assets/ci-electron.yml](./assets/ci-electron.yml)
> 全部结论来自真实项目的实测回填,每条主张后附"为什么信"。
> **初始化时装,不要等痛点爆发**——下面每一节都是痛点爆发→排查→误诊→返工之后才补上的,
> 其中仅"冒烟误红"一项就烧掉三轮排查加一次写进 master 的错误注释。

## 1. 主进程 seam(初始化就写进 main,~20 行)

测试基建的一切前提是主进程留好注入口。四件,全部初始化时写:

<!-- asset -->
```ts
// ① Quiet test mode (injected by e2e/smoke; production never sets this variable): no window shown, no foreground steal
const QUIET = process.platform === 'darwin' && Boolean(process.env['MYAPP_NO_FOREGROUND'])

// ② Single-instance lock: the second instance has initialised nothing, so exit at once is safest (quit runs before-quit and may hang).
//    app.exit does not stop the rest of this tick's synchronous code, so keep the boolean and guard again in whenReady
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) app.exit(0)
// … app.whenReady().then(() => { if (!gotTheLock) return; /* initialise */ })

// ③ Apply quiet mode when creating the window
new BrowserWindow({
  show: !QUIET,
  webPreferences: { /* …, */ backgroundThrottling: !QUIET }
})

// ④ Dev orphan guard: when electron-vite exits (Ctrl+C) it does not kill electron, and Electron swallows SIGINT
//    — so poll whether the parent is alive and exit once the parent (vite) is gone. Dev only.
if (process.env['ELECTRON_RENDERER_URL']) {
  const vitePid = process.ppid
  const t = setInterval(() => {
    try { process.kill(vitePid, 0) } catch { clearInterval(t); app.quit() }
  }, 1000)
}
```

外加**数据根注入口**(app 读外部数据才需要):真实路径不写死,经 env 可换根——
`const home = process.env['MYAPP_HOME_OVERRIDE'] ?? homedir()`。e2e 靠它喂 fixture,
否则用例结果取决于跑测试的人机器上有多少真实数据(自己机器绿、CI 红)。

**为什么静音是"不显示窗口"而不是 activation policy**:实测 `setActivationPolicy('accessory')`
下仍 12/15 tick 抢前台,加 `dock.hide()` 后 13/15——抢台来自 `BrowserWindow` 默认 show 的
makeKey+激活,与 Dock 无关。隐藏窗口后 A/B:基线 32 tick 抢台 → 0(78 采样点全程前台未变)。
关 `backgroundThrottling` 是配套:隐藏窗口的定时器会降频,不关会给测试引入新的时序 flake。

**验证**:`lsappinfo info -only name $(lsappinfo front)` 循环采样,跑测试期间前台 app 不该变。

## 2. Dock 零闪现:LSUIElement 副本

现象:测试期间 Dock 图标持续出现/消失抖动。机理:图标在 Electron **原生引导期**就按
Info.plist(`LSUIElement=false`)注册,主进程 JS 的 `dock.hide()` 几百毫秒后才执行,
永远追不上——实测静音模式下原件照样注册 `ApplicationType=Foreground`。修法只能在 plist 层:

<!-- example -->
```bash
cp ~/.claude/skills/electron-scaffold/assets/quiet-electron.sh <项目>/scripts/
```

脚本做的事:APFS `cp -Rc` 克隆 dist 副本(写时复制,秒级近零磁盘)→ 副本 plist 写
`LSUIElement=true` → adhoc 重签(改 plist 破签名封条,arm64 要求有效签名)。幂等且
Electron 版本感知;**原件一字不动**,正常 dev 与打包版 Dock 行为不变。

**接线要给两个 env,缺一漏风**:

| 变量 | 谁认 | 依据 |
|---|---|---|
| `ELECTRON_OVERRIDE_DIST_PATH` | `electron/index.js`(Playwright 的 `_electron.launch` 走这里) | electron 包原生机制 |
| `ELECTRON_EXEC_PATH` | **electron-vite**(`getElectronPath()` 自读 path.txt 拼路径,不经 `electron/index.js`) | 读源码坐实,实测于 electron-vite 2.3 |

⚠️ 后者是**版本敏感事实**,electron-vite 改解析方式不会通知你——耐久守卫不是记住这条,
是 smoke 模板里的「重定向失效自诊断」(隔离侧没动而真实 userData 动了 → 报专错)。

**验证**(探针先自证非空过,再看结论):
1. 测前等 LaunchServices 清零(`lsappinfo find bundleid=<id>` 为空;注册项在 kill 后有约 1s 残留,不等就会拿旧实例污染对照);
2. 原件启动 → 应见 `ApplicationType=Foreground`(证明探针看得见问题);
3. 副本启动 → 只见 `UIElement`,零 `Foreground`。

## 3. smoke 冒烟骨架

<!-- example -->
```bash
cp ~/.claude/skills/electron-scaffold/assets/smoke.sh.template <项目>/scripts/smoke.sh
# 填顶部「项目填空」块:就绪产物 / 进程模式 / 真实 userData 对照,共三处 + 命名
```

模板骨架 = 启动 → 等就绪产物 → 抓主进程错误 → 杀父验孤儿防护。五条设计决定,每条都有事故背书:

- **轮询到条件成立,绝不固定 sleep**。误红比慢更贵:门禁抖过几次,"重跑一下就好"就成了习惯,它也就不再是门禁。超时 = 实测量级 × 10,并把实际耗时打进成功输出(变慢看得见)。
- **就绪信号 = app 自产的原子写产物**,不是"进程存在"。进程存在是恒真量级的判据——**闸门信号必须验主人**:锁被占时新实例 `app.exit(0)` 静默假死、日志零错误,而 pgrep 被旧实例满足,表现为"就绪超时"。误诊三轮的判别性证据:把超时调到实测量级的 **30 倍照样红**——"慢"即出局,剩下的只有"死"。
- **双隔离**:userData 隔离(`pnpm dev -- --user-data-dir=<mktemp>`,单实例锁按 userData 界定作用域,与用户开着的实例互不抢锁)+ 进程组隔离(`set -m` 后探测/击杀全按 pgid 只认自己这棵树,永不误杀用户实例)。
- **失败自己留证**:die() 把完整日志拷到带时间戳的文件。不赌调用方不 grep——三轮误诊全因失败输出被调用方过滤、无证可查。
- **进程匹配按 `ps -o comm=` 过滤**:`pgrep -f` 会被别人 argv 里的路径字符串误报(实测:验证脚本自己的后台 pkill 就中招)。

**验证(硬性)**:装完把每条失败分支**强制触发**一遍——留着占位值跑(未填空守卫)、等待期杀掉本组 electron(死亡分支)、把就绪产物路径改坏(超时 + 重定向自诊断),各分支要红得出来、留得下证;从未红过的门禁与没有门禁在证据上等价。注意:**开着另一个实例不是失败分支**——共存是特性,只该打一行提示。

## 4. e2e 纪律(Playwright `_electron`)

- **userData 每例隔离**:`launch` 传 `--user-data-dir=<临时目录>`(Electron 认这个 Chromium 开关,实测含锁与缓存全部隔离)。旧数据迁移场景靠预置 fixture 到该目录覆盖。
- **fixture 数据根必传,做成必填参数**:launch 助手的 `home` 用必填签名,靠 typecheck 拦漏传——但**前提是 e2e 目录真的在 tsconfig 里**。agentshed 教训:两个 tsconfig 都不含 `e2e/`,Playwright 运行时只剥类型不检查,整个目录从未被 typecheck,必填守卫形同虚设还自以为有;纳入后既有代码 0 错误,成本为零。**初始化时就把 `e2e/**/*.ts` 和 `playwright.config.ts` 写进 tsconfig include。**
- **`workers: 1`(保守默认)**:userData 已按例隔离时,锁本不互撞;串行防的是多 Electron 实例并行的资源抖动放大时序 flake。若有任何用例共享 userData 或读真实数据根,则**必须**串行。
- **globalSetup 接静音**:darwin 上跑 `quiet-electron.sh` 并设 `ELECTRON_OVERRIDE_DIST_PATH`(worker 继承 env);launch 的 env 里注入 `<APP>_NO_FOREGROUND`。Linux/CI 无 Dock,守卫住 platform 即天然空操作。
- **关闭 app 必须有时限,超时杀整个进程组**:Playwright 的 `close()` 无上限地等进程退出及其 stdio
  管道关闭,而 CPU 负载下 Electron 在 app 自身退出之后的原生退出可拖到数分钟,用例于是超时在清理阶段。
  所有 launch 处必须经同一个关闭助手:超过时限即杀 app 的进程组(Playwright 以独立进程组启动 app,其
  pid 即组号)——只杀主进程不够,组内其余进程仍占着管道——并给该用例加注、打一行警告。代价是挂住的退出
  不再让用例失败、只剩那行警告,所以未加负载的运行里出现该警告必须当缺陷查。**判据**:e2e 代码里没有
  绕过关闭助手的 `close()` 调用。
- **隐藏窗口的有效性边界**:DOM 文本/布局几何/计算样式/`toBeVisible` 都走 layout 与 CDP,与窗口是否上屏无关(`toBeVisible` 在 CI 的 xvfb 里从来就是 DOM 级语义)。**例外是真焦点语义**——`document.hasFocus()`、autofocus、`:focus` 在隐藏窗口下不同;写输入框类用例时要么经 CDP 显式聚焦,要么该用例单独去掉静音变量,不许沉默依赖窗口聚焦。

## 5. 换测试运行体制后的有效性验证法

隐藏窗口、换 dist 副本、改并发……凡是动了**测试的运行体制**,"全绿"只证明断言还在通过,
不证明断言还有区分力。验证法:**在新体制下重放若干已知可红的变异**(拿此前变异检验用过的现成变异,
各断言类型至少一个),仍红才算体制切换无损。agentshed 切隐藏窗口时
重放了文本断言类与状态 pill 类各一个,均红。
配套的 A/B 度量习惯:改前先把问题量化成可采样的数字(如前台采样 32 tick),改后同一探针
归零——探针本身要先在"坏"状态下证明看得见问题,否则零是空过。

## 6. CI(GitHub Actions)

<!-- example -->
```bash
cp ~/.claude/skills/electron-scaffold/assets/ci-electron.yml <项目>/.github/workflows/ci.yml
# 填一处:checks job 里项目自有的额外检查;分支名留 master/main 中实际用的
```

模板里四个"抄错才知道"的点,已按事故写好:

| 要点 | 不这么写会怎样 |
|---|---|
| 系统库交给 `pnpm exec playwright install-deps chromium` | 手写 apt 包名随 Ubuntu 版本漂移(`libasound2` → `libasound2t64`),runner 升级日全红 |
| `xvfb-run -a` | 无显示服务 Electron 起不来;`-a` 自动挑空闲 display |
| `if: failure()` 上传 playwright-report/test-results | 不传则 CI 红了只剩 exit code,无从查起 |
| ubuntu 而非 macos runner | 私有仓库 macOS 按 10 倍计费;e2e 断言平台无关,macOS 专属面归发版流程 |

smoke **不进 CI**:macOS 本地专用(BSD stat、进程路径),价值在开发机真实数据形态,容器里等于 e2e 劣化版。
把 workflow 设为必需检查 → **github-ops 的 [checks-gate.md](../github-ops/checks-gate.md)**(单一出处,此处不复制;要点:GitHub 侧三项缺一不生效,且门禁必须证明"能红")。

## 7. 主进程读文件的耗时只认 Electron 下的实测

同一段读文件代码,在 Electron 主进程里可比 Node 下慢一个数量级:实测每个 64 KB 流分块比 Node 多约 3 ms
(前提:Electron 43、macOS、文件已在页缓存;机理未剖析,同进程的 worker 线程同样慢)。vitest 这类跑在
node 下的工具看不到这个差。

- 关于主进程读文件耗时的数字,必须用 Electron 二进制跑同一份代码测得;Node 下的数字必须标注为「Node 下
  实测」,不得用来判断主进程。主进程有批量读文件路径(扫描、建索引)的项目,必须有一个把被测代码打包后
  交给 Electron 二进制运行、并能切到 Node 做对照的基准脚本。
- 流式读取的分块大小必须显式设定,不得依赖运行时默认值,测试也必须显式传入分块大小。取值必须按整轮冷扫描
  选,不得只按最大的那个文件选:大文件随分块增大一直变快,而每次读取都要付一个分块大小的缓冲,大量小文件
  组成的整轮扫描在某个中间值最快。

**判据**:报出的每个主进程读文件耗时,都写得出它是在哪个二进制下测的。
