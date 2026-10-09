# macOS 签名、公证与发布验收

macOS 桌面应用(Developer ID / DMG 直分发)从配置到发版验收的完整链条。
按**平台**组织而非按时机——建项目时配的东西和发版时验的东西是同一条因果链,拆开看会各缺一半。

引用方:`electron-scaffold` 第 4 节(配置侧)、`github-ops` 第 3/4 节(发版侧)。各取所需的节即可。

本文按 DMG 直分发写。以 ZIP、PKG 或 Mac App Store 分发时,必须按该形态重新推导最外层的提交与验收边界,不得照搬下面的 DMG 流程。

---

## 0. 动手前先坐实

改配置或排查故障之前,必须先读完下列事实,不得凭记忆或惯例推断:

- 已安装的 electron-builder 版本、它实际生效的配置、打包脚本与钩子、产物命名;
- 发布 workflow 从打包到**每一个**发布与镜像 job 的全程;
- 预期产物全集(架构、格式)从项目配置推导,不得假定固定的架构数或文件名;
- 手头有受影响的真实产物时,先查外层 DMG,再挂载查内部 App。

随版本变化的行为(如 electron-builder 内置公证何时触发),只有被已安装版本的代码与类型、或一次真实构建证实,才可当作事实。读不到 Apple 或 electron-builder 的现行文档时必须如实说明,不得把记忆当作刚查过的文档。

## 1. 三个动作各解决什么

- **签名**(`Developer ID Application`):标识开发者、保护完整性。Electron 应用同时要启用 Hardened Runtime 与所需 entitlements——**这是公证的前提**,没有它公证直接被拒。entitlements 只给 App 实际需要的;嵌套的可执行文件与框架必须由内向外逐层签名,最后签 App。
- **公证**:把交付物提交 Apple 扫描恶意软件。**`.app` 与最外层 DMG 都要提交,两次缺一不可。**
- **staple**:把 Apple 签发的 ticket **装订**到交付物上,使 Gatekeeper 在**访问不到 Apple 服务时**仍能验证公证结果。

**为什么两处都要钉**:ticket 跟着被装订的**那一个文件**走。

| 只钉了谁 | 症状 |
|---|---|
| 只钉 DMG | 用户把 app 拖进「应用程序」后,DMG 连同票据被丢掉,**app 身上没票据** → 首次启动只能联网查票,断网即判"无法验证是否包含恶意软件" |
| 只钉 app | **DMG 自身没票据** → 双击打开 DMG 时 `spctl --type open` 判 rejected |

**app 的票据管「拖出来之后」,DMG 的票据管「打开 DMG 时」**,不能互相替代。

## 2. 固定顺序与硬约束

```text
签名 .app
→ 提交 .app 公证 → staple 到 .app          ← 必须在打 DMG 之前
→ 生成各架构 DMG(内部 app 已自带票据)
→ 签名每个 DMG
→ 提交前检查每个 DMG(第 5 节)
→ 提交每个 DMG 公证 → staple DMG
→ 验证:DMG 自身 + 断言 DMG 内 app 自带票据
→ 上传
```

**硬约束**:

- **一切签名与公证都在上传之前**;
- **staple 之后不得再改动字节**——改了票据与签名同时作废;
- 打包完成后**没有可行的补钉途径**:DMG 只读挂载,虽可 `hdiutil convert` 成可写再改,但改动内容会作废它自身的签名与票据,等于整套重做。**唯一时机是打 DMG 之前。**

electron-builder 侧:`mac.notarize: true` 的内置公证正是跑在"签完 .app、生成 target 之前"这个位置(`macPackager` 的 `sign()` → `notarizeIfProvided` → `@electron/notarize` 的 `stapleApp()`)。**正式版打包脚本不要传 `-c.mac.notarize=false`**,预发布/仅签名档才传。

## 3. 凭据与证书(一次性)

五个标准环境变量(electron-builder + notarytool 的事实标准,不要自定义命名):

| 变量 | 用途 |
|---|---|
| `CSC_LINK` | Developer ID 证书 `.p12` 的 base64 |
| `CSC_KEY_PASSWORD` | 导出 `.p12` 时设的密码 |
| `APPLE_ID` | Apple ID 邮箱 |
| `APPLE_APP_SPECIFIC_PASSWORD` | **App 专用密码**,不用主密码 |
| `APPLE_TEAM_ID` | Developer Team ID |

公证凭据也可以用 App Store Connect API key(或 notarytool 的 keychain profile)代替上表三个 Apple 变量,按项目策略二选一。任何日志与命令输出都不得打印凭据。

