# Project documents

> Related: `/to-spec` ([SKILL.md](../../to-spec/SKILL.md)) · `/domain-modeling` ([SKILL.md](../../domain-modeling/SKILL.md), [ADR-FORMAT.md](../../domain-modeling/ADR-FORMAT.md)) · `/features-catalog` ([SKILL.md](../../features-catalog/SKILL.md)) · `/tdd` ([SKILL.md](../../tdd/SKILL.md)) · `/review-tests` ([SKILL.md](../../review-tests/SKILL.md)) · `/prototype` ([SKILL.md](../../prototype/SKILL.md), [UI.md](../../prototype/UI.md)) · `/implement` ([SKILL.md](../../implement/SKILL.md), [delivery-and-feedback.md](../../implement/delivery-and-feedback.md))

## Problem Statement

A project kept two documents per feature, a spec and a feature-catalogue page, and the page restated the spec. Every change that touched one had to touch the other and then check the two against each other.

A spec also carried content that nobody rebuilding the product would need: how a rule came about, how the current code is laid out, how the tests were designed, what a benchmark measured on one machine. The section on failure modes was filled by walking every user operation sequence, and each entry in it had to have a test case, so the number of cases followed the number of entries rather than the risk.

A project's ADRs were append-only. A change to a decision opened a new entry that superseded part of an older one, so the rule in force was spread across several entries, and the entries kept how each decision came about, verification logs, costs already paid and implementation detail. Nothing said what an entry may hold or how long it may be, and the rule keeping process conventions out of ADRs contradicted the places that record a project's own choice of practice in one.

Every visible change to the interface, down to a colour or a gap, needed a prototype the user had confirmed, and the prototype had to be kept in step with the app afterwards.

The document check at the end of a change ran in the main session, at the point where that session's context is largest.

## Solution

A feature has one document, its spec, and the spec states the user-visible behaviour too. A spec holds what rebuilding the product from the specs, the ADRs and `CONTEXT.md` would need, and nothing else. An ADR states a decision in force the way a spec states behaviour: a table decides which decisions get one, it holds only what each of its sections allows within a length cap, and it is edited in place once the user confirms the change. A boundary entry is written when the product's behaviour had to be decided there or when real use reaches the failure and getting it wrong is costly; test cases follow the acceptance criteria and that risk. A prototype is made when the interface question is open, and is not kept in step with the app once the app exists. The document check at the end of a change runs in a sub-agent on a smaller model.

## Functional Requirements

### project-documents::REQ-001 One document per feature

- project-documents::REQ-001/AC-01: No skill creates, updates, reads as a source of truth or requires `docs/features/`. A feature's user-visible behaviour is stated in its spec.
- project-documents::REQ-001/AC-02: Whatever took a feature's slug from `docs/features/` takes it from `docs/specs/`: the working-record directory, the prototype module directory, the file an e2e case goes in.
- project-documents::REQ-001/AC-03: The index of `docs/specs/` is a table of each spec and what the feature does in one line, so the directory is also the overview of what the product does.
- project-documents::REQ-001/AC-04: In a project that still has `docs/features/`, the closing document check reports it as one finding and states the migration: add to the same-name spec whatever the page says and the spec does not, repoint the references to it, delete the directory. Until the owner has that done, no skill maintains the directory or checks anything against it.

### project-documents::REQ-002 What a spec holds

- project-documents::REQ-002/AC-01: A spec holds the product's behaviour, including what it does not do; facts about external systems and their data; algorithms and accounting rules; persisted formats and how data written by another version is read; and the architectural constraints, by reference to the ADR or invariant that sets them. A rebuilt product must read the data existing users already have, so the last two are never left to the code alone.
- project-documents::REQ-002/AC-02: A spec does not hold the history of a rule, a description of how the current code is laid out, a reminder to whoever maintains the current code, the design of the tests, a measurement and how it was taken, or a second statement of a rule the same spec already states. A measurement stays only as the threshold of a quality requirement or as the stated reliability of an external fact. The problem a feature solves, stated in its Problem Statement, and the reason an Out of Scope entry is not done are not the history of a rule.
- project-documents::REQ-002/AC-03: The spec template has no section for testing decisions, and `/to-spec` has no step that settles test seams. The seam is chosen when the test is written.
- project-documents::REQ-002/AC-04: A fact about real data that comes to light while tests are designed is written into the spec as a statement about that data.
- project-documents::REQ-002/AC-05: When a change rewrites a section of an existing spec, content of the kinds in AC-02 found in that section is removed in the same change. A section the change does not rewrite is not edited just to remove such content; a statement in it that is no longer true is still corrected.
- project-documents::REQ-002/AC-06: Requirement identifiers and the rules for them are unchanged.

