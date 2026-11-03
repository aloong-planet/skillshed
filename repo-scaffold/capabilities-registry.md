# 项目能力登记表

`capabilities.toml` 里允许出现的全部 ID,以及每个 ID 的形态、字段、取值类型、默认值与含义。本文是 ID 定义的唯一正本;读写规则(必须先读、缺失即未确认、不得转述来源)以全局指令的「项目能力声明」节为准,此处不复述。

## 两种形态

**顶层值**:写成顶层键值 `ID = 值`,写在所有段之前;值的取值类型按下方各 ID 的定义。

**段**:写成以 ID 命名的段,基础字段只有下列三个;**除基础字段外,只允许该 ID 的定义里列出的字段与子表**,不得增加其他字段。

```toml
[lint]
enabled = true
source = "eslint.config.js"
enforced-by = ["pnpm lint"]
```

- `enabled`:布尔,必填。
- `source`:该能力权威定义所在的仓库相对路径,路径或路径数组;`enabled = true` 时必填。
- `enforced-by`:守住它的命令,命令数组,skill 执行验证时照它跑;`enabled = true` 时必填。没有任何命令守它时写 `[]`,表示它靠人守。

## 取值类型

| 类型 | TOML 写法 | 约束 |
|---|---|---|
| 布尔 | `true` / `false` | — |
| 路径 | 字符串 | 仓库相对路径 |
| 命令 | 字符串 | 在仓库根执行的完整命令 |
| 命令数组 | 字符串数组 | 每项是一条命令 |
| 语言标签 | 字符串 | BCP 47 语言标签(如 `"en"`、`"zh"`) |
| 字符串表 | 内联表 | 键与值都是字符串 |
| 枚举 | 字符串 | 取值只能是该 ID 定义里列出的值之一 |

## 默认值与推荐答案

下表每个 ID 都有一个默认值。段形态的默认值一律是 `enabled = false`。

凡向用户问某个 ID 取什么值——`/repo-scaffold` 建立或补写声明时,或其他 skill 因该 ID 未确认而停下来问时——推荐答案一律按下列规则给出:

- `client-framework`:按仓库的依赖与目录给。依赖里有 `electron` → `"electron"`;依赖里有 `@tauri-apps/*` 或仓库根有 `src-tauri/` → `"tauri"`;都没有、但仓库有产出原生客户端的工程(如 `*.xcodeproj`、`*.xcworkspace`,或 `Package.swift` 加 app 的 `Info.plist`)→ `"native"`;以上都没有 → 默认值 `"none"`;出现两种及以上迹象时不给推荐,列出各方的证据请用户定。
- 其余 ID:默认值。

推荐答案只用于提问,未经用户确认不得写入,也不得据此替用户判断能力是否启用。文件里缺失的 ID 如何处理,以全局指令的「项目能力声明」节为准。

## ID 一览

