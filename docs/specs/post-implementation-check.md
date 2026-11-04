# Post-implementation check: handoff and handback

> Related: `/implement` step 6 ([post-implementation-check.md](../../implement/post-implementation-check.md)) · `/review-tests` ([SKILL.md](../../review-tests/SKILL.md))

## Problem Statement

`/implement` step 6 hands the written tests to an independent reviewer. The reviewer writes every dimension's conclusions and findings into the test review record, and then hands back a full report as its final message. That report repeats what the record already holds (median 1.9k estimated tokens, up to 2.8k, over 64 recorded reviews) and stays in the main agent's context for the rest of the session, once per review round. Two copies of the same findings can also disagree, and nothing says which one the main agent must act on. The record has no fixed place where a round's findings are listed, so a short handback has nothing stable to point at.

## Solution

The record lists each time point's findings in one numbered Findings subsection. The reviewer's handback shrinks to a pointer: the conclusion, the record's path, and each finding's identifier with a one-line title. The main agent reads the findings from the record, never from the handback. The handoff to the reviewer stays as it is.

## User Stories

### post-implementation-check::US-001 Act on findings from one source

As the main agent running step 6, I want the reviewer to hand back only where its findings are, so that the findings live in one place, I act on the version that is kept, and the session does not carry a second copy of every round's report.

- post-implementation-check::US-001/AC-01: After a post-implementation check (first or incremental), the reviewer's handback holds only the conclusion (whether this round has findings), the test review record's path, and, for each finding of this round, its identifier and a one-line title.
- post-implementation-check::US-001/AC-02: The handback holds no finding body, no dimension conclusion, no evidence and no account of how the check was done.
- post-implementation-check::US-001/AC-03: Before handling any finding, the main agent reads this round's Findings subsection of the record in full; it does not handle a finding from its handback title.
- post-implementation-check::US-001/AC-04: When the handback and the record disagree (an identifier in one and not the other, or a title that does not match the finding), the record governs, and the main agent records the mismatch as an untrue record before handling the findings.

## Functional Requirements

### post-implementation-check::REQ-001 One numbered Findings subsection per time point (direct acceptance)