**坑:空的 `CSC_LINK` 会被 electron-builder 当成"证书路径"**,于是无证书构建反而失败。无证书分支必须**根本不设置**这个变量,而不是设成空字符串。

导出证书为 base64(一次性):

```bash
security export -t identities -f pkcs12 -o /tmp/cert.p12
base64 -i /tmp/cert.p12 | pbcopy
rm /tmp/cert.p12
```

本地跑签名构建的三项前置:

```bash
security find-identity -v            # 钥匙串里有 Developer ID Application
xcrun --find notarytool              # Xcode CLT 提供 notarytool
```

第三项是凭据文件:三个 Apple 变量放**不入库**的本地 env 文件(`.env.local` 之类,确认在 `.gitignore` 里),用 `set -a; source <file>; set +a` 注入。

> `security find-identity` **不要加 `-p codesigning`**:那样只列**有效**身份,会把 `CSSMERR_TP_NOT_TRUSTED` 的证书整条藏掉(典型成因是缺 WWDR 中间证书),排查签名问题时会误以为证书根本不存在。

## 4. CI 分档与 fail-closed

发布至少分下列几档,由**触发方式**(tag 形态或手动触发)决定:

| 档 | 触发 | 行为 |
|---|---|---|
| 正式版 | 干净 tag | 签名 + 公证 + staple + 完整验收,发 Latest |
| 预发布 | `-beta`/`-rc`/`-alpha`/`-dev` 后缀 tag | 只签名不公证,发 Pre-release |
| 手动验证 | 手动触发 + 显式开关 | 要求真实证书与凭据、走完整门禁,但**只产出 Actions 临时产物**:不创建 Release,不动镜像与 latest 指针 |
| 普通手动触发 | 手动触发、不开验证开关 | 按项目策略产出已签名或未签名的诊断产物,只作 Actions 产物 |

**fail-closed 是硬要求**:正式版缺任一凭据 → 直接失败,**绝不降级**成"仅签名"或"未签名"档。降级发布出去的产物用户装不上,而 CI 是绿的。

**构建策略与发布权限必须分开**:

- 发布类 job 的 `if` 必须基于真实的事件与 ref(正式版 tag),不得拿一个宽泛的 `IS_RELEASE` 或"正式验证"布尔值当发布许可——手动验证档会借这个布尔值误获发布权。
- 镜像同步、latest 指针等下游 job 必须依赖各平台的门禁 job,且只在正式版事件上运行;不得让下游同步绕过失败的 macOS 门禁。
- 产物集必须原子发布:任一必需产物未过第 5、6 节的门禁,整组都不发布;仅当项目明确定义了部分发布的语义时例外。

两个 GitHub Actions 的具体约束:

- **Secrets 不能直接写进 step 的 `if` 表达式**,要先在 job 层转成布尔 env(如 `HAS_CSC`、`HAS_APPLE`),再用它做分支判断。
- **内置公证跑在打包步骤内部**,所以公证凭据必须注入**打包那一步**的 env;只给后面的公证步骤等于没配。而 electron-builder 在凭据缺失时**只 warn 后静默跳过、不报错**,CI 照样绿而产出的 app 没票据——兜底靠第 5 节的断言。
- **门禁位置**:公证与验收必须卡在**打包与上传之间**。任一步失败都要阻断 Release 上传,而不是先传了再说。

## 5. 门禁脚本要断言什么

只看命令退出码不够,以下每条都要显式断言:

- **产物全集**:提交 Apple 之前先核对预期产物全集——缺失、重复、多出、版本或架构不符,都必须在等待公证之前失败。
- **提交前检查**:对最终签名后的每个 DMG,在 `notarytool submit` 之前跑 `hdiutil verify`(镜像完整性)、`codesign --verify --verbose=4` 与下一条的签名内容断言;任一失败不得提交。
- **签名内容**:`codesign --display --verbose=4` 的输出里断言**签名身份是 Developer ID Application**、**Team ID 匹配**、**Timestamp 非 `none`**(缺安全时间戳的签名会在证书过期后失效)。
- **解析必须结构化**:签名字段取完整字段比对,不做子串匹配;notarytool 的输出按 JSON 解析;stdout 与 stderr 都要捕获——Apple 的命令行工具常把诊断写进 stderr。
- **公证状态**:`notarytool submit --wait --output-format json` 的 `status` 必须是 `Accepted` 且带有效 submission id。**但 submit 的状态不够**——还要用 `notarytool log <id>` 拉回日志,断言 **jobId 与本次 submission id 一致、状态仍是 Accepted、没有 severity 为 error 的问题**(比较不区分大小写),并把日志**原样(未改动的 JSON)随构建产物留档**,如与产物同级的 `<产物>.notary-log.json`;CI 上随临时产物一并上传。
- **票据装订**:见第 6 节。
- **失败诊断不能掩盖原始错误**:Apple 返回 `Invalid` 时尽力去读日志做诊断,但**日志查询本身失败不得覆盖原始的拒绝错误**——否则真正的原因会被一个次生错误顶掉。

