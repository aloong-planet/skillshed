# Post-implementation review: one independent pass

> Related: [delivery-flow](delivery-flow.md) · [closeout-path](closeout-path.md) · [project-documents](project-documents.md) · [risk-tiers](risk-tiers.md) · `/implement` ([post-implementation-check.md](../../implement/post-implementation-check.md)) · `/review-code` ([SKILL.md](../../review-code/SKILL.md), [independent-review.md](../../review-code/independent-review.md)) · `/review-tests` ([SKILL.md](../../review-tests/SKILL.md))

## Problem Statement

Once a change's tests passed, three checks followed one another. The main agent reviewed its own code and wrote a conclusion for every layer of the review. An independent reviewer then read the tests, wrote a conclusion for every dimension into a record, and came back for another round on the fix to the round before. Last, the main agent checked the spec clause by clause. The author of a change judges it by its own understanding of it, so its review can file a real defect as harmless. The later rounds of the test review mostly found weak assertions in the previous fix and mistakes in the record itself, and nobody read the records after the change merged.

## Solution

One reviewer that did not see the conversation reads the change once. It reviews the code, reviews the tests, and checks that each acceptance criterion the change delivers is implemented and has a test guarding it. It hands back its findings and nothing else. The main agent decides what happens to each finding, makes the fixes, checks them itself and runs the tests they touch. There is no second round, except the second review [risk-tiers::REQ-005](risk-tiers.md) gives a core-tier change. Every finding and what was done about it reaches the user in the delivery note.

## Functional Requirements

### post-implementation-check::REQ-002 Completion is signalled by the handback (direct acceptance)

The review is complete only when the reviewer has handed back. Nothing the reviewer writes or runs before that is a completion signal.

### post-implementation-check::REQ-004 One review, once

- post-implementation-check::REQ-004/AC-01: When the run of [delivery-flow::REQ-001/AC-01](delivery-flow.md) has passed, the main agent commits the change and hands it to one reviewer that does not inherit the conversation and loads the review skills itself.
- post-implementation-check::REQ-004/AC-02: The review runs once for a delivery. What is changed after it, the fixes to its findings or anything else, is not reviewed again, except by the second review of a core-tier change ([risk-tiers::REQ-005/AC-03](risk-tiers.md)). A change made after a delivery was reported complete is a new delivery with its own review.
- post-implementation-check::REQ-004/AC-03: While the reviewer runs, the main agent changes no code, no test and no data a test reads in that checkout.
- post-implementation-check::REQ-004/AC-04: Where the tool cannot send a sub-agent, the main agent runs the review itself, and the delivery note says the review was not independent.
- post-implementation-check::REQ-004/AC-05: A light-tier change ([risk-tiers::REQ-001/AC-02](risk-tiers.md)) gets no independent review. The main agent reviews its own code by the layers `/review-code` defines, fixes what it finds, and writes each finding with its outcome into the delivery note.

### post-implementation-check::REQ-005 What the reviewer checks

- post-implementation-check::REQ-005/AC-01: The code of the change, by the layers `/review-code` defines.
- post-implementation-check::REQ-005/AC-02: The tests the change wrote or changed, by the dimensions `/review-tests` defines. Coverage is judged against the list of [project-documents::REQ-003/AC-04](project-documents.md). For a core-tier change it is also judged against the entries of [risk-tiers::REQ-005/AC-01](risk-tiers.md).
- post-implementation-check::REQ-005/AC-03: Each acceptance criterion the change delivers: the ticket's acceptance items where there is a ticket, otherwise the criteria of the spec text the change added or rewrote. For each one the reviewer finds where it is implemented and what guards it: a test, or the gate the ticket names for it. A criterion with no implementation, or with neither guard, is a finding, unless the ticket names evidence gathered by hand as its guarantee or the test file states it as a gap that cannot be driven. Behaviour the change adds that no criterion asks for is a finding, and so is an implementation that differs from what the spec states.
- post-implementation-check::REQ-005/AC-04: The three are one pass by one reviewer over the same commit range.

### post-implementation-check::REQ-006 The reviewer changes nothing

