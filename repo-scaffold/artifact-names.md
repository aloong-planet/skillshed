# 产物固定名称

skill 会往项目里写三类东西:固定名称(节名、标签、取值、标题)、整篇种子文本、原样复制的资产。三类都受项目 `working-language` 管辖(登记表 [capabilities-registry.md](./capabilities-registry.md) 的 `working-language` 一行),本文规定各自怎么写。

## 固定名称

skill 条文与模板以中文规范名给出、要写进项目产物的固定名称,必须按项目的 `working-language` 书写:`zh` 写中文规范名,`en` 写下表的英文名。**不得临时自行翻译**——其他 skill 按名称查找各节,同一名称各译一次,查找就会落空。

- **新增**:skill 改动凡引入一个要写进项目产物的固定名称,必须在同一次改动里登记进下表,并让定义它的文件链接本文。
- **改名或删除**:必须先在全部 skill 目录里全量检索该名称(检索须跟进软链接),把引用处改完再动本表。
- **核验**:改动 skill 后必须在仓库根运行 `node scripts/check-artifact-names.mjs`,退出码非 0 不得提交;它核对下表的完整性、各模板里的固定名称是否全部登记、资产是否零中文。

| 中文规范名 | en | 定义处 |
|---|---|---|
| 关联 | Related | `to-spec/SKILL.md` |
| 适用范围 | Applies to | `to-spec/SKILL.md` |
| 失败模式与边界 | Failure modes and boundaries | `to-spec/SKILL.md` |
| 本轮确认且有效 | Confirmed and in force | `to-spec/SKILL.md` |
| 已被后续决定取代 | Superseded by a later decision | `to-spec/SKILL.md` |
| 背景 | Background | `to-spec/SKILL.md` |
| 明确不做 | Explicitly out of scope | `to-spec/SKILL.md` |
| 直接验收 | direct acceptance | `to-spec/requirement-identifiers.md` |
| 需求来源 | Requirement sources | `to-spec/requirement-identifiers.md` |
| 技术前提 | Technical prerequisites | `to-spec/requirement-identifiers.md` |
| 流程验收 | Process acceptance | `to-spec/requirement-identifiers.md` |
| 不受本轮影响 | Not affected this round | `to-spec/requirement-identifiers.md` |
| 收口 | Closeout | `to-tickets/SKILL.md` |
| 全 feature 验收与文档回归 | full-feature acceptance and documentation regression | `to-tickets/SKILL.md` |
| 这是收口票。 | This is the closeout ticket. | `to-tickets/SKILL.md` |
| 覆盖与验收清单 | Coverage and acceptance checklist | `to-tickets/SKILL.md` |
| 来源 commit | Source commit | `to-tickets/SKILL.md` |
| 核对范围 | Scope | `to-tickets/SKILL.md` |
| 核对 commit | Checked commit | `to-tickets/SKILL.md` |
| 来源 → spec | Source → spec | `to-tickets/SKILL.md` |
| 来源锚点及支持原文 | Source anchor and supporting text | `to-tickets/SKILL.md` |
| 来源处置 | Source disposition | `to-tickets/SKILL.md` |
| spec 覆盖单位 | Spec coverage unit | `to-tickets/SKILL.md` |
| 语义核对结论 | Semantic check | `to-tickets/SKILL.md` |
| spec → tickets → 验证 | Spec → tickets → verification | `to-tickets/SKILL.md` |
| spec 覆盖单位及文档链接 | Spec coverage unit and link | `to-tickets/SKILL.md` |
| 来源原文及适用条件 | Source text and conditions | `to-tickets/SKILL.md` |
| 承兑票与角色 | Owning ticket and role | `to-tickets/SKILL.md` |
| 计划验证及边界 | Planned verification and boundary | `to-tickets/SKILL.md` |
| 当前验证 | Current verification | `to-tickets/SKILL.md` |
| 核对日期、spec 与实现 commit 参考 | Check date, spec and implementation commits | `to-tickets/SKILL.md` |
| 覆盖单位、票及适用路径 | Coverage unit, ticket and path | `to-tickets/SKILL.md` |
| 实际结果与有效证据引用 | Actual result and evidence | `to-tickets/SKILL.md` |
| 当前结论 | Current conclusion | `to-tickets/SKILL.md` |
| 尚未执行 | Not run yet | `to-tickets/SKILL.md` |
| 未验证 | Unverified | `to-tickets/SKILL.md` |
| 双向核对 | Two-way audit | `to-tickets/SKILL.md` |
| 核对范围或发现 | Scope or finding | `to-tickets/SKILL.md` |
| 涉及来源及标识 | Sources and identifiers | `to-tickets/SKILL.md` |
| 处置与依据 | Disposition and basis | `to-tickets/SKILL.md` |
| 本票产物与流程验收 | Ticket artifacts and process acceptance | `to-tickets/SKILL.md` |
| 产品验收 | Product acceptance | `to-tickets/SKILL.md` |
| 文档同步清单 | Document sync checklist | `to-tickets/ticket-artifacts.md` |
| 同步事项及触发时点 | Sync item and trigger | `to-tickets/ticket-artifacts.md` |
| 涉及文档 | Documents | `to-tickets/ticket-artifacts.md` |
| 状态与说明 | Status and notes | `to-tickets/ticket-artifacts.md` |
| 已完成 | Done | `to-tickets/ticket-artifacts.md` |
| 待触发 | Waiting | `to-tickets/ticket-artifacts.md` |
| 待处理 | Pending | `to-tickets/ticket-artifacts.md` |
| 代码审查 | Code review | `to-tickets/ticket-artifacts.md` |
| 测试审查 | Test review | `to-tickets/ticket-artifacts.md` |
| 文档同步 | Document sync | `to-tickets/ticket-artifacts.md` |
| 关联决策 | Related decisions | `features-catalog/SKILL.md` |
| 概述 | Overview | `features-catalog/SKILL.md` |
| 能力 | Capabilities | `features-catalog/SKILL.md` |
| 边界与不做 | Boundaries and non-goals | `features-catalog/SKILL.md` |
| 功能目录 | Feature catalogue | `features-catalog/SKILL.md` |
| 功能 | Feature | `features-catalog/SKILL.md` |
| 一句话 | In one line | `features-catalog/SKILL.md` |
| 阶段一 · 逐句核真 | Stage 1: changed declarations | `features-catalog/SKILL.md` |
| 阶段二 · 关系对读 | Stage 2: related declarations | `features-catalog/SKILL.md` |
| 阶段三 · 事件核销 | Stage 3: events | `features-catalog/SKILL.md` |
| 收口结论 | Closeout conclusion | `features-catalog/SKILL.md` |
| 状态 | Status | `domain-modeling/ADR-FORMAT.md` |
| 提议 | Proposed | `domain-modeling/ADR-FORMAT.md` |
| 已接受 | Accepted | `domain-modeling/ADR-FORMAT.md` |
| 已被 ADR-XXXX 取代 | Superseded by ADR-XXXX | `domain-modeling/ADR-FORMAT.md` |
| 背景与问题 | Context | `domain-modeling/ADR-FORMAT.md` |
| 备选项 | Options | `domain-modeling/ADR-FORMAT.md` |
| 决策 | Decision | `domain-modeling/ADR-FORMAT.md` |
| 后果 | Consequences | `domain-modeling/ADR-FORMAT.md` |
| 正面 | Positive | `domain-modeling/ADR-FORMAT.md` |
| 负面 | Negative | `domain-modeling/ADR-FORMAT.md` |
| 中性 | Neutral | `domain-modeling/ADR-FORMAT.md` |
| 来源 | Sources | `domain-modeling/ADR-FORMAT.md` |
| 未留档 | not recorded | `domain-modeling/ADR-FORMAT.md` |
| 总体 | General | `domain-modeling/ADR-FORMAT.md` |
| 术语 | Language | `domain-modeling/CONTEXT-FORMAT.md` |
| 关系 | Relationships | `domain-modeling/CONTEXT-FORMAT.md` |
| 不变量 | Invariants | `domain-modeling/CONTEXT-FORMAT.md` |
| 已消解歧义 | Flagged ambiguities | `domain-modeling/CONTEXT-FORMAT.md` |
| 底层前提 | Underlying premises | `review-code/SKILL.md` |
| 可运行性 | Runnability | `review-code/SKILL.md` |
| 安全正确性 | Security | `review-code/SKILL.md` |
| 一致性 | Consistency | `review-code/SKILL.md` |
| 维度 | Dimension | `review-tests/SKILL.md` |
| 覆盖是否完整 | Coverage | `review-tests/SKILL.md` |
| case 设计是否合理 | Case design | `review-tests/SKILL.md` |
| 有没有假通过 | False greens | `review-tests/SKILL.md` |
| 核销前的范围复核 | Pre-delivery scope re-check | `implement/document-sync.md` |
| 后置验收 | Deferred acceptance | `implement/SKILL.md` |
| 文档布局 | Documentation layout | `repo-scaffold/SKILL.md` |

