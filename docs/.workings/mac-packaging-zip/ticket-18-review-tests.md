# Ticket 18 — Test review

Ticket: zhoulf1006/skillshed#18 (`ticket-18`). Files under review: `electron-scaffold/assets/mac-packaging.test.cjs`
against `electron-scaffold/assets/mac-packaging.cjs`.

## Design review

Date: 2026-10-19. Implementation version: 316b61f (origin/master, where this ticket's implementation starts).
Scope: every test this ticket adds or changes. The 51 existing cases are re-run unchanged, except the two whose
construction the lint finding changes (C5) and the configuration constant, which gains `dmg.sign: true`.

### Facts the fixtures are shaped after

- A real unsigned build with electron-builder 26.17.0 (product `Demo`, version `1.2.1-beta`, arm64, dmg and zip
  targets, a GitHub publish provider), run in the scratch project on 2026-10-19:
  - the version directory held `Demo-1.2.1-beta-mac-arm64.dmg`, `.dmg.blockmap`, `Demo-1.2.1-beta-mac-arm64.zip`,
    `.zip.blockmap`, `latest-mac.yml`, `builder-debug.yml` and `mac-arm64/`;
  - the ZIP's only top-level entry was `Demo.app` (`zipinfo -1`), and its name came from
    `mac.artifactName: ${productName}-${version}-mac-${arch}.${ext}`;
  - `latest-mac.yml` (GitHub provider, pre-release version: still `latest`) held `version`, `files` (`url`, `sha512`,
    `size`) with the ZIP first and the DMG second, then `path`, `sha512` and `releaseDate`; each `sha512` equalled
    `openssl dgst -sha512 -binary <file> | base64`;
  - with `dmg.writeUpdateInfo: false` the DMG entry and the `.dmg.blockmap` were gone, the ZIP entry unchanged.
- app-builder-lib 26.17.0 source: the root configuration accepts no `zip` key (`additionalProperties: false`, no
  `zip` property), so a ZIP's name comes only from `mac.artifactName`; the default ZIP pattern drops the arch for the
  default architecture (`ArchiveTarget.js`); with `extraDistFiles` the ZIP holds the app's directory contents, so
  extra files sit beside the app (`ArchiveTarget.js`); the DMG's hash and blockmap are taken after it is signed and
  before anything else touches it (`dmg-builder` `dmg.js`), so the gate's later staple invalidates them.
- Fixture hashes are literals computed with `openssl dgst -sha512 -binary | base64` over the fixture contents
  (`zip for <arch>`), not recomputed in the test with the implementation's algorithm.

### Test design table

| # | Test (planned) | Covers | Seam | Input that drives the target branch | Assertion object; source of the expected value | Fixture shape source | Expensive resources |
|---|---|---|---|---|---|---|---|
| C1 | `dmg.sign: true` is required | #18 comment, finding 1; mac-distribution Implementation Decisions ("signs the DMG (`dmg.sign`), which the asset's gate requires though its header does not list it") | `resolveLayout` | The configuration without `dmg.sign`, and with `dmg.sign: false` | The thrown message, which names the setting and what was found; the comment's requirement | The existing `CONFIG` (shaped after a project's `electron-builder.yml`) | None |
| C2 | A `zip` target opts the ZIP in; without it the layout says no ZIP | #18 "a project that does not want the ZIP keeps the DMG-only behaviour" | `resolveLayout` | `ZIP_CONFIG` (dmg and zip targets with the same arches, `mac.artifactName`, `dmg.writeUpdateInfo: false`) and `CONFIG` | The layout object, a literal with `zip: true` or `zip: false` (the existing layout case gains `zip: false`) | The real build's configuration | None |
| C3 | The ZIP opt-in is refused before building unless it is complete: a zip arch list other than the dmg's; `zip` as a bare target name (no arch list), so a ZIP can never be built ungated; `mac.artifactName` missing or another pattern; `dmg.writeUpdateInfo` not `false` | #18 bullets 1 and 5; the owner's answer on `dmg.writeUpdateInfo`; the comment's "a missing setting stops the run before building" | `resolveLayout` | Four variants of `ZIP_CONFIG` | Each thrown message, which says what to write; the design | Source-derived (the schema's lack of a `zip` key; the dropped default arch) | None |
| C4 | `yamlParser`'s error keeps the original error as its cause | #18 comment, finding 2 (`preserve-caught-error`) | `yamlParser(resolve)` | A `resolve` that throws | `error.cause` is the thrown error; the rule's requirement | The existing case | None |
| C5 | The two existing cases that build a configuration without `dmg` and without `productName` | #18 comment, finding 2 (`no-unused-vars`) | `resolveLayout` | Copies of `CONFIG` with the key deleted, no unused binding | Unchanged messages | Unchanged | None |
| P1 | Local packaging with the ZIP: one builder call, then each ZIP is extracted to a temporary directory and its app checked (verify, display), never stapler-validated; the temporary directories are gone afterwards | #18 bullet 2; agentshed #235 ("both packaging profiles also produce a ZIP"); `macos-signing.md` §1 (local never notarized) | `packageMac` with the injected runner | `profile: 'local'`, `zip: true`; the fake builder writes each arch's ZIP, the fake `ditto -x -k` writes `<dest>/Demo.app/…` | The exact external command list and `result.zips`; the order is the requirement at a system boundary (`macos-signing.md` §3), the exemption for order assertions the existing cases use | The real ZIP's layout (only `Demo.app` at the top) | None |
| P2 | Release packaging with the ZIP: each extracted app must carry its stapled ticket | #18 acceptance criterion 1 (half) | `packageMac` | `profile: 'release'`, `zip: true` | `xcrun stapler validate <extracted>/Demo.app` follows each extraction; #18's list (signature, Team ID, timestamp, stapled ticket) | As P1 | None |
| P3 | A ZIP whose app lacks the stapled ticket fails the release build, while the built app itself is stapled | #18 acceptance criterion 1; mac-distribution Failure B4 | `packageMac` | The runner fails `stapler validate` only for paths inside the arm64 ZIP's extraction | The rejection carries stapler's message; the extraction directory is removed | As P1 | None |
| P4 | A ZIP whose app is signed wrongly fails: no Developer ID Application authority, another Team ID, no secure timestamp; the built app is signed correctly | #18 acceptance criterion 1; Failure B4 | `packageMac` | The runner answers `codesign --display` for the extracted arm64 app with each wrong signature | The thrown message for each; the existing signature messages, labelled for the app in the ZIP | `SIGNED_ADHOC` and the existing shapes of real `codesign --display` output | None |
| P5 | A ZIP holding more than the app fails | #18 bullet 2 ("exactly one `.app`") | `packageMac` | The fake extraction writes `Demo.app` and an extra file beside it | The thrown message names what was found | Source-derived: the `extraDistFiles` branch of `ArchiveTarget.js`, the reachable way a ZIP holds more than the app | None |
| P6 | The builder left no ZIP for an arch | #18 "missing … ZIPs fail" | `packageMac` | The fake builder skips the x64 ZIP | The thrown message with the expected path | As P1 | None |
| P7 | The ZIP is never written: after a passing release packaging its bytes and modification time are those the builder left, and the only command naming it is the extraction | #18 acceptance criterion 2, Test part | `packageMac` | A passing release packaging with the ZIP | The file's bytes (the literal the fake builder wrote) and its mtime recorded right after the build; the commands containing the ZIP's path equal exactly `ditto -x -k <zip> <dest>` | As P1 | None |
| P8 | With the ZIP, a rebuild clears this build's leftover ZIPs and every `*-mac.yml` before building; DMG-only leaves them as they are | mac-distribution Failure A3; #18 "without the ZIP opted in, the asset behaves as today" | `packageMac` | An output directory holding a stale ZIP, `latest-mac.yml` and `beta-mac.yml`, packaged with and without the ZIP | The files present when the builder starts (the existing `seenAtBuild` technique) | The real version directory's names | None |
| S1 | The artifact-set gate with the ZIP returns the DMGs and the ZIPs in config order when the one update metadata file lists exactly those ZIPs with their sha512 and size; it writes nothing | #18 bullet 4; the owner's answer (count and hashes) | `checkArtifactSet(outputDir, layout)`, which the DMG gate command calls before any submission | A temporary version directory with three DMGs, three ZIPs, their blockmaps, `builder-debug.yml` and a `latest-mac.yml` with literal hashes | The returned paths (literals) and the ZIPs' bytes afterwards | The real version directory and the real `latest-mac.yml` | None |
| S2 | A set that is not exactly this build's fails: a missing DMG (the set check keeps the DMG selection; this case was written without its row, see the post-implementation check); a missing ZIP; a ZIP under electron-builder's default name; a ZIP of another version | #18 "missing, duplicated or extra ZIPs fail"; Failure B3 | `checkArtifactSet` | The directory of S1 with one change each | Each thrown message | The default name from `ArchiveTarget.js` | None |
| S3 | Update metadata that does not vouch for these ZIPs fails: no metadata file (the message says a publish provider is needed); two of them; another version; an entry that is not one of the ZIPs (a DMG entry); a ZIP not listed; a ZIP listed twice; another sha512; another size | #18 bullet 4; the owner's answer; Failure B3 | `checkArtifactSet` | The directory of S1 with one change each; reachable because the gate command runs on whatever the version directory holds, also one the asset's packaging did not produce | Each thrown message | The real `latest-mac.yml`; two files as written with `generateUpdatesFilesForAllChannels` on a non-GitHub provider (`updateInfoBuilder.js`) | None |
| S4 | DMG-only: ZIPs and update metadata are not part of the set | #18 acceptance criterion 3 | `checkArtifactSet` | Layout without the ZIP; a stray ZIP and no metadata in the directory | Returns the DMGs and no ZIPs | As S1 | None |
| P9 | An extraction that cannot be fully removed neither fails a ZIP check that passed nor replaces the error of one that failed (row added from the code review's finding R1, before the case was written) | `macos-signing.md` §7 ("清理阶段的错误不得覆盖原始的验收错误"), applied to the ZIP's temporary extraction | `packageMac` | The fake extraction adds a read-only directory with a file inside the app, which makes the removal throw; once with a correct signature, once with no Developer ID authority | The first packaging returns its ZIPs; the second throws the signature message; source: the rule | Measured on 2026-10-19 (Node 24.19, macOS 26): `fs.rmSync` with `recursive` and `force` throws `ENOTEMPTY` on a tree holding a 0555 directory; a real electron-builder app has no such directory (0 of 311), so the state is reachable through a project's own bundle contents | None |
| M1 | The DMG gate command checks the artifact set before it runs any command (row added during the slices; see the note below) | #18 bullet 4 ("the artifact-set gate counts …") at the command's boundary; `macos-signing.md` §6 (the set fails before waiting on Apple) | `main(['notarize-dmg'], env, root)` | A project directory whose version directory has DMGs and ZIPs but no update metadata | The thrown message is the set check's; had a DMG been gated first, the real `hdiutil` would have failed on the fake DMG with another message | `ZIP_CONFIG` dumped as `electron-builder.yml`; S1's version directory | None |

Not unit-testable, stated in the test file's header: the DMG gate command's loop over the DMGs, and real `ditto`,
`codesign` and `stapler` on a real ZIP. A real release packaging run covers them (agentshed #235's manual
verification run, the deferred acceptance of #18's acceptance criterion 2).

Note on M1: the case was written during the last slice, before its row was added here, which reverses the order this
review requires. The row was added and reviewed right after, under the four dimensions below, with no finding: it
drives the public command, its state is reachable (the gate command run on a directory without metadata), and its
expected message is the set check's literal. It passed when first run because `main` was already wired, so its
ability to fail was shown by a mutation: with `main` selecting DMGs only, it failed on `hdiutil`'s "image not
recognized" message.

### Coverage

Every failure mode in scope maps to a row: mac-distribution Failure A3 → P8; B3 → S2, S3 (and the existing DMG set
cases); B4 → P3, P4. #18's criteria: 1 → P2, P3, P4 (P5, P6 for "exactly one" and "missing"); 2 → P7 and S1's
unchanged bytes, the Evidence part deferred; 3 → the existing cases, P8's DMG-only half and S4; 4 → the documentation
diff, no test. The comment → C1, C4, C5; the lint itself is verified by the lint replica, not by a test. Each row names
the input that takes execution into its branch: P3 and P4 keep the built app correct, so only the ZIP check can fail
them. Conclusion: complete for the stated scope; the two gaps above are declared.

### Case design

Each case uses its own temporary directories, removed by the existing `afterEach`; each asserts the effect it is
named for. Red flags: no module of the project is mocked (`node:test`, no module stand-ins; the runner is the
injected system-boundary seam); no private member or internal state is written; command order is asserted only for
external command sequences whose order is the requirement, the exemption the existing cases already use; no
side-channel reads replace the interface, except P7's read of the ZIP's own bytes and mtime, which is the observable
the criterion is about. Reachable states: P5 uses the reachable `extraDistFiles` layout instead of a ZIP with a
foreign app, which no build produces; S3's cases are reachable through the gate command run on its own. Conclusion:
no finding.

### False greens (the three design-time checks)

No assertion depends on a threshold. Expected values are literals: messages, paths built by the same path helpers
the existing cases use, and hashes computed by `openssl`, not by node's crypto as the implementation does. Every
assertion targets live code: the new branches of `resolveLayout` and `packageMac` and the new `checkArtifactSet`,
which the gate command calls. Conclusion: no finding; the post-implementation check adds mutations.

### Resource reuse

No expensive resource: the whole file ran in about 150 ms before this change, every fixture is a few bytes in a
temporary directory, and `js-yaml` loads in milliseconds. The existing helpers are reused and extended (`tempDir` with
its `afterEach`, `makeApps`, `buildRunner`, `pkg`, `lipo`) rather than duplicated. Conclusion: no finding.

## Post-implementation check

Date: 2026-10-19. Implementation version: the uncommitted changes on `feat/mac-packaging-zip` over 316b61f after the
code review's fix (R1), run in the scratch project with electron-builder 26.17.0, the two files byte-identical to the
worktree's. Scope: as the design review, plus P9, M1 and S2's missing-DMG case.

### Written tests against the design table

Every row checked for seam, driving input, assertion object, source of the expected value, fixture and resources:
C1–C5, P1–P9, S1–S4 and M1 match their rows. One mismatch, resolved by amending the table: S2's "a DMG is missing"
case was written in the same edit as the other S2 cases without being in the row; the row now lists it. It and M1
(written before its row) are the two cases whose design came after the code, against this review's order; P9's row
was written before its case. The test file's header states the remaining gaps (the DMG gate's loop over the DMGs,
the hook path, a real ZIP's extraction and app), matching the design review.

### Coverage

Unchanged from the design review, plus P9 (§7's rule that a clean-up error never replaces the acceptance error,
applied to the ZIP's extraction) and M1 (the set check precedes any command). Conclusion: complete for the scope.

### Case design

P9 creates its failure with a real read-only directory, not a stand-in for `fs`, and proves the precondition took
effect (the extraction is still there) before the case counts. No module of the project is mocked. Conclusion: no
finding.

### False greens

Why each case went red first, or the mutation that shows it can fail:

| Cases | First red, and its cause | Valid for the intended failure |
|---|---|---|
| C1, C3, P3–P6, S3 | "Missing expected exception": the check did not exist | Yes |
| C2, C4, P1, P2 | The `zip` key, the `cause`, the ZIPs and the stapler step were absent | Yes |
| P8 (ZIP half) | The leftovers were still there when the builder ran | Yes |
| P9 (both) | `ENOTEMPTY` failed the passing check and replaced the failing check's error | Yes |
| P7 | Green on first run (the code never wrote the ZIP) | Shown by mutation: rewriting the ZIP with its own bytes failed it at the mtime assertion; a `stapler staple` on the ZIP failed it at the command assertion (and P1, P2) |
| P8 (DMG-only half) | Green on first run (today's behaviour) | Shown by mutation Mu1, clearing the metadata without the ZIP: only this case failed |
| S1 | Red because `checkArtifactSet` did not exist, which is not the failure it is designed for | Shown by Mu2, touching the ZIPs in the set check: only S1 failed, at the mtime assertion |
| S4 | As S1 | Shown by Mu3, gating ZIPs in DMG-only mode: only S4 failed |
| S2, ZIP cases | Green on first run (the shared selection helper already covered them) | Shown by Mu4, taking the ZIPs from the expected names instead of the directory: exactly the three ZIP cases failed |
| S2, missing DMG | Green on first run | Shown by Mu5, taking every `.dmg` without the selection: it failed, and so did S1 and S4 (the order of the DMGs) |
| M1 | Green on first run (`main` already wired) | Shown by mutation, `main` selecting DMGs only: it failed on `hdiutil`'s "image not recognized" |

Every mutation was applied to the scratch copy only (exactly one textual match, confirmed by the mutation script),
attributed by the failing case's name and assertion, and undone by copying the worktree's file back; the restored
run passed 86 of 86. Conclusion: no false green found.

### Resource reuse

No expensive resource: the 86 tests in 13 suites ran in 287 ms; the largest fixtures are a few bytes in temporary
directories, and `yamlParser` resolves the cached js-yaml module. Nothing is loaded or built more than once per case.
Conclusion: no finding.
