#!/bin/bash
# Installs DeskCharm from Terminal:
#
#   curl -fsSL https://<site>/install.sh | bash
#
# Fetched with curl rather than a browser, the app isn't quarantined, so it
# opens without macOS's "DeskCharm Not Opened" warning. deploy.sh fills in
# where the .dmg is; DESKCHARM_DMG overrides it.
set -euo pipefail

URL="${DESKCHARM_DMG:-__DMG_URL__}"
[ "$(uname)" = Darwin ] || { echo "DeskCharm is a Mac app."; exit 1; }

DEST=/Applications
[ -w "$DEST" ] || { DEST="$HOME/Applications"; mkdir -p "$DEST"; }

TMP="$(mktemp -d)"
MNT="$TMP/mnt"
trap 'hdiutil detach -quiet "$MNT" 2>/dev/null || true; rm -rf "$TMP"' EXIT

echo "==> Downloading DeskCharm"
curl -fL --progress-bar "$URL" -o "$TMP/DeskCharm.dmg"
hdiutil attach -quiet -nobrowse -readonly -mountpoint "$MNT" "$TMP/DeskCharm.dmg"

echo "==> Installing to $DEST"
pkill -x DeskCharm 2>/dev/null || true
rm -rf "$DEST/DeskCharm.app"
ditto "$MNT/DeskCharm.app" "$DEST/DeskCharm.app"
xattr -dr com.apple.quarantine "$DEST/DeskCharm.app" 2>/dev/null || true

open "$DEST/DeskCharm.app"
echo "==> Done. Look for ✦ in the menu bar."
