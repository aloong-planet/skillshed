# Post-implementation check: handoff and handback — task list

Spec: [post-implementation-check](../../specs/post-implementation-check.md) · Coverage and acceptance checklist: [checklist.md](checklist.md) · Code review: [review-code.md](review-code.md)

Implemented directly from the spec, no ticket. The skills repository commits to `main` (its established practice; a branch cut from the local `main` would carry its five unpushed commits).

| # | Task | Check | Status and notes |
|---|---|---|---|
| 1 | `/review-tests`: a numbered Findings subsection per time point (REQ-001); the handback clause under the post-implementation check (US-001/AC-01, AC-02); 「发现」 in the fixed-name sentence | `node scripts/check-artifact-names.mjs` exit 0; `/skill-policy` self-check converged | Done. The first edit split an existing paragraph (its last sentence moved under the new rule); caught in the diff review and fixed. |
| 2 | `implement/post-implementation-check.md`: read the Findings subsection in full before handling, the record governs on a mismatch (US-001/AC-03, AC-04); "the final report" becomes "the final hand-back" in the end-signal rule (REQ-002) | `/skill-policy` self-check converged | Done. A restatement of the handback's content was replaced with a pointer to `/review-tests` (stage 2 of the self-check). |
| 3 | Register 「发现」 → Findings in `repo-scaffold/artifact-names/review-tests.md` | `node scripts/check-artifact-names.mjs` exit 0 | Done |
| 4 | TDD | — | Skipped: the change is skill text with no executable part; no test can drive it. The test design review (step 4.4) is skipped with it, and step 6 has no written tests to check. |
| 5 | Rehearsal (Testing Decisions): two fresh headless reviewer sessions on agentshed #227's incremental check (fix range 0e6d642..76b23b6), at commit 76b23b6 | Handback holds only what US-001/AC-01 lists; the record carries a numbered Findings subsection | Done, 2/2 pass: each handback is 8 lines, about 200 estimated tokens (193 and 220; the 64 recorded handbacks have a median of 1,912) — the conclusion, the record path with the section, and F10–F13 with one-line titles; each run changed only the record, whose incremental section has `### Findings` with F10–F13 continuing the first round's F1–F9. Not driven: the main agent's handling (US-001/AC-03, AC-04). Raw runs: `~/research/skill-context-efficiency/data-2026-10-25/rehearsal-handback/` |
| 6 | `/review-code` (step 5) | [review-code.md](review-code.md) | Done |
| 7 | Full verification gate | [gate log](evidence/gate-dfd2738.txt) | Done: `check-artifact-names` and the link check exit 0. `lint` and `e2e-suite` were undeclared; the owner chose to declare the six missing capabilities `enabled = false` (separate commit), so both are skipped by the declaration |
| 8 | Spec check, archive, step 8 cross-regression | [final-regression.md](final-regression.md) | Done: every spec unit is implemented as written; no deviation to write back; no ADR (workflow conventions stay in skills) and no CONTEXT.md in this repository. 2026-10-26: the spec's Out of Scope read-budget entry restated with a measurement of 21 recorded incremental checks, and re-checked in the final regression |
