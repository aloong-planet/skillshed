---
name: repo-scaffold
description: 把一个仓库配置成这套 skills 能在其上运作的样子——记录 issue tracker 的位置与用法、文档布局约定,写进 docs/agents/ 并在 CLAUDE.md 挂上索引。在某个仓库首次使用这套 skills 之前跑一次;更换 issue tracker、或要重铺约定时重跑。
disable-model-invocation: true
---

# Repo Scaffold

给仓库铺一次性配置。铺完之后其余 skills 才知道:票往哪里发、文档往哪里放、术语从哪里取。

**两类配置**:

- **Issue tracker** —— 票存在哪、怎么读写。`to-tickets` 与 `to-spec` 读它。
- **文档布局** —— 哪个目录放什么、哪些是结论、哪些只是过程记录。几乎所有 skill 都读它。

这是提问驱动的 skill,不是确定性脚本。**必须先探查、再呈现、经用户确认后才写**;不得凭默认值直接落盘。

## 1. 探查

读当前仓库的实际状态,**不得假设**:

- `git remote -v` —— 是不是 GitHub 仓库、哪一个
- 仓库根的 `CLAUDE.md` 与 `AGENTS.md` —— 哪个存在、里面是否已有 `## Agent skills` 段
- 仓库根的 `CONTEXT.md` 与 `CONTEXT-MAP.md`
- `docs/` 下已有哪些目录(`adr` `specs` `features` `prototypes` `postmortems` `ops` `.workings`)
- `docs/agents/` —— 本 skill 上次的产出是否已存在

## 2. 逐节确认

先汇报探查结果:已有什么、缺什么。然后一节一问、一问一答,**每节先给出推荐答案**,用户一个词就能接受。探查已经定死的节直接跳过,不要为了走流程而问。

**A 节 —— Issue tracker.**

> 这套 skills 里 `to-tickets` 与 `to-spec` 要往 tracker 发票、从 tracker 取票,必须知道该调 `gh issue create` 还是写文件。

`git remote` 指向 GitHub 就推荐 GitHub。否则提供:

- **GitHub** —— 票是仓库的 GitHub Issues,操作规范见 `/github-ops` 第 8 节
- **本地文件** —— 票是 `docs/.workings/<slug>/issues/` 下的文件,适合无远程或纯个人的仓库
- **其他**(Jira、Linear 等)—— 请用户用一段话描述工作流,原样记录

选定后按种子模板写 `docs/agents/issue-tracker.md`。

**B 节 —— 文档布局.** 默认**单上下文**:仓库根一个 `CONTEXT.md`,`docs/adr/` 放决策。这适合绝大多数仓库,**直接写,不必问**。

仅当探查发现 monorepo 迹象(`pnpm-workspace.yaml`、`package.json` 的 `workspaces`、`packages/*` 各自带 `src/`)时,才提供**多上下文**选项。多上下文的格式与推断规则由 `/domain-modeling` 定义,见其 `CONTEXT-FORMAT.md`——**本 skill 不重复定义,只记录选了哪种**。

## 3. 出草稿

把要写的东西完整呈现给用户,**让其先改再写**:

- 要插进 `CLAUDE.md` / `AGENTS.md` 的 `## Agent skills` 段
- `docs/agents/issue-tracker.md` 与 `docs/agents/docs-layout.md` 的内容

## 4. 写入

**选文件的规则,不得违反**:

- `CLAUDE.md` 存在 → 改它。
- 否则 `AGENTS.md` 存在 → 改它。
- 两个都不存在 → **问用户建哪个**,不得替他选。
- **`CLAUDE.md` 已存在时一律不得新建 `AGENTS.md`**,反之亦然;始终改已经在那儿的那个。

**已有 `## Agent skills` 段时就地更新其内容,不得追加出第二段。** 不得改动该段之外的内容。

段落形态:

```markdown
## Agent skills

### Issue tracker

[一句话说票在哪]。见 `docs/agents/issue-tracker.md`。

### 文档布局

[一句话说单上下文还是多上下文]。见 `docs/agents/docs-layout.md`。
```

再用本 skill 目录内的种子模板写两个文件:

- [issue-tracker-github.md](./issue-tracker-github.md)
- [issue-tracker-local.md](./issue-tracker-local.md)
- [docs-layout.md](./docs-layout.md)

「其他」类 tracker 没有模板,按用户的描述从头写 `docs/agents/issue-tracker.md`。

## 5. 不创建目录

**只写上面那几个文件,不得预先创建 `docs/specs/`、`docs/features/`、`docs/prototypes/` 等空目录。** 各目录由拥有它的 skill 在首次真正产出时创建——空目录进不了 git,而提前铺出来会让人以为里面本该有东西。

同理:探查发现 `CONTEXT.md`、`docs/adr/` 不存在时**静默继续**,不得提示缺失、不得建议提前创建。它们由 `/domain-modeling` 在术语或决策真正敲定时懒创建。

## 6. 收尾

告诉用户配置已写好、哪些 skill 会读它,以及 `docs/agents/*.md` 可以直接手改——只有换 tracker 或要重铺时才需要重跑本 skill。
