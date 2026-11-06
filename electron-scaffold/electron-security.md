# Electron 安全检查清单(官方 20 条 + 1 条)

来源:Electron 官方 `docs/tutorial/security.md` 的 "Checklist: Security recommendations"(第 1~20 条)。官方措辞是 **"at least"**——这是下限,不是充分条件;第 21 条是官方清单之外的。

**为什么要人工过**:没有可靠的自动化门禁。官方**运行时 Security Warnings 只有 8 条,源码注释明标第 12~14 条"未实现"**(导航、新窗口、webview 全无警告);Electronegativity 已停止维护,且在"只写了 `setWindowOpenHandler`、没写 `will-navigate`"时**静默放行**——恰是最常见的漏法。真正的防线是**把守卫写成可测的纯函数并固化回归测试**。

## 何时过这份清单

- 新建 Electron 项目(与 SKILL.md 的一次性基础设施同批)
- 改动主进程窗口/会话/协议/IPC 配置时
- 主进程新读一个环境变量或启动开关时
- 升级 Electron 主版本后
- 引入"渲染他人内容"能力时(markdown/HTML/外部数据)
- 新增一个打包平台时(如在 macOS 之外加 Windows 或 Linux 构建):Chromium 读启动参数的方式、环境变量名分不分大小写都随平台变(第 21 条),其余条目的验证也只在验过的平台上成立

## 清单

逐条给**判据**(怎么算做到)与**难度**。标注"默认已安全"的仍需确认没被显式关掉。

### 一、默认已安全——确认没被关掉即可(8 条,难度:零)

| # | 条目 | 判据 |
|---|---|---|
| 2 | 远程内容不开 nodeIntegration | 5.0+ 默认关;grep `nodeIntegration: true` 无命中 |
| 3 | contextIsolation | 12.0+ 默认开;grep `contextIsolation: false` 无命中 |
| 4 | sandbox | 20.0+ 默认开;grep `sandbox: false` 无命中 |
| 6 | 不禁用 webSecurity | grep `webSecurity: false` 无命中 |
| 8 | 不开 allowRunningInsecureContent | 同上 grep |
| 9 | 不开 experimentalFeatures | 同上 grep |
| 10 | 不用 enableBlinkFeatures | 同上 grep |
| 11 | webview 不加 allowpopups | 未用 webview 即不适用 |

### 二、必做(难度低,收益直接)

| # | 条目 | 判据 | 难度 |
|---|---|---|---|
| **13** | 限制导航 | `will-navigate` **与 `will-frame-navigate` 都挂**(官方清单只提前者,而它**只管主框架**);挂在 `app.on('web-contents-created')` 上覆盖全部 webContents;URL 比较用 `new URL()` 比 origin,**不得用 `startsWith`**(官方点名:`https://example.com.attacker.com` 会通过) | 低 |
| **14** | 限制新窗口 | `setWindowOpenHandler` 在所有分支后**无条件 `return { action: 'deny' }`**;放行目标交系统浏览器 | 低 |
| **15** | openExternal 只传已校验 URL | **协议白名单而非黑名单**:`new URL()` 解析后只放行 `http:`/`https:`;拒绝 `file:`/`smb:`/自定义 scheme | 极低 |
| **5** | 权限请求 | `setPermissionRequestHandler` + `setPermissionCheckHandler`;纯本地应用可全 deny | 极低 |
| **17** | IPC sender 校验 | 校验 `e.senderFrame?.url` 属于本 app;**用统一包装器注册 handler,不逐个加**——逐个加必然漏,包装器让新增 handler 自动受校验 | 低 |
| **20** | preload 不裸暴露 Electron API | 暴露包装函数而非 `ipcRenderer`;事件回调**丢弃 `IpcRendererEvent`**(它带 `sender`)——形如 `(_e, payload) => cb(payload)` | 极低 |
| **12** | webview 校验 | 用 webview 才必做;不用也建议加防御性 `will-attach-webview`(删 preload、关 nodeIntegration、preventDefault),因为它可由 DOM 脚本创建 | 极低 |

### 三、该做(难度中,按项目形态取舍)

