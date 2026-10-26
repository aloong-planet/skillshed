# Code review — post-implementation check handoff and handback

2026-10-25. Scope: the uncommitted changes to `review-tests/SKILL.md`, `implement/post-implementation-check.md` and `repo-scaffold/artifact-names/review-tests.md`, against `dfd2738`. No ticket; spec [post-implementation-check](../../specs/post-implementation-check.md).

## Underlying premises

- The reviewer loads `/review-tests` and not `/implement`'s reference files: confirmed, `implement/post-implementation-check.md` has the subagent load `/review-tests` itself and gives it only paths. This is why the handback clause sits in `/review-tests`, not in the handoff file.
- Records already keep a Findings subsection with numbered entries: confirmed in agentshed's `ticket-227-review-tests.md` ("### Findings") and rag-starter's `ticket-03-review-tests.md` ("### Findings and their handling", F1–F17). The new rule makes a practice mandatory and fixes its name; it invents no new structure.
- The handback today repeats the record: confirmed by rule (`/review-tests`, "记录归属": each dimension's conclusions and findings go into the record) and measured (64 recorded handbacks, median 1,912, maximum 2,824 estimated tokens).
- Conclusion: no finding.

## Runnability

- Paths through the clauses: first check, incremental check (both under "按 `/implement` 第 6 步的交接执行时"), `/review-tests` activated alone (the handback clause does not apply; the Findings subsection does), no subagent available (the main agent runs the check; no handback; the Findings subsection still applies), design review (main agent; Findings subsection applies). Each path has exactly one applicable set of rules.
- End signal: "the final hand-back" replaces "the final report"; a handback that lists only identifiers is still a hand-back, so REQ-002 holds. The record being written still does not end the check.
- Mismatch path: the record governs and the mismatch becomes an untrue record before handling, so the main agent never acts on a title alone.
- Conclusion: no finding.

## Security

Not applicable: the change is instruction text; it adds no input, path, permission or secret handling. Conclusion: no finding.

## Consistency

- Every other use of 交回 (`implement/SKILL.md` step 6, `post-implementation-check.md` lines 3, 9 and 23) speaks of "handling the findings handed back", which still holds: the handback points at the findings, the record holds them. No other file uses "最终报告".
- The new name 「发现」 is registered (English: Findings) and covered by `/review-tests`' fixed-name sentence; `node scripts/check-artifact-names.mjs` exits 0.
- The handback clause follows the run-evidence clause's form and condition in the same list.
- Baseline smells: none apply to instruction text.
- Conclusion: no finding.

## Refactoring list

Empty.
