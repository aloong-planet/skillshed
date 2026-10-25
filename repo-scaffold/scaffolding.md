# 铺设流程

本文适用于为仓库铺设或重铺 `/repo-scaffold` 的四件事。入口:[SKILL.md](SKILL.md)。

这是提问驱动的 skill,不是确定性脚本。**必须先探查、再呈现、经用户确认后才写**;不得凭默认值直接落盘。

## 1. 探查

读当前仓库的实际状态,**不得假设**:

- `git remote -v` —— 是不是 GitHub 仓库、哪一个
- 仓库根的 `CLAUDE.md` 与 `AGENTS.md` —— 哪个存在、里面是否已有 `## Agent skills` 段、`AGENTS.md` 是否已有指向 `capabilities.toml` 的引用行
- 仓库根的 `capabilities.toml` 是否存在
- 仓库根的 `CONTEXT.md` 与 `CONTEXT-MAP.md`
- `docs/` 下已有哪些目录(`adr` `specs` `features` `prototypes` `postmortems` `ops` `.workings`)
- `docs/agents/` —— 本 skill 上次的产出是否已存在
- 技术栈与包管理器,既有的 linter 配置与 `lint` 脚本,项目的全量验证脚本,`.github/workflows/` 下的检查 workflow
- 是不是客户端应用、用哪个框架:依赖里有没有 `electron`、`@tauri-apps/*`,仓库根有没有 `src-tauri/`

## 2. 逐节确认

先汇报探查结果:已有什么、缺什么。然后一节一问、一问一答,**每节先给出推荐答案**,用户一个词就能接受。探查已经定死的节直接跳过,不要为了走流程而问。

**A 节 —— Issue tracker.**

> 这套 skills 里 `to-tickets` 与 `to-spec` 要往 tracker 发票、从 tracker 取票,必须知道该调 `gh issue create` 还是写文件。

`git remote` 指向 GitHub 就推荐 GitHub。否则提供:

- **GitHub** —— 票是仓库的 GitHub Issues,操作规范见 `/github-ops` 的 [issues.md](../github-ops/issues.md)
- **本地文件** —— 票是 `docs/.workings/<slug>/issues/` 下的文件,适合无远程或纯个人的仓库
- **其他**(Jira、Linear 等)—— 请用户用一段话描述工作流,原样记录

选定后按种子模板写 `docs/agents/issue-tracker.md`。

**B 节 —— 文档布局.** 默认**单上下文**:仓库根一个 `CONTEXT.md`,`docs/adr/` 放决策。这适合绝大多数仓库,**直接写,不必问**。

仅当探查发现 monorepo 迹象(`pnpm-workspace.yaml`、`package.json` 的 `workspaces`、`packages/*` 各自带 `src/`)时,才提供**多上下文**选项。多上下文的格式与推断规则由 `/domain-modeling` 定义,见其 `CONTEXT-FORMAT.md`——**本 skill 不重复定义,只记录选了哪种**。

**C 节 —— 项目能力声明.** 按登记表逐个 ID 处理,`lint` 除外(它由 D 节决定)。**先定 `client-framework`,其余 ID 按登记表的「前提」列只处理适用的**:前提不成立的 ID 不问、不写。**每个适用的 ID 都必须写进 `capabilities.toml`**——文件里缺失的适用 ID 是未确认(全局指令「项目能力声明」节):

- **`capabilities.toml` 不存在** → 新建:先问 `client-framework`;再在草稿里给其余适用的 ID 先填上默认值,按下面的问法逐项问。
- **已存在** → 不重写已有的项;先核对 `client-framework`,再逐个核对其余**全部**适用的 ID,缺哪项就在草稿里补哪项,按下面的问法问。已有项的形态、字段或取值类型与登记表不符的,以及写了前提不成立的 ID 的,各作为一条发现列进草稿。

问法:

每一问的推荐答案按登记表「默认值与推荐答案」节给出,用户一个词就能接受;未经用户确认不得写入。

- **顶层值**:问取什么值。
- **`client-framework`**:分两步问——先问是不是客户端应用,是的话再问用哪个框架;推荐答案所需的依赖与目录取第 1 节的探查结果。
- **段**:问是否启用;**不得凭目录或文件推断哪些能力已启用**——接线未完成的仓库,现象与声明给出相反答案。用户答启用的,按登记表填 `source`、`enforced-by` 以及该 ID 的专属字段与子表。

`AGENTS.md` 里没有指向 `capabilities.toml` 的引用行时,补一行。引用行按 `working-language` 书写,只说「跨 skill 生效的项目事实见仓库根的 `capabilities.toml`」这一个意思,不复述文件内容。

**D 节 —— Lint.** **本节会安装依赖、改动构建脚本与 CI 配置,必须在草稿里单列,经用户确认后才执行。** 按探查结果分派,三种情形**互斥**:

- **已有 linter**(linter 配置与 `lint` 脚本至少有其一) → 不重装、不改已有配置;把现状列给用户确认,缺的那部分(脚本、配置或下文的接线)按下列各条补齐,再写 `lint` 段。
- **没有 linter,用户同意接入** → 推荐该技术栈公认的 linter,用户确认后安装:TS/JS 推荐 ESLint(flat config)加 typescript-eslint;Rust 用 clippy;Python 用 ruff;其他技术栈先问用户。按下列各条接线。
- **没有 linter,用户不接入** → `capabilities.toml` 写 `[lint]` 段 `enabled = false`,本节结束。

接入或补齐时:

- 不顺带安装格式化工具——格式是风格偏好,不是对错,要装另外问用户。
- 规则集、存量报错的处置、接线、`lint` 段的写法与门禁能红的证明,一律按 [lint-adoption.md](./lint-adoption.md) 执行,本节不复述。

