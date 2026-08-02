---
name: github-ops
description: "Rules and standards for ANY GitHub operation — git commit, push, PR, release, tag, issue, Actions, CI check gates, branch protection/rulesets, or anything that ends up on GitHub. Use whenever cutting a branch, committing, pushing, opening/reviewing a PR, cutting a release, creating/deleting tags, editing release notes, setting up or verifying CI gates and required status checks, or writing anything published to a GitHub repo. Enforces the no-AI-signature rule, the branch-from-master rule, and the release/tag conventions."
when_to_use: "Activate for any git branch creation / commit / push / PR / release / tag / issue / GitHub Actions / CI gate / branch ruleset work, or any text that will appear on GitHub."
---

# GitHub 操作规范

对**任何**会出现在 GitHub 上的产出,一律遵守以下规则。

## 1. 绝不加 AI 署名(硬性,覆盖所有产出)

**任何面向 GitHub 的文本都不带 AI/co-author 痕迹。** 与默认习惯相反——默认会加 `Co-Authored-By` 和 `Generated with Claude Code`,这里**必须主动全部省略**。

- **commit message**:标题+正文,不加 `Co-Authored-By: ...`、不加 `🤖 Generated with [Claude Code]` 之类尾注。
- **committer / author**:不署 Claude/AI 身份,用仓库现有 git 用户(如 loong_zhou)。
- **PR 描述 / body**:不加 co-author、不加 Generated-with。
- **Release notes / tag message / issue 评论**:同样不加。
- 一句话:**GitHub 上的产出只写正常技术内容,零 AI 署名。**

提交前自检——查**本分支全部** commit,不只最后一条(一次推多条时 `-1` 会漏掉前面的):

```bash
git log origin/master..HEAD --format=%B | grep -inE "co-authored|generated with" \
  && echo "有署名,必须改" || echo "干净"
```

这里不必先 `fetch`:`origin/master` 陈旧只会让范围**变大**(多查几条),不会漏查——与第 2 节的基线自检方向相反,那边陈旧会导致误判。

## 2. 分支永远从最新 master 拉(硬性)

`git checkout -b` 之前**必须**先把基线摆正:

```bash
git checkout master && git pull        # 先回 master 并拉最新
git checkout -b <type>/<slug>          # 再拉新分支
```

**这条对一切分支生效**——feature 分支、配 CI、修工具链、改文档、hotfix,全都算。不要因为"这次只是顺手配个 CI"就在当前分支上直接 `-b`。

**开 PR 前自检基线**(比事后补救便宜得多):

```bash
git fetch origin                        # 必须先 fetch:origin/master 是本地缓存,不刷新就是拿陈旧基线在比
git log --oneline origin/master..HEAD   # 本分支相对 master 到底带了哪些 commit
```

这个列表必须与 PR 描述**一一对应**。数量对不上就是基线错了,**别直接开 PR**:

- **分支还没推过** → 直接 `git rebase origin/master`,零风险。
- **分支已经推过** → rebase 后必须 force push,那是破坏性操作,走第 5 节的流程(先备份、告知代价、经确认)。改基线的成本在推送那一刻就翻倍了,这也是为什么这条检查要放在**开 PR 前**。

**为什么值得单列一节**(2026-08-02 实际踩过):在一条未合并的 feature 分支上顺手拉了配 CI 的分支,PR 描述只写 CI,实际带着整张 feature 票的改动。squash 合并后 master 上出现一个**标题只说 CI、内容却是整张票**的 commit;原来那几条写得很细的 commit message 也在 squash 里一起没了。

后果不在代码——内容是对的、CI 全绿——而在**历史可读性**:后人 `git log` 或 bisect 追"某字段什么时候进来的",会被指到一个名不副实的 commit 上。而修它要 force push 默认分支,是破坏性操作(见第 5 节),代价远高于事前敲那两条命令。

**合并之后**:下一个分支开工前再 `git checkout master && git pull` 一次,别拿合并前的本地 master 当基线。

## 3. 发版 / Release 标准

版本号语义化(`vMAJOR.MINOR.PATCH`);先改 `package.json` version,再打同名 tag。**tag 名决定 CI 行为**:

| tag 形态 | 含义 | CI 产出 | GitHub 标记 |
|---|---|---|---|
| **干净 tag**(如 `v0.6.0`) | 正式版 | mac 签名+**公证**(首次打开确认一次) | **Latest** |
| **预发布后缀**(`-beta`/`-rc`/`-alpha`/`-dev`) | 迭代版 | mac 只签名(右键打开) | **Pre-release** |

- 公证慢(等 Apple 2–30min)→ 只有干净 tag(正式版)才公证;快速迭代用预发布后缀。
- **mac 产出多个架构 DMG**(项目若配了 `arch: [universal, arm64, x64]`):正式版每个架构都是独立 `.app`,**公证按包各跑一次**(等待 ×产物数,正式版 CI 更久)。CI 产物 glob 用 `*.dmg` 通配,自动兼容,无需改。发 note 时下载表要按架构列全(见模板)。
- Windows 不涉及公证,照常打包。
- **通用细则**(三档与 fail-closed、凭据变量、门禁断言、产物验收、上传顺序)见 `electron-scaffold` 的 [macos-signing.md](../electron-scaffold/macos-signing.md)。
- **本项目的实际取值与流程**(签名身份、secret 名、脚本名、产物命名)以项目自己的 macOS 签名/公证**运维手册**为准(通常在 `docs/ops/` 下)。**按类别找,不要记文件名**——项目重组文档时路径会变,写死的指针必然腐烂。

### Release note 必填(不留空)

每个 Release 都要写 note,**照 `release-note-template.md`(本 skill 目录内)填写**:

- **面向最终用户**写用户能感知的变化,不贴 `feat:`/`fix:` commit 原文;技术改动翻译成人话。
- **不用任何 emoji / 图标**,正文纯文字。开头"版本说明"1–3 句概括,再分组(新功能/优化/修复/破坏性变更,按需删)。
- **Release Title 只写「版本号-类型」,不带亮点说明**:正式版(干净 tag)= `<tag>-release`(如 `v1.2.0-release`);预发布(`-beta`/`-rc`/`-alpha`/`-dev` 后缀 tag)= 直接用带后缀的 tag 名(如 `v1.2.0-beta`)。亮点/变更/下载全部放正文,标题不重复。
- **桌面 app 必写"下载与安装"**:各平台产物文件名 + 安装版/免安装版区别 + 首次安装提示。
- **macOS 公证/非公证二选一**——判断依据是本次 **tag 形态**:干净 tag=已公证(首次打开确认一次)用公证版那段;预发布后缀 tag=未公证用非公证版那段(含 `xattr -dr com.apple.quarantine` 去隔离命令)。删掉不适用的整段。
- 结尾放 `Full Changelog: .../compare/<上一版>...<本次>` 对比链接。
- note/title/tag message 同样**无 AI 署名**(第 1 节)。
- **顶部"版本说明"(1–3 句人话摘要:本版最大变化 + 用户好处)由用户提供或确认**——这是收益叙事,不要自己编;其余模板部分(下载表/安装提示/公证段/changelog 链接)自动填好。

## 4. 标准发版流程(每步验证,不跳步)

1. 改 `package.json` version。
2. **本地验证全绿**再发:typecheck + test + build(用项目实际脚本)。
3. commit(**无 AI 署名**)+ push。**默认分支若配了 required status checks,直推会被拒**(见第 7 节),此时版本号变更也走 PR,合并后再打 tag。
4. 打 tag + push tag(干净 tag=正式版触发公证;`-beta` 等=迭代版)。tag 推送不受分支规则影响。
5. **盯 CI 到完成**(用轮询 conclusion,不用 `gh run watch --exit-status`——其退出码在部分环境误报)。
6. **下载 Release 产物独立验证**(不只信 CI 绿):
   - mac 签名与公证:`spctl --assess --type execute --verbose <app>` 应 `accepted / Notarized Developer ID`;签名身份 `codesign -dv`。
   - **mac 票据装订:`spctl` 与 `codesign` 都查不出,必须挂载 DMG 对里面的 `.app` 单独跑 `xcrun stapler validate`。**
     `spctl --assess` 在联网时会通过在线查票而成功,分辨不出票据有没有装订上;票据只钉在 DMG 上的话,用户拖出 app 后首次启动断网即被拦下。
   - **装上后看到"是从互联网下载的 App,确定要打开吗"是正常的,不是验收失败**——判据是措辞,不是有没有弹框。
   - 以上三条的命令、原理与对照定位法,连同凭据配置、CI 分档、门禁断言,统一见 **`electron-scaffold` 的 [macos-signing.md](../electron-scaffold/macos-signing.md)**(第 6 节是发版验收,第 4 节是 CI 分档,第 7 节是上传顺序)。**该文档是单一出处,此处只留判据、不复制命令。**