| # | 条目 | 判据 | 难度 |
|---|---|---|---|
| **7** | CSP | 经 `session.webRequest.onHeadersReceived` 注入(比 `<meta>` 可靠);**两档策略**——prod 严格,dev 必须放宽(vite/webpack HMR 要 inline+eval+ws,否则开发环境跑不起来);渲染他人内容时 `img-src` **不含 http(s)**,否则文档里的外部图会真外联(隐私泄漏) | 中低 |
| **19** | Fuses | 打包配置关 `runAsNode`/`nodeOptions`/`nodeCliInspect`,开 `onlyLoadAppFromAsar`/asar 完整性/cookie 加密。**判据是读产物而非看配置**:配置写对不代表生效(版本/平台/配置段位置错都会静默跳过),须读二进制的 fuse wire 校验 | 低 |
| **18** | 避免 file://,用自定义协议 | `registerSchemesAsPrivileged`(app ready **前**,`standard+secure+supportFetchAPI`)+ `protocol.handle` 映射到产物目录;**路径解析必须防穿越**——注意明文 `..` 会被 WHATWG URL 在解析层钳掉,真正要拦的是**编码穿越**(`%2e%2e%2f`);读盘用 `net.fetch(file://)` 免维护 MIME 表,且**必须 `await`**(某些输入会 reject 而非返 404,直接 return promise 会漏成 unhandled rejection) | 中 |
| **1** | 只加载安全内容 | 纯本地应用不适用;有远程内容则一律 HTTPS/WSS | 视情况 |

### 四、只检查不强制(1 条)

| # | 条目 | 判据 | 难度 |
|---|---|---|---|
| **16** | 跟最新 Electron | **只做检查、不做强制**——升不升由项目按约束决定(依赖卡住、目标机 OS 版本、发版窗口)。检查动作:记录当前版本与最新 stable 的 major 差、是否仍在支持窗口内、以及下方"版本影响的检查项"里哪几条因此降级。**留在旧版是合法选择,但必须在台账里标为已知风险并写明原因**,不能留空当没这回事 | 低但持续 |

#### 为什么它不强制,却仍要查

Electron **只维护最新 3 个 major**,落后 4 个以上即无任何安全 backport。其余各条是"你在 Chromium 上加的锁",#16 是"Chromium 本身有没有打补丁"——**它是其余条目的地基而非并列项**。地基旧了,上面的锁依然有效(它们防的是应用层逃逸),但引擎层的已知漏洞不再被修。

判断"能不能升"通常比"值不值得升"更值得先查:实践中卡点几乎总是**原生模块的 ABI** 或**平台底线**(macOS 版本),而不是 API 变更——纯 JS 依赖 + 用现代 API 的应用,跨多个 major 往往零改动。

#### 版本影响的检查项(留在旧版时按此降级台账)

| 影响的条目 | 版本门槛 | 低于门槛时的实际状态 |
|---|---|---|
| **#19 Fuses · ASAR 完整性** | **E39** | 低于 39:`embeddedAsarIntegrityValidation` 是**实验性且仅 macOS**;E36 才有 Windows 侧改进。台账不能按"已转正"记 |
| **#19 Fuses · ASAR digest** | **E41** | 低于 41:无 digest(对完整性信息本身再签一层防篡改),校验数据自身可被改 |
| **#19 Fuses · `wasmTrapHandlers`** | **E41** | 低于 41:该 fuse 不存在(wire 长度 8 而非 9)。不设期望值则无损失;**按下标读 fuse 的校验脚本在两侧都能跑**(只追加不重排) |
| **#3 contextIsolation 默认开** | E12 | 低于 12 必须显式设 |
| **#4 sandbox 默认开** | E20 | 低于 20 必须显式设 |
| **#2 nodeIntegration 默认关** | E5 | 低于 5 必须显式设 |
| **#18 `protocol.handle`** | E25 | 低于 25 只有已废弃的 `registerBufferProtocol`/`registerFileProtocol` 系列,需换写法 |
| **#14 `setWindowOpenHandler`** | E12 | 低于 12 用 `new-window` 事件(已移除) |
| **#13 `will-frame-navigate`** | E26 | 低于 26 只有 `will-navigate`(**只管主框架**),子框架导航无从拦截——这是旧版最实际的防护缺口 |
| **#5 `setPermissionCheckHandler` 的 `fileSystem` 类型** | E43 | 低于 43 权限类型少几种;**全 deny 的写法不受影响** |
| **供应链**(不在 20 条内) | E42 | 低于 42:`electron` npm 包用 `postinstall` 下载二进制,无法配 `--ignore-scripts` |

**结论口径**:除 `will-frame-navigate`(E26)外,清单其余条目的**写法**在相当旧的版本上都成立,代码不用改;真正随版本降级的是 **#19 的完整性校验强度**。所以旧版项目照样应该把其余各条全做完——它们不因版本旧而失效。

### 五、官方清单之外(1 条)

| # | 条目 | 判据 | 难度 |
|---|---|---|---|
| **21** | 打包版不接受启动入口 | 启动参数里出现允许项确切写法之外的任何参数(像不像开关都算),或环境里出现开发服务器地址、测试 seam 变量时,打包版必须在加载任何内容之前以退出码 64 退出,且只在标准错误输出被拒绝的名字;不带这些输入的启动必须照常打开。**判据是实跑打包产物**:未打包的运行进不了这段逻辑。用打包资产的项目每次打包都由它实跑(macos-signing.md 第 6 节),不用该资产的项目必须自己实跑同样的检查 | 低 |

