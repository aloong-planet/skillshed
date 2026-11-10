---
name: github-ops
description: "Rules and standards for ANY GitHub operation — git commit, push, PR, release, tag, issue, Actions, CI check gates, branch protection/rulesets, or anything that ends up on GitHub. Use whenever cutting a branch, committing, pushing, opening/reviewing a PR, cutting a release, creating/deleting tags, editing release notes, setting up or verifying CI gates and required status checks, or writing anything published to a GitHub repo. Enforces the no-AI-signature rule, the branch-from-main rule, and the release/tag conventions. **Watching CI: run this skill's own watch-ci.sh — never hand-roll a polling loop.**"
when_to_use: "Activate for any git branch creation / commit / push / PR / release / tag / issue / GitHub Actions / CI gate / branch ruleset work, or any text that will appear on GitHub. Waiting on a CI run counts — use watch-ci.sh from this skill's directory."
---

# GitHub 操作规范

对**任何**会出现在 GitHub 上的产出,一律遵守以下规则。

## 按情形必读的文件

遇到下列情形,必须先完整读取对应文件再动手;本文其余各节的规则同时生效:

- 发版(改版本号、打 tag、写 Release note):[release.md](release.md);写 Release note 时同时读 [release-note-template.md](release-note-template.md),发版中等 CI 结果时同时读 [ci-watch.md](ci-watch.md)。
- 等 CI 运行结果、判断某次运行的结论:[ci-watch.md](ci-watch.md)。
- 作为被派来执行交付的子 agent(委派方给出检出、分支、交出的 commit 与交付说明文件,要求推送、开 PR 并等 CI):[delivery.md](delivery.md),等 CI 时同时读 [ci-watch.md](ci-watch.md)。
- 新建、查看、评论、改标签或关闭 Issue:[issues.md](issues.md)。
- 新建 GitHub 仓库、首次推送,或给已有本地历史的目录接 remote:[first-push.md](first-push.md)。

## 1. 绝不加 AI 署名(硬性,覆盖所有产出)

**任何面向 GitHub 的文本都不带 AI/co-author 痕迹。** 与默认习惯相反——默认会加 `Co-Authored-By` 和 `Generated with <工具名>`(Claude Code、Codex 等),这里**必须主动全部省略**。

- **commit message**:标题+正文,不加 `Co-Authored-By: ...`、不加 `🤖 Generated with [Claude Code]`、`Generated with Codex` 之类尾注。
- **committer / author**:不署任何 AI 工具的身份,用仓库现有 git 用户。
- **PR 描述 / body**:不加 co-author、不加 Generated-with。
- **Release notes / tag message / issue 评论**:同样不加。
- 一句话:**GitHub 上的产出只写正常技术内容,零 AI 署名。**

提交前自检——查**本分支全部** commit,不只最后一条(一次推多条时 `-1` 会漏掉前面的):

```bash
git log origin/main..HEAD --format=%B | grep -inE "co-authored|generated with" \
  && echo "有署名,必须改" || echo "干净"
```

这里不必先 `fetch`:`origin/main` 陈旧只会让范围**变大**(多查几条),不会漏查——与第 2 节的基线自检方向相反,那边陈旧会导致误判。

**这条命令只覆盖 commit message。** PR 描述、release note、issue 与评论不在 git 历史里,自检查不到——它们在**提交给平台之前**逐份自查:正文里不得出现 co-author 行、`Generated with` 尾注、或任何指向 AI 工具的署名。判据:每份将要发到平台的文本,发出前都能说出"已看过、无署名"。

## 2. 分支永远从最新 main 拉(硬性)

`git checkout -b` 之前**必须**先把基线摆正:

```bash
git checkout main && git pull        # 先回 main 并拉最新
git checkout -b <type>/<slug>          # 再拉新分支
```

**这条对一切分支生效**——feature 分支、配 CI、修工具链、改文档、hotfix,全都算。不要因为"这次只是顺手配个 CI"就在当前分支上直接 `-b`。
**本节一律以 `main` 指代该仓库的默认分支**;实际叫别的名字时(`master`、`trunk`),把命令里的 `main` 换成它——先查清默认分支名再执行,别照抄。

