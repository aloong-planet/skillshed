---
name: github-ops
description: "Rules and standards for ANY GitHub operation — git commit, push, PR, release, tag, issue, Actions, CI check gates, branch protection/rulesets, or anything that ends up on GitHub. Use whenever cutting a branch, committing, pushing, opening/reviewing a PR, cutting a release, creating/deleting tags, editing release notes, setting up or verifying CI gates and required status checks, or writing anything published to a GitHub repo. Enforces the no-AI-signature rule, the branch-from-master rule, and the release/tag conventions. **Watching CI: run this skill's own watch-ci.sh — never hand-roll a polling loop.**"
when_to_use: "Activate for any git branch creation / commit / push / PR / release / tag / issue / GitHub Actions / CI gate / branch ruleset work, or any text that will appear on GitHub. Waiting on a CI run counts — use watch-ci.sh from this skill's directory."
---

# GitHub 操作规范

对**任何**会出现在 GitHub 上的产出,一律遵守以下规则。

## 1. 绝不加 AI 署名(硬性,覆盖所有产出)

**任何面向 GitHub 的文本都不带 AI/co-author 痕迹。** 与默认习惯相反——默认会加 `Co-Authored-By` 和 `Generated with <工具名>`(Claude Code、Codex 等),这里**必须主动全部省略**。

- **commit message**:标题+正文,不加 `Co-Authored-By: ...`、不加 `🤖 Generated with [Claude Code]`、`Generated with Codex` 之类尾注。
- **committer / author**:不署任何 AI 工具的身份,用仓库现有 git 用户。
- **PR 描述 / body**:不加 co-author、不加 Generated-with。
- **Release notes / tag message / issue 评论**:同样不加。
- 一句话:**GitHub 上的产出只写正常技术内容,零 AI 署名。**

提交前自检——查**本分支全部** commit,不只最后一条(一次推多条时 `-1` 会漏掉前面的):

```bash
git log origin/master..HEAD --format=%B | grep -inE "co-authored|generated with" \
  && echo "有署名,必须改" || echo "干净"
```

这里不必先 `fetch`:`origin/master` 陈旧只会让范围**变大**(多查几条),不会漏查——与第 2 节的基线自检方向相反,那边陈旧会导致误判。

**这条命令只覆盖 commit message。** PR 描述、release note、issue 与评论不在 git 历史里,自检查不到——它们在**提交给平台之前**逐份自查:正文里不得出现 co-author 行、`Generated with` 尾注、或任何指向 AI 工具的署名。判据:每份将要发到平台的文本,发出前都能说出"已看过、无署名"。

## 2. 分支永远从最新 master 拉(硬性)

`git checkout -b` 之前**必须**先把基线摆正:

```bash
git checkout master && git pull        # 先回 master 并拉最新
git checkout -b <type>/<slug>          # 再拉新分支
```

**这条对一切分支生效**——feature 分支、配 CI、修工具链、改文档、hotfix,全都算。不要因为"这次只是顺手配个 CI"就在当前分支上直接 `-b`。
**本节一律以 `master` 指代该仓库的默认分支**;实际叫别的名字时(`main`、`trunk`),把命令里的 `master` 换成它——先查清默认分支名再执行,别照抄。

**开 PR 前自检基线**(比事后补救便宜得多):

```bash
git fetch origin                        # 必须先 fetch:origin/master 是本地缓存,不刷新就是拿陈旧基线在比
git log --oneline origin/master..HEAD   # 本分支相对 master 到底带了哪些 commit
```

这个列表必须与 PR 描述**一一对应**。数量对不上就是基线错了,**别直接开 PR**:

- **分支还没推过** → 直接 `git rebase origin/master`,零风险。
- **分支已经推过** → rebase 后必须 force push,那是破坏性操作,走第 6 节的流程(先备份、告知代价、经确认)。改基线的成本在推送那一刻就翻倍了,这也是为什么这条检查要放在**开 PR 前**。

**机制:在未合并的分支上再拉分支,新 PR 会静默带上旧分支的全部 commit。** PR 描述只写新改动,squash 合并后 master 上落下一个标题只说小改动、内容却是整批的 commit。代码可以全对、CI 全绿,坏的是**历史可读性**——`git log` 与 bisect 追某个改动的来历时,会被指到名不副实的 commit 上;修复要 force push 默认分支(第 6 节的破坏性操作),代价远高于事前敲那两条命令。