## 3. 出草稿

把要写的东西完整呈现给用户,**让其先改再写**:

- 要插进目标指令文件的 `## Agent skills` 段(以及 Claude Code 在用时那行 `@AGENTS.md` 导入)。目标文件按第 4 节的规则定;既有 `CLAUDE.md` 含实质内容时,**第 4 节的迁移之问先于出草稿**——答案决定块写进哪个文件
- `docs/agents/issue-tracker.md` 与 `docs/agents/docs-layout.md` 的内容
- `capabilities.toml` 的新建或补写内容,以及 `AGENTS.md` 的引用行(C 节无需改动任何文件时不列)
- D 节的接线清单:要安装的依赖、要新建或改动的配置与脚本、CI 步骤,以及存量报错按 lint-adoption.md 第 3 节的分类结果——要修的、按文件范围关闭的(各附约束与退役条件)、逐行豁免并建票的(D 节无需安装或改动任何文件时不列)

## 4. 写入

### 内容写 `AGENTS.md`

`AGENTS.md` 是跨 agent 的开放标准,三十余种 agent 原生读它;`CLAUDE.md` 只有 Claude Code 读。把内容放进 `CLAUDE.md`,其余 agent 一概读不到,**而反过来没有对称损失**——只读 `CLAUDE.md` 的那一个可以靠一行导入拿到 `AGENTS.md` 的全部内容。**唯一例外**:用户在下面的迁移之问上明确拒绝时,内容留在 `CLAUDE.md`。

### `CLAUDE.md` 只是垫片

**仅当 Claude Code 会用于本仓库时才建 `CLAUDE.md`,且它只含 `@AGENTS.md` 一行,不得存放任何内容**(本 skill 在 Claude Code 中运行即视为在用;用户明确说明本仓库不给 Claude Code 使用时不建)。

Windows 上不得用 symlink 代替导入——创建 symlink 需要管理员权限或开发者模式,`@AGENTS.md` 导入没有这个前提。

### 已有文件时

按 `CLAUDE.md` 是否含实质内容分派,两种情形**互斥**:

- **`CLAUDE.md` 不存在,或只是一行导入** → 块写进 `AGENTS.md`(不存在就建)。Claude Code 在用而垫片缺失时,补上那行导入。
- **`CLAUDE.md` 含实质内容**(不止一行导入;**无论 `AGENTS.md` 是否存在**)→ **先问用户:是否把内容迁往 `AGENTS.md`、`CLAUDE.md` 改为一行导入?** 推荐迁移——单一来源,其余 agent 也读得到;两个文件各有内容时漂移已经发生,这一问正是收敛的机会。同意 → 迁移后块写进 `AGENTS.md`;拒绝 → 块写进 `CLAUDE.md`,`AGENTS.md` 除 C 节的引用行外保持原样(存在不动;不存在时只为引用行新建;既有 `## Agent skills` 段的就地更新除外,见下)。迁移是内容搬家,**必须逐字搬运,不得顺手改写**。

**`capabilities.toml` 的引用行一律写在 `AGENTS.md`,不随 `## Agent skills` 段的去向走**——全局指令要求没载入任何 skill 的 agent 也能从 `AGENTS.md` 找到它。

**不得让两个文件各存一份相同内容。** 单一来源加导入;两份并存必然漂移,而没有任何检查会发现。

**`## Agent skills` 段全仓库只许有一段。** 已有段时在它所在的那个文件里就地更新,不得在另一个文件另写一段——**段的既有位置优先于上面的分派**;仅当用户同意迁移时,段随内容一并迁入 `AGENTS.md`。没有段时才按分派新写。除迁移与 C 节的引用行外,不得改动该段之外的内容。

段落形态:

```markdown
## Agent skills

### Issue tracker

[一句话说票在哪]。见 `docs/agents/issue-tracker.md`。

### 文档布局

[一句话说单上下文还是多上下文]。见 `docs/agents/docs-layout.md`。
```

`## Agent skills` 段与下列种子模板写进项目时,必须按 [artifact-names.md](./artifact-names.md) 的「种子文本」节书写。再用本 skill 目录内的种子模板写两个文件:

- [issue-tracker-github.md](./issue-tracker-github.md)
- [issue-tracker-local.md](./issue-tracker-local.md)
- [docs-layout.md](./docs-layout.md)

「其他」类 tracker 没有模板,按用户的描述从头写 `docs/agents/issue-tracker.md`。

## 5. 不创建目录

**除 D 节经用户确认的 lint 接线外,只写上面那几个文件,不得预先创建 `docs/specs/`、`docs/features/`、`docs/prototypes/` 等空目录。** 各目录由拥有它的 skill 在首次真正产出时创建——空目录进不了 git,而提前铺出来会让人以为里面本该有东西。

同理:探查发现 `CONTEXT.md`、`docs/adr/` 不存在时**静默继续**,不得提示缺失、不得建议提前创建。它们由 `/domain-modeling` 在术语或决策真正敲定时懒创建。

## 6. 收尾

告诉用户配置已写好、哪些 skill 会读它,以及 `docs/agents/*.md` 与 `capabilities.toml` 可以直接手改——只有换 tracker 或要重铺时才需要重跑本 skill;`capabilities.toml` 的更新时机按全局指令的「项目能力声明」节,不经本 skill。

`client-framework` 为 `"electron"` 时,告诉用户 Electron 项目的一次性基础设施由 `/electron-scaffold` 铺;为 `"tauri"` 时,告诉用户 Tauri 还没有对应的 scaffold skill。