| ID | 形态 | 取值类型,或 `enabled = true` 的含义 | 前提 | 默认值 |
|---|---|---|---|---|
| `client-framework` | 顶层值 | 枚举:项目是不是客户端应用、用哪个框架。`"none"`:不是客户端应用;`"electron"`:Electron 客户端;`"tauri"`:Tauri 客户端;`"native"`:直接用平台原生工具链构建、不经跨平台框架的客户端(如 Swift/AppKit) | 无 | `"none"` |
| `working-language` | 顶层值 | 语言标签:仓库工作语言;中文一律写 `"zh"`,不写 `"zh-Hans"`、`"zh-CN"` 等带文字或地区子标签的形式。管辖源码注释、工程文档、测试名、终端输出、commit message、PR 标题与正文、issue;不管辖面向用户的产品文案与 release note。skill 写进项目的固定名称、种子文本与资产随它书写的规则见 [artifact-names.md](./artifact-names.md) | 无 | `"en"` |
| `i18n` | 段 | 产品界面支持多种语言,用户可见文案集中在字典里;`source` 指字典目录 | 无 | `enabled = false` |
| `enumeration-wording-gate` | 段 | 有门禁检查文案不把可枚举维度的成员当全集列出;覆盖哪些维度以门禁脚本里的规则为准,`source` 指门禁脚本 | 无 | `enabled = false` |
| `lint` | 段 | 有 linter 且已接入验证网关;`source` 指 linter 配置文件 | 无 | `enabled = false` |
| `e2e-suite` | 段 | 有端到端测试且已接入验证网关;`source` 指端到端测试的配置文件 | 无 | `enabled = false` |
| `mutation-testing` | 段 | 对测试做变异检验;条文与适用范围见 review-tests 的 [mutation-testing.md](../review-tests/mutation-testing.md)。`source` 指记录项目采用这一做法的文档(如 ADR);这一做法靠人守,`enforced-by` 写 `[]` | 无 | `enabled = false` |
| `theming` | 段 | 界面颜色由主题变量驱动,且至少有一个主题维度(明暗、多套配色、对比度等);有哪些维度以主题样式文件为准,`source` 指主题样式文件 | 无 | `enabled = false` |
| `macos-distribution` | 段 | 项目对外分发 macOS 安装包;怎么打包按下文的实现指南分派,`source` 指项目的签名与公证运维手册,`enforced-by` 填发布门禁命令。专属子表见下 | `client-framework` 为 `"electron"`、`"tauri"` 或 `"native"` | `enabled = false` |

### 前提

「前提」列写了条件的 ID,只在条件成立时适用,条件不成立时不适用;「前提」为「无」的 ID 总是适用。适用与不适用的 ID 各自怎样写、怎样读,以全局指令的「项目能力声明」节为准。

### `macos-distribution` 的实现指南

分发政策(哪种构建签名、哪种公证、无证书怎么办)与框架无关;怎么打包按 `client-framework` 读对应的指南:

| `client-framework` | 实现指南 |
|---|---|
| `"electron"` | electron-scaffold 的 [macos-signing.md](../electron-scaffold/macos-signing.md);其中第 1 节是分发政策 |
| `"tauri"` | 暂无。需要它的 skill 必须停下来告诉用户「Tauri 项目的 macOS 打包没有指南」,不得改用 Electron 的指南 |
| `"native"` | 暂无。需要它的 skill 必须停下来告诉用户「原生客户端的 macOS 打包没有指南」,不得改用 Electron 的指南 |

### `macos-distribution` 的专属子表

`enabled = true` 时必须写下列两个子表,子表名固定,不得增删:

| 子表 | 用途 | 字段 |
|---|---|---|
| `[macos-distribution.profiles.local]` | 本地打包 | `command`(命令,必填)、`env`(字符串表,可选:执行该命令时附加的环境变量) |
| `[macos-distribution.profiles.release]` | 发布打包,正式版与预发布版共用 | 同上 |

- 每个子表的命令要达到的签名与公证程度,由上文实现指南里的分发政策规定,本表不写。
- 什么样的 tag 是正式版、什么样的是预发布版,由 `/github-ops` 的 [release.md](../github-ops/release.md)「发版 / Release 标准」定义,本表不写。

```toml
[macos-distribution]
enabled = true
source = "docs/ops/mac-signing.md"
enforced-by = ["pnpm dist:mac:release"]

[macos-distribution.profiles.local]
command = "pnpm dist:mac:local"

[macos-distribution.profiles.release]
command = "pnpm dist:mac:release"
```

## 增删 ID

- **新增 ID 前必须指得出至少一条以它为前提的 skill 条文,并在同一次改动里让那条条文按 ID 引用它**——没有读者的 ID 永远不会被核对,写了也只是噪声。
- **删除或改名 ID 前,必须在全部 skill 目录里全量检索该 ID**(检索须跟进软链接),把引用处改完再动本表。