## 种子文本

下列文件是整篇写进项目的种子文本:不存在按名称查找,所以不逐词对照,而是写入时按项目的 `working-language` 整篇成文(其中的固定名称仍按上表)。

- `repo-scaffold/docs-layout.md`:种子文本,写进 `docs/agents/docs-layout.md`
- `repo-scaffold/issue-tracker-github.md`:种子文本,写进 `docs/agents/issue-tracker.md`
- `repo-scaffold/issue-tracker-local.md`:种子文本,写进 `docs/agents/issue-tracker.md`

模板里的说明性正文(占位符 `{…}`、`<…>` 里的填写指引,以及标题与标签之外的叙述句)同样按 `working-language` 成文。

## 资产

原样复制进项目的文件与代码块一律以英文书写,不含中文:复制后源注释、终端输出与界面文案直接符合 `working-language` 为 `en` 的项目;项目工作语言为其他语言时,复制时按该语言改写。

- 资产文件:`electron-scaffold/assets/` 下全部文件,`prototype/` 的 `gallery-template.html`、`logic-page-template.html`、`logic-template.js`、`sync-mmd.mjs`。
- 资产代码块:`electron-scaffold/`、`prototype/` 下的文档与 `github-ops/checks-gate.md` 中,会被复制进项目的代码块在围栏前一行标注 `<!-- asset -->`,必须零中文;只作讲解、不进入项目的代码块若含中文,标注 `<!-- example -->`。这两处文档里含中文的代码块缺标注即为未归类。
