# Ticket 18 — task list

Ticket: zhoulf1006/skillshed#18 ("electron-scaffold: produce and gate a ZIP alongside the DMG"); the `ticket-18-`
prefix of this directory's files stands for that issue. Branch `feat/mac-packaging-zip`, cut from origin/master at
316b61f. A construction record, not an authority: the requirements are the issue, its comment and the owner's
answers listed below; the current statement of the asset is `electron-scaffold/macos-signing.md` and the asset's
header.

## Requirement sources

- The issue body and its one comment (two findings from aloong-planet/agentshed#244).
- aloong-planet/agentshed `docs/specs/mac-distribution.md` (mac-distribution::REQ-001/AC-02, mac-distribution::CON-002,
  Failures A3, B3, B4) and `docs/adr/0032-app-updates.md`; Checked commit: 690ad2d (main), where the spec was last
  changed in b0185b1 and the ADR in 5911d52.
- The owner's instructions in the session of 2026-10-19: fix the two findings; rewrite `macos-signing.md` §4's
  certificate export (export only the Developer ID Application identity, from Keychain Access; no clipboard); the
  real-run evidence comes from agentshed #235's manual verification run; work in a worktree; stop after opening the
  PR.
- The owner's answers in the same session: #18 stays open and the PR refers to it without closing it; the records go
  in `docs/.workings/mac-packaging-zip/`; `lint` and `e2e-suite` are treated as not enabled this round, and a separate
  issue completes `capabilities.toml`; the gate checks the update metadata's content and hashes (not only its
  presence); with the ZIP opted in, `dmg.writeUpdateInfo: false` is required.

## Tasks

| # | Task | Verification checkpoint | State |
|---|---|---|---|
| 1 | Worktree and branch from the latest origin/master | `git log origin/master..HEAD` empty after cutting | Done (316b61f) |
| 2 | Baseline: the 51 asset tests and the three lint findings reproduced in a scratch project (electron-builder 26.17.0, the agentshed lint configuration without its exclusion) | 51 pass; exactly the three findings | Done |
| 3 | Facts from electron-builder 26.17.0's source and a real unsigned build: ZIP naming, ZIP layout, update metadata name and content | Recorded in the test review's fixture sources | Done |
| 4 | Test design review (`/review-tests`), before the first test is written | Design review section in `ticket-18-review-tests.md` | Done |
| 5 | Slices, red before green (`/tdd`): `dmg.sign`; lint findings; ZIP opt-in configuration; the ZIP's app check in packaging; pre-build clearing; the artifact-set gate with the update metadata | Each slice's test red for the intended reason, then green | Done (86 tests; reds and mutations in `ticket-18-review-tests.md`) |
| 6 | `macos-signing.md`: §3 and §7 for the ZIP (with §6, §9 and §10 where they state the gate, its tests and the release steps), §4 certificate export, preamble | `node scripts/check-artifact-names.mjs` exit 0; `/skill-policy` self-check converged | Done (check-artifact-names exit 0, shown able to fail; self-check converged) |
| 7 | Verification gateway | Asset tests green in the scratch project; the lint replica reports nothing on both files; check-artifact-names exit 0 | Done |
| 8 | Code review (`/review-code`), its own task | `ticket-18-review-code.md` | Done (one bug found and fixed, R1) |
| 9 | Test review, post-implementation check (`/review-tests`), its own task | Post-implementation section in `ticket-18-review-tests.md` | Done |
| 10 | Ticket acceptance check, archiving, document sync | `ticket-18-doc-sync.md` has no Pending item | Done (two Waiting items, on agentshed #235) |
| 11 | Delivery: push, PR referring to #18, the issue's artifact section, the comment on agentshed #235, the capabilities issue | PR open; stop for the owner's confirmation | Done: #19 created; #235 commented; #18 section added; PR #20 opened and stopped there. The refactor item was declined as recommended |
