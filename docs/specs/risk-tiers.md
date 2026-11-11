# Risk tiers

> Related: [delivery-flow](delivery-flow.md) · [post-implementation-check](post-implementation-check.md) · [project-documents](project-documents.md) · [closeout-path](closeout-path.md) · `/implement` ([SKILL.md](../../implement/SKILL.md), [risk-tiers.md](../../implement/risk-tiers.md), [post-implementation-check.md](../../implement/post-implementation-check.md), [delivery-and-feedback.md](../../implement/delivery-and-feedback.md)) · `/to-tickets` ([SKILL.md](../../to-tickets/SKILL.md), [ticket-templates.md](../../to-tickets/ticket-templates.md)) · `/review-code` ([independent-review.md](../../review-code/independent-review.md)) · `/tdd` ([SKILL.md](../../tdd/SKILL.md)) · `/github-ops` ([SKILL.md](../../github-ops/SKILL.md)) · `/repo-scaffold` ([capabilities-registry.md](../../repo-scaffold/capabilities-registry.md))

## Problem Statement

Every change that was not judged small took the same path: one independent review, a document check by a sub-agent, and a stop for the owner's approval before the merge. A change could be judged small only when nothing had to be aligned with the owner and it did not come from a ticket. So a ticket that changed a few lines of presentation was reviewed like a change to how data is written to disk, and a change to how data is written to disk got no more than that ticket did. A pull request that changed only documents waited for the owner like any other.

## Solution

A change takes one of three tiers, set by what a mistake in it would cost. The agent assesses the tier and says why; when tickets are cut, each ticket is assessed then and carries its tier. The user may declare the tier instead, for one change or for everything, and a declaration decides. A light-tier change is reviewed by the main agent itself. A standard-tier change gets the one independent review. A core-tier change also has a test for every costly failure the spec states about the code it touches, and its fixes get a second review when they change product code. A project may also declare that a pull request which changes no executable content is merged once its CI passes, without waiting for its owner.

## Functional Requirements

### risk-tiers::REQ-001 A change takes one of three tiers

Applies to every change carried out through `/implement`, other than a closeout ticket.

- risk-tiers::REQ-001/AC-01: A change takes the light, the standard or the core tier. The tier is set by what a mistake in the change would cost. It is not set by the number of lines changed, and not by how the change arrived: a change made from a ticket, from a spec or from a request is judged the same way, and so is a change whose requirements were first aligned with the user.
- risk-tiers::REQ-001/AC-02: The light tier is for a change in which a mistake is cheap: it would be seen the first time the changed thing is used, and reverting the change would undo it. Wording, a style, one interaction on one surface, a local defect with a visible symptom, a document, and a small fix to a test or a tool are of this kind.
- risk-tiers::REQ-001/AC-03: The core tier is for a change in which a mistake could lose or corrupt the user's data, produce a wrong figure that nobody would notice, or open a security hole: a change to how such data is written or deleted, to how such a figure is computed, or to what a boundary admits.
- risk-tiers::REQ-001/AC-04: The standard tier is for every other change.

### risk-tiers::REQ-002 Who sets the tier

- risk-tiers::REQ-002/AC-01: Before it starts a change, the agent assesses its tier and states it in its reply with the reason, in terms of what a mistake would cost.
- risk-tiers::REQ-002/AC-02: When tickets are cut, the agent cutting them assesses the tier of each, shows it with the breakdown the user approves, and writes it into the ticket with its reason. A ticket's tier is the one written in it. A ticket that states none is assessed by the agent that implements it.
- risk-tiers::REQ-002/AC-03: The user may declare the tier: for one change, for a set of tickets, for a project, or for every change. A declaration decides, over the agent's assessment and over the tier written in a ticket. Where more than one declaration covers a change, the narrowest applies.
- risk-tiers::REQ-002/AC-04: The agent may raise a tier and never lowers one. When the reason for the tier stops holding while the change is being made, because the change reaches what REQ-001/AC-03 describes or a mistake in it is no longer cheap, the change goes on at the higher tier and the agent says so. It takes no tier below the one it assessed at the start or the one written in the ticket.
- risk-tiers::REQ-002/AC-05: Under a declaration of the user's, the agent keeps the declared tier. Where it would have assessed a higher one, it says so, before it starts where that already shows and otherwise as soon as it shows, and the declared tier still applies.
- risk-tiers::REQ-002/AC-06: The delivery note states the tier and where it came from: the agent's assessment, the ticket, or the user's declaration.

### risk-tiers::REQ-003 Alignment is decided apart from the tier

- risk-tiers::REQ-003/AC-01: Whether a change's requirements are aligned with the user before it is coded depends on whether there is a requirement or an acceptance criterion to align or a decision to make. It does not depend on the tier. A change with nothing to align and no decision to make starts at the implementation, at any tier.
- risk-tiers::REQ-003/AC-02: A light-tier change whose requirements were aligned is not written up through `/to-spec`. The behaviour that was decided goes into the spec when the main agent answers the document questions of REQ-004/AC-04.
- risk-tiers::REQ-003/AC-03: When a requirement to align or a decision to make turns up while a change is being made, the agent stops and aligns it with the user, at any tier.

