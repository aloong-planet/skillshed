---
name: to-tickets
description: Breaks a plan, spec, or conversation into independently deliverable tracer-bullet tickets. Use when work spans more than one working session and must be split up, when the user asks to cut tickets or break down a spec, or before starting implementation that no single sitting can finish.
---

# To Tickets

Break a plan, spec, or conversation into a set of **tickets** — tracer-bullet vertical slices, each declaring the tickets that **block** it.

The issue tracker and the agent-grabbable label string should have been provided to you in `docs/agents/issue-tracker.md` — run `/repo-scaffold` if not.

**Tickets are disposable; the spec is not** — so a ticket references the spec, never the reverse. What that forbids on the persistent side is stated once, in `/to-spec`; here it means each ticket carries its own requirement text (quoted from the spec) rather than expecting the spec to point back at it.

## Process

### 1. Gather context

必须先完整读取 [需求标识与覆盖单位](../to-spec/requirement-identifiers.md)。

Work from whatever is already in the conversation context. If the user passes a reference (a spec path, an issue number or URL) as an argument, fetch it and read its full body and comments.

取得输入内容后，输入已有 spec 时，必须读取全文，并按该规范的“核对范围与旧格式接续”确认本轮范围及标识；只有 plan 或 conversation 时，必须先用 `/to-spec` 将已确认内容合成为持久 spec，再继续拆票。已有 plan/conversation 入口保留，但不得直接生成一份与 spec 平行的临时需求编号表；上下文不足时不得声称已经完成来源核对。

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code. Ticket titles and descriptions must use the project's domain glossary vocabulary and respect ADRs in the area being changed.

Look for opportunities to prefactor the code to make the implementation easier. "Make the change easy, then make the easy change."

### 3. Draft vertical slices

Break the work into **tracer bullet** tickets.

<vertical-slice-rules>

- Each slice must deliver a narrow but COMPLETE path through all layers involved in its behaviour (schema, API, UI, tests), not a horizontal slice of one layer.
- Each slice must be independently demoable or verifiable when complete.
- Size each slice to fit in a single fresh context window; split any slice whose implementation and verification cannot fit together.
- If a slice requires prefactoring, complete that prerequisite before implementing the behaviour that depends on it.
- **A cut must not run through the middle of something the user sees at once.** Slicing by where the code lives is what invites this: two halves that share a screen land in different tickets, and whichever ships first leaves a visible inconsistency until the other does. Judge a cut by what appears together on screen, not by which module implements it — if the two sides must ship together to look right, they belong in one ticket.

</vertical-slice-rules>

Give each ticket its **blocking edges** — the other tickets that must complete before it can start. A ticket with no blockers can start immediately.

**Once the slices are drafted, verify coverage by enumeration.** Mechanically enumerate the full set of things the change touches, then map every item to a ticket. Anything left without an owning ticket is a gap: add or widen a ticket, then re-check.

"The tickets cover everything" is a **negative claim**, and must not rest on sampling, impression, or the categories used while researching. When slicing by category, the blind spots of that categorisation are inherited wholesale — whatever falls outside every category will not announce itself, and the omission surfaces late in implementation, when adding a ticket costs far more than it would have here.

Pick the enumeration technique to fit the change (repo-wide search, exhausting a type, walking a directory, listing call sites). One criterion decides whether it counts: **the result must be a reproducible listing, not a recollection.**

Before presenting the breakdown in step 4, draft its acceptance criteria and complete the requirements audit in **The feature checklist** below. The change-surface enumeration above must not substitute for that audit.

**A feature cut into more than one ticket ends with a dedicated closeout ticket** — numbered last, blocked by every other ticket in the feature, and named so nobody has to infer it: the file is `<NN>-feature-closeout.md`, or on a tracker the title opens with `收口:`. **Like wide refactors below, it is an exception to vertical slicing**: it carries the full-feature closeout (see `/features-catalog`) and delivers no product behaviour of its own, so it is verifiable but not demoable.