**合并之后**:下一个分支开工前再 `git checkout master && git pull` 一次,别拿合并前的本地 master 当基线。

**提交前核对暂存区的实际内容,不只看文件名**:同一工作区可能有另一个会话或另一件事在并行改动,按文件 `add` 会把不属于本次的改动一并带走,而 commit 只显示文件名、看不出里面混了什么。判据:提交前逐处过一遍暂存的改动内容,每一处都能说出它属于本次的哪条需求;说不出的先撤出暂存区。

## 3. 合并需要人明确授权(硬性)

**开 PR 不构成合并授权。** 开完 PR 就停下,等用户明确说合并再执行——CI 全绿、检查全过、"看起来没问题"都不是授权,它们是合并的**前置条件**而非**批准**。

- 授权只认用户当轮的明确表态;此前某一轮说过"合了吧"不覆盖这一轮的新 PR。
- 未获授权时不得执行合并动作,也不得为"顺便"而合并任何其它已开 PR。
- 获授权后:默认 squash 合并保持默认分支线性、合并后删远程分支;合并方式有特殊需要用户会说明。

判据:执行合并前说得出用户是在哪一句话里批准了**这一个** PR。

## 4. 发版 / Release 标准

版本号语义化(`vMAJOR.MINOR.PATCH`);先改 `package.json` version,再打同名 tag。**tag 名决定 CI 行为**:

| tag 形态 | 含义 | GitHub 标记 |
|---|---|---|
| **正式版 tag**:干净 tag(如 `v0.6.0`) | 正式版 | **Latest** |
| **预发布 tag**:带预发布后缀(`-alpha`/`-beta`/`-rc`/`-dev`) | 迭代版 | **Pre-release** |

- **macOS 安装包先看项目能力声明**:读 `capabilities.toml` 的 `macos-distribution`(读写规则见全局指令的「项目能力声明」节)——
  - `enabled = true` → 必须完整读取 `electron-scaffold` 的 [macos-signing.md](../electron-scaffold/macos-signing.md),按其第 10 节执行;该文档的条文与本文件同等生效。
  - `enabled = false` → 产出里写明「按项目能力声明,macos-distribution 未启用,该项跳过」,本文件里凡涉及 macOS 安装包的步骤一并跳过。
  - 缺失 → 未确认,按全局指令停下来问。

### Release note 必填(不留空)

每个 Release 都要写 note,**照 `release-note-template.md`(本 skill 目录内)填写**:

- **面向最终用户**写用户能感知的变化,不贴 `feat:`/`fix:` commit 原文;技术改动翻译成人话。
- **不用任何 emoji / 图标**,正文纯文字。开头"版本说明"1–3 句概括,再分组(新功能/优化/修复/破坏性变更,按需删)。
- **Release Title 只写「版本号-类型」,不带亮点说明**:正式版(干净 tag)= `<tag>-release`(如 `v1.2.0-release`);预发布(`-beta`/`-rc`/`-alpha`/`-dev` 后缀 tag)= 直接用带后缀的 tag 名(如 `v1.2.0-beta`)。亮点/变更/下载全部放正文,标题不重复。
- **桌面 app 必写"下载与安装"**:各平台产物文件名 + 安装版/免安装版区别 + 首次安装提示。
- **macOS 段按本节开头的能力开关处理**:启用时写法按 macos-signing.md 第 10 节;未启用时删掉模板里的整段 macOS 内容。
- 结尾放 `Full Changelog: .../compare/<上一版>...<本次>` 对比链接。
- note/title/tag message 同样**无 AI 署名**(第 1 节)。
- **顶部"版本说明"(1–3 句人话摘要:本版最大变化 + 用户好处)由用户提供或确认**——这是收益叙事,不要自己编;其余模板部分(下载表/安装提示/macOS 段/changelog 链接)自动填好。

## 5. 标准发版流程(每步验证,不跳步)

