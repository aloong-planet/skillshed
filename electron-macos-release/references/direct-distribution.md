# Electron DMG direct-distribution reference

## Contents

- [Authority and evidence](#authority-and-evidence)
- [Pipeline design](#pipeline-design)
- [Pre-submission checks](#pre-submission-checks)
- [Apple submission and audit log](#apple-submission-and-audit-log)
- [Post-staple checks](#post-staple-checks)
- [CI state model](#ci-state-model)
- [Failure modes and false signals](#failure-modes-and-false-signals)
- [Testing strategy](#testing-strategy)

## Authority and evidence

Use current primary sources before relying on remembered behavior:

- Apple: [Notarizing macOS software before distribution](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
- Apple Developer Forums: [Signing a Mac product for distribution](https://developer.apple.com/forums/thread/128166)
- electron-builder: [macOS code signing](https://www.electron.build/code-signing-mac.html)
- electron-builder: [macOS configuration](https://www.electron.build/configuration/mac.html)

Apple pages may block automated clients. If they cannot be read, say so and avoid presenting an unverified memory as a fresh documentation check.

Confirm electron-builder behavior against the installed version. Built-in notarization may operate on the App before the DMG is created; that does not establish notarization of a directly distributed outer DMG. Inspect installed code/types and the real build log before choosing hooks or a custom post-build script.

## Pipeline design

For a directly distributed DMG, model these artifacts independently:

```text
nested executables/frameworks
  -> signed Electron.app
  -> final DMG created
  -> final DMG signed
  -> that exact DMG submitted to Apple
  -> matching Accepted log retained
  -> DMG stapled
  -> outer DMG and inner App verified
  -> publication
```

Use `Developer ID Application`, not an installer identity, for an App and DMG distributed directly. Give the App hardened runtime and only the entitlements it needs. Sign from the deepest nested code outward.

Derive the intended artifact set from project configuration and naming. Validate missing, duplicate, unexpected, or cross-version artifacts before spending time on Apple submissions. Multiple architecture-specific DMGs are separate final artifacts and each needs its own submission and ticket.

## Pre-submission checks

Run on the final signed DMG:

```bash
hdiutil verify "<artifact.dmg>"
codesign --verify --verbose=4 "<artifact.dmg>"
codesign --display --verbose=4 "<artifact.dmg>"
```

Capture both stdout and stderr because Apple command-line tools commonly write diagnostic data to stderr. Parse complete fields, not loose substring matches. Require:

- an authority beginning with `Developer ID Application:`;
- `TeamIdentifier` equal to the configured team;
- a present secure `Timestamp` whose value is not `none`.

Failure here must occur before `notarytool submit`.

## Apple submission and audit log

Use either supported Apple ID credentials or an App Store Connect API key/profile, according to project policy. Never print secrets.

```bash
xcrun notarytool submit "<artifact.dmg>" \
  --wait \
  --output-format json \
  <credential options>
```

Parse JSON structurally. Require `status` equal to `Accepted` and a valid submission ID. An `Accepted` response is necessary but not the complete audit gate. Fetch the matching log before stapling:

```bash
xcrun notarytool log "<submission-id>" \
  --output-format json \
  <credential options>
```

Require the log job ID to equal the current submission ID, status to remain Accepted, and no issue whose severity is `error` (compare case-insensitively). Save the unmodified JSON as a sibling audit artifact such as `<artifact.dmg>.notary-log.json`.

On rejection, preserve the original submission failure as the primary error and attempt to fetch the log diagnostically. A secondary log-fetch failure must not overwrite the rejection.

## Post-staple checks

After an accepted log:

```bash
xcrun stapler staple "<artifact.dmg>"
xcrun stapler validate "<artifact.dmg>"
hdiutil verify "<artifact.dmg>"
spctl --assess --type open --context context:primary-signature --verbose=4 "<artifact.dmg>"
```

Do not make `codesign --strict` the decisive DMG check; it can produce a container-inappropriate failure signal. The final outer-container gates are stapler validation, Gatekeeper’s open assessment, and image integrity.

Mount to a unique temporary mount point in read-only/nobrowse mode. Require exactly the intended `.app` and verify it separately, for example:

```bash
codesign --verify --deep --strict --verbose=2 "<mount>/<Product.app>"
spctl --assess --type execute --verbose=4 "<mount>/<Product.app>"
```

Detach in a `finally` path. If normal detach fails, a force detach may be used as cleanup; cleanup errors must not replace the original validation error.

## CI state model

Keep build policy and publication authority separate:

| Event | Signing/notarization behavior | Publication behavior |
|---|---|---|
| Formal release ref | Require identity and Apple credentials; run all gates | Publish only after all gates pass; mirrors/latest may run |
| Prerelease ref | Project policy: often signed-only | GitHub prerelease only if policy allows; do not mutate formal mirrors/latest |
| Ordinary manual dispatch | Signed or unsigned diagnostic artifact per policy | Actions artifact only |
| Manual formal validation | Require real identity/credentials; run all formal gates | Actions artifact only; no Release or mirror/latest mutation |

Implement publication `if` expressions from the real event and formal tag/ref. Do not reuse a broad `IS_RELEASE` or “formal validation” flag as publication permission without also requiring the release event/ref.

Upload notarization logs with temporary CI artifacts. Publication jobs must depend on the platform jobs so a failed macOS gate cannot be bypassed by a downstream sync job.

## Failure modes and false signals

- **Inner App accepted, outer DMG rejected / `no usable signature`:** the DMG was not separately signed, submitted, stapled, or assessed.
- **`stapler validate` fails:** ticket is absent, does not match the exact bytes, or staple failed. Do not publish.
- **DMG changed after staple:** any post-staple rebuild or byte mutation invalidates the final artifact relationship. Re-sign, resubmit, and restaple the final bytes.
- **Clean tag exists:** it expresses intended policy, not proof. Check workflow conclusion and artifact evidence.
- **Packaging step is green:** it proves packaging, not Apple acceptance.
- **`notarytool submit` returns Accepted:** also validate the matching log and final stapled artifact.
- **Only App `spctl --type execute` passes:** this says nothing about Gatekeeper opening the DMG.
- **Only `codesign --display` looks plausible:** also verify the signature and enforce team/timestamp fields.
- **Some architectures pass:** default to atomic publication of the intended set; do not leak a partial release.
- **Mocked unit tests pass:** run a real credentialed macOS CI path before declaring compliance.
- **Formal credentials are absent:** fail closed; do not fall through to an unsigned branch.

## Testing strategy

Expose pure parsers and inject command execution so tests can cover:

- artifact-set discovery and version/architecture mismatches;
- signature authority, exact Team ID, and timestamp absence/`none`;
- malformed submit JSON, missing submission ID, and non-Accepted status;
- mismatched log job ID, wrong status, and error-severity issues;
- command order: preflight -> submit -> log -> staple -> final checks;
- paths containing spaces;
- mount failure, inner-App failure, normal detach, force-detach fallback, and preservation of the primary error;
- workflow conditions proving manual formal validation cannot publish or update mirrors.

Static tests of workflow text are useful regression guards but are not a substitute for parsing the workflow and running the real manual formal-validation job. A complete validation report must distinguish local mocked coverage from real Apple evidence.