- post-implementation-check::REQ-006/AC-01: The reviewer changes no file in the checkout or in the working records, and makes no commit.
- post-implementation-check::REQ-006/AC-02: It may run the tests the change wrote or changed, commands that only collect tests without running them, and commands of its own that reproduce a finding. Files it needs for that are created outside the checkout. Where the project declares mutation testing enabled, the temporary changes that takes are restored before the handback.

### post-implementation-check::REQ-007 What the reviewer hands back

- post-implementation-check::REQ-007/AC-01: For each finding, an identifier, a one-line title and the failure it describes: what a user does, what data arrives or what change to the code produces the wrong result, and, for a missing guard, why no test would go red. A finding about behaviour that can be run gives the command that reproduces it and the output it got. Where reproducing it needs data or an environment the reviewer cannot get, the finding says instead that it was not reproduced, what is missing, and which fact it rests on was therefore not checked.
- post-implementation-check::REQ-007/AC-02: A finding carries no patch, no draft of a fix and no draft of a test. It may name the direction of a fix in one sentence.
- post-implementation-check::REQ-007/AC-03: After the findings, the handback gives the number of acceptance criteria checked and the number of tests reviewed. For a core-tier change it also gives the number of entries checked ([risk-tiers::REQ-005/AC-02](risk-tiers.md)). With no finding it says so and gives these numbers. Where a check was skipped because the project's capability declaration leaves the capability off, not applicable or unconfirmed, a line says so for each.
- post-implementation-check::REQ-007/AC-04: The handback holds no conclusion for a layer or dimension that produced no finding, no account of how the review was done and no table. No review record is written anywhere.

### post-implementation-check::REQ-008 What the main agent does with a finding