1. 改 `package.json` version。
2. **本地验证全绿**再发:typecheck + test + build(用项目实际脚本)。
3. commit(**无 AI 署名**)+ push。**默认分支若配了 required status checks,直推会被拒**(见第 8 节),此时版本号变更也走 PR,合并后再打 tag。
4. 打 tag + push tag(正式版 tag 或预发布 tag,见第 4 节)。tag 推送不受分支规则影响。
5. **盯 CI 到完成**:跑本 skill 自带的 `watch-ci.sh`(用法与原理见第 7 节)。不得手写轮询循环。
6. **下载 Release 产物独立验证**(不只信 CI 绿):逐个平台的产物下载下来实际检查。macOS 安装包按第 4 节开头的能力开关处理——启用时按 macos-signing.md 第 10 节验。
7. **写 Release note(约定:CI 验证通过后主动做,不等用户开口)**:
   - CI `conclusion=success` 且第 6 步产物验证通过后,**主动提醒用户**"该更新 release note 了"。
   - 照 `release-note-template.md` 拟稿,自动填好下载表/安装提示/changelog 链接等固定部分;macOS 段按第 4 节开头的能力开关处理。
   - **顶部"版本说明"人话摘要向用户要或让其确认**(不自己编收益叙事)。
   - 用户确认后用 `gh release edit <tag> --title "<tag>-release" --notes-file <文件>` 更新(预发布 tag 标题直接用带后缀的 tag 名)。note/title **无 AI 署名**。
8. 需要时清理测试 tag/Release/Actions 记录,保持版本列表干净。

## 6. 改历史 / 破坏性操作(force push、删 tag/Release、rewrite)

破坏性,必须:
1. **先备份**(备份分支推到远程)。
2. 明确告知用户代价(SHA 全变、tag/Release 受影响、不可逆),得到确认再做。
3. 每步验证,完成并验证 OK 后才删备份。

## 7. 盯 CI 的可靠方式

**先看这条:用本 skill 自带的 `watch-ci.sh`,不要手写轮询循环。** 命令与用法在本节末尾。

**手写轮询的失败形态是静默空转**:循环把「命令报错」与「条件未成立」压成同一种表现——什么都不发生——而前者永远不会自行成立,看起来跟「CI 还在跑」一模一样,极易被当成"监视器正常超时"放过。典型诱因是版本相关的 flag:装机的 CLI 没有那个 flag 时,循环里每一轮都在报错,命令替换拿到空串,循环永不退出。

两条要求,与 CLI 版本无关:
- **轮询循环里的命令,先单独跑一次确认它有输出。**
- **版本相关的事实不要写进 frontmatter**。description 每轮都注入上下文,把会腐烂的
  细节钉在那儿,等于每轮误导一次;而正文里的过期内容至少还有人读到时能发现。
  frontmatter 只放机制无关的指向("用 watch-ci.sh"),版本细节留在正文。

下面是脚本背后的原理(需要自己查一次状态时用):
`gh run watch --exit-status` 的退出码在某些环境会误报成功/失败。**改用轮询 conclusion**:
```bash
gh run view <run-id> --repo <owner/repo> --json status,conclusion --jq '"\(.status)|\(.conclusion)"'
```
`status=completed` 且 `conclusion=success` 才算成功。

**用本 skill 自带的 `watch-ci.sh`**(本 skill 目录内,下文以 `<skill-dir>` 代指该目录;调用时换成本 skill 实际所在的目录),别每次手写轮询循环:
```bash
<skill-dir>/watch-ci.sh                       # 锚定当前 HEAD:覆盖该 commit 的全部 run,盯到全部完成
<skill-dir>/watch-ci.sh --workflow <名称>     # 只盯该 commit 上指定 workflow 的 run
<skill-dir>/watch-ci.sh <run-id>              # 指定单个 run
INTERVAL=15 <skill-dir>/watch-ci.sh           # 轮询间隔(秒,默认 30)
CREATE_WAIT=300 <skill-dir>/watch-ci.sh       # 等第一个 run 出现的上限(秒,默认 120)
SETTLE=60 <skill-dir>/watch-ci.sh             # 全部完成后再等的静默窗口(秒,默认 20)
TIMEOUT=3600 <skill-dir>/watch-ci.sh          # 总时限(秒,默认 2400)
```
无参时按 HEAD 的 commit 锚定:「取最近一次 run」在推送后立刻调用有
竞态——新 run 未建出来时抓到的是上一轮旧 run,绿得毫无意义。HEAD 没有 run(没推送/不触发
workflow)时明确报错退出,不退回"最近一次"。⚠️ `gh run list --commit` 只认**全长** SHA,
短 SHA 静默返回空。
**一个 commit 触发多个 workflow 时,只看其中一个就会在另一个还在跑时报绿**,所以无参调用覆盖该 commit 的**全部** run:
每轮重读 run 列表,全部 completed 之后再等一个静默窗口(`SETTLE`),列表不变才收尾——各 run 相隔几秒才建出,
由 `workflow_run` 串联的 workflow 要等前一个结束才建出,窗口就是为它们留的;**窗口过后才建出的 run 不在覆盖内**,
串联 workflow 在前一个结束后超过 `SETTLE` 秒才建出的仓库,必须调大 `SETTLE`。只想盯其中一个 workflow 时显式传 `--workflow`。
在目标仓库目录下运行即可(repo 靠 `gh` 从当前目录自动推断,脚本无任何项目硬编码)。轮询 conclusion 到 completed,逐个 run 打印 conclusion 与各 job;退出码:全部 run 均为 success→0,任一 run 为其他结论(含 cancelled、skipped)→1,脚本错误、等不到 run 或超时→2。可后台跑,完成自动通知。
**不得把它接进管道**:判据是调用行里 `watch-ci.sh` 之后不出现 `|`——管道把整条命令的退出码换成末段命令的,上面那三个码当场丢失,而合并要靠它们挡住。要截断输出就先重定向到文件,取到退出码之后再读文件(机制与「用退出码数组补救」的二次陷阱见 review-code/false-greens.md 形态六)。