**Never let "the last ticket" be inferred from numbering.** Blocking edges form a graph, not a line: a feature can have several leaf tickets, and which one finishes last depends on execution order rather than slicing order. A step that runs exactly once, at the end, needs a ticket that declares itself — counting cannot identify one, and whoever guesses wrong skips the step in silence.

A feature cut into a single ticket gets no closeout ticket: with one ticket there is no cross-ticket combination to check, and that ticket's own step 8 already spans its whole range.

**Wide refactors are the exception to vertical slicing.** A **wide refactor** is one mechanical change — rename a column, retype a shared symbol — whose **blast radius** fans across the whole codebase, so a single edit breaks thousands of call sites at once and no vertical slice can land green. Don't force it into a tracer bullet; sequence it as **expand–contract**. First expand: add the new form beside the old so nothing breaks. Then migrate the call sites over in batches sized by blast radius (per package, per directory), each batch its own ticket blocked by the expand, keeping CI green batch to batch because the old form still exists. Finally contract: delete the old form once no caller remains, in a ticket blocked by every migrate batch. When even the batches can't stay green alone, keep the sequence but let them share an integration branch that all block a final integrate-and-verify ticket — green is promised only there.

### 4. Quiz the user

Present the proposed breakdown as a numbered list. For each ticket, show:

- **Title**: short descriptive name
- **Blocked by**: which other tickets (if any) must complete first
- **What it delivers**: the end-to-end behaviour this ticket makes work

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the blocking edges correct — does each ticket only depend on tickets that genuinely gate it?
- Should any tickets be merged or split further?

Iterate until the user approves the breakdown.

### 5. Publish the tickets to the configured tracker

Publish the approved tickets. **How** depends on the tracker `/repo-scaffold` configured — the tickets are the same either way, only the shape of the blocking edges changes:

- **Local files** → write one file per ticket under `docs/.workings/<slug>/issues/<NN>-<ticket-slug>.md`, numbered from `01` in dependency order (blockers first). Each file's "Blocked by" lists the numbers/titles it depends on. Use the per-ticket file template below — one ticket per file, never a single combined file.
- **A real issue tracker (GitHub, Linear, …)** → publish one issue per ticket in dependency order (blockers first) so each ticket's blocking edges can reference real identifiers. Use the platform's native blocking / sub-issue relationship where it has one; otherwise set each ticket's "Blocked by" to the blocking issues. Apply the `ready-for-agent` triage label unless instructed otherwise — the tickets are agent-grabbable by construction.

Work the **frontier**: any ticket whose blockers are all done. For a purely linear chain that means top to bottom.

Do NOT close or modify any parent issue.

## Every acceptance criterion must name what guarantees it

Each criterion must state which of three tiers backs it. A criterion carrying no tier is not written yet:

- **Gate** — enforced by automation: failing it turns something red and the implementer cannot route around it. Name which gate.
- **Test** — covered by a specific case. On completion the case must be nameable.
- **Evidence** — human verification only. On completion a reviewable artifact must exist: screenshot, command output, measurement. A criterion whose evidence is a search returning nothing must record **the search command together with its empty output** — an empty result is also the shape of a search that never read the target, so the command is what makes the two distinguishable.

**There is no fourth tier.** A criterion fitting none of them is either too vague to verify — rewrite it — or not an acceptance criterion at all but a design note — move it into the body.

The reason is mechanical: **a checkbox is not evidence.** It records that someone claimed completion, never what that completion rested on. A fully ticked list whose items cannot each name their guarantee is worth no more than no list at all.

When no verification mechanism can be named, first check whether the expected result is explicit, whether a suitable seam exists, and whether the required tools and environment are available. Record the actual gap; do not infer a missing injectable seam from unverifiability alone. If a new seam is necessary, follow /to-spec's “勾画测试 seam” decision process and include the approved seam work in the same ticket as a technical prerequisite, following “技术前提与流程验收” in the shared requirement standard.

When the same criterion recurs across several tickets, back it with **one mechanism** and have those tickets reference it, rather than confirming it by hand in each. Once the mechanism exists, verify separately that it can actually fail — a check that has never failed is, on the evidence, indistinguishable from no check.

## The feature checklist

