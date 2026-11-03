# Closeout path

> Related: `/implement` ([SKILL.md](../../implement/SKILL.md), [claim-check.md](../../implement/claim-check.md), [post-implementation-check.md](../../implement/post-implementation-check.md)) · `/features-catalog` ([SKILL.md](../../features-catalog/SKILL.md)) · `/to-tickets` ([ticket-artifacts.md](../../to-tickets/ticket-artifacts.md))

## Problem Statement

A closeout ticket delivers no product behaviour and usually changes no executable line, yet it ran every step meant for code: the code review, the test design review, the pre-review run, the independent test review and a full local run named in the ticket. The test review has no written test to read in that case, and its scope stops at tests, so a false statement written into a spec is outside it unless the statement happens to be tied to an evidence script.

Measured once, on the closeout of a two-ticket feature with no product code: about 26M tokens, about what each code ticket of that feature took (32M and 35M). The independent test review took 17% of the tokens and four findings, none of them on a written test. The one that changed a decision was on a sentence written into a spec.

## Solution

A closeout ticket runs its own path in `/implement`. The full-feature closeout in `/features-catalog` stays its body. With no executable change, the code and test reviews and the pre-review run give way to one claim check of the factual statements the ticket writes into the repository. An executable change made during the closeout still takes the full steps.

Separately, the first post-implementation check of any ticket is skipped when nothing executable changed.

## Functional Requirements

### closeout-path::REQ-001 The closeout path (direct acceptance)

A ticket that states it is a closeout ticket runs `/implement`'s closeout path. Every ticket it is blocked by must be merged first. The path runs `/features-catalog`'s closeout, decides by the fork point, runs the claim check and delivers.

### closeout-path::REQ-002 What decides the reviews

- closeout-path::REQ-002/AC-01: With `change-scope.mjs` exiting 0 against the fork point, the code review, the test reviews and the pre-review run do not run.
- closeout-path::REQ-002/AC-02: With any other exit code, those changes take steps 4 to 7 in full.
- closeout-path::REQ-002/AC-03: With no difference from the fork point at all, no PR is opened and the closeout conclusion goes to the user.

### closeout-path::REQ-003 The claim check

- closeout-path::REQ-003/AC-01: The check derives its lines from the commit range's diff: every added or rewritten sentence stating a product fact, wherever it is written in the repository. No sampling.
- closeout-path::REQ-003/AC-02: Each line gets a location, an evidence location and one of three conclusions: holds, false, not enough evidence. A ticket or another document is not evidence.
- closeout-path::REQ-003/AC-03: A negative statement lists every way into the state and shows evidence for each. A statement of how a state ends rests on a reading taken from that state.
- closeout-path::REQ-003/AC-04: Every line is judged and recorded before any finding is handled, so the record keeps what each statement got wrong. Missing evidence is gathered when the finding is handled.
- closeout-path::REQ-003/AC-05: A fix that adds or rewrites a statement has those lines checked again. Evidence gathered for a statement left as it is rejudges that line, and a fix that only deletes a statement needs no check.

### closeout-path::REQ-004 The full run (direct acceptance)

The closeout follows the general gate rules in `full-verification-gate.md`, with no rule of its own. Its ticket does not name the project's full verification command as an acceptance item, since that would bypass which commands the gate may skip. With no executable change, the test commands skip when the fork point's CI passed, and the whole e2e suite runs on the PR's CI when the workflow carries it.

### closeout-path::REQ-005 The first post-implementation check

Before a first post-implementation check, on any ticket, `change-scope.mjs` runs against the fork point. On exit 0 no reviewer is sent, and the test review record states the skip and its basis.

## Failure modes and boundaries

1. **A blocking ticket is not merged.** The closeout stops and reports; it does not start (REQ-001).
2. **Only product code changed and no test was written.** The first check still runs: the judgement is on the whole change, not on test files, because this is the case that check most needs to catch (REQ-005).
3. **A test file changed only in comments.** `change-scope.mjs` reads it as `same`, so it counts as no executable change (REQ-002, REQ-005).
4. **The script errors (exit 2).** Treated as an executable change, as the gate treats it (REQ-002/AC-02).
5. **The closeout writes no factual statement.** The check records the command and the empty result, and ends (REQ-003/AC-01).
6. **A closeout finds a defect in the product.** The fix is an executable change and takes the full steps (REQ-002/AC-02); the statements still go through the claim check.
7. **A finding needs a new decision.** It goes to the user to decide (`claim-check.md`, handling).
8. **The project's CI does not run the e2e suite.** The general gate rules run it locally: a command the workflow does not carry cannot be skipped (REQ-004).

## Implementation Decisions

- The path sits in `implement/SKILL.md` beside the light path for small changes, in the same form, and the claim check has its own reference file, loaded only by this path.
- `claim-check.md` names no subagent, by the owner's choice: a closeout already runs in a new session that did none of the feature's earlier work, and nothing uses a subagent unless a rule asks for one.
- A closeout ticket's process acceptance has three items of its own in `ticket-artifacts.md`: the claim check, document sync, and a conditional review of executable changes.

## Testing Decisions

- Static: `node scripts/check-artifact-names.mjs` and `node scripts/check-prototype-copies.mjs` exit 0, and the `/skill-policy` two-stage self-check converges on every changed clause.
- Stated gap: the one rehearsal, on a real closeout, ran the earlier form with the check in a subagent. The check as written here, with no subagent, has not run, so the first real closeout ticket after this change is its first run.

## Out of Scope

- The feature checklist and the regression report in the claim check. They are working records outside the repository, verified under `/features-catalog`, and the owner chose to check only what is written into the repository.
- A second reader of the statements a closeout writes. The check reads sentences written by the same agent, so a mistake made while writing can repeat in it. The owner accepts this cost.
- A local run of the whole e2e suite for a closeout with no executable change. The cost is that the cases only the shipped platform runs do not run for that ticket, by the owner's choice.
- A claim check on tickets other than closeouts.