### project-documents::REQ-003 Boundary entries and test coverage

- project-documents::REQ-003/AC-01: A new entry under "Failure modes and boundaries" is written for a boundary where the product's behaviour had to be decided, or for a failure that real use reaches and whose mishandling is costly: lost data, a wrong figure nobody would notice, a security hole, a blocked main flow. The section is not filled by walking every user operation sequence.
- project-documents::REQ-003/AC-02: The question of what content brought into the app can do to the host (links, media, scripts, forms, drag and drop, oversized content) is still asked at every point that renders or loads such content, and an entry is written for each thing a user can trigger there.
- project-documents::REQ-003/AC-03: For a change that involves state or effects, the ways into and out of each state are still listed, and the entries of AC-01 are derived from them.
- project-documents::REQ-003/AC-04: The cases a change must have are one for each acceptance criterion it delivers, and one for each boundary entry it adds or changes that is costly in the sense of AC-01. Any other entry needs no case. A case that cannot be driven is a stated gap, as before. A core-tier change has more cases than these ([risk-tiers::REQ-005/AC-01](risk-tiers.md)).
- project-documents::REQ-003/AC-05: The test review checks coverage against the list of AC-04, not against the section entry by entry, except for the entries [risk-tiers::REQ-005/AC-01](risk-tiers.md) names for a core-tier change.
- project-documents::REQ-003/AC-06: Entries and cases that already exist stay. Nothing here asks for a case to be deleted.

### project-documents::REQ-004 The prototype gate

- project-documents::REQ-004/AC-01: A prototype confirmed by the user is required before an interface is specified or coded in two cases only: the change adds a surface the app does not have (a page, a pane, a drawer, a dialog or another overlay: a region with a layout of its own, not a control added to a surface the app has), or more than one arrangement of the interface is being weighed, which includes the user asking to see it first.
- project-documents::REQ-004/AC-02: Every other interface change is implemented directly and delivered with a screenshot of the running app for each interface point it changed. Where the app cannot be run to take one, the delivery says so and why.
- project-documents::REQ-004/AC-03: The app is the baseline of the interface. Existing prototypes stay in the repository as reference, and where a prototype and the app differ the app is right, with the one exception of boundary 7. No skill requires a prototype to be updated because the app changed, to be marked as out of date, or to be compared with the implementation.
- project-documents::REQ-004/AC-04: A prototype made for a surface the app already has starts from the app's current look.
- project-documents::REQ-004/AC-05: `/ui-design` applies to interface code and to a prototype when one is made, as before.

### project-documents::REQ-005 The closing document check runs in a sub-agent

Applies to the document check that ends a change, not to the full-feature closeout of a closeout ticket.