必须按 `/to-spec` 流程中的[准备：核对记录约定](../to-spec/SKILL.md#准备核对记录约定)使用同一份 feature checklist；本节规定其 spec 到 tickets 的映射及验证责任。

1. **枚举 spec**：必须以当前已确认的 spec 为需求基线，完整读取并逐节盘点需求、背景或明确不做的归类，按共享规范的“核对范围与旧格式接续”确定本轮范围并记录其余条目不受影响的依据。必须在本节引言指定的同一份清单的“spec → tickets → 验证”部分枚举本轮覆盖单位，包括适用的质量要求、共享约束及散落在其它章节的义务；复合条件未拆清时必须回到 /to-spec 补齐，不得只在清单中拆出隐藏的新要求。必须按本节“双向审核后再确认拆票”条核对 spec 与 tickets 的双向覆盖；“已确认来源 → spec”由 /to-spec 负责，不得将其作为拆票阶段例行重做的检查。仅在发现具体需求歧义、冲突或缺失时，才追溯相关来源或回到 /to-spec 处理。

2. **分配责任**：必须让共享规范规定的本轮核对范围内每个覆盖单位直接对应承兑 ticket 及其引用的相同标识，允许一票承兑多个单位。共享条件必须在同一来源行列出所有适用票和各自验证范围；跨票组合必须列出实现贡献票并指定收口验证责任，不得因此延期各票自身可完成的验收。既有行为无需修改时，必须分配明确的回归验证责任；不得以宽泛票名或组件名代替覆盖。技术前提和流程验收必须按共享规范分类，不得成为无来源的范围扩张。

3. **定验证边界**：必须按原有 Gate/Test/Evidence 规则为每个承兑项说明保障机制。用户可见行为必须列出入口、动作、可观察结果，并让计划验证经过该用户路径；内部约束必须在对应内部边界验证。执行前必须标为未验证；执行后必须记录实现版本、实际结果和可复查依据。不得用低层通过替代用户路径验收。

4. **双向审核后再确认拆票**：必须按“Draft vertical slices”规定的审核时点，完成本轮核对范围内 spec 覆盖单位 → ticket → 验证责任的正向核对，以及每个票内验收项 → spec 或明确技术前提/流程依据的反向核对。必须逐项记录漏项、无承兑方、语义收窄、验证边界错误和未批准扩张及其处置；有未解决缺口不得发布。用户调整拆票后必须重核受影响范围，再按现有确认与发布流程执行；不得以行数、已填单元格或关闭票数宣称覆盖。

5. **变更与历史**：需求或票范围变化时，必须先按共享规范“稳定身份与变更授权”处理确认及权威来源，再按共享规范更新身份对应与清单，重做受影响的双向核对。必须追加验证历史并明确旧结果适用的 spec/实现版本，不得把旧版本通过无条件沿用到变化后的需求。清单的工作索引定位必须遵守本节引言所引用的“准备：核对记录约定”；不得因历史上有一条通过记录就略过本轮验收。

必须按本节枚举结果逐项展开下面的清单模板，不得将示例行集当作完整范围。来源核对由 `/to-spec` 填写，本阶段补承兑与验证计划，实施和收口追加真实结果。

<checklist-template>

# <功能名> — 覆盖与验收清单

Spec：[<spec-slug>](../../specs/<spec-slug>.md)
来源 commit：<commit 参考；含未提交修改或无可用 commit 时如实注明>
核对范围：<本轮范围及共享要求>

## 来源 → spec

| 来源锚点及支持原文 | 来源处置 | spec 覆盖单位 | 语义核对结论 |
|---|---|---|---|
| <已确认来源> | 有效 | <spec-slug>::US-001/AC-01 | <结论> |

## spec → tickets → 验证

| spec 覆盖单位及文档链接 | 来源原文及适用条件 | 承兑票与角色 | 计划验证及边界 |
|---|---|---|---|
| <spec-slug>::US-001/AC-01 | <原文> | 01：实现及用户路径验收 | Test：<入口、动作、可观察结果> |
| <spec-slug>::US-001/AC-02 | <原文> | 01：实现及用户路径验收 | Test：<本项独立的入口、动作、可观察结果> |
| <spec-slug>::CON-001 | <原文> | 01、02：各自适用的路径 | Test：<约束的验证方法> |

## 验证历史

| 日期、spec 与实现 commit 参考 | 覆盖单位、票及适用路径 | 实际结果与证据 | 结论 |
|---|---|---|---|
| <日期及 commit 参考；未提交修改如实注明> | <spec-slug>::US-001/AC-01；01 | 尚未执行 | 未验证 |
| <日期及 commit 参考；未提交修改如实注明> | <spec-slug>::US-001/AC-02；01 | 尚未执行 | 未验证 |

## 双向核对

| 核对范围或发现 | 涉及来源及标识 | 处置与依据 |
|---|---|---|
| <本轮范围及结论或缺口> | <定位> | <处理结果> |

</checklist-template>

必须仅在实际需要时生成技术前提区；票内引用文本是注明来源 commit 参考的摘录，需求改变后必须按本节“变更与历史”条对齐，不得将摘录作为另一份需求权威。模板中的 Test 可按“Every acceptance criterion must name what guarantees it”改选适当保障层级。收口票的“产品验收”区及其跨票组合条目仅在该组合已由 spec 定义且本票承兑时生成。

<local-ticket-template>

# <NN> — <Ticket title>

**What to build:** the end-to-end behaviour this ticket makes work, from the user's perspective — not a layer-by-layer implementation list.

**Blocked by:** the numbers/titles of the tickets that gate this one, or "None — can start immediately".

**Status:** ready-for-agent

## 需求来源

[<spec-slug> spec](../../../specs/<spec-slug>.md)；核对 commit：<commit 参考>

## 产品验收

- [ ] <spec-slug>::US-001/AC-01 — <来源原文及必要前提>
  — **Test**：<验证机制及用户路径>
- [ ] <spec-slug>::CON-001 — <直接验收条件原文>
  — **Test**：<本票适用范围及验证机制>

## 技术前提

- [ ] 为 <spec-slug>::US-001/AC-01 <所需的实现或验证前提>
  — **Test**：<验证机制>

</local-ticket-template>

<closeout-ticket-template>

# <NN> — 收口:全 feature 验收与文档回归

**这是收口票。** 本 feature 的最后一张,承担全 feature 收口,不交付产品行为。

**Blocked by:** 本 feature 的全部其它票(逐一列出编号)。

**Status:** ready-for-agent

## 需求来源

[<spec-slug> spec](../../../specs/<spec-slug>.md)；核对 commit：<commit 参考>

## 流程验收

- [ ] 按 /features-catalog 完成全 feature 文档与行为回归
  — **Evidence**：checklist.md 中本轮逐项查证记录，以及 final-regression.md 中引用该记录的收口结论和文档回归表

## 产品验收

- [ ] <spec-slug>::US-001/AC-03 — <已确认的跨票组合验收条件原文>
  — **Test**：<跨票组合用例>

</closeout-ticket-template>

<issue-template>

## Parent

A reference to the parent issue on the tracker (if the source was an existing issue, otherwise omit this section).

## What to build

The end-to-end behaviour this ticket makes work, from the user's perspective — not layer-by-layer implementation.

## 需求来源

Spec：`docs/specs/<spec-slug>.md`；核对 commit：<commit 参考>

## 产品验收

- [ ] <spec-slug>::US-001/AC-01 — <来源原文及必要前提>
  — **Test**：<验证机制及用户路径>
- [ ] <spec-slug>::CON-001 — <直接验收条件原文>
  — **Test**：<本票适用范围及验证机制>

## 技术前提

- [ ] 为 <spec-slug>::US-001/AC-01 <所需的实现或验证前提>
  — **Test**：<验证机制>

## Blocked by

- A reference to each blocking ticket, or "None — can start immediately".

</issue-template>

In either form, avoid specific implementation file paths or code snippets — they go stale fast. Requirement-source references and verification-evidence locations are not implementation details; provide them under their respective reference rules. Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it and note briefly that it came from a prototype. Trim to the decision-rich parts — not a working demo, just the important bits.