- post-implementation-check::REQ-008/AC-01: The main agent writes every finding of the handback into the delivery note before it acts on any, and gives each one of three outcomes there: fixed; left for the user to decide; not fixed, with the reason.
- post-implementation-check::REQ-008/AC-02: A finding is left for the user to decide when settling it needs something the spec does not state and would change behaviour that can be observed: who else can change the data, where the product runs, which of two defensible behaviours is wanted. The main agent keeps the current behaviour where the work can go on without the decision, implements the behaviour it recommends and marks it provisional where it cannot, and writes neither into the spec before the user decides. Such a finding does not hold up the delivery.
- post-implementation-check::REQ-008/AC-03: A finding the main agent disagrees with is not dropped. It is listed as not fixed, with the finding and the main agent's reason side by side.
- post-implementation-check::REQ-008/AC-04: The main agent writes its own fix. It does not apply a patch or a test handed to it.
- post-implementation-check::REQ-008/AC-05: For each fix the main agent checks, before running anything: the product code against the spec text it implements; each new or changed assertion against the false-green forms; that each branch and exit of a changed function is driven by a test or named as a gap; and the other users of a shared test helper it changed. A problem this finds is fixed. Nothing is written about the check.
- post-implementation-check::REQ-008/AC-06: The fixes then pass the run of [delivery-flow::REQ-001/AC-02](delivery-flow.md).
- post-implementation-check::REQ-008/AC-07: The delivery note gives the commit range of what was changed in code, tests or test data after the last handover to a reviewer, and states that it was not independently reviewed.
- post-implementation-check::REQ-008/AC-08: Before the main agent changes product code to fix a finding that says the commit handed over gives a wrong result in some state or for some input, it obtains that result on that commit itself, starting from a state or input that has a witness (post-implementation-check::REQ-008/AC-09), and does not rely on the reviewer's statement. Rerunning a reproducing command the handback gives counts as obtaining it, and the state or input that command uses needs a witness all the same. Whether the result obtained is wrong is judged by the state the witness shows, not by what the finding says about that state.
- post-implementation-check::REQ-008/AC-09: What counts as a witness depends on who produces the state or input. For a state the product gets into by itself, and for an input any party on the other side of the interface can give (a user's input, a failed or timed-out connection), the witness is that it can be reached step by step through the public interface. For data only another version or another system produces (stored data an older version wrote, what an external system returns), the witness is a commit that can be named and wrote it, or a real sample.
- post-implementation-check::REQ-008/AC-10: Where the main agent cannot obtain the result of post-implementation-check::REQ-008/AC-08 and has made every check, the finding is not fixed and its outcome in the delivery note becomes not fixed. Where the finding says the state or input comes from an older version, from stored data or from an external system, checking that origin is one of these checks.
- post-implementation-check::REQ-008/AC-11: Where the main agent cannot obtain the result of post-implementation-check::REQ-008/AC-08 and one check could not be made because it needs data or an environment the main agent cannot get, the finding is not fixed. It is left for the user to decide and the current behaviour is kept, as in post-implementation-check::REQ-008/AC-02, and the delivery note says under it what is missing.

## Constraints

### post-implementation-check::CON-001 What the reviewer is given (direct acceptance)

Applies to: the handoff. The reviewer is given the checkout's absolute path, the start of the range (the fork point, or for the second review of a core-tier change the commit first handed over) and the commit handed over, the slugs of the specs the change touches, the ticket where there is one, for a core-tier change that it is core tier, and the instruction to load the review skills and run the review. It is given no judgement of the code or the tests, no account of how the change was made, and not the list of cases the author planned.

### post-implementation-check::CON-002 Tool-independent wording (direct acceptance)

Applies to: the clauses that define the handback. They name what the reviewer's final hand-back contains, not a particular tool's hand-back mechanism, so they hold in Claude Code (a hand-back call) and in Codex (the subagent's last message) alike.

## Failure modes and boundaries

1. **Nothing executable changed.** The review does not run, and the delivery note states the skip and its basis ([closeout-path::REQ-005](closeout-path.md)).
2. **No finding.** The handback says so and gives the two numbers, and for a core-tier change the number of entries checked (REQ-007/AC-03).
3. **The reviewer stops before handing back** (crash, interruption, context exhausted), **or hands back without the two numbers, or, for a core-tier change, without the number of entries checked.** The review is not complete (REQ-002). The main agent sends it out once more with the same handoff; if that one does not hand back either, it runs the review itself and the delivery note says the review was not independent.
4. **The reviewer changed a file or made a commit.** On the handback the main agent compares the checkout with the commit it handed over, undoes a commit the reviewer made, restores a changed file from that commit, tells the user, and still uses the findings (REQ-006/AC-01).
5. **A fix turns out large.** Its size brings no second review; only a core-tier change whose fixes change product code gets one ([risk-tiers::REQ-005/AC-03](risk-tiers.md)). The delivery note's statement of REQ-008/AC-07 is what tells the user.
6. **The handback carries a patch all the same.** It is not applied (REQ-008/AC-04).
7. **A finding needs the user's decision.** It does not hold up the delivery and is in the note (REQ-008/AC-02).
8. **The change has no ticket and adds or rewrites no acceptance criterion**, such as a fix that restores behaviour the spec already states. The reviewer checks the changed code against the spec text it implements, and the handback gives zero criteria checked (REQ-005/AC-03, REQ-007/AC-03).
9. **A finding rests on a fact the main agent cannot check**, because the check needs data or an environment it cannot get. The finding is not fixed on the reviewer's statement: it is left for the user to decide, the current behaviour is kept, and the note says what is missing (post-implementation-check::REQ-008/AC-11).

## Implementation Decisions

- The reviewer loads `/review-code` and `/review-tests`. What it checks, what it may not change and what it hands back are stated once, in a reference file of `/review-code` that both skills have the reviewer read, since it does not load `/implement`'s reference files. The rules for handing over and for handling the findings are in `/implement`'s reference file, which only the main agent reads.
- `/review-code`'s subject is a commit range, read without the author's context. Run in the session that wrote the change, for a light-tier change or at the user's request, it reviews that session's change and reports the same way.

## Out of Scope

- A second review of a change that is not core tier, and any review after the second.
- A second reader for the findings the main agent leaves unfixed. The user reads them in the delivery note instead.
- A smaller model for the reviewer. It runs on the model the tool gives it.
- A package of the diff written to a file for the reviewer. The reviewer reads the range through git itself.
