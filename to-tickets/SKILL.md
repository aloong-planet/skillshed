---
name: to-tickets
description: Breaks a plan, spec, or conversation into independently deliverable tracer-bullet tickets. Use when work spans more than one working session and must be split up, when the user asks to cut tickets or break down a spec, or before starting implementation that no single sitting can finish.
---

# To Tickets

使用本文件的文档同步规则时，必须完整读取 [文档同步与记录维护](../implement/document-sync.md)。

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

Before presenting the breakdown in step 4, draft its acceptance criteria and complete the requirements audit in **The feature checklist** (read [feature-checklist.md](feature-checklist.md) in full first). The change-surface enumeration above must not substitute for that audit. 必须完整读取 [Ticket 产物与文档同步清单](ticket-artifacts.md)，将其中的产物声明、同步项计划与最终流程验收纳入草案和双向审核；不得因此提前发布 tickets。

**A feature cut into more than one ticket ends with a dedicated closeout ticket** — numbered last, blocked by every other ticket in the feature, and named so nobody has to infer it: the file is `<NN>-feature-closeout.md`, or on a tracker the title opens with `收口:`. **Like wide refactors below, it is an exception to vertical slicing**: it carries the full-feature closeout (see `/features-catalog`), runs `/implement`'s closeout path, and delivers no product behaviour of its own, so it is verifiable but not demoable.

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

Publish the approved tickets. Before writing any ticket, read [ticket-templates.md](ticket-templates.md) in full: every ticket, in either tracker shape, is written from its templates. **How** depends on the tracker `/repo-scaffold` configured — the tickets are the same either way, only the shape of the blocking edges changes:

- **Local files** → write one file per ticket under `docs/.workings/<slug>/issues/<NN>-<ticket-slug>.md`, numbered from `01` in dependency order (blockers first). Each file's "Blocked by" lists the numbers/titles it depends on. Use the per-ticket file template in [ticket-templates.md](ticket-templates.md) — one ticket per file, never a single combined file.
- **A real issue tracker (GitHub, Linear, …)** → publish one issue per ticket in dependency order (blockers first) so each ticket's blocking edges can reference real identifiers. Use the platform's native blocking / sub-issue relationship where it has one; otherwise set each ticket's "Blocked by" to the blocking issues. Apply the `ready-for-agent` triage label unless instructed otherwise — the tickets are agent-grabbable by construction.

**Write each ticket's prose — title and body, in either tracker shape — in the repository's working language**: the `working-language` value in `capabilities.toml` (field format in `/repo-scaffold`'s capability registry; read and write rules in the global instructions' 「项目能力声明」 section). If it is undeclared, stop and ask the user; never pick a language yourself.

Work the **frontier**: any ticket whose blockers are all done. For a purely linear chain that means top to bottom.

发布 tickets 时，必须按 [Ticket 产物与文档同步清单](ticket-artifacts.md) 创建已确认的同步清单并填入各票的产物声明；tracker 标识只有发布后才可取得时，必须取得真实标识后再补齐对应路径，不得猜号。

切票发布期间不得关闭或修改父 issue；后续实施与验收中的关联状态回写必须遵守 [文档同步与记录维护](../implement/document-sync.md)，不得将切票授权当作父 issue 修改授权。

## Every acceptance criterion must name what guarantees it

Each criterion must state which of three tiers backs it. A criterion carrying no tier is not written yet:

- **Gate** — enforced by automation: failing it turns something red and the implementer cannot route around it. Name which gate.
- **Test** — covered by a specific case. On completion the case must be nameable.
- **Evidence** — human verification only. On completion a reviewable artifact must exist: screenshot, command output, measurement. A criterion whose evidence is a search returning nothing must record **the search command together with its empty output** — an empty result is also the shape of a search that never read the target, so the command is what makes the two distinguishable.

**There is no fourth tier.** A criterion fitting none of them is either too vague to verify — rewrite it — or not an acceptance criterion at all but a design note — move it into the body.

The reason is mechanical: **a checkbox is not evidence.** It records that someone claimed completion, never what that completion rested on. A fully ticked list whose items cannot each name their guarantee is worth no more than no list at all.

When no verification mechanism can be named, first check whether the expected result is explicit, whether a suitable seam exists, and whether the required tools and environment are available. Record the actual gap; do not infer a missing injectable seam from unverifiability alone. If a new seam is necessary, follow the “预定 seam” rule in /tdd's “Seam——测试站在哪” section and include the approved seam work in the same ticket as a technical prerequisite, following “技术前提与流程验收” in the shared requirement standard.

When the same criterion recurs across several tickets, back it with **one mechanism** and have those tickets reference it, rather than confirming it by hand in each. Once the mechanism exists, verify separately that it can actually fail — a check that has never failed is, on the evidence, indistinguishable from no check.

## The feature checklist

建立、映射、审核或更新 feature checklist 时(本 skill 第 3 步的需求审核,以及其它 skill 按「The feature checklist」执行的步骤),必须完整读取 [feature-checklist.md](feature-checklist.md) 并按其执行。