**开 PR 前自检基线**(比事后补救便宜得多):

```bash
git fetch origin                        # 必须先 fetch:origin/main 是本地缓存,不刷新就是拿陈旧基线在比
git log --oneline origin/main..HEAD   # 本分支相对 main 到底带了哪些 commit
```

这个列表必须与 PR 描述**一一对应**。数量对不上就是基线错了,**别直接开 PR**:

- **分支还没推过** → 直接 `git rebase origin/main`,零风险。
- **分支已经推过** → rebase 后必须 force push,那是破坏性操作,走第 4 节的流程(先备份、告知代价、经确认)。改基线的成本在推送那一刻就翻倍了,这也是为什么这条检查要放在**开 PR 前**。

**机制:在未合并的分支上再拉分支,新 PR 会静默带上旧分支的全部 commit。** PR 描述只写新改动,squash 合并后 main 上落下一个标题只说小改动、内容却是整批的 commit。代码可以全对、CI 全绿,坏的是**历史可读性**——`git log` 与 bisect 追某个改动的来历时,会被指到名不副实的 commit 上;修复要 force push 默认分支(第 4 节的破坏性操作),代价远高于事前敲那两条命令。

**合并之后**:下一个分支开工前再 `git checkout main && git pull` 一次,别拿合并前的本地 main 当基线。

**提交前核对暂存区的实际内容,不只看文件名**:同一工作区可能有另一个会话或另一件事在并行改动,按文件 `add` 会把不属于本次的改动一并带走,而 commit 只显示文件名、看不出里面混了什么。判据:提交前逐处过一遍暂存的改动内容,每一处都能说出它属于本次的哪条需求;说不出的先撤出暂存区。

## 3. 合并需要人明确授权(硬性)

**开 PR 不构成合并授权。** 开完 PR 就停下,等用户明确说合并再执行——CI 全绿、检查全过、"看起来没问题"都不是授权,它们是合并的**前置条件**而非**批准**。本节只有一个例外,见下面「唯一的例外」一条。

- 授权只认用户当轮的明确表态;此前某一轮说过"合了吧"不覆盖这一轮的新 PR。
- 未获授权时不得执行合并动作,也不得为"顺便"而合并任何其它已开 PR。
- 获授权后:默认 squash 合并保持默认分支线性、合并后删远程分支;合并方式有特殊需要用户会说明。
- **唯一的例外**是能力 `docs-auto-merge` 所定的合并,其含义、全部条件与各条件的判定方法见 `/repo-scaffold` 的 [capabilities-registry.md](../repo-scaffold/capabilities-registry.md) 所指之处。必须先判其中「这一个 PR 不改动可执行内容」一项:不成立的,不适用本例外,也不读该能力;成立的,再读项目的 `capabilities.toml`,该能力启用、且其余条件对这一个 PR 全部核实成立时,合并不需要用户授权:不问用户,按上一条的合并方式合并。有一项条件不成立或没有核实的,仍按本节等授权。

判据:执行合并前说得出用户是在哪一句话里批准了**这一个** PR;按例外合并的,说得出每一项条件是由什么核实成立的。

## 4. 改历史 / 破坏性操作(force push、删 tag/Release、rewrite)

破坏性,必须:
1. **先备份**(备份分支推到远程)。
2. 明确告知用户代价(SHA 全变、tag/Release 受影响、不可逆),得到确认再做。
3. 每步验证,完成并验证 OK 后才删备份。

## 5. CI 检查门禁与分支保护

**细则见 [checks-gate.md](./checks-gate.md)。**

要点(展开与命令都在子文档):