In the test review record, each time point's section (design review, post-implementation check, and each incremental post-implementation check) lists all of that round's findings under one subsection named with the fixed name 「发现」 (written per the project's `working-language`), each finding with an identifier that no other finding in the same record uses; a round with no findings still has the subsection and states that it found none.

### post-implementation-check::REQ-002 Completion is still signalled by the handback (direct acceptance)

The check is complete only when the reviewer has handed back; the Findings subsection appearing or being written is not a completion signal. (This is the existing rule; the shorter handback must keep it true.)

### post-implementation-check::REQ-003 An incremental check reads part of the record (direct acceptance)

In an incremental post-implementation check, the reviewer reads in the test review record only the test design table with its increments and the previous round's conclusions, findings and their handling, finding them by section heading, and gets the identifiers already used by searching. Its document-sync check of the record covers only those parts. Earlier rounds hold conclusions on earlier versions, which the check carries over rather than judges again.

## Constraints

### post-implementation-check::CON-001 The handoff to the reviewer is unchanged (direct acceptance)

Applies to: the first and the incremental post-implementation check. The reviewer is still given only the global instruction files, the spec and test review record paths, the commit range(s), and the gate and targeted log paths; no diff file or other package is generated for it, and no judgment about the tests is written into the handoff.

### post-implementation-check::CON-002 Tool-independent wording (direct acceptance)

Applies to: the clauses that define the handback. They name what the reviewer's final hand-back contains, not a particular tool's hand-back mechanism, so they hold in Claude Code (a hand-back call) and in Codex (the subagent's last message) alike.

## Failure modes and boundaries

Listed in the order a step 6 round runs.

1. **Nothing executable changed.** The first check does not run, so there is no reviewer and no handback; the record states the skip and its basis ([closeout-path::REQ-005](closeout-path.md)).
2. **No findings.** The handback states none and gives the path, with no identifiers; the record's Findings subsection states none (REQ-001).
3. **Many findings.** The handback lists every finding of the round, one line each; it does not summarise or merge them to stay short (US-001/AC-01).
4. **Incremental round.** New findings get identifiers not used earlier in the record; the handback lists only this round's findings. How the earlier rounds' findings were handled stays where the record already keeps it (REQ-001).
5. **Reviewer stops before handing back** (crash, interruption, context exhausted). There is no handback, so the check is not complete even if the Findings subsection is already written; the main agent does not start fixing from a half-written record (REQ-002).
6. **Handback and record disagree.** The record governs; the mismatch is recorded as an untrue record (US-001/AC-04).
7. **The tool cannot spawn a subagent.** The main agent runs the check itself, as today; there is no handback, and REQ-001 still applies to the record.
8. **Working language.** A `zh` project writes 「发现」, an `en` project the registered English name; neither invents its own (REQ-001, `/repo-scaffold`'s artifact-name rules).
9. **A ticket continued from records written before this rule.** Earlier rounds are not rewritten; each round run from now on writes its own Findings subsection (REQ-001).
10. **Design review.** The main agent runs it in step 4 with no handback; its section still carries a Findings subsection (REQ-001).

## Implementation Decisions

- The handback's content is defined in `/review-tests`, beside its run-evidence clause and under the same condition (when run on `/implement` step 6's handoff): the reviewer loads `/review-tests`, not `/implement`'s reference files, so a rule kept only in the latter would never reach it.
- `implement/post-implementation-check.md` defines the main agent's side: read the Findings subsection in full before handling, and the record governs on a mismatch; the existing end-signal sentence stays.
- `/review-tests` requires the Findings subsection in its output rules, alongside the existing rule that every dimension keeps a conclusion.
- 「发现」 is registered in `repo-scaffold/artifact-names/review-tests.md` (English: Findings, the name records already use), and `/review-tests`' sentence on fixed names in records covers it.

## Testing Decisions

- Static: `node scripts/check-artifact-names.mjs` exits 0 with the new row; the `/skill-policy` two-stage self-check converges on every changed clause.
- Replay for REQ-003: two incremental rounds of one ticket, rebuilt from their transcripts, two runs per arm, scored with the arms hidden. The arm under test had the rule in its handoff and a note on the fix log's build and version: mean tokens -27%, list price -14%, requests -14%, and the finding one of the rounds was known for appeared in all four of its runs. The note showed no saving, so only the rule is adopted. One ticket, and the spread between runs is wider than the means: the other round's token pairs were -64% and +99%.
- Rehearsal: two fresh headless sessions each run the incremental post-implementation check on a recorded fix range, against the new clauses. Pass when the handback holds only what US-001/AC-01 lists and nothing US-001/AC-02 excludes, and the record carries a numbered Findings subsection (REQ-001). The 64 recorded reviews (handback median 1,912, maximum 2,824 estimated tokens) stand in for the control arm. Rehearsals run in a throwaway clone, read-only except for the record they write.

## Out of Scope

- A review package (commit list, stat and diff written to a file for the reviewer): over 30 recorded commit ranges a full `-U10` diff has a median of 56k estimated tokens (15.6k without working records and lockfiles; up to about 1M), against a median of 8.4k that reviewers now read through targeted `git diff`, because a ticket's range also carries records, prototypes and documents. A lighter list (commits, stat, changed paths) would replace about three tool calls per review, not worth a script and a clause.
- A read budget for the reviewer (outside the fix range, read only for a named risk): in a first check `/review-tests` itself requires reading the test files, the spec, the records and the logs, and several searches (live-path checks, shared setup, import relations). In incremental checks there is little to cut: over 21 recorded ones, reads tied to none of the fix range, the material needed to check it (the spec, code the changed tests import or the changed lines name, shared setup), finding the scope, or reads the rules require anyway averaged 1.1 calls and about 0.7k estimated tokens per check; dropping all of them would save a median 1.4% of the reviewer's cumulative input. The whole record counted then among the reads the rules require; REQ-003 narrows that one read and leaves the rest as they are.
