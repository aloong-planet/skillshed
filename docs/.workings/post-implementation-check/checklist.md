# Post-implementation check — Coverage and acceptance checklist

Spec: [post-implementation-check](../../specs/post-implementation-check.md)
Source commit: none yet — the spec is uncommitted; checked against the draft of 2026-10-25, and on 2026-10-26 against the draft whose Out of Scope restates the read-budget entry with a measurement
Scope: first build of this spec: every unit it defines (US-001/AC-01–AC-04, REQ-001, REQ-002, CON-001, CON-002) and its failure modes and boundaries.

## Source → spec

| Source anchor and supporting text | Source disposition | Spec coverage unit | Semantic check |
|---|---|---|---|
| Owner's answer, 2026-10-25, "输入侧怎么改": "不改" (after the measurement that a full `-U10` package has a median of 56k against 8.4k read today) | Confirmed and in force | post-implementation-check::CON-001; Out of Scope (review package) | Kept whole: nothing is added to the handoff, and the package is recorded as out of scope with its measured reason |
| Owner's answer, 2026-10-25, "交回格式": "结论+路径+编号与标题", for first and incremental checks; full content only in the record; the main agent reads the record's findings in full before handling | Confirmed and in force | post-implementation-check::US-001/AC-01, AC-02, AC-03 | Kept: both rounds are covered (AC-01 names first and incremental), the excluded content is listed (AC-02), and the reading obligation precedes handling (AC-03) |
| Same answer: "只剩一个来源" (one source) | Confirmed and in force | post-implementation-check::US-001/AC-04 | Derived from the one-source answer, then confirmed by the owner, 2026-10-25 ("以记录为准并记为发现"): the record governs and the mismatch is recorded as an untrue record |
| Owner's answer, 2026-10-25, "发现小节": "规定", one numbered Findings subsection per time point, the name registered (English: Findings) | Confirmed and in force | post-implementation-check::REQ-001 | Kept: every time point, identifiers unique within the record, empty rounds still state none |
| `implement/post-implementation-check.md`, the end-signal rule: the check ends on the reviewer's final report, not on the record being written | Confirmed and in force | post-implementation-check::REQ-002 | Existing behaviour kept as a regression condition for the shorter handback |
| Fact check, 2026-10-25: the hand-back is a call in Claude Code and the subagent's last message in Codex | Background | post-implementation-check::CON-002 | Recorded as a wording constraint, not a product choice |
| Owner's answer, 2026-10-25, "验证": two rehearsal runs of the new version; the 64 recorded reviews stand in for the control | Confirmed and in force | Testing Decisions | Kept as the verification plan; not a requirement unit |
| Measurement run at the owner's request, 2026-10-26 ("现在分"): over 21 recorded incremental checks, reads tied to none of the fix range, its supporting material, scope finding or rule-mandated reads average 1.1 calls and about 0.7k estimated tokens, a median 1.4% of cumulative input; then the owner's "继续" after the proposal to restate the entry with it | Confirmed and in force | Out of Scope (read budget) | Kept: the first-check reason stays; the incremental reason is the measured share; no requirement unit |

## Spec → tickets → verification

| Spec coverage unit and link | Source text and conditions | Owning ticket and role | Planned verification and boundary |
|---|---|---|---|
| post-implementation-check::US-001/AC-01, AC-02 | the handback's content, first and incremental checks | none: implemented directly from the spec | Evidence: rehearsal of an incremental check on a recorded fix range; the handback's text read in full |
| post-implementation-check::US-001/AC-03, AC-04 | the main agent reads the Findings subsection; the record governs | none | Evidence: the clause in `implement/post-implementation-check.md`; behaviour only in a real step 6 |
| post-implementation-check::REQ-001 | numbered Findings subsection per time point | none | Evidence: the rehearsal's record; Gate: `check-artifact-names.mjs` for the name |
| post-implementation-check::REQ-002, CON-001, CON-002 | end signal, unchanged handoff, tool-independent wording | none | Evidence: the diff of the clauses |

## Current verification

| Check date, spec and implementation commits | Coverage unit, ticket and path | Actual result and evidence | Current conclusion |
|---|---|---|---|
| 2026-10-25, on dfd2738 with the change uncommitted | US-001/AC-01, AC-02 | 2/2 rehearsal handbacks hold only the conclusion, the record path and F10–F13 with titles (193 and 220 estimated tokens); [tasks.md](tasks.md) row 5 | Passed |
| 2026-10-25, same | US-001/AC-03, AC-04 | The clause is in place ([final-regression.md](final-regression.md), stage 1); no run has driven the main agent's handling | Unverified |
| 2026-10-25, same | REQ-001 | Both rehearsal records carry `### Findings` with F10–F13, unique in the record; `check-artifact-names.mjs` exit 0 ([gate log](evidence/gate-dfd2738.txt)) | Passed |
| 2026-10-25, same | REQ-002, CON-001, CON-002 | Diff: end signal kept as "the final hand-back", handoff sentence untouched, the handback clause names content, not a tool | Passed |

## Two-way audit

| Scope or finding | Sources and identifiers | Disposition and basis |
|---|---|---|
