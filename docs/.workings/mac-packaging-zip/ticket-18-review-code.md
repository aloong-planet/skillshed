# Ticket 18 — Code review

Ticket: zhoulf1006/skillshed#18 (`ticket-18`). Date: 2026-10-19. Implementation version: the uncommitted changes on
branch `feat/mac-packaging-zip` over 316b61f, as they stood after the verification gateway (86 asset tests passing
after this review's fix). Scope: `electron-scaffold/assets/mac-packaging.cjs`, its tests, and
`electron-scaffold/macos-signing.md` (preamble, §2, §3, §4, §6, §7, §9, §10).

## Underlying premises

Findings, both fixed:

- F1. Four new comments stated causes that had not been established: that the updater "installs whatever the ZIP
  holds" (the reason for the exactly-one-app check), that it "installs the app as it is" (the reason for the stapled
  check), that a bare `zip` target "builds a ZIP for the default arch only", and that `mac.artifactName` is "the only
  way" to name the ZIP. They now state only what is checked and why the requirement exists (#18's "exactly one
  `.app`"; the same checks as the DMG's app; no arch list; the rejected `zip` block).
- F2. A fixture claimed to be "as electron-builder writes them" (two metadata files, `latest` and `beta`) matched no
  output of `computeChannelNames`. It is now the three files a formal version gets with
  `generateUpdatesFilesForAllChannels` on a generic provider.

Established by measurement or by reading the installed code, on 2026-10-19:

- electron-builder 26.17.0 refuses a `zip` block: "configuration has an unknown property 'zip'" (a real build).
- A ZIP's name comes from `mac.artifactName`; the ZIP holds only `Demo.app`; a GitHub provider writes `latest-mac.yml`
  for a pre-release version; the metadata's sha512 is base64 and equals `openssl dgst -sha512 -binary | base64`;
  `dmg.writeUpdateInfo: false` removes the DMG entry and its blockmap (a real unsigned build).
- The gate's metadata check passes on that build's real version directory, and fails it once the ZIP is rewritten,
  whether its size changes (one byte appended) or not (one byte flipped).
- A real `ditto -x -k` of the real ZIP yields exactly `Demo.app`.
- `stapler` refuses a ZIP: "Stapler is incapable of working with ZIP archive files.", exit 66 (macOS 26.0.1).
- electron-updater 6.8.9 passes the metadata's `sha512` to its download, and builder-util-runtime 9.7.0 throws
  `ERR_CHECKSUM_MISMATCH` on a different hash; a differential download that fails (a missing blockmap included) falls
  back to the full download (`AppUpdater.differentialDownloadInstaller`).
- electron-builder builds the ZIP after `doPack`, which signs and runs `afterSign`, from the same `.app`
  (`macPackager.packMacTargets`); read from the source, exercised by no signed build in this round.
- `gh secret set` reads the value from standard input when `--body` is omitted (gh 2.97.0 help).

Not measured here: a signed, notarized ZIP from a real release packaging (the deferred acceptance, agentshed #235).

## Runnability

Finding, fixed:

- R1. The ZIP check removed its temporary extraction in a bare `finally`. `fs.rmSync` with `recursive` and `force`
  throws `ENOTEMPTY` on a tree that holds a read-only directory (measured, Node 24.19 on macOS 26); a real
  electron-builder bundle holds none (0 of 311 directories), but a project's own resources can. The throw then failed
  a check that had passed, or replaced the error of one that had failed. Escape surface: upper (it fails the whole
  packaging run on a cleanup problem), so it is a bug. Fixed: a failed removal is reported as a warning and changes
  neither outcome. Test P9 (both cases) was red against the old code with `ENOTEMPTY` and is green now; each case also
  asserts that the removal really failed. Class-level check of the asset's other temporary-directory clean-ups: the
  afterSign work directory (holds only the ZIP `ditto -c -k` wrote, in a directory the code created), the DMG gate's
  mount point (its clean-up error is already kept from overriding the original error), and the pre-build clears
  (outside any `finally`; a failure there must stop the build). 3 checked, 0 affected.

Other paths walked, no finding: `zipConfigured` reads `config.mac.target` only after `configuredArches` has proved it
an array with a dmg entry; `config.dmg` is read only after the `dmg.artifactName` check has proved it present; a ZIP
that `ditto` cannot extract fails the packaging with `ditto`'s error and the extraction is still removed; a metadata
entry that is null or has no `url` fails as a foreign entry before the per-ZIP loop dereferences it; malformed YAML
fails with js-yaml's error. Each ZIP failure fails the whole packaging run, as each DMG failure does: the gate is meant
to stop everything.

Upper layers re-scanned after F1, F2 and R1.

## Security

No finding. The extraction goes into a fresh `mkdtemp` directory; the ZIP comes from this build; the new log lines
print file names and the temporary path, no credential; js-yaml 4's `load` uses the default safe schema. The time
between the set check and the upload is outside the asset: the gate is the last step before the upload, and the DMG
gate does not touch the ZIPs.

## Consistency

No regression of existing invariants: the DMG messages are unchanged (`assertDmgSignature` and `selectDmgArtifacts`
wrap the new shared helpers), the DMG-only command sequence is unchanged (the existing exact-sequence case passes
unchanged), and the existing exports are kept. The new code follows the asset's style: messages that say what to
write, injected runner, real temporary directories.

Smell baseline, over the code this ticket adds or changes:

| Smell | Result |
|---|---|
| Mysterious Name | None |
| Duplicated Code | One: the ZIP check and the DMG gate's mounted-app check both run `codesign --verify --deep --strict` and `stapler validate` on an app; refactor list item 1 |
| Feature Envy, Data Clumps, Primitive Obsession | None beyond the existing `(outputDir, productName, version, arch)` naming helpers, which the new `zipFile` follows |
| Repeated Switches | None |
| Shotgun Surgery, Divergent Change | None |
| Speculative Generality | `selectByArch` has two callers (DMGs and ZIPs); not speculative |
| Message Chains, Middle Man, Refused Bequest | None |

## Refactor list (not executed; for the owner's decision)

| # | Item | Reason | Impact | Recommendation |
|---|---|---|---|---|
| 1 | Share the app checks of the ZIP check and the DMG gate's mounted app | Duplicated Code (two calls each) | Self-contained: each copy affects only its own container | Do not do: the two containers have different clean-up contracts (mount, detach, forced detach versus a temporary directory), and a shared helper would have to carry both |