### risk-tiers::REQ-004 The light tier

- risk-tiers::REQ-004/AC-01: Before coding, the main agent writes the success criteria in its reply: for a defect, the wrong behaviour and how it is reproduced; for a change of behaviour, the behaviour afterwards. Where the change is made from a ticket, the ticket's acceptance items are the criteria.
- risk-tiers::REQ-004/AC-02: Each behaviour in the criteria gets a test, written or changed as `/tdd` says, or the delivery note says why a test of it has no value.
- risk-tiers::REQ-004/AC-03: The review is the main agent's own, as [post-implementation-check::REQ-004/AC-05](post-implementation-check.md) says. Where the change is made from a ticket, the main agent also finds, for each acceptance item, where it is implemented and what guards it, by the rule the independent reviewer follows ([post-implementation-check::REQ-005/AC-03](post-implementation-check.md)), and writes what it found unmet into the delivery note as a finding.
- risk-tiers::REQ-004/AC-04: The main agent itself answers which statements in the documents the change made untrue and which are missing, after searching the documents for the names the change touched, and rewrites them. No document check is handed over.
- risk-tiers::REQ-004/AC-05: The runs, the delivery note and the delivery are those of any change ([delivery-flow](delivery-flow.md)).

### risk-tiers::REQ-005 What the core tier adds to the standard tier

- risk-tiers::REQ-005/AC-01: A core-tier change has a case for every entry under "Failure modes and boundaries" that states a costly failure in the sense of [project-documents::REQ-003/AC-01](project-documents.md) and concerns the code the change touched. The entries are those of the specs of the features that code implements, whether or not the change added or rewrote them. An entry that cannot be driven is a stated gap. The agent names these entries in its list of planned cases ([delivery-flow::REQ-004/AC-01](delivery-flow.md)).
- risk-tiers::REQ-005/AC-02: The handoff to the reviewer says that the change is core tier. The reviewer checks AC-01 entry by entry: an entry with neither a case nor a stated gap is a finding. Its handback gives the number of entries it checked, beside the two numbers of [post-implementation-check::REQ-007/AC-03](post-implementation-check.md).
- risk-tiers::REQ-005/AC-03: When the findings are handled and the run after the fixes has passed, the main agent looks at what the commits made since the one handed to the reviewer changed. Where they changed product code, a file whose executable content changed and that is neither a test nor data a test reads, those commits are handed once to an independent reviewer that does not inherit the conversation, with the commit handed over the first time as the start of the range. It reviews that range as [post-implementation-check::REQ-005](post-implementation-check.md) says and hands back as REQ-007 there says, and its findings are handled as REQ-008 there says.
- risk-tiers::REQ-005/AC-04: A change has two reviews at most. What is changed after the second review is not reviewed, and neither are fixes after the first review that changed no product code. The delivery note states the range that was not reviewed ([post-implementation-check::REQ-008/AC-07](post-implementation-check.md)).
- risk-tiers::REQ-005/AC-05: In everything else a core-tier change is treated as a standard-tier change.

### risk-tiers::REQ-006 Merging without approval where nothing executable changed

- risk-tiers::REQ-006/AC-01: A project may declare in its capability declaration that a pull request which changes no executable content is merged without waiting for its owner. A project that declares this off waits for the owner on every pull request.
- risk-tiers::REQ-006/AC-02: The main agent merges a pull request itself, without asking, when all of these hold: the project declares the capability on; the script that judges executable content finds the delivered commit the same as its fork point; the repository has CI that pull requests trigger, and every CI run on the pull request's head succeeded; the pull request's head is the commit that was handed over for delivery; and the user has not asked to see this change before it merges.
- risk-tiers::REQ-006/AC-03: Where any of them does not hold, the merge waits for the user's approval ([delivery-flow::REQ-002/AC-06](delivery-flow.md)).
- risk-tiers::REQ-006/AC-04: The delivery note of such a change says, before the pull request is opened, that the change holds no executable content and will be merged once its CI passes, under the project's declaration. After the merge the main agent tells the user the pull request's address, that it was merged without approval, and the merge commit.
- risk-tiers::REQ-006/AC-05: The merge is made the way an approved merge is made.
- risk-tiers::REQ-006/AC-06: The project's declaration is read only for a change whose executable content equals its fork point. A change with executable content waits for the owner whatever the project declares, and a project that has not declared the capability is not asked about it for such a change.
- risk-tiers::REQ-006/AC-07: Before a project declares the capability on, the user is told what it reaches: every change the script finds to hold no executable content. The question names, among what that takes in beyond specs and ADRs, the project's instruction files, every file under `docs/` with the prototypes and their scripts and styles among them, and a change of comments alone in a JavaScript, TypeScript or Python file. A user who turns it on is then asked which of those files they want to see before a merge, and the answer is written as a standing request in the project's `AGENTS.md`, naming each file or directory.
- risk-tiers::REQ-006/AC-08: The user asks to see a change before it merges (AC-02) either for one change, in the conversation, or as a standing request written where the agent's instructions are. A standing request that names files or directories holds for a pull request that changes any of them, whatever else the pull request changes, and that pull request waits for approval.