7. **写 Release note(约定:CI 验证通过后主动做,不等用户开口)**:
   - CI `conclusion=success` 且第 6 步产物验证通过后,**主动提醒用户**"该更新 release note 了"。
   - 照 `release-note-template.md` 拟稿:按本次 tag 形态选公证/非公证段,自动填好下载表/安装提示/changelog 链接等固定部分。
   - **顶部"版本说明"人话摘要向用户要或让其确认**(不自己编收益叙事)。
   - 用户确认后用 `gh release edit <tag> --title "<tag>-release" --notes-file <文件>` 更新(预发布 tag 标题直接用带后缀的 tag 名)。note/title **无 AI 署名**。
8. 需要时清理测试 tag/Release/Actions 记录,保持版本列表干净。

## 5. 改历史 / 破坏性操作(force push、删 tag/Release、rewrite)

破坏性,必须:
1. **先备份**(备份分支推到远程)。
2. 明确告知用户代价(SHA 全变、tag/Release 受影响、不可逆),得到确认再做。
3. 每步验证,完成并验证 OK 后才删备份。

## 6. 盯 CI 的可靠方式

`gh run watch --exit-status` 的退出码在某些环境会误报成功/失败。**改用轮询 conclusion**:
```bash
gh run view <run-id> --repo <owner/repo> --json status,conclusion --jq '"\(.status)|\(.conclusion)"'
```
`status=completed` 且 `conclusion=success` 才算成功。

**用本 skill 自带的 `watch-ci.sh`**(本 skill 目录内),别每次手写轮询循环:
```bash
~/.claude/skills/github-ops/watch-ci.sh            # 自动取最近一次 run
~/.claude/skills/github-ops/watch-ci.sh <run-id>   # 指定 run
INTERVAL=15 ~/.claude/skills/github-ops/watch-ci.sh # 自定义轮询间隔(秒,默认 30)
```
在目标仓库目录下运行即可(repo 靠 `gh` 从当前目录自动推断,脚本无任何项目硬编码)。轮询 conclusion 到 completed,打印 conclusion+各 job;退出码 CI success→0 / 失败→1 / 脚本错误→2。可后台跑,完成自动通知。

## 7. CI 检查门禁与分支保护

**细则见 [checks-gate.md](./checks-gate.md)。**

要点(展开与命令都在子文档):

- **门禁 = 检查 workflow + 把它设为必需的分支规则**,缺一不可。发版 workflow 不算门禁——它只在打 tag 时触发。判据一条命令:`grep -nE "pnpm (run )?(test|typecheck)" .github/workflows/*.yml` 无输出即没有门禁。
- **门禁 workflow 至少跑 typecheck + test + build**,子包全覆盖;子包有独立 lockfile 的要单独 install。
- **Node 版本不能照抄打包 workflow**:打包时产物跑的是运行时自带的 node,检查时测试跑在 runner 的 node 上,`node:sqlite` 这类版本敏感的内置模块由后者提供。
- **门禁必须证明「能红」**:一道从未失败过的门禁与没有门禁在证据上等价。用一次性 PR 做变异验证,变异要打不同步骤并预写预期失败步骤,验完关闭删分支、绝不合并。
- **GitHub 侧三项缺一不生效**:Enforcement 改 Active(默认 Disabled)、Target branches 非空、添加 check 名(取 job 的 `name`,未设则取 job id)。**只选质量门禁那条**,别把 Cloudflare Pages / Vercel 这类部署检查设为必需——不触及该目录的 PR 会因它从不运行而永久卡住。
- **UI 勾了不等于存成功**,用 `gh api repos/<owner>/<repo>/rulesets/<id>` 核验 enforcement / include / rules / checks 四项。
- **门禁生效后直推默认分支会被拒**,发版的版本号变更改走 PR(见第 4 节第 3 步);tag 推送不受影响。