#### 为什么 #19 管不到

macOS 信任的是这个签名包,用户授给它的权限属于在它里面运行的任何东西。#19 的 fuses 只关 Node 的入口,Chromium 的开关与项目自己读的环境变量都不归它管。实测(前提:Electron 43.2.0、macOS 26、已公证的包、以同一用户启动):

| 启动入口 | 结果 |
|---|---|
| `--remote-debugging-port`,一个或两个短横线 | 端口打开,外部客户端能驱动窗口 |
| `--remote-debugging-pipe` | 管道上应答 |
| `--gpu-launcher=<程序>` | 运行该程序 |
| `--renderer-cmd-prefix`、`--utility-cmd-prefix` | 不运行程序,进程崩溃 |
| `--type=`,值为空,再带上述开关 | 与普通启动一样进入主进程,端口打开 |
| `--type=<进程类型>` | Chromium 在任何 JS 之前读它,不进入主进程;手工启动时进程崩溃,不开端口、不运行程序 |
| `ELECTRON_RENDERER_URL=<地址>`,主进程按它加载窗口时 | 窗口加载该地址,IPC 校验信任它,preload 的接口全部暴露给它 |

#### 怎么算做到

- **必须用允许清单,不得用禁止清单**:Chromium 的开关没有公开的固定清单,上表的 `--gpu-launcher` 就不在任何现成清单上;禁止清单只拦得住列出来的。
- **必须按整个参数的确切写法比对允许项,不得先判断哪个参数是开关**:Chromium 先去掉每个参数首尾的空白再认开关,且认法随平台不同——POSIX 上只认 `--` 与 `-` 起头、去掉 ASCII 空白,Windows 上 `/` 起头也算、开关名转成小写、去掉 Unicode 空白(读自 Chromium 主干的 `base/command_line.cc`)。守卫照它的认法重写一遍,漏掉哪一处就从哪一处被绕过。实测(前提同上):以「短横线起头」认开关的守卫,放过了前面带一个空格或制表符的 `--remote-debugging-port=0`,端口打开。不像开关的参数一并拒绝;应用要接收参数形式的文件路径(如 Windows 的文件关联)时,必须把这种形式写成允许项,并在每个打包平台的产物上实跑:符合这种形式、而 Chromium 在该平台会当作开关读的参数(如 Windows 上 `/` 起头的)仍被拒绝。
- **必须不分大小写地比对环境变量名**:Windows 上 Node 的 `process.env` 不分大小写,按任一大小写都读得到,`Object.keys` 却返回设置时的原样(读自 Node 文档,未实测);按原样比对,小写的 seam 名就会被放过。
- **必须拒绝整次启动,不得去掉开关后继续**:有些开关在主进程脚本运行之前已经生效。实测(前提同上):`--js-flags=--expose-gc` 在主模块顶层用 `removeSwitch` 去掉后,`gc` 仍然暴露。
- **不得弹框**:正常打开应用的人走不到这里,弹框只给启动者一个以应用名义显示对话框的办法。
- **不得换用别的退出码**:64 是应用与打包门禁之间的约定,门禁靠它把拒绝与崩溃分开。

## 固化:唯一可靠的门禁是自己的测试

工具都不可靠,所以把判定层写成**纯函数 + 单测**,把接线写成 **e2e 断言**:

- 判定层纯函数:`isAppUrl(url, appBase)`(导航放行)、`externalOpenTarget(raw)`(外链白名单)、`assertTrustedSender(...)`(IPC)、`cspFor(isDev)`(策略)、`resolveAppPath(...)`(协议路径)、`refusedLaunchInputs(args, env)`(启动入口)
- 必测的**绕过向量**:origin 前缀相似(`localhost:5173.attacker.com`)、大小写(`JaVaScRiPt:`)、userinfo(`https://good.com@evil.com`)、编码穿越(`%2e%2e%2f`)、不可解析输入;启动入口另测前导空白(空格、制表符)、一个短横线的写法、形似允许项的写法(更长、大小写不同、缺 `=`)、无人列出的开关、裸的 `--`、不像开关的参数、大小写不同的变量名,并断言 `-psn_` 照常放行、值里的内容不进结果
- e2e 必断言:打包版 URL 以自定义协议开头(回退到 `file://` 会静默丢保护)、文档内链接点击后**窗口 URL 不变**
- 打包后跑 fuses 校验脚本(读产物二进制),并实跑产物核对启动入口(#21)

## 参考实现

`agentshed` 项目:`src/main/security.ts` + `security.test.ts`(判定层与绕过向量)、`src/main/app-protocol.ts` + 测试(#18)、`scripts/check-fuses.mjs`(#19 产物校验)、`src/main/launch-inputs.ts` + `launch-guard.ts` + 测试(#21)、`docs/ops/electron-security.md`(逐条现状台账)。
