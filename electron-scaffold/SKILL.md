---
name: electron-scaffold
description: "Electron(electron-builder)桌面项目该一次性铺好的基础设施清单,覆盖安全基线、打包产物治理、macOS 系统权限、分发渠道命名、签名与公证、本地自动化测试基建。装一次以后自动生效的东西,不是日常操作。"
when_to_use: "初始化 Electron + electron-builder 项目时逐项过一遍。此外安全基线须在这些时刻重过:改动主进程的窗口/会话/协议/IPC 配置、升级 Electron 主版本、新增渲染外部内容的能力。macOS 权限弹不出来、app 不出现在系统隐私列表、首次启动被 Gatekeeper 拦下,或签名公证失败(DMG 被拒、提示「已损坏」「无法验证开发者」、`no usable signature`、票据缺失)时也查本 skill。日常打包发版不走这里——见 /github-ops。"
---

# Electron 新项目基础设施(scaffold)

初始化 Electron(electron-builder)新项目时**一次性**铺的基础设施。这些是"建项目时装一次、以后自动生效"的东西,不是日常操作。日常发版/打包规范另见 `/github-ops` skill。

**先看项目能力声明的 `client-framework`**(读写规则见全局指令的「项目能力声明」节):值为 `"electron"` 时本 skill 适用;为其他登记的取值时本 skill 不适用,产出里写明「按项目能力声明,client-framework 为 <值>,electron-scaffold 不适用」后停止,不得照本 skill 铺任何东西;缺失或取值未登记 → 未确认,按全局指令停下来问。

> 用法:新建 Electron 项目做初始化时,过一遍下面的清单,把适用项装进去。每项都有:何时需要、装什么、怎么接、验证。

---

## 0. 安全清单(必过,单独成篇)

**何时需要**:每个 Electron 项目都要;除初始化外,以下时机**重过一遍**——改主进程窗口/会话/协议/IPC 配置、升级 Electron 主版本、引入"渲染他人内容"的能力(markdown/HTML/外部数据)。

