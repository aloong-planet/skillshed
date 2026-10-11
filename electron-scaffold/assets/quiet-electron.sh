#!/bin/bash
# Make a "quiet test" copy of the Electron dist: add LSUIElement=true to Info.plist.
#
# Why change the plist rather than JS: the Dock icon is registered from the plist during Electron's **native bootstrap**,
# while app.dock.hide() only runs in main-process JS a few hundred milliseconds later — every instance "flashes, then
# disappears", and a run of e2e instances makes the Dock jitter non-stop. LSUIElement=true makes it a UIElement from the
# moment of registration (no Dock icon, no menu bar), so there is no flash window at all.
#
# Usage (after copying into the project): e2e in the playwright globalSetup, smoke inside its script — run this script
# first, then set ELECTRON_OVERRIDE_DIST_PATH (and, with electron-vite, also ELECTRON_EXEC_PATH;
# see section 2 of the electron-scaffold skill's electron-testing.md).
#
# The original is untouched: the copy lives in node_modules/.cache/electron-quiet/, and tests point to it through
# ELECTRON_OVERRIDE_DIST_PATH (natively supported by electron/index.js);
# a normal pnpm dev and the packaged app still use the original, so their Dock behaviour is unchanged.
#
# Idempotent and version-aware: when the copy's version matches the original and the plist already carries the flag → exit at once;
# rebuilt automatically after an Electron upgrade. Needed on macOS only; a no-op elsewhere.
set -euo pipefail
[ "$(uname)" = "Darwin" ] || exit 0
cd "$(dirname "$0")/.."

SRC=node_modules/electron/dist
DST=node_modules/.cache/electron-quiet/dist
PLIST="$DST/Electron.app/Contents/Info.plist"

[ -f "$SRC/version" ] || { echo "quiet-electron: $SRC/version not found (electron not installed?)" >&2; exit 1; }

# The fast-path criterion includes a completion marker, written only **after every step succeeded** — otherwise, if codesign
# failed after the plist was written, the next fast path would judge "ready" from version + plist and pass a copy with an
# invalid signature forever (arm64 cannot start it), with nobody knowing the cache needs deleting.
if [ -f "$DST/.quiet-ok" ] && [ "$(cat "$DST/version")" = "$(cat "$SRC/version")" ] \
   && /usr/libexec/PlistBuddy -c "Print :LSUIElement" "$PLIST" >/dev/null 2>&1; then
  exit 0
fi

rm -rf "$DST"
mkdir -p "$(dirname "$DST")"
# APFS copy-on-write: seconds and almost no disk; a non-APFS volume falls back to a plain copy
cp -Rc "$SRC" "$DST" 2>/dev/null || cp -R "$SRC" "$DST"

/usr/libexec/PlistBuddy -c "Add :LSUIElement bool true" "$PLIST" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Set :LSUIElement true" "$PLIST"

# Changing the plist breaks the signature seal; arm64 requires a valid (at least ad-hoc) signature, and the original is ad-hoc anyway.
# stderr is not swallowed: under set -e a failure must die with its reason, not silently leave a half-made copy
codesign --force -s - "$DST/Electron.app"

touch "$DST/.quiet-ok"   # the completion marker comes last; the fast path relies on it
echo "quiet-electron: copy ready ($(cat "$DST/version"))"
