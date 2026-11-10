# Closeout path

> Related: `/implement` ([SKILL.md](../../implement/SKILL.md), [claim-check.md](../../implement/claim-check.md), [post-implementation-check.md](../../implement/post-implementation-check.md)) · `/features-catalog` ([SKILL.md](../../features-catalog/SKILL.md)) · `/to-tickets` ([ticket-templates.md](../../to-tickets/ticket-templates.md))

## Problem Statement

A closeout ticket delivers no product behaviour and usually changes no executable line, yet it ran every step meant for code: the code review, the test design review, the pre-review run, the independent test review and a full local run named in the ticket. The test review has no written test to read in that case, and its scope stops at tests, so a false statement written into a spec is outside it unless the statement happens to be tied to an evidence script.

## Solution

A closeout ticket runs its own path in `/implement`. The full-feature closeout in `/features-catalog` stays its body. With no executable change, the independent review gives way to one claim check of the factual statements the ticket writes into the repository. An executable change made during the closeout still takes the full steps.

Separately, the independent review of any change is skipped when nothing executable changed.

## Functional Requirements

### closeout-path::REQ-001 The closeout path (direct acceptance)

A ticket that states it is a closeout ticket runs `/implement`'s closeout path. Every ticket it is blocked by must be merged first. The path runs `/features-catalog`'s closeout, decides by the fork point, runs the claim check and delivers.

### closeout-path::REQ-002 What decides the reviews

- closeout-path::REQ-002/AC-01: With `change-scope.mjs` exiting 0 against the fork point, the independent review does not run.
- closeout-path::REQ-002/AC-02: An executable change is written through the implementation steps on the same branch and gets the independent review of [post-implementation-check](post-implementation-check.md) before delivery; the closeout then re-judges what it affects. A failed command or any other exit code is fixed before the judgement runs again, and goes to the user if it cannot be.
- closeout-path::REQ-002/AC-03: With no difference from the fork point at all, no PR is opened and the closeout conclusion goes to the user.

### closeout-path::REQ-003 The claim check

- closeout-path::REQ-003/AC-01: The check derives its lines from the commit range's diff: every added or rewritten sentence stating a product fact, wherever it is written in the repository. No sampling.
- closeout-path::REQ-003/AC-02: Each line gets a location, an evidence location and one of three conclusions: holds, false, not enough evidence. A ticket or another document is not evidence.
- closeout-path::REQ-003/AC-03: A negative statement lists every way into the state and shows evidence for each. A statement of how a state ends rests on a reading taken from that state.
- closeout-path::REQ-003/AC-04: Every line is judged and recorded before any finding is handled, so the record keeps what each statement got wrong. Missing evidence is gathered when the finding is handled.
- closeout-path::REQ-003/AC-05: A fix that adds or rewrites a statement has those lines checked again. Evidence gathered for a statement left as it is rejudges that line, and a fix that only deletes a statement needs no check. An executable fix does not restart the check: lines already judged stay as they are.

### closeout-path::REQ-004 The runs (direct acceptance)

The closeout's runs follow [delivery-flow::REQ-001](delivery-flow.md). Its ticket does not name the project's full verification command as an acceptance item, since that would bypass the rule on which commands run.

### closeout-path::REQ-005 When the independent review is skipped

Before the independent review, on any change, `change-scope.mjs` runs against the fork point. On exit 0 no reviewer is sent, and the delivery note states the skip and its basis.

### closeout-path::REQ-006 Reading what the path already names (direct acceptance)

A closeout knows at the start what it will read. Once the ticket is known to be a closeout, it reads the skills and reference files the path's items name in one request, then what those name along with the specs and shared records the ticket names in the next, and so on layer by layer. What only some cases need waits for the case. A tool that cannot send several calls in one request reads as it can.

### closeout-path::REQ-007 The closeout reads and writes no status record

- closeout-path::REQ-007/AC-01: The full-feature closeout checks every coverage unit of the feature against the integrated code and its tests, and judges the documents over the range of the whole feature. It reads no per-ticket sync checklist, review record or verification table.
- closeout-path::REQ-007/AC-02: It writes no table of its own. Its delivery note names the units it found unmet or unverified and the statements it corrected; with none, it says how many units it checked.

## Failure modes and boundaries

1. **A blocking ticket is not merged.** The closeout stops and reports; it does not start (REQ-001).
2. **Only product code changed and no test was written.** The review still runs: the judgement is on the whole change, not on test files, because this is the case the review most needs to catch (REQ-005).
3. **A test file changed only in comments.** `change-scope.mjs` reads it as `same`, so it counts as no executable change (REQ-002, REQ-005).
4. **The script errors (exit 2).** It cannot list the files, so the error is fixed and the judgement runs again, or the user is told if it cannot be fixed (REQ-002/AC-02).
5. **The closeout writes no factual statement.** The check records the command and the empty result, and ends (REQ-003/AC-01).
6. **A closeout finds a defect in the product.** The fix is an executable change, so it is written through the full steps (REQ-002/AC-02); the statements still go through the claim check.
7. **A finding needs a new decision.** It goes to the user to decide (`claim-check.md`, handling).
8. **The project's CI does not run a test command, such as its e2e suite or a local smoke test.** With no executable change it does not run for this ticket. With an executable change it runs locally once before the delivery ([delivery-flow::REQ-001/AC-03 and AC-06](delivery-flow.md)).
9. **The fork point has no CI run, or one that did not pass.** It cannot be the base, so the test commands run as [delivery-flow::REQ-001/AC-01 and AC-03](delivery-flow.md) say.
10. **A test command is known to read a document.** It does not count as a test command, so it still runs ([delivery-flow::REQ-001/AC-06](delivery-flow.md)).
11. **The session does not yet know the ticket is a closeout.** Reading the ticket comes first, since the layers depend on it (REQ-006).

## Implementation Decisions

- The claim check runs in the closeout's own session and sends no subagent: a closeout already runs in a new session that did none of the feature's earlier work, and nothing uses a subagent unless a rule asks for one.
- REQ-006 names no file list; the layers are derived from the path.

## Out of Scope

- The feature checklist in the claim check. It is a working record outside the repository; the check covers only what is written into the repository.
- A second reader of the statements a closeout writes. The check reads sentences written by the same agent, so a mistake made while writing can repeat in it.
- A local run of any test command for a closeout with no executable change. The cost is that a command the CI workflow does not carry does not run for that ticket at all, such as a smoke test that starts the app, and the cases only the shipped platform runs do not run either. Tests that `/features-catalog`'s item-by-item verification runs as evidence are not among those commands, and they stay.
- A claim check on tickets other than closeouts.
