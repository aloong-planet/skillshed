# Final regression — post-implementation check handoff and handback

2026-10-25, against `dfd2738` plus the uncommitted change listed in [tasks.md](tasks.md); re-checked 2026-10-26 for the spec's restated Out of Scope entry (read budget). No ticket; spec [post-implementation-check](../../specs/post-implementation-check.md). The skills repository keeps no `docs/features/` and no `CONTEXT.md`; the declaration surfaces are the skill files, the spec, the fixed-name tables and the research note that proposed the change.

Languages in the searched files: Chinese and English (the skill files are Chinese, the spec and records English); each search below was run in both.

## Stage 1: changed declarations

| Pair | Statement | Verdict |
|---|---|---|
| spec ↔ `review-tests/SKILL.md` | REQ-001: one numbered Findings subsection per time point, identifiers unique in the record, an empty round states none | True: the new paragraph after the per-dimension output rule says exactly this, for every time point |
| spec ↔ `review-tests/SKILL.md` | US-001/AC-01, AC-02: what the handback holds and excludes, first and incremental checks | True: the 「交回」 item under the post-implementation check, under the step-6 condition that also covers incremental checks |
| spec ↔ `implement/post-implementation-check.md` | US-001/AC-03, AC-04: read the Findings subsection in full before handling; the record governs on a mismatch, recorded as an untrue record | True: the sentence after the end-signal rule |
| spec ↔ `implement/post-implementation-check.md` | REQ-002: the hand-back, not the record, ends the check | True: the end-signal rule, now "the final hand-back" |
| spec ↔ `artifact-names/review-tests.md` | 「发现」 registered, English Findings | True; `check-artifact-names.mjs` exit 0 ([gate log](evidence/gate-dfd2738.txt)) |
| spec ↔ handoff clause | CON-001: the handoff is unchanged | True: the "交给它的只有" sentence is untouched (diff) |
| spec Implementation Decisions ↔ the files | where each rule lives | True after the correction made before implementing (the handback rule moved from the handoff file to `/review-tests`) |
| `review-tests/SKILL.md` ↔ its own output rules | the new paragraph sits after the per-dimension rule, which keeps its last sentence | True: the first edit had split that paragraph; fixed (tasks.md row 1) |
| spec Out of Scope ↔ the measurement behind it (2026-10-26) | read budget: the first-check reason; in incremental checks 1.1 calls and about 0.7k estimated tokens per check outside the fix range and its supporting material, a median 1.4% of cumulative input | True: the figures match `~/research/skill-context-efficiency/data-2026-10-26/incremental-reads/final.txt` (21 checks; median saving 130,628 of a median 9,701,641) |

## Stage 2: related declarations

| Relation | Statement elsewhere | Verdict |
|---|---|---|
| A fact ↔ its other statements | `implement/SKILL.md` step 6 and `post-implementation-check.md` lines 3, 9, 23: "处置交回的发现" | Still true: the handback points at the findings |
| A fact ↔ its other statements | `rg -n -i "final report|最终报告" --glob '!docs/.workings/**' --glob '!docs/specs/task-graph-query.md' .` over the whole repository | No match (exit 1): no other use |
| A fact ↔ its other statements | The research note's proposal of a review package (`~/research/skill-context-efficiency/superpowers-token-planning.md`, §5.3 item 1) | Was stale; a follow-up line now records the measured reversal and points at the spec |
| A fact ↔ its other statements | The same note's read-budget proposal: §5.3 item 1 and the end of §3.5 ("能借用的是三样") | Both were stale for the read budget: §5.3 item 1 now has a 2026-10-26 follow-up with the measurement, §3.5 points to it |
| Rule ↔ the gate that guards it | `check-artifact-names.mjs` guards the fixed name's registration and its defining file | Covered; it does not check record content, which no gate reads (the rule is kept by people and the rehearsal) |
| Rule ↔ templates and generated documents | `/review-tests` has no record template; the record skeletons are written from its rules | No template to update |
| File ↔ its index row | `docs/specs/README.md` | The committed README indexes this spec (staged on its own; the untracked draft README in the work tree belongs to the task-graph draft and is left alone) |

## Stage 3: events

| Event | Check | Verdict |
|---|---|---|
| Enumerable dimension's members changed | None: no list of members changed | Empty |
| `Pending:` notes in scope | `rg -n "Pending:"` on the spec and the three changed files | No match (exit 1): empty |
| New general rule | The Findings subsection and the handback content: canonical home is `/review-tests` (writing layer), the main agent's side `implement/post-implementation-check.md` | Placed |
| Rehearsal result | tasks.md row 5: 2/2 pass for US-001/AC-01, AC-02 and REQ-001 | Recorded; the main agent's handling (AC-03, AC-04) was not driven by a rehearsal and rests on the clause text (stage 1) |

## Closeout conclusion

Every table above is resolved: the spec and the skill text agree unit by unit, the stale statements elsewhere (the research note's review package and read budget) are corrected, and no event is left open. Not verified in behaviour: US-001/AC-03 and AC-04 (the main agent's side). The six undeclared capabilities are declared `enabled = false` by the owner's decision, in a separate commit.
