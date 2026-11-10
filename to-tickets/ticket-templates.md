# 票模板

本文适用于写出或改写票的正文:[SKILL.md](SKILL.md) 第 5 步发布票时,以及需求变化后按 [feature-checklist.md](feature-checklist.md)「变更与当前验证」改写已发布票的需求引用与验收项时。

Template headings and the other fixed names in the templates follow the artifact-name tables for [this file](../repo-scaffold/artifact-names/to-tickets.ticket-templates.md), for [the requirement identifiers](../repo-scaffold/artifact-names/to-spec.requirement-identifiers.md) and for [`features-catalog`](../repo-scaffold/artifact-names/features-catalog.md).

必须仅在实际需要时生成技术前提区；票内引用文本是注明来源 commit 参考的摘录，需求改变后必须按 [feature-checklist.md](feature-checklist.md)「变更与当前验证」条对齐，不得将摘录作为另一份需求权威。模板中的 Test 可按 [SKILL.md](SKILL.md)「Every acceptance criterion must name what guarantees it」改选适当保障层级。收口票的“产品验收”区及其跨票组合条目仅在该组合已由 spec 定义且本票承兑时生成。收口票不得把项目的全量验证命令写成验收项：全量及其可跳过的命令由 `/implement` 的全量验证网关判定，写成验收项会绕过该判定。

必须将以下三种票模板中的产物与流程验收占位指令，按 [Ticket 产物与文档同步清单](ticket-artifacts.md) 展开为实际路径、验收项及 Evidence 位置；成品票不得残留占位指令，也不得要求票的读者访问本机 skill 才能理解验收条件。

<local-ticket-template>

# <NN> — <Ticket title>

**What to build:** the end-to-end behaviour this ticket makes work, from the user's perspective — not a layer-by-layer implementation list.

**Blocked by:** the numbers/titles of the tickets that gate this one, or "None — can start immediately".

**Status:** ready-for-agent

## 本票产物与流程验收

<必须按上方模板生成规则展开产物声明及三项最终流程验收。>

## 需求来源

[<spec-slug> spec](../../../specs/<spec-slug>.md)；核对 commit：<commit 参考>

## 产品验收

- [ ] <spec-slug>::US-001/AC-01 — <来源原文及必要前提>
  — **Test**：<验证机制及用户路径>
- [ ] <spec-slug>::CON-001 — <直接验收条件原文>
  — **Test**：<本票适用范围及验证机制>

## 技术前提

- [ ] <为 <spec-slug>::US-001/AC-01 所需的实现或验证前提>
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

<必须按上方模板生成规则先展开产物声明及收口票的三项最终流程验收，再保留下列收口专属项。>

- [ ] 按 /features-catalog 完成全 feature 文档与行为回归
  — **Evidence**：<checklist.md 中本轮逐项查证记录，以及 final-regression.md 中引用该记录的收口结论和文档回归表>

## 产品验收

- [ ] <spec-slug>::US-001/AC-03 — <已确认的跨票组合验收条件原文>
  — **Test**：<跨票组合用例>

</closeout-ticket-template>

<issue-template>

## 本票产物与流程验收

<必须按上方模板生成规则展开产物声明及三项最终流程验收。>

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

- [ ] <为 <spec-slug>::US-001/AC-01 所需的实现或验证前提>
  — **Test**：<验证机制>

## Blocked by

- A reference to each blocking ticket, or "None — can start immediately".

</issue-template>

In either tracker shape (local file or tracker issue), avoid specific implementation file paths or code snippets — they go stale fast. Requirement-source references and verification-evidence locations are not implementation details; provide them under their respective reference rules. Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it and note briefly that it came from a prototype. Trim to the decision-rich parts — not a working demo, just the important bits.