- project-documents::REQ-005/AC-01: Where the tool can send a sub-agent, the main agent hands the check to one that does not inherit the conversation and that loads the skill itself. Where it cannot, the main agent runs the check.
- project-documents::REQ-005/AC-02: Where the tool lets the sub-agent's model be chosen, it is the tier one below the main session's, of the latest generation: the tier's alias where the tool takes aliases, the latest model of that tier where it takes model names, never an older generation because it is cheaper. A main session already on the smallest tier uses that tier.
- project-documents::REQ-005/AC-03: Where the tool lets the sub-agent's reasoning effort be chosen, it is the level named `high`; where no level has that name, the first level above the tool's default.
- project-documents::REQ-005/AC-04: The main agent commits the change before it hands over. If the working tree then still holds changes that are not the change's, it does not hand over and tells the user. The handoff carries the checkout's absolute path, the fork point and that commit, the slugs of the specs the change touched, the directory of the change's working records, the ticket when there is one, the events of the change that no file records (a rule newly decided, the user's acceptance feedback, a change of work status), the commit range of the fix when the check is handed over again after one, and the instruction to load the skill and run the check. It carries no judgement of what is or is not consistent.
- project-documents::REQ-005/AC-05: The sub-agent may rewrite documents to make them true, a document being a Markdown file, in the checkout or in the change's working records, that no test reads. It does not change code, tests, data a test reads, interface dictionaries or package metadata, does not commit, and hands back a finding that needs any of these.
- project-documents::REQ-005/AC-06: The handback is the conclusion, the documents it changed, the number of statements it judged with the searches it ran to find them, and each finding it could not settle, stated in full. No report is written.
- project-documents::REQ-005/AC-07: On the handback the main agent first checks that the checkout is on the branch it handed over and that the commit of AC-04 is still in its history; if not, it changes nothing and tells the user. It undoes any commit the sub-agent made, keeping its changes in the working tree, then lists what changed in the working tree since the commit of AC-04. A changed path that is not a document is restored from that commit and reported to the user. The main agent then reads the findings in the handback, commits the document changes that remain, and only then acts on a finding. A handback without the number and the searches sends the check out once more; if that fails too, the main agent stops and tells the user.
- project-documents::REQ-005/AC-08: The main agent reads only the rules for handing over and for checking the handback. The rules of the check itself are in a file the sub-agent reads.
- project-documents::REQ-005/AC-09: Before the main agent commits the document changes a sub-agent left, it reads the sub-agent's changes to the documents in the checkout and judges each added, rewritten or deleted statement against what the change did and decided, reading the code or document the statement is about where that does not settle it. A statement left untrue is corrected, a deleted one that still holds is restored, and the user is told which. It judges only those statements and does not run the check again. This does not apply when the main agent ran the check itself.

### project-documents::REQ-007 Which decisions get an ADR (direct acceptance)

A decision gets an ADR when it is hard to reverse, baffling without context and the product of a real trade-off, and the table below sends it to an ADR; whatever the table sends elsewhere goes there instead.

| What is decided | Where it goes |
|---|---|
| A project's architectural decision, or the trade-off behind its product behaviour or an accounting rule | An ADR |
| A project's choice on a process question: which practice it adopts, and why | An ADR, stating this project's choice and not the practice's own rules |
| A process rule that holds across projects | The skill that governs that work |
| A constraint on whoever changes the code | An invariant in the project's `AGENTS.md`; the trade-off behind it, when it meets the thresholds, also gets an ADR as in the first row |
| Product behaviour or an accounting rule, as stated | The feature's spec, which cites the ADR of the choice behind it when that choice gets one |
| An incident | A postmortem |
| How the code carries out a decision | A comment in that code |

### project-documents::REQ-008 What an ADR holds

- project-documents::REQ-008/AC-01: An ADR has five sections, and each holds only this: Context, the problem and the forces on it; Options, one item per option, chosen, rejected or deferred, with why, and for a deferred one the condition that reopens it; Decision, the rule in force in the active voice; Consequences, the positive, negative and neutral consequences that still hold; Sources, pointers to the evidence and the key figures the decision rests on, each with the premise it holds under.
- project-documents::REQ-008/AC-02: No section holds how the rule came about, a verification or rollout log, a record of the evidence closing, a one-off cost already paid, how the code carries out the decision, interface detail, how a measurement was taken, line numbers, a site-by-site list, a restatement of another ADR, a spec or a skill, or an option about how to record the decision.
- project-documents::REQ-008/AC-03: Context is at most three sentences, and each option and each consequence is its own item of at most two sentences. The entry without its title and status line is at most 1,800 characters in a project whose working language is `zh`, and at most 5,000 in a project with any other working language. An entry over the cap first loses what AC-02 excludes, under REQ-009/AC-06, and is split by decision if it is still over.
- project-documents::REQ-008/AC-04: Whoever writes or edits an ADR checks it against AC-01 to AC-03, and checks that the declaration at the head of the project's `docs/adr/README.md` states these rules and that its index matches the entries. The closing document check makes the same checks again for each ADR the change added or whose own statements it edited (REQ-010/AC-01), and for each ADR it deleted checks that its number was retired under REQ-009/AC-05.

