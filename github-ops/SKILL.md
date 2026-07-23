---
name: github-ops
description: "Rules and standards for ANY GitHub operation — git commit, push, PR, release, tag, issue, Actions, or anything that ends up on GitHub. Use whenever committing, pushing, opening/reviewing a PR, cutting a release, creating/deleting tags, editing release notes, or writing anything published to a GitHub repo. Enforces the no-AI-signature rule and the release/tag conventions."
when_to_use: "Activate for any git commit / push / PR / release / tag / issue / GitHub Actions work, or any text that will appear on GitHub."
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

提交前自检:`git log -1 --format=%B` 确认末尾没有 Co-Authored-By / Generated with。

## 2. 发版 / Release 标准

版本号语义化(`vMAJOR.MINOR.PATCH`);先改 `package.json` version,再打同名 tag。**tag 名决定 CI 行为**:

| tag 形态 | 含义 | CI 产出 | GitHub 标记 |
|---|---|---|---|
| **干净 tag**(如 `v0.6.0`) | 正式版 | mac 签名+**公证**(双击即开) | **Latest** |
| **预发布后缀**(`-beta`/`-rc`/`-alpha`/`-dev`) | 迭代版 | mac 只签名(右键打开) | **Pre-release** |

- 公证慢(等 Apple 2–30min)→ 只有干净 tag(正式版)才公证;快速迭代用预发布后缀。
- **mac 产出多个架构 DMG**(项目若配了 `arch: [universal, arm64, x64]`):正式版每个架构都是独立 `.app`,**公证按包各跑一次**(等待 ×产物数,正式版 CI 更久)。CI 产物 glob 用 `*.dmg` 通配,自动兼容,无需改。发 note 时下载表要按架构列全(见模板)。
- Windows 不涉及公证,照常打包。
- 具体 CI 三档逻辑、签名/公证凭据、workflow 坑,见项目内 `docs/mac-signing.md`(若该项目有)。

### Release note 必填(不留空)

每个 Release 都要写 note,**照 `release-note-template.md`(本 skill 目录内)填写**:

- **面向最终用户**写用户能感知的变化,不贴 `feat:`/`fix:` commit 原文;技术改动翻译成人话。
- **不用任何 emoji / 图标**,正文纯文字。开头"版本说明"1–3 句概括,再分组(新功能/优化/修复/破坏性变更,按需删)。
- **Release Title 只写「版本号-类型」,不带亮点说明**:正式版(干净 tag)= `<tag>-release`(如 `v1.2.0-release`);预发布(`-beta`/`-rc`/`-alpha`/`-dev` 后缀 tag)= 直接用带后缀的 tag 名(如 `v1.2.0-beta`)。亮点/变更/下载全部放正文,标题不重复。
- **桌面 app 必写"下载与安装"**:各平台产物文件名 + 安装版/免安装版区别 + 首次安装提示。
- **macOS 公证/非公证二选一**——判断依据是本次 **tag 形态**:干净 tag=已公证(双击即开)用公证版那段;预发布后缀 tag=未公证用非公证版那段(含 `xattr -dr com.apple.quarantine` 去隔离命令)。删掉不适用的整段。
- 结尾放 `Full Changelog: .../compare/<上一版>...<本次>` 对比链接。
- note/title/tag message 同样**无 AI 署名**(第 1 节)。
- **顶部"版本说明"(1–3 句人话摘要:本版最大变化 + 用户好处)由用户提供或确认**——这是收益叙事,不要自己编;其余模板部分(下载表/安装提示/公证段/changelog 链接)自动填好。

## 3. 标准发版流程(每步验证,不跳步)

1. 改 `package.json` version。
2. **本地验证全绿**再发:typecheck + test + build(用项目实际脚本)。
3. commit(**无 AI 署名**)+ push。
4. 打 tag + push tag(干净 tag=正式版触发公证;`-beta` 等=迭代版)。
5. **盯 CI 到完成**(用轮询 conclusion,不用 `gh run watch --exit-status`——其退出码在部分环境误报)。
6. **下载 Release 产物独立验证**(不只信 CI 绿):
   - mac:`spctl --assess --type execute --verbose <app>` 应 `accepted / Notarized Developer ID`(正式版);签名身份 `codesign -dv`。
7. **写 Release note(约定:CI 验证通过后主动做,不等用户开口)**:
   - CI `conclusion=success` 且第 6 步产物验证通过后,**主动提醒用户**"该更新 release note 了"。
   - 照 `release-note-template.md` 拟稿:按本次 tag 形态选公证/非公证段,自动填好下载表/安装提示/changelog 链接等固定部分。
   - **顶部"版本说明"人话摘要向用户要或让其确认**(不自己编收益叙事)。
   - 用户确认后用 `gh release edit <tag> --title "<tag>-release" --notes-file <文件>` 更新(预发布 tag 标题直接用带后缀的 tag 名)。note/title **无 AI 署名**。
8. 需要时清理测试 tag/Release/Actions 记录,保持版本列表干净。

## 4. 改历史 / 破坏性操作(force push、删 tag/Release、rewrite)

破坏性,必须:
1. **先备份**(备份分支推到远程)。
2. 明确告知用户代价(SHA 全变、tag/Release 受影响、不可逆),得到确认再做。
3. 每步验证,完成并验证 OK 后才删备份。

## 5. 盯 CI 的可靠方式

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