## Failure modes and boundaries

1. **A change assessed as light reaches riskier code while it is being made.** The agent raises it and says so; the steps of the higher tier that it has not yet done are done before the delivery (REQ-002/AC-04).
2. **The user declares a tier below the one the agent would assess.** The declared tier is taken. The agent says beforehand which tier it would have assessed, and the delivery note records the declaration (REQ-002/AC-05, AC-06).
3. **A ticket's tier and a declaration of the user's differ.** The declaration applies (REQ-002/AC-03).
4. **A ticket states no tier**, because it was cut before tiers existed or was written by hand. The agent that implements it assesses the tier (REQ-002/AC-02).
5. **The fixes after the review change only tests, data a test reads, documents, or comments in JavaScript, TypeScript or Python files.** No second review (REQ-005/AC-03).
6. **A fix made after the second review, or to a CI failure after it.** It is not reviewed, and the delivery note says so (REQ-005/AC-04).
7. **The tool cannot send a sub-agent.** The main agent runs both reviews itself and the delivery note says they were not independent ([post-implementation-check::REQ-004/AC-04](post-implementation-check.md)).
8. **A light-tier ticket of a feature cut into several tickets.** The main agent checks its acceptance items (REQ-004/AC-03). The feature's closeout, where it has one, checks the whole feature as before.
9. **A repository whose Markdown is its product**, such as skills or instructions for agents. The script finds no executable content in a change to them, so such a change would qualify under REQ-006; the repository leaves that capability off, and every pull request waits for its owner (REQ-006/AC-01).
10. **A change of comments only, in JavaScript, TypeScript or Python files.** The script finds the executable content unchanged, and REQ-006 applies to it as to a change of documents. In a file of any other type the script counts a changed comment as executable content. A comment that a tool reads, such as a test runner's environment line, a bundler's annotation or a coverage marker, is read by the script as a comment like any other: a change of such a comment alone merges under REQ-006 where the project declares the capability, and the pull request's CI is the check it passes.
11. **A repository with no CI that pull requests trigger.** REQ-006/AC-02 cannot hold, and every pull request waits for the owner.
12. **A CI run fails on a pull request that qualified under REQ-006.** It is not merged. After the fix the conditions are judged again on the new head; a fix that changed executable content waits for the owner.
13. **A change edits the capability declaration.** The script counts it as executable content, so it is never merged under REQ-006 and waits for the owner.
14. **A light-tier change decides behaviour for a feature that has no spec.** The decided behaviour is stated in the delivery note; writing that feature's spec is a change of its own (REQ-003/AC-02).
15. **A pull request that changes only a project's instruction file, or a prototype under `docs/`.** The script reads every file under `docs/` and every Markdown file as holding no executable content, so the pull request qualifies under REQ-006 and merges without approval, unless a standing request of the user's names the file or a directory it is under (REQ-006/AC-08). The user is told so before the project turns the capability on (REQ-006/AC-07).

## Implementation Decisions

- The tier rules have one home, a reference file of `/implement` that `/to-tickets` also has the cutting agent read.
- `/implement` opens by settling the tier: a declaration of the user's where one covers the change, otherwise the tier written in the ticket, otherwise the agent's own assessment. Its small-change path becomes the light-tier path.
- `/to-tickets` shows each ticket's tier in the breakdown it puts to the user, and the ticket templates carry a line for the tier and its reason.
- The reviewer's entry-by-entry check is in the reference file of `/review-code` that both review skills have the reviewer read. `/tdd`'s list of planned cases names the entries of REQ-005/AC-01.
- One capability ID joins the registry in `/repo-scaffold`, a section with the base fields only: the merge of REQ-006, whose `source` is the document that records the project's adoption of it. It has no enforcing command.
- `/github-ops`'s rule that a merge needs the user's explicit authorization gains the one exception of REQ-006. The delivery sub-agent still never merges.
- What the user is told and asked before the capability is turned on (REQ-006/AC-07) is in the registry, with the capability's definition. What counts as a request to see a change first (REQ-006/AC-08) is with the conditions of the merge, in the delivery rules of `/implement`.
- A declaration that is to outlast a conversation is written where the agent's instructions are: a project's `AGENTS.md` for that project, the owner's global instructions for every project. Those files are the owner's; the global instructions are outside this repository, and their outline of the flow follows this spec.

## Out of Scope

- A list of core paths that a script compares with a change's diff, and any setting of the tier that rests on file paths. A list true to the criterion of REQ-001/AC-03, tried on one project, covered most of that project's product changes; a list by file also counts an unrelated edit to a listed file, misses a change made to a listed file's behaviour from another file, and grows with the project.
- A second reader of the agent's assessment of the tier. The user sees the tier in the reply and in the ticket breakdown, and may declare another.
- A smaller model for the reviewer in any tier.
- Running every test locally before a core-tier change is reviewed. The pull request's CI carries the full run.
- Merging without approval a pull request that changes executable content, at any tier.
- Telling a comment that a tool reads from any other comment when judging executable content.
- The tier of an executable change a closeout ticket makes. [closeout-path](closeout-path.md) decides its path.