### project-documents::REQ-009 How an ADR changes

- project-documents::REQ-009/AC-01: An entry states the decision in force. A change to an accepted decision edits that entry in place, and an approach given up becomes one of its rejected options, with why it was given up. The states are Proposed and Accepted; there is no superseded state, and the history of an entry is in git.
- project-documents::REQ-009/AC-02: A change to what an entry chose, rejected or accepted as a consequence is confirmed by the user before it is written. A rewrite that keeps the decision, such as compressing an entry, merging entries or correcting a stale fact, is not confirmed in advance, and each one is listed in the delivery note for the review before the pull request merges, or reported to the user when the change has no delivery note.
- project-documents::REQ-009/AC-03: An accepted entry's status line carries the date the decision in force was confirmed. A change of decision updates it; a rewrite that keeps the decision leaves it.
- project-documents::REQ-009/AC-04: A new decision edits every existing entry in which it makes a sentence of the Decision section untrue or needs a sentence added there, and opens a new entry when there is none. An edit that takes an entry over the cap of REQ-008/AC-03 splits it by decision.
- project-documents::REQ-009/AC-05: An entry merged into another, or whose decision is withdrawn, has its file deleted. The same change points every citation of its number in the repository at the entry it went into, or removes the citation when the decision was withdrawn, and the ADR index keeps a line naming each retired number and where it went. A number is never used again.
- project-documents::REQ-009/AC-06: Before content of a kind REQ-008/AC-02 excludes leaves an entry, it is found in its current home, or added there first: interface behaviour in the spec, how the code carries out the decision in a comment in that code, a constraint in an `AGENTS.md` invariant. Content with no current home, such as how the rule came about, is deleted.

### project-documents::REQ-010 ADRs written under the earlier rules

- project-documents::REQ-010/AC-01: When a change edits an entry's own statements (its decision, its options, its consequences or a fact it states), the whole entry is brought under REQ-008 and REQ-009 in the same change: the entries its status line or notes mark as superseding, extending or amending it, or as superseded, extended or amended by it, are merged into it under REQ-009/AC-05; what REQ-008/AC-02 excludes leaves it under REQ-009/AC-06; and its length comes within the cap. Pointing a citation at another number is not such an edit. An entry no change edits stays as it is.
- project-documents::REQ-010/AC-02: These rules apply in every project at once. The first change that writes or edits an ADR in a project rewrites the declaration at the head of its `docs/adr/README.md` to these rules.

### project-documents::REQ-006 This repository follows its own rules (direct acceptance)

The two specs this repository already has lose their testing-decisions sections and the content of REQ-002/AC-02's kinds, under REQ-002/AC-04 for any fact about real runs worth keeping. The repository's README describes the document check without a feature catalogue, and the specs index lists this spec.

## Failure modes and boundaries