- **门禁 = 检查 workflow + 把它的 `CI gate` 设为必需的分支规则**,缺一不可。发版 workflow 不算门禁——它只在打 tag 时触发。判据是 checks-gate.md 第 1 节「存在性判据」那条检索,无输出即没有门禁。
- **门禁 workflow 至少跑 typecheck + test + build**,子包全覆盖;子包有独立 lockfile 的要单独 install。
- **从 `assets/ci-routing/` 起步**:产品 job 由 PR 的改动路径决定是否运行,默认分支的 push 全部运行;分类与判定脚本不改代码,项目只写 `routing.json` 与它的用例。门禁 workflow 不写 workflow 级 `paths` 过滤。
- **Node 版本不能照抄打包 workflow**:打包时产物跑的是运行时自带的 node,检查时测试跑在 runner 的 node 上,`node:sqlite` 这类版本敏感的内置模块由后者提供。
- **门禁必须证明「能红」**:一道从未失败过的门禁与没有门禁在证据上等价。本地能完整跑通的门禁先本地变异(改—跑—直接捕获退出码—还原);只有依赖 CI 环境才能复现的才开一次性 PR,变异要打不同步骤并预写预期失败步骤,验完关闭删分支、绝不合并。
- **GitHub 侧三项缺一不生效**:Enforcement 改 Active(默认 Disabled)、Target branches 非空、添加 `CI gate`(取 job 的 `name`,未设则取 job id)。别把 Cloudflare Pages / Vercel 这类部署检查设为必需——不触及该目录的 PR 会因它从不运行而永久卡住。
- **UI 勾了不等于存成功**,用 `gh api repos/<owner>/<repo>/rulesets/<id>` 核验 enforcement / include / rules / checks 四项。
- **门禁生效后直推默认分支会被拒**,发版的版本号变更改走 PR(见 [release.md](release.md)「标准发版流程」第 3 步);tag 推送不受影响。

## 6. 面向 GitHub 的文字用仓库工作语言

**commit message、PR 标题与正文、issue 及其评论,凡在 `working-language` 管辖范围内的,一律用该语言书写**——值与管辖范围以 `capabilities.toml` 及 `/repo-scaffold` 的能力登记表为准,读写规则见全局指令的「项目能力声明」节,本节不复述。该项未确认时按全局指令停下问用户,不得自行选语言。引用的标识符、命令、文件路径与报错原文按原样保留,不翻译。

判据:每份将要提交或发到平台的文字,发出前都能说出「已核对,语言与 `working-language` 一致」。

## 7. workflow 里的 action 一律钉到完整 commit(pin every action)

**每个 action 必须写成 `owner/repo@<40 位十六进制 commit> # v<x.y.z>`,同一个 action 在所有 workflow 里钉同一个 commit;不得钉 tag 或分支。** 机理:tag 与分支都能被挪到别的代码上,而门禁 workflow 决定什么能合进默认分支、发版 workflow 握着签名凭据与发布权限——action 在 tag 下被换掉,这两类 job 跑的就是没人审过的代码。

- 升级某个 action 时,到它自己的仓库把目标 release 的 tag 解析成 commit,用到它的 workflow 一起改:`gh api repos/<owner>/<repo>/commits/<tag> --jq .sha`。
- 「某个 commit 是哪个 release」「它是不是当前大版本」离线查不出,必须在升级时当场解析;离线检查只核形式。

判据:`.github/workflows/` 下每一行 `uses:`,除指向本仓库的引用(`./` 或 `$/` 开头)与 `docker://` 引用外,`@` 后都是 40 位小写十六进制并在行尾带 `# v<x.y.z>`;同一个 `owner/repo` 在各行的 commit 相同。

**新增或改动 `.github/workflows/` 下任一文件后、提交前,必须在目标仓库根目录运行本 skill 目录内的 `check-action-pins.mjs`(需要 node),退出码为 0 才得提交。** 它按上面的判据逐行核对,违反处以「文件:行号」列出;退出码 1 即有违反,退出码 2 即没有核对到任何 workflow 文件,两者都不得当作通过。它读不懂的 `uses` 写法(流式映射 `{ uses: ... }`、值折到下一行)同样报为违反,必须改写成单行的块式键。
