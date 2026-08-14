---
name: to-tickets
description: Breaks a plan, spec, or conversation into independently deliverable tracer-bullet tickets. Use when work spans more than one working session and must be split up, when the user asks to cut tickets or break down a spec, or before starting implementation that no single sitting can finish.
---

> Forked from mattpocock/skills. Changes: coverage enumeration after slicing; every acceptance criterion must name what guarantees it (gate / test / evidence).

# To Tickets

Break a plan, spec, or conversation into a set of **tickets** — tracer-bullet vertical slices, each declaring the tickets that **block** it.

The issue tracker and the agent-grabbable label string should have been provided to you in `docs/agents/issue-tracker.md` — run `/repo-scaffold` if not.

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes a reference (a spec path, an issue number or URL) as an argument, fetch it and read its full body and comments.

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code. Ticket titles and descriptions should use the project's domain glossary vocabulary, and respect ADRs in the area you're touching.

Look for opportunities to prefactor the code to make the implementation easier. "Make the change easy, then make the easy change."

### 3. Draft vertical slices

Break the work into **tracer bullet** tickets.

<vertical-slice-rules>

- Each slice cuts a narrow but COMPLETE path through every layer (schema, API, UI, tests) — vertical, NOT a horizontal slice of one layer
- A completed slice is demoable or verifiable on its own
- Each slice is sized to fit in a single fresh context window
- Any prefactoring should be done first

</vertical-slice-rules>

Give each ticket its **blocking edges** — the other tickets that must complete before it can start. A ticket with no blockers can start immediately.

**Once the slices are drafted, verify coverage by enumeration.** Mechanically enumerate the full set of things the change touches, then map every item to a ticket. Anything left without an owning ticket is a gap: add or widen a ticket, then re-check.

"The tickets cover everything" is a **negative claim**, and must not rest on sampling, impression, or the categories used while researching. When slicing by category, the blind spots of that categorisation are inherited wholesale — whatever falls outside every category will not announce itself, and the omission surfaces late in implementation, when adding a ticket costs far more than it would have here.

Pick the enumeration technique to fit the change (repo-wide search, exhausting a type, walking a directory, listing call sites). One criterion decides whether it counts: **the result must be a reproducible listing, not a recollection.**

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

- **Local files** → write one file per ticket under `docs/.workings/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` in dependency order (blockers first). Each file's "Blocked by" lists the numbers/titles it depends on. Use the per-ticket file template below — one ticket per file, never a single combined file.
- **A real issue tracker (GitHub, Linear, …)** → publish one issue per ticket in dependency order (blockers first) so each ticket's blocking edges can reference real identifiers. Use the platform's native blocking / sub-issue relationship where it has one; otherwise set each ticket's "Blocked by" to the blocking issues. Apply the `ready-for-agent` triage label unless instructed otherwise — the tickets are agent-grabbable by construction.

Work the **frontier**: any ticket whose blockers are all done. For a purely linear chain that means top to bottom.

Do NOT close or modify any parent issue.

## Every acceptance criterion must name what guarantees it

Each criterion must state which of three tiers backs it. A criterion carrying no tier is not written yet:

- **Gate** — enforced by automation: failing it turns something red and the implementer cannot route around it. Name which gate.
- **Test** — covered by a specific case. On completion the case must be nameable.
- **Evidence** — human verification only. On completion a reviewable artifact must exist: screenshot, command output, measurement.

**There is no fourth tier.** A criterion fitting none of them is either too vague to verify — rewrite it — or not an acceptance criterion at all but a design note — move it into the body.

The reason is mechanical: **a checkbox is not evidence.** It records that someone claimed completion, never what that completion rested on. A fully ticked list whose items cannot each name their guarantee is worth no more than no list at all.

Naming the guarantee also exposes design gaps in reverse: when a criterion turns out to be unverifiable, the implementation is usually missing an injectable seam — and that seam belongs in the same ticket, as a prerequisite criterion.

When the same criterion recurs across several tickets, back it with **one mechanism** and have those tickets reference it, rather than confirming it by hand in each. Once the mechanism exists, verify separately that it can actually fail — a check that has never failed is, on the evidence, indistinguishable from no check.

## The feature checklist

Once the criteria are written, produce one **feature checklist** covering the whole feature, saved beside the tickets at `docs/.workings/<feature-slug>/checklist.md`.

Its rows come from the spec — every entry under 「失败模式与边界」 and every User Story, one row each. Against each row, name **which ticket, and which of that ticket's acceptance criteria, delivers it**. A requirement no ticket answers for is a slicing gap: add or widen a ticket, then re-check.

This mapping is what makes "every ticket is closed, therefore the feature is done" checkable rather than assumed. Step 3's enumeration runs along the change surface and proves no *code* was left unowned; until the requirements are mapped too, a requirement dropped between tickets is invisible from inside any one of them — each ticket meets its own criteria and none of them is the one that failed.

<checklist-template>

# <功能名> — 验收清单

来源:`docs/specs/<slug>.md`

| # | 需求(spec 原文) | 承兑票 | 该票的验收标准 |
|---|---|---|---|
| 1 | {「失败模式与边界」或 User Stories 的一条} | {NN} | {criterion} — gate / test / evidence |

</checklist-template>

<local-ticket-template>

# <NN> — <Ticket title>

**What to build:** the end-to-end behaviour this ticket makes work, from the user's perspective — not a layer-by-layer implementation list.

**Blocked by:** the numbers/titles of the tickets that gate this one, or "None — can start immediately".

**Status:** ready-for-agent

- [ ] {criterion} — **gate | test | evidence**: {what guarantees it}
- [ ] {criterion} — **gate | test | evidence**: {what guarantees it}

</local-ticket-template>

<issue-template>

## Parent

A reference to the parent issue on the tracker (if the source was an existing issue, otherwise omit this section).

## What to build

The end-to-end behaviour this ticket makes work, from the user's perspective — not layer-by-layer implementation.

## Acceptance criteria

- [ ] {criterion} — **gate | test | evidence**: {what guarantees it}
- [ ] {criterion} — **gate | test | evidence**: {what guarantees it}

## Blocked by

- A reference to each blocking ticket, or "None — can start immediately".

</issue-template>

In either form, avoid specific file paths or code snippets — they go stale fast. Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it and note briefly that it came from a prototype. Trim to the decision-rich parts — not a working demo, just the important bits.