**装什么**:两份配套文件——
- **[electron-security.md](./electron-security.md)**:清单本体。20 条的判据与难度、哪些默认已安全、哪些必须主动做;**版本(#16)只检查不强制**,并列出"版本影响哪些检查项"供旧版项目按此降级台账。
- **[electron-security-howto.md](./electron-security-howto.md)**:适配手册。每条**具体怎么改**——可抄的实现骨架、怎么验、踩过的坑;第 18 条(自定义协议,难度最高)给完整五步。

**为什么单独一篇且必须人工过**:这类问题**没有可靠的自动化门禁**——官方运行时 Security Warnings 只覆盖 8 条,源码注释明标第 12~14 条(导航/新窗口/webview)"未实现";Electronegativity 已停止维护,且在"只写了 `setWindowOpenHandler`、没写 `will-navigate`"时静默放行,恰是最常见的漏法。

**怎么接**:安全判定层写成**纯函数 + 单测**(导航放行、外链白名单、IPC sender、CSP 策略、协议路径解析),接线层做成 e2e 断言。清单文件末尾给了必测的绕过向量与参考实现位置。

**验证**:单测覆盖全部绕过向量;e2e 断言打包版 URL 协议 + "文档内链接点击后窗口 URL 不变";打包后跑 fuses 校验脚本(读产物二进制——配置写对≠生效)。

---

## 1. 打包产物版本保留(自动清理旧 release)

**何时需要**:`electron-builder.yml` 的 `directories.output` 用了 `release/${version}`(每版一个子目录)。electron-builder **无内置版本保留配置**(实测 26.x options schema 无 keep/retain/prune),只写不删 → 版本无限累积吃磁盘(实际见过 21 版 8.3G)。

**装什么**:把本 skill 的 `assets/clean-old-releases.cjs` 复制到项目 `build/` 目录(与 `buildResources: build` 同处)。脚本通用无项目硬编码,靠 `BuildResult.outDir` 定位版本根、按 semver 排序、保留最近 N 个(默认 5,`KEEP_RELEASES` env 可覆盖)。

<!-- example -->
```bash
cp ~/.claude/skills/electron-scaffold/assets/clean-old-releases.cjs <项目>/build/
```

**怎么接**:`electron-builder.yml` 顶层加 afterAllArtifactBuild 钩子:
```yaml
afterAllArtifactBuild: build/clean-old-releases.cjs
```

**⚠️ 关键坑**:
- **`.cjs` 后缀必需**——若 `package.json` 是 `"type": "module"`,普通 `.js` 会被当 ESM,脚本里的 `require`/`module.exports` 报 `require is not defined in ES module scope`。electron-builder 用 dynamic `import()` 加载钩子,`.cjs` 对"手动 node 运行"和"electron-builder 加载"都兼容。
- 钩子路径写成 `build/xxx.cjs`(相对项目根),electron-builder 会 resolve 到工作区内;不能指向工作区外。

**验证**(装完跑一遍):
<!-- example -->
```bash
# 手动清一次现有产物 + 验证幂等(再跑应输出 "nothing to clean",不误删保留项)
node build/clean-old-releases.cjs        # 首次:打印删除清单
node build/clean-old-releases.cjs        # 再跑:nothing to clean(版本数 ≤ N)
KEEP_RELEASES=3 node build/clean-old-releases.cjs   # 参数化生效验证(干跑前先确认清单)
```
成功标准:版本目录裁到最近 N 个;非版本散文件(latest-mac.yml / *.blockmap)不被碰;再跑幂等不越删越少。

**设计要点**(脚本已实现,复用时无需改):
- 严格 semver 正则识别版本目录 → **绝不误删**非版本内容。
- semver 数值比较(非字符串)→ 正确处理 `0.10 vs 0.9`。
- 删除失败只 `console.warn` 不抛 → **清理不拖垮打包**(附加动作失败不该让发版失败)。
- CI 上 fresh runner 每次只有 1 版,钩子无害(版本数 ≤ N 不删)。
- **不静默**:删了哪些会打印清单。

**注意**:`release/`(或你的 output 根)应在 `.gitignore` —— 清理的是本地产物,不影响 git、不影响云端 GitHub Release。

---

## 2. macOS 系统权限(TCC)的正确接法

**何时需要**:app 要用屏幕录制、摄像头、麦克风、本地网络、辅助功能等 macOS 隐私权限。

### 先分清:三类权限,处理方式完全不同

**别把它们当成一套东西**——这是最容易一开始就走错的地方。

| 权限 | Electron 有请求 API? | 状态查询可靠? | 做法 |
|---|---|---|---|
| 摄像头 / 麦克风 | ✅ `askForMediaAccess()` | ✅ 有真正的 `not-determined` | **直接用 API**,不需要下面那套 |
| 辅助功能 | ✅ `isTrustedAccessibilityClient(true)` 自带 prompt 参数 | ✅ | 用它自带的 prompt |
| **屏幕录制** | ❌ `askForMediaAccess` **明确不支持 `screen`** | ❌ 从未询问过也返回 `denied` | **触发式登记**(见下) |
| 本地网络(macOS 15+) | ❌ 无 | ❌ 完全没有查询 API | 只能靠实际访问触发,失败无感知 |
| 完全磁盘访问 | ❌ 无 | ❌ | 无法程序触发,只能引导手动添加 |

**只有下半张表的权限需要本节这套做法。** 摄像头/麦克风有正经 API,套用下面的写法是画蛇添足。

### 屏幕录制这类"无请求 API"权限:触发式登记

四条系统事实(实测于 macOS 26,均已验证):

1. **`getMediaAccessStatus('screen')` 对从未询问过的 app 返回 `'denied'`,不是 `'not-determined'`** —— 底层是 `CGPreflightScreenCaptureAccess` 的布尔,**没有第三态**。所以"非 granted"既可能是没问过、也可能是问过被拒,**单看它分不出来**。
2. **macOS 只在 app 真的尝试受保护操作时,才把它登记进「系统设置 → 隐私与安全性」的对应列表**;纯查询不触发登记。
3. **授权框由另一个进程异步绘制**。`CGRequestScreenCaptureAccess`(以及 `desktopCapturer.getSources`)**在任何情况下都立即返回**,从不阻塞等待用户;app 退出了那个框还挂在屏幕上。
4. **授权状态在进程内缓存**,用户点了允许也要**重启 app** 才读得到新值(electron#36722)。

**装什么 / 怎么接**——核心是**把"询问"和"使用"在时间上分开**:

<!-- asset -->
```ts
/** Answers only "is it enough"; does not split by status: anything other than granted is treated the same */
export function needsScreenPermission(platform: string, status: string): boolean {
  if (platform !== 'darwin') return false
  return status !== 'granted'
}

/** Trigger the system prompt once at startup (after the main window is shown). Fire-and-forget. */
primeScreenPermission(): void {
  if (!needsScreenPermission(process.platform, systemPreferences.getMediaAccessStatus('screen'))) return
  // 1x1 thumbnail: only to trigger the authorisation flow and complete registration; no real image is needed
  void desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } })
    .catch((err) => console.error('[perm] failed to trigger the screen-recording permission prompt (not fatal)', err))
}

/** At use time only check + guide; never trigger the prompt here */
ensureScreenPermission(): boolean {
  if (!needsScreenPermission(process.platform, systemPreferences.getMediaAccessStatus('screen'))) return true
  this.showPermissionGuide()   // the copy must say "restart the app after granting permission"
  return false
}
```

**接在哪**:`primeScreenPermission()` 挂到**主窗 show 之后**,不能挂在 `app.whenReady()` 或服务的 `start()` 里。

### ❌ 错误做法(每条都实测栽过)

**❌ 相信 `not-determined` 分支存在**
<!-- example -->
```ts
if (status === 'granted' || status === 'not-determined') return true   // 错
```
对 `screen` 而言这条分支是**死代码**,全新用户一律落进 denied。后果是死锁:判 denied → 不去尝试采集 → 系统不登记 app → 引导用户去列表里找 → **列表里没有它** → 永远无法授权。**检查本身堵死了唯一的授权入口。** 老机器不暴露,因为早年从别的路径授过权。

**❌ 在"使用"路径里触发询问**
探测后复查状态、仍未授权就弹自己的引导框 —— **两个框会同时出现**。用户点了你的,系统那个被晾着没答复,**TCC 不落记录,app 照样进不了列表**,死锁绕回原点。这不是难看,是功能性阻断。

**❌ 用"探测是否超时"推断系统框在不在**
判据从根上不成立 —— 授权框由另一进程异步绘制,`CGRequestScreenCaptureAccess` 与 `desktopCapturer.getSources` **从不阻塞**,`timeout` 分支永远走不到。

**❌ 挂在窗口显示之前触发**
app 尚未成为前台应用时,macOS **静默不弹框**,你会以为代码没生效。

**❌ 引入 `mac-screen-capture-permissions` 之类的原生包**
它的 `hasPromptedForPermission()` 看似是"系统还会不会问"的准确信号,读源码后会发现**就是在 userData 写一个点文件、再 `existsSync` 查它**,并非原生能力;唯一真正原生的 `hasPermissions()` 走 `CGPreflightScreenCaptureAccess`,而 Electron 的 `getMediaAccessStatus` 已经提供了同一个东西。代价却是引入首个随包分发的原生模块(预编译产物停留在 Electron 18–21 一代、无 x64 预编译、2023-09 后无维护)加三个运行时依赖。**严格劣于自己实现。**

### 验证

<!-- example -->
```bash
tccutil reset ScreenCapture <bundleId>    # 复现"全新机器",不必真换机器
# 然后从访达双击启动打包版(不要从终端跑——终端子进程会继承终端的 TCC 归属,结果不作数)
```

**判据是"app 有没有出现在隐私列表里",不是"功能能不能用"** —— 后者在你自己机器上早就授过权,永远是绿的,测不出这个 bug。成功标准:①启动后只弹系统授权框,**不伴随自家引导框** ②app 出现在列表中 ③允许 + 重启后功能可用。

### 连带坑:同 bundle id 的两个构建会抢 TCC

TCC 按 bundle id 记账、**同时记录代码签名要求**。同一个 bundle id 的两个不同签名构建(如 App Store 版与直分发版)**无法同时持有同一项权限**:后被授权的会让先前那个失效,且手动在系统设置里 `+` 添加也无效。开发期调试尤其容易撞上,解法是给不同分发渠道用不同 bundle id。

---

## 3. appId / bundle id 命名规范(双渠道双 id)

**何时需要**:每个新 Electron 项目设 `electron-builder.yml` 的 `appId` 时;计划(或可能)上 Mac App Store 的项目必须从第一天就分渠道。

**规范**:appId 形如 `<app名>.<渠道域名>`,两个分发渠道用**不同 id**:

| 渠道 | appId | 示例 |
|---|---|---|
| 非商城版(DMG / Windows) | `<app名>.aloong.com` | `agentshed.aloong.com` |
| MAS 版 | `<app名>.aloongplanet.com` | `agentshed.aloongplanet.com` |

**怎么接**:`electron-builder.yml` 顶层 `appId` 写非商城版;MAS 版 id 以注释备档在其上方,上架时在 mas 构建段覆盖(参照 Transfer 的 MAS 构建线)。

**为什么必须双 id**:TCC 按 bundle id 记账且记录代码签名要求——同一 id 的两个不同签名构建(MAS 版与直分发版)无法同时持有同一项系统权限,后授权的会让先前那个失效,手动在系统设置里添加也无效(见第 2 节末"连带坑",Transfer 实测)。

**验证**:打包后 `/usr/libexec/PlistBuddy -c "Print CFBundleIdentifier" <App>.app/Contents/Info.plist` 应回显对应渠道的 id。

---

## 4. macOS 签名与公证(细则单独成篇)

**先看项目能力声明**:读 `capabilities.toml` 的 `macos-distribution`(读写规则见全局指令的「项目能力声明」节)——

- `enabled = true` → 必须完整读取 [macos-signing.md](./macos-signing.md),该文档的条文与本文件同等生效。建项目时按它装:第 1 节的分发政策定两条打包命令要达到什么,第 3 节的打包结构搭出 `dist:mac:local` 与 `dist:mac:release`,第 4 节配证书与凭据,第 5 节配 CI 各档,第 6、7 节写门禁与验收。两条命令写进 `macos-distribution.profiles`。
- `enabled = false` → 产出里写明「按项目能力声明,macos-distribution 未启用,该项跳过」。
- 缺失 → 未确认,按全局指令停下来问。

Mac App Store 线由商店分发,不走 Gatekeeper 的票据路径,不适用本节(渠道划分见第 3 节)。

**配完把参数落进项目文档**:签名身份、凭据来源、CI 各档行为、踩过的 workflow 坑,写进项目的 macOS 签名/公证**运维手册**(通常在 `docs/ops/` 下,就地更新),并让 `macos-distribution` 的 `source` 指向它;打包命令记在哪里按 macos-signing.md 第 1 节。macos-signing.md 是**跨项目的通用细则**,项目手册记的是**本项目的实际取值与流程**,两者不重复。

## 5. 本地自动测试基建(macOS,细则单独成篇)

**何时需要**:每个要跑本地自动化验证(e2e / 冒烟)的 Electron 项目。**初始化时装,
不要等痛点爆发**——本节每一件都是在真实项目上痛点爆发→排查→误诊→返工之后回填的
(agentshed,2026-08-03/04),其中仅"冒烟误红"一项就烧掉三轮排查。

**装什么**:四件套,细则与依据统一见 **[electron-testing.md](./electron-testing.md)**——

| 件 | 形式 | 解决什么 |
|---|---|---|
| 主进程测试 seam(静音 + 数据根注入 + 单实例锁 + 防孤儿) | 可抄骨架 ~20 行(文档第 1 节) | 测试可注入、不抢前台;e2e 结果不随开发机数据变 |
| [assets/quiet-electron.sh](./assets/quiet-electron.sh) | 复制进项目 scripts/ | Dock 图标零闪现(图标在原生引导期按 plist 注册,JS 追不上) |
| [assets/smoke.sh.template](./assets/smoke.sh.template) | 复制后填「项目填空」块(核心三处+命名,未填空会自报) | dev 冒烟:双隔离、失败留证、就绪产物判据 |
| [assets/ci-electron.yml](./assets/ci-electron.yml) | 复制进 .github/workflows/ | ubuntu+xvfb 的 e2e 门禁,四个"抄错才知道"的坑已排 |

主进程有批量读文件路径(扫描、建索引)的项目,另按文档第 7 节配基准脚本。

**怎么接**:seam 写进 main;e2e 在 playwright globalSetup 跑 quiet-electron.sh 并设
`ELECTRON_OVERRIDE_DIST_PATH`;smoke 模板自带接线(electron-vite 另需
`ELECTRON_EXEC_PATH`,两个都给——依据见文档第 2 节);**e2e 目录与 playwright.config
必须写进 tsconfig include**,否则整个 e2e 目录从未被 typecheck、类型守卫全是假的。

**验证**(硬性,文档各节附具体方法):smoke 每条失败分支强制触发一遍;Dock/前台用
lsappinfo 探针 A/B(探针先在"坏"状态自证非空过);换测试运行体制后重放已知可红的变异。

## 6. 开发运行与打包版的 userData 目录

**何时需要**:定 app 名(`package.json` 的 `name`、`productName`,electron-builder 的 `productName`)时,
以及往 userData 新增文件时。userData 目录名来自 app 名(`app.getName()`);开发运行与打包版的 app 名只差
大小写时,在 macOS 默认的大小写不敏感卷上两者是同一个目录,开发运行读写的就是已安装版的偏好、缓存与各类
记录。

**装什么**:不装东西,是起名与新增 userData 文件时的一项判定。

**怎么接**:两个名字只差大小写时,必须逐个判定 userData 里的文件——只该描述已安装版的记录(如「更新后」
提示所依据的上次版本记录)不得在开发运行中读写;此后每新增一个 userData 文件都先做这个判定。不想承担
这项判定,就让两个名字不只差大小写。

**验证**:开发运行与打包版各打印一次 `app.getPath('userData')`,忽略大小写比较两者是否相同;相同时,开发
运行一次后,已安装版那些只属于安装版的记录修改时间不变。

<!--
扩展位:以后 Electron 新项目基础设施的其它一次性项(如无签名 CI 打包坑、多架构产物命名、
graceful-quit 骨架等)可在此追加为 ## 7 / ## 8 ……。每项保持"何时需要 / 装什么 / 怎么接 / 验证"结构。
-->