1. **The tool cannot choose a sub-agent's model or effort.** The sub-agent runs on what the tool gives it; the check is still handed over (REQ-005/AC-02, AC-03).
2. **The sub-agent changed code.** Its change is restored from the commit made before the handover, so nothing the main agent wrote is lost with it, and the user is told (REQ-005/AC-04, AC-07).
3. **The check finds that the implementation, not a document, is wrong.** It is a finding handed back; the main agent fixes the code through the implementation steps and hands the check over again for what the fix touched (REQ-005/AC-05).
4. **An existing spec has a testing-decisions section and the change does not rewrite it.** It stays. `/tdd` no longer reads it for seams (REQ-002/AC-03, AC-05).
5. **A prototype exists for a surface and the change alters that surface without adding one.** The change is implemented directly; the prototype is neither updated nor marked (REQ-004/AC-02, AC-03).
6. **A change adds a new state to an existing surface (an empty state, a notice, a degraded form).** It adds no surface, so it needs no prototype unless more than one form is being weighed (REQ-004/AC-01).
7. **A change inside the gate is being implemented.** Until the change is delivered, its in-gate interface points are built to the prototype the user confirmed, and a difference from it is a defect of the implementation. Once it is delivered, the app is the baseline for them as for any other (REQ-004/AC-01, AC-03).
8. **The spec was rewritten before the code, as the flow asks.** Whether the change alters user-visible behaviour, and so whether the closing check runs, is judged against the specs at the branch's fork point, not against the specs the branch has already rewritten (REQ-001/AC-01).
9. **Something happened in the conversation and no file records it** (a rule newly decided, acceptance feedback). The sub-agent cannot see the conversation, so the handoff states the event; it states what happened, not what is or is not consistent (REQ-005/AC-04).
10. **Retiring an entry changes a citation inside another entry.** The citing entry is not rewritten for that; it comes under the new rules when a change edits its own statements (REQ-010/AC-01).
11. **A project's ADR index still declares append-only.** The new rules apply there all the same, and the first change to an ADR in that project rewrites the declaration (REQ-010/AC-02).
12. **The closing check finds a touched ADR outside the rules, and the fix needs code changed**, such as a citation of a retired number in a source comment. The check rewrites what is document-only and hands back the rest as a finding (REQ-005/AC-05, REQ-008/AC-04, REQ-009/AC-05).
13. **The entries of one rule, merged, exceed the cap.** The result is split by decision rather than kept over the cap (REQ-008/AC-03, REQ-009/AC-04).
14. **Something an entry excludes is stated nowhere else**, such as an interface behaviour only an ADR describes. It is added to its home before it leaves the entry, so a rewrite loses nothing still true (REQ-009/AC-06).
15. **A rewrite meant to keep the decision changes it**, by dropping a rejected option or a negative consequence that still holds; removing content REQ-008/AC-02 excludes is not such a drop. That is a change of decision and is confirmed by the user before it is written; the delivery note's list of rewrites is where a reviewer catches one that was not (REQ-009/AC-02).

## Implementation Decisions

- The `features-catalog` skill keeps its name and keeps the closing document check; its selector describes the check only. Renaming it is left to the redesign of the flow.
- In that skill, the rules for handing over and for checking the handback open `SKILL.md`, and the three-stage regression moves to a reference file the sub-agent reads in full. The three ways a statement goes untrue stay the sub-agent's method for finding what to judge; it writes none of it down. The full-feature closeout stays where a closeout ticket's own session reads it.
- The wording for the model tier follows the rule already used for handing the CI wait to a sub-agent, and the wording for effort follows the rule `/research` already used for its gatherer, so the three rules read alike.
- The fixed names that existed only for catalogue pages leave the artifact-name tables; "In one line" moves to `/to-spec`'s table with the specs index template. `scripts/check-artifact-names.mjs` is adjusted to match.
- The rules for ADRs stay in domain-modeling's `ADR-FORMAT.md`, the one place the other skills point to, which also says what the index declaration states. The table of REQ-007 takes the place of its collection boundary; the capability registry's wording that a project's adoption of a practice is recorded in a document such as an ADR stands.
- `/prototype` keeps its rule that persistent documents hold conclusions rather than prototype paths, with a reason that no longer appeals to append-only documents. In ADR-FORMAT's artifact-name table the fixed name of the superseded state gives way to "Retired numbers" and "Withdrawn", and `scripts/check-artifact-names.mjs` checks the table against ADR-FORMAT.
- Every step that edits an ADR points to ADR-FORMAT: `/implement`'s light-path document check, the closeout's claim check, and the closing check's executor, whose rules in the features-catalog reference file also hold the second look of REQ-008/AC-04 and hand back as a finding any rewrite that would change a decision. The main agent lists the executor's ADR rewrites when it checks the handback.
- The owner's global instructions name the catalogue, the exhaustive section and the prototype rule in their outline of the flow. That file is outside this repository and is changed by the owner's session when this change merges.

## Out of Scope

- Handing a closeout ticket's full-feature closeout to a sub-agent.
- Migrating another project's `docs/features/`, trimming its specs beyond REQ-002/AC-05, or rewriting its ADRs beyond REQ-010; a project's owner asks for that as a change of its own.
- A script that measures an ADR's length or sections. The length is checked with the content, which has to be read anyway (REQ-008/AC-04).
- A project's own ADRs and gate scripts about prototypes. A project that has decided its prototypes are the baseline keeps that decision until it reverses it.
- Renaming the `features-catalog` skill.
