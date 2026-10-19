# Ticket 18 — Document sync checklist

Ticket: zhoulf1006/skillshed#18 (`ticket-18`). Feature: the ZIP of aloong-planet/agentshed's macOS release line,
whose coverage checklist (`docs/.workings/macos-release-line/checklist.md` in agentshed) maps this ticket to
mac-distribution::CON-002 ("zhoulf1006/skillshed#18: the asset").

| Sync item and trigger | Documents | Status and notes |
|---|---|---|
| The asset and the policy describe the ZIP (opt-in, checks, release steps), the `dmg.sign` requirement and the certificate export; with this change | `electron-scaffold/assets/mac-packaging.cjs` (header), `electron-scaffold/macos-signing.md` (preamble, §2, §3, §4, §6, §7, §9, §10) | Done: the change on branch `feat/mac-packaging-zip`, checked against the code and the measured facts in [ticket-18-review-code.md](ticket-18-review-code.md); `node scripts/check-artifact-names.mjs` exit 0; the `/skill-policy` self-check converged (both stages, no finding in the last round) |
| #18 declares this ticket's artifacts and process acceptance; before delivery | zhoulf1006/skillshed#18 (body) | Done: section "Ticket artifacts and process acceptance" added on 2026-10-19 |
| agentshed #235 is told which evidence it owes #18 and what adopting the asset makes outdated; before delivery | aloong-planet/agentshed#235 | Done: [comment of 2026-10-19](https://github.com/aloong-planet/agentshed/issues/235#issuecomment-6259217130) |
| #18's deferred acceptance (acceptance criterion 2's real-run evidence: the ZIP's sha512 and size equal its entry in the update metadata) is recorded where it lands; at agentshed #235's manual verification run | agentshed `docs/.workings/macos-release-line/evidence/ticket-235/` and that checklist's Current verification row "Every unit mapped to #235 and zhoulf1006/skillshed#18"; zhoulf1006/skillshed#18 | Waiting: the trigger is #235's manual verification run with the adopted asset. #235's implementer follows it up, and the owner triggers the run. The method and the file to read (`latest-mac.yml` under the GitHub provider) are in the comment above. Then the evidence is linked back on #18, which closes then |
| The agentshed statements that adopting the asset makes outdated are rewritten; at #235's adoption | agentshed `docs/specs/mac-distribution.md` (CON-002's Pending note; the Implementation Decisions on `dmg.sign` and on the copies' lint exclusion), the comment in `electron-builder.yml`, the exclusion in `eslint.config.js` | Waiting: the trigger is #235's adoption, followed up by #235's implementer (listed in the comment above). These are agentshed's documents, outside this change |

## Pre-delivery scope re-check (2026-10-19)

Scope in skillshed: every skill directory, searched repository-wide for the statements this change could make untrue
(`security export`, `pbcopy`, `.p12`, `selectDmgArtifacts`, `notarize-dmg`, `latest-mac`, `-mac.yml`, `blockmap`,
`electron-updater`, `ZIP`, `.zip`, `writeUpdateInfo`, `dmg.sign`, `artifactName`, `产物全集`, `*.dmg`); the root
(`capabilities.toml`, `.gitignore`, `scripts/`); this directory; every file electron-scaffold governs; and the files
that cite `macos-signing.md` (`repo-scaffold/capabilities-registry.md`, `github-ops/SKILL.md`,
`github-ops/release-note-template.md`, `review-code/false-greens.md`). Scope in agentshed, read at 690ad2d: the
mac-distribution spec, ADR-0032, the coverage checklist, #235, `electron-builder.yml`, `eslint.config.js` and
`scripts/lib/release-artifact.mjs`. Excluded: the shared clone's uncommitted and untracked files, which belong to
other work and are not on this branch.

Found: `electron-scaffold/SKILL.md` §1 and `assets/clean-old-releases.cjs` name `latest-mac.yml` and blockmaps as
files the release cleanup leaves alone, which is still true. The release-note template lists DMGs only, which agrees
with §10's rule that the ZIP is not listed. skillshed has no ADR, no `CONTEXT.md` and no features catalogue. This
ticket's decisions (the metadata's hash check, `dmg.writeUpdateInfo: false`) are stated in the asset's header and
`macos-signing.md`, which are this repository's current statement of them. No difference is left open; the two
Waiting items are agentshed's and are tracked on #235.