## 8. CI 检查门禁与分支保护

**细则见 [checks-gate.md](./checks-gate.md)。**

要点(展开与命令都在子文档):

- **门禁 = 检查 workflow + 把它设为必需的分支规则**,缺一不可。发版 workflow 不算门禁——它只在打 tag 时触发。判据一条命令:`grep -nE "pnpm (run )?(test|typecheck)" .github/workflows/*.yml` 无输出即没有门禁。
- **门禁 workflow 至少跑 typecheck + test + build**,子包全覆盖;子包有独立 lockfile 的要单独 install。
- **Node 版本不能照抄打包 workflow**:打包时产物跑的是运行时自带的 node,检查时测试跑在 runner 的 node 上,`node:sqlite` 这类版本敏感的内置模块由后者提供。
- **门禁必须证明「能红」**:一道从未失败过的门禁与没有门禁在证据上等价。本地能完整跑通的门禁先本地变异(改—跑—直接捕获退出码—还原);只有依赖 CI 环境才能复现的才开一次性 PR,变异要打不同步骤并预写预期失败步骤,验完关闭删分支、绝不合并。
- **GitHub 侧三项缺一不生效**:Enforcement 改 Active(默认 Disabled)、Target branches 非空、添加 check 名(取 job 的 `name`,未设则取 job id)。**只选质量门禁那条**,别把 Cloudflare Pages / Vercel 这类部署检查设为必需——不触及该目录的 PR 会因它从不运行而永久卡住。
- **UI 勾了不等于存成功**,用 `gh api repos/<owner>/<repo>/rulesets/<id>` 核验 enforcement / include / rules / checks 四项。
- **门禁生效后直推默认分支会被拒**,发版的版本号变更改走 PR(见第 5 节第 3 步);tag 推送不受影响。

## 9. Issue 操作

`gh` 从**当前工作目录**推断仓库。因此在目标仓库的 clone 之外操作时,每条命令都必须显式带
`-R <owner>/<repo>`——在 A 仓库的工作目录里往 B 仓库建票是常态,漏掉 `-R` 不会报错,票会静默
建到当前仓库里去。判据:命令里出现 issue 编号或要新建票,而 `pwd` 不在该仓库的 clone 内,就必须有 `-R`。

```bash
gh issue create -R <owner>/<repo> --title "…" --body "$(cat <<'BODY'
多行正文写在 heredoc 里
BODY
)"
gh issue view   <n> -R <owner>/<repo> --comments
gh issue comment <n> -R <owner>/<repo> --body "…"
gh issue edit   <n> -R <owner>/<repo> --add-label "…"   # 或 --remove-label
gh issue close  <n> -R <owner>/<repo> --comment "…"
```

**多行正文一律用 heredoc**,不要靠引号转义拼接:正文里的反引号、`$`、换行在双引号中会被 shell
解释,拼出来的票在 GitHub 上与本地看到的不是同一份内容。

一次取全字段(比逐票 `view` 少几轮往返):

```bash
gh issue list -R <owner>/<repo> --state open \
  --json number,title,body,labels,comments \
  --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'
```

