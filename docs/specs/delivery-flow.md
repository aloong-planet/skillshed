# Delivery flow

> Related: [post-implementation-check](post-implementation-check.md) · [project-documents](project-documents.md) · [closeout-path](closeout-path.md) · `/implement` ([SKILL.md](../../implement/SKILL.md)) · `/tdd` ([SKILL.md](../../tdd/SKILL.md)) · `/to-tickets` ([SKILL.md](../../to-tickets/SKILL.md)) · `/github-ops` ([SKILL.md](../../github-ops/SKILL.md), [delivery.md](../../github-ops/delivery.md))

## Problem Statement

Once the tests of a change passed, much of what followed kept records in step instead of checking the change. A table of the planned test cases was kept in step with the tests and compared with them at every review round. Every local run wrote a full log. Each ticket had a list of documents to sync and rows of verification status, and both were written again after the merge, as were the ticket's checkboxes. The same tests ran several times on unchanged code and once more in the pull request's CI. All of it ran in the main session at the point where its context is largest, and nobody read the records once the change had merged.

## Solution

The main agent writes the change and its tests, runs the tests the change touches, and deals with the findings of the one review. What only it knows, it writes into the spec, an ADR or the glossary. The rest goes to sub-agents: the document check and the delivery. A test command runs in full once for a delivery, in the pull request's CI where the CI carries it. One record is kept, the delivery note, and nothing is written after the merge.

## Functional Requirements

### delivery-flow::REQ-001 The runs follow the change

Applies to the runs that verify a change once it is written. The runs made while a test and its code are being written are part of writing them.

- delivery-flow::REQ-001/AC-01: After the implementation and before the review, the main agent runs the type check, the lint, and the tests the change touches: the test files it wrote or changed, the test files that import a module it changed, and the test files that read a configuration or data file it changed. The list comes from a search, not from memory. Running a whole test command instead of the files selected from it also meets this.
- delivery-flow::REQ-001/AC-02: After the fixes to the review's findings, and after any other change made once the review was sent, the same run for what they touch.
- delivery-flow::REQ-001/AC-03: Each test command runs in full once for a delivery, on the code being delivered: in the pull request's CI where the CI workflow carries the command, and locally before the delivery where it does not or where there is no pull request. A check that is neither a test command nor part of AC-01's run follows the same rule.
- delivery-flow::REQ-001/AC-04: Beyond AC-01 to AC-03 nothing runs: no run before the review other than AC-01, no full local run of a command the CI carries beyond what AC-01's last sentence allows, and no local run because the default branch was merged into the branch.
- delivery-flow::REQ-001/AC-05: A command is not run again on code whose executable content is unchanged since that command last passed on it.
- delivery-flow::REQ-001/AC-06: A change whose executable content is the same as at its fork point runs no test command, whatever AC-01 to AC-03 would have it run, provided the default branch's CI passed on the fork point. That includes a command the CI workflow does not carry, such as a smoke test that runs only locally. Commands that are not test commands still run: the lint, the type check, and any check that scans the repository's files or reads its documents. A script that chains a test command with other commands is split, so that the others still run.
- delivery-flow::REQ-001/AC-07: A command that fails stops the flow: nothing is handed over or delivered until it passes.
- delivery-flow::REQ-001/AC-08: No log of a run is written to a file. The delivery note names each command that ran locally, the commit it ran on and its result. The CI's runs are read on the pull request and are not copied into the note.
- delivery-flow::REQ-001/AC-09: A delivery through a pull request is complete only when every CI run on the pull request's head has succeeded. A run that fails is fixed, the fix passes the run of AC-02, and the CI is awaited again.

### delivery-flow::REQ-002 What goes to sub-agents once the findings are handled

- delivery-flow::REQ-002/AC-01: Before handing anything over, the main agent writes what only it knows: into the spec, the behaviour its change decided or changed; into an ADR, a decision that reaches the ADR bar; into the glossary, a new term.
- delivery-flow::REQ-002/AC-02: Once the findings are handled, and the run of REQ-001/AC-02 has passed where there were fixes, the closing document check goes to a sub-agent as [project-documents::REQ-005](project-documents.md) says.
- delivery-flow::REQ-002/AC-03: The delivery then goes to a sub-agent that loads `/github-ops` itself. It pushes the branch, opens the pull request with the delivery note as its description or updates the one the branch already has, waits for the CI, and hands back the pull request's address, the commit at its head and the conclusion of each CI run, with the failing output of a run that did not succeed. It changes no file and makes no commit.
- delivery-flow::REQ-002/AC-04: Where the tool lets the delivery sub-agent's model be chosen, it is the smallest tier of the latest generation, named the way [project-documents::REQ-005/AC-02](project-documents.md) names a tier.
- delivery-flow::REQ-002/AC-05: On the delivery handback the main agent checks that the pull request's head is the commit it handed over and that every conclusion is success, before it reports the delivery complete.
- delivery-flow::REQ-002/AC-06: The merge waits for the user's approval. After the merge nothing is written: no record, no edit to a ticket, no comment. The main agent tells the user the merge commit.
- delivery-flow::REQ-002/AC-07: Where the tool cannot send a sub-agent, the main agent does these steps itself.

### delivery-flow::REQ-003 What is written down

