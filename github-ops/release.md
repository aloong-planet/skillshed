# 发版

本文适用于发版:改版本号、打 tag、写 Release note。入口:[SKILL.md](SKILL.md)「按情形必读的文件」;SKILL.md 的规则同时生效。

## 发版 / Release 标准

版本号语义化(`vMAJOR.MINOR.PATCH`);先改 `package.json` version,再打同名 tag。**tag 名决定 CI 行为**:

| tag 形态 | 含义 | GitHub 标记 |
|---|---|---|
| **正式版 tag**:干净 tag(如 `v0.6.0`) | 正式版 | **Latest** |
| **预发布 tag**:带预发布后缀(`-alpha`/`-beta`/`-rc`/`-dev`) | 迭代版 | **Pre-release** |

- **macOS 安装包先看项目能力声明**:读 `capabilities.toml` 的 `client-framework` 与 `macos-distribution`(读写规则见全局指令的「项目能力声明」节),先按前者、再按后者分支——
  - `client-framework` 未确认(缺失或取值未登记)→ 按全局指令停下来问。
  - `client-framework` 为 `"none"` → `macos-distribution` 不适用:按全局指令写明不适用,本文件里凡涉及 macOS 安装包的步骤一并跳过。
  - `client-framework` 为 `"electron"` 或 `"tauri"` → 按 `macos-distribution`:
    - `enabled = true` → 按 `/repo-scaffold` 能力登记表里该 ID 的[实现指南](../repo-scaffold/capabilities-registry.md),取与 `client-framework` 对应的那份完整读取(下称 macOS 指南),按其中发版时的 macOS 步骤执行;该文档的条文与本文件同等生效。登记表写明没有指南的,按登记表停下来。
    - `enabled = false` → 产出里写明「按项目能力声明,macos-distribution 未启用,该项跳过」,本文件里凡涉及 macOS 安装包的步骤一并跳过。
    - 缺失 → 未确认,按全局指令停下来问。

### Release note 必填(不留空)

每个 Release 都要写 note,**照 `release-note-template.md`(本 skill 目录内)填写**:

- **面向最终用户**写用户能感知的变化,不贴 `feat:`/`fix:` commit 原文;技术改动翻译成人话。
- **不用任何 emoji / 图标**,正文纯文字。开头"版本说明"1–3 句概括,再分组(新功能/优化/修复/破坏性变更,按需删)。
- **Release Title 只写「版本号-类型」,不带亮点说明**:正式版(干净 tag)= `<tag>-release`(如 `v1.2.0-release`);预发布(`-beta`/`-rc`/`-alpha`/`-dev` 后缀 tag)= 直接用带后缀的 tag 名(如 `v1.2.0-beta`)。亮点/变更/下载全部放正文,标题不重复。
- **桌面 app 必写"下载与安装"**:各平台产物文件名 + 安装版/免安装版区别 + 首次安装提示。
- **macOS 段按本节开头的能力开关处理**:启用时写法按 macOS 指南中发版时的 macOS 步骤;未启用或不适用时删掉模板里的整段 macOS 内容。
- 结尾放 `Full Changelog: .../compare/<上一版>...<本次>` 对比链接。
- note/title/tag message 同样**无 AI 署名**([SKILL.md](SKILL.md) 第 1 节)。
- **顶部"版本说明"(1–3 句人话摘要:本版最大变化 + 用户好处)由用户提供或确认**——这是收益叙事,不要自己编;其余模板部分(下载表/安装提示/macOS 段/changelog 链接)自动填好。

## 标准发版流程(每步验证,不跳步)

1. 改 `package.json` version。
2. **本地验证全绿**再发:typecheck + test + build(用项目实际脚本)。
3. commit(**无 AI 署名**)+ push。**默认分支若配了 required status checks,直推会被拒**(见 [SKILL.md](SKILL.md) 第 5 节),此时版本号变更也走 PR,合并后再打 tag。
4. 打 tag + push tag(正式版 tag 或预发布 tag,见本文「发版 / Release 标准」)。tag 推送不受分支规则影响。
5. **盯 CI 到完成**:跑本 skill 自带的 `watch-ci.sh`(用法与原理见 [ci-watch.md](ci-watch.md))。不得手写轮询循环。
6. **下载 Release 产物独立验证**(不只信 CI 绿):逐个平台的产物下载下来实际检查。macOS 安装包按本文「发版 / Release 标准」开头的能力开关处理——启用时按 macOS 指南中发版时的 macOS 步骤验。
7. **写 Release note(约定:CI 验证通过后主动做,不等用户开口)**:
   - CI `conclusion=success` 且第 6 步产物验证通过后,**主动提醒用户**"该更新 release note 了"。
   - 照 `release-note-template.md` 拟稿,自动填好下载表/安装提示/changelog 链接等固定部分;macOS 段按本文「发版 / Release 标准」开头的能力开关处理。
   - **顶部"版本说明"人话摘要向用户要或让其确认**(不自己编收益叙事)。
   - 用户确认后用 `gh release edit <tag> --title "<tag>-release" --notes-file <文件>` 更新(预发布 tag 标题直接用带后缀的 tag 名)。note/title **无 AI 署名**。
8. 需要时清理测试 tag/Release/Actions 记录,保持版本列表干净。