票的标题、正文与评论同样受第 1 节约束:**无 AI 署名**。

## 10. 新建仓库与首次推送

**首次推送前必须扫凭据,发现环节本身就要覆盖全历史**——凭据风险在历史里,只扫工作区的发现流程与这条机制自相矛盾:加了又删的值恰好只存在于历史 blob 中,工作区扫描对它双目失明。

首选现成扫描器,不手搓模式库(与「有解析器就不写正则」同口径):

```bash
gitleaks detect --source . --redact    # 逐提交扫全历史,维护中的规则库+熵检测
```

**扫描在提交之后、推送之前跑。** 历史扫描看不见未提交的内容——"先扫再提交"这个自然顺序会拿到一个毫无意义的绿:扫时值不在历史里,提交后它进了历史,推送把它带出去。扫红了也不亏:值只进了本地历史,正处在下述零代价窗口里。

子命令与 flag 随版本漂移(新版是 `gitleaks git`),**先单独跑一次确认本机版本的用法,再写进任何流程**。扫描器不可用时的退路,两道并跑——历史按值、工作区按名,各补对方的盲区(值形态清单永远不全,自定义凭据靠名字在工作区露头;挂名检索进不了打包的历史 blob,裸值靠形态在历史里露头):

```bash
git rev-list --objects --all | awk '{print $1}' | git cat-file --batch 2>/dev/null \
  | grep -aoE "(AIza[0-9A-Za-z_-]{35}|ghp_[A-Za-z0-9]{36}|sk-[A-Za-z0-9]{32,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,})" | sort -u
grep -rniE "(api[_-]?key|secret|token|password|-----BEGIN)" . --exclude-dir=.git
```

无论哪条路,**扫描都是筛选器,不是判决**:`token`、`password` 这类词在正常文档里大量合法出现,「零命中」在文档型仓库不可达——拿它当判据,门禁永远红,教出来的唯一反射是无视门禁。真正的判据:**每一条命中都能当场说清是引用而非真值;说不清的按真值处理;真值零容忍**,以 `git log --all -S "<真值>"` 定位它进过哪些提交,清历史(见下)后复扫归零再谈推送。

机制,三条都并入判断:

- **私有是当下的可见性,不是属性**——转公开、加协作者、fork、CI 缓存、克隆散落,任何一环都会把内容带出去。每一次推送按"终将可见"处理。
- **凭据风险在历史里,不在工作区**。把工作区的值改掉不解决问题,`git log -S` 才是判据。
- **一旦推送过,清理历史不能替代轮换**——旧值已经存在过,必须假定不再可信。

两条路径的风险位置不同,都要覆盖:

| 路径 | 凭据风险在哪 |
|---|---|
| 建空仓库,内容后推 | 将要提交的**工作区** |
| 已有本地 git 历史的目录接 remote | **历史**——工作区可能早已干净,这正是最容易漏的一种 |

**无 remote 是重写历史的零代价窗口**:改历史的成本在推送那一刻翻倍(第 6 节)。已有本地历史的目录接 remote 前,该清的必须现在清(`git filter-repo --replace-text`),清完用上面两条判据复验。

其余首推检查:

- `.gitignore` 先于首个 commit 就位——否则第一个提交就把不该带的固化进历史。
- 可见性按内容定:含个人工作习惯、内部约定、真实项目细节的默认私有;要公开,先过上面的凭据扫描并复核内容。
- **仓库同时是运行时目录时**(如 agent 的配置目录本身就是仓库),破坏性 git 操作会当场改变运行中的行为——`filter-repo` / `reset --hard` 会吃掉未提交改动、把文件退回 HEAD。操作前先全量备份(含未跟踪文件),并确认没有会话正依赖该目录。


## 11. 面向 GitHub 的文字用仓库工作语言

**commit message、PR 标题与正文、issue 及其评论,凡在 `working-language` 管辖范围内的,一律用该语言书写**——值与管辖范围以 `capabilities.toml` 及 `/repo-scaffold` 的能力登记表为准,读写规则见全局指令的「项目能力声明」节,本节不复述。该项未确认时按全局指令停下问用户,不得自行选语言。引用的标识符、命令、文件路径与报错原文按原样保留,不翻译。

判据:每份将要提交或发到平台的文字,发出前都能说出「已核对,语言与 `working-language` 一致」。