## 6. 发版产物验收

**外层 DMG 与内部 App 是两个独立的验收对象,两边都要验。** staple 之后对每个 DMG:

```bash
# 外层 DMG:以这三条为决定性门禁
xcrun stapler validate <dmg>
hdiutil verify <dmg>
spctl --assess --type open --context context:primary-signature --verbose=4 <dmg>

# 内部 App:挂载到独立的临时目录,只读、不在访达显示
MP=$(mktemp -d); hdiutil attach -readonly -nobrowse -mountpoint "$MP" <dmg>
xcrun stapler validate "$MP"/<产品>.app                       # ← 必须成功(spctl 查不出票据装订,见下)
codesign --verify --deep --strict --verbose=2 "$MP"/<产品>.app
spctl --assess --type execute --verbose=4 "$MP"/<产品>.app
hdiutil detach "$MP"
```

**`spctl` 与 `codesign` 都查不出票据装订,只有 `stapler validate` 能分辨:**

- `spctl --assess` 在**联网**时会通过在线查票而成功,票据装没装订上它一律返回 `accepted / Notarized Developer ID`;
- `codesign --verify` 只验签名,与票据无关。

**用它们做验收会全绿放行一个坏产物。** 把挂载后对内部 App 的 `stapler validate` 断言写进公证脚本,这个缺陷就再也漏不掉。

挂载验收的写法:

- 挂载后必须断言镜像里**恰好**是预期的那个 `.app`,不得用通配符放过多出或缺失的情况。
- 卸载必须放在 finally 路径里,成功失败都卸载;正常卸载失败时可以强制卸载兜底,但清理阶段的错误不得覆盖原始的验收错误。
- `codesign --deep --strict` 只用于 App,不作为外层 DMG 的决定性门禁。

**对照法定位**:拿本机任一已公证的 app(编辑器、IM 客户端)跑同一条命令,有票据的返回成功——同类物件横向对照比纵向读流水线代码快一个数量级。

**用户侧的正常提示别误判为故障**:浏览器下载的 app 一定带隔离属性,首次从访达启动必弹一次"是从互联网下载的 App,确定要打开吗",与公证无关,点一次即消。**判据是措辞**——带"Apple 已检查,未发现恶意软件"→ 公证生效;"无法验证开发者 / 可能包含恶意软件"→ 才是故障。别因为看到前者就回头去改公证配置。

## 7. 多产物发布的上传顺序

**先传产物,最后才覆盖"最新版指针"**(`latest.json`、站点上的版本常量等)。

反过来做会开一个**真实的 404 窗口**:指针类文件几十秒就生效,而安装包要签名 + 各架构分别公证,要等 Apple 几十分钟。这段时间里用户点下载全是 404。

改指针之前**逐条实测目标 URL 可达**(每个文件 × 每个下载源),不要只验一条就推断其余。

## 8. 验证边界(诚实声明)

- 用 fake command runner 做的单测,验的是**命令序列、失败传播、清理逻辑**,**不等于验过 Apple**——它一次也没访问过 Apple 服务。测试文件里要写明这一点,不能让绿色被读成"公证通过"。
- 真实端到端只能由**正式版 tag** 或**专门的手动验证档**产生。
- 下列信号单独成立时都不得据以宣称"已公证":tag 形态、打包步骤成功、`notarytool submit` 返回 Accepted、只有内部 App 的检查通过(包括 `spctl --type execute`——它说明不了打开 DMG 时 Gatekeeper 怎么判)。必须以第 5、6 节的全部断言为准。
- 注入命令执行器的单测至少覆盖:产物全集发现与版本、架构错配;签名身份、Team ID 精确匹配、时间戳缺失或为 `none`;submit 的 JSON 畸形、缺 submission id、状态非 Accepted;日志 jobId 不符、状态不符、含 error 级问题;第 2 节的命令顺序;含空格的路径;挂载失败、内部 App 验收失败、正常卸载、强制卸载兜底、原始错误不被覆盖;workflow 条件能证明手动验证档无法发布或改动镜像。
- 对 workflow 文本做静态测试只是回归护栏,不能替代真跑一次手动验证档。
- 这几条属于「验证会假绿」的通用形态,判据见 [review-code/false-greens.md](../review-code/false-greens.md)。
