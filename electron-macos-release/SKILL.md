---
name: electron-macos-release
description: Design, implement, diagnose, and verify direct-distribution macOS release pipelines for Electron/electron-builder apps. Use for Developer ID Application signing, hardened runtime and entitlements, signed DMG creation, Apple notarytool submission, notarization logs, stapling, Gatekeeper checks, GitHub Actions release gates, or failures such as "damaged", "unidentified developer", `no usable signature`, rejected DMGs, and missing stapled tickets.
---

# Electron macOS direct distribution

Build a fail-closed release path for Electron apps distributed outside the Mac App Store. Treat the final downloadable container and the App inside it as separate verification targets.

## Start from facts

Before changing configuration:

1. Read the installed `electron-builder` version, its actual config/schema, package scripts, hooks, and generated artifact names.
2. Read the release workflow from build through every publication or mirror job. Identify the complete intended macOS artifact set from project config; do not assume a fixed architecture count.
3. Inspect a real affected artifact when available. Test the outer DMG before mounting it, then test the App inside it.
4. Check current Apple direct-distribution guidance and current electron-builder documentation. Treat version-sensitive behavior as confirmed only when supported by the installed code/types or a real build.

For implementation or diagnosis, read [references/direct-distribution.md](references/direct-distribution.md) completely before editing.

## Select the delivery boundary

- For a directly downloaded DMG, sign nested code and the App first, create and sign the final DMG, then notarize and staple that DMG.
- For ZIP, PKG, or Mac App Store delivery, re-derive the outermost submission and verification boundary. Do not copy the DMG flow blindly.
- Do not infer that a notarized inner App makes its enclosing DMG signed, notarized, or stapled.

## Require this order

1. Sign nested code from the inside out and sign the App with hardened runtime and project-appropriate entitlements.
2. Create the final DMG and sign it with `Developer ID Application` plus a secure timestamp.
3. Before submission, verify image integrity and assert the DMG signature authority, expected Team ID, and a non-`none` timestamp.
4. Submit that exact DMG with `notarytool --wait`; require a parseable submission ID and `Accepted` status.
5. Fetch the matching notarization log; require the same job ID, accepted status, and no error-severity issues. Retain the log with CI artifacts.
6. Staple the DMG, validate the ticket, recheck image integrity, and run the container-appropriate Gatekeeper assessment.
7. Mount read-only, locate the intended App, and verify its signature independently. Always detach on success or failure without hiding the original error.
8. Publish only after every intended DMG passes. Never mutate DMG bytes after stapling.

## Make CI fail closed

- Formal releases must fail when the signing identity or any required Apple credential is absent; never silently downgrade a formal release to signed-only or unsigned output.
- Validate the full expected artifact set before publication. If any required artifact fails, publish none of that set unless the project explicitly defines partial-release semantics.
- Make downstream mirrors and `latest` pointers depend on successful platform gates and restrict them to the project’s formal-release event.
- Add a manual formal-validation mode when practical. It must exercise real signing and Apple notarization while uploading only temporary Actions artifacts—not creating a Release or changing mirrors/latest pointers.
- Keep publication conditions based on the actual event/ref, not on a shared “formal validation” boolean that can accidentally authorize publishing.

## Preserve validation integrity

- Unit-test parsing, artifact discovery, command order, failure propagation, and cleanup with an injected command runner.
- Do not describe mocked tests as real notarization. Require a real macOS runner with real credentials for end-to-end proof.
- Do not claim “notarized” from tag shape, successful packaging, `notarytool submit` alone, or inner-App checks alone.
- Download the produced artifact for release verification when feasible. Verify the outer DMG and the mounted inner App.
- Do not use `codesign --strict` as the decisive outer-DMG gate. Use `stapler validate`, `spctl --type open --context context:primary-signature`, and `hdiutil verify`; reserve deep/strict code verification for the App where appropriate.

## Coordinate with other skills

- Use `electron-scaffold` to install this release infrastructure when initializing a project.
- Use `github-ops` for commits, tags, PRs, Releases, release notes, and CI monitoring. This skill owns the technical evidence required before GitHub text may claim a DMG is notarized.