- delivery-flow::REQ-003/AC-01: A delivery has one record, its delivery note: what changed and why; each finding of the review with its outcome; each command that ran with its result; the evidence for each acceptance item that a ticket guarantees by evidence gathered by hand; what was not verified; what waits for the user's decision; the screenshots [project-documents::REQ-004/AC-02](project-documents.md) asks for; and what is left for someone else to do.
- delivery-flow::REQ-003/AC-02: The note is drafted in a file in the change's working-record directory from the moment the review hands back. It becomes the description of the pull request, and is the report to the user where there is no pull request.
- delivery-flow::REQ-003/AC-03: No skill writes or requires a code review record, a test review record, a table of planned test cases, a document sync checklist, a regression report, a log of a run, a copy of a command's output, or a table of verification status. The one exception is the claim check of a closeout ([closeout-path::REQ-003](closeout-path.md)).
- delivery-flow::REQ-003/AC-04: Where the note rests a statement on a command, such as a search that found nothing or a test that failed before a fix, it gives the command and what it returned.
- delivery-flow::REQ-003/AC-05: The working records that remain hold plans, not status: the alignment record, the feature checklist's parts on sources and on which ticket delivers what, and local ticket files. Implementing, delivering or merging a ticket changes none of them.
- delivery-flow::REQ-003/AC-06: Records a project already has stay as they are. Nothing is migrated or deleted, and a ticket continued from them does not add to them.

### delivery-flow::REQ-004 Planned test cases are listed in the reply

- delivery-flow::REQ-004/AC-01: Before it writes or changes the first test of a change, the agent lists the cases it plans in its reply, one line each: the acceptance criterion or boundary entry the case proves, the input that takes execution there, and where the expected value comes from.
- delivery-flow::REQ-004/AC-02: The list is not written to a file and is not kept up to date as the cases change.
- delivery-flow::REQ-004/AC-03: The test review has one time point, after the tests are written, and it does not compare the tests with the list.

### delivery-flow::REQ-005 Tickets hold no status

- delivery-flow::REQ-005/AC-01: A ticket states its acceptance items as a plain list without checkboxes. Each item still names what guarantees it.
- delivery-flow::REQ-005/AC-02: A ticket has no process-acceptance items and names no record paths.
- delivery-flow::REQ-005/AC-03: On a tracker that closes a ticket from a pull request, the pull request's description names the ticket so that the merge closes it. Nobody edits a ticket or comments on it after the merge, on any tracker. A ticket is done when the change that names it is in the default branch.
- delivery-flow::REQ-005/AC-04: A feature delivered as one ticket, or with none, has no table of which ticket delivers what. A feature cut into several keeps it. The feature checklist has no part for current verification.

## Constraints

### delivery-flow::CON-001 Tool-independent wording (direct acceptance)

Applies to: the clauses on sub-agents and their models. They name what is handed over, what is handed back and a tier of model, not one tool's mechanism or one model's name. A tool that cannot choose a sub-agent's model runs it on what the tool gives.

## Failure modes and boundaries

1. **The CI does not carry a test command**, such as a smoke test that runs only on the author's machine. It runs locally once before the delivery (REQ-001/AC-03).
2. **The default branch moved and was merged into the branch.** Nothing runs locally for that; the CI runs on the new head and the delivery waits for it (REQ-001/AC-04, AC-09).
3. **A CI run fails.** The fix is made, passes the run of REQ-001/AC-02 and is pushed. It is not reviewed again, and the note says so ([post-implementation-check::REQ-008/AC-07](post-implementation-check.md)).
4. **The pull request's head is not the commit that was handed over.** The main agent does not report the delivery complete; it finds what differs and tells the user (REQ-002/AC-05).
5. **The session loses its context between the review and the delivery.** The note's file already holds the findings and their outcomes so far (REQ-003/AC-02).
6. **Local ticket files, or a tracker that cannot close a ticket from a pull request.** Nothing is edited; the ticket is done when its change is in the default branch (REQ-005/AC-03).
7. **A ticket cut under the earlier rules**, with checkboxes and process-acceptance items. It is implemented as it stands; its boxes are not ticked and the records it names are not written (REQ-005, REQ-003/AC-06).
8. **The fork point's CI did not pass, or never ran.** REQ-001/AC-06 does not apply, and the test commands run as AC-01 and AC-03 say.
9. **A change judged small.** It gets the main agent's own review in place of the independent one ([post-implementation-check::REQ-004/AC-05](post-implementation-check.md)), and the main agent itself answers which statements in the documents the change made untrue or left missing, so no document check is handed over. REQ-001, REQ-003, REQ-004 and the delivery of REQ-002/AC-03 to AC-06 apply to it as to any change.
10. **The user reports on a change already delivered.** A defect or added scope is a new delivery, continued on the pull request's branch where that pull request is not merged yet. An acceptance writes nothing (REQ-003/AC-05, REQ-005/AC-03).
11. **The CI carries a command but its job did not run on the pull request's head.** Where the job was skipped by the CI's own routing by changed paths and the workflow's gate passed, the command does not run for this delivery. In any other case the CI did not carry it this time, and it runs locally on that head (REQ-001/AC-03).
12. **No CI is triggered by a pull request in the repository.** Every test command and check runs locally before the delivery, and the delivery does not wait for a CI (REQ-001/AC-03, AC-09).

## Implementation Decisions

- The planned-case list is a rule of `/tdd`, the skill loaded when tests are written. `/review-tests` loses its design-review time point.
- The rules on per-ticket records and on the sync checklist leave `/to-tickets` and `/implement`; `/implement` keeps the order of the steps and the reference files for the runs and the handoffs.
- `change-scope.mjs` still decides whether executable content changed.
- The delivery sub-agent waits for the CI itself, with the script `/github-ops` already has for that.
- The fixed names that only the removed records had leave the artifact-name tables.
- The owner's global instructions outline the flow and list the working records. That file is outside this repository, and its outline and list follow this spec.

## Out of Scope

- Tiers by risk, and a list of core paths whose changes run every test locally.
- Whether closeout tickets stay, and a whole-feature check by a sub-agent in their place.
- The record `/to-spec` keeps of its check of sources against the spec.
- A check that the merge commit's tree equals the pull request's head.
- Removing or migrating the records projects already have.
