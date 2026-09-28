#!/bin/bash
# Builds DeskCharm.app. Locally compiled, so no quarantine flag and no
# notarization needed — Gatekeeper only gates code that arrives from outside.
set -e
cd "$(dirname "$0")"

APP="DeskCharm.app"
rm -rf "$APP" build
mkdir -p build "$APP/Contents/MacOS" "$APP/Contents/Resources/Charms"

echo "==> Compiling"
swiftc -O -swift-version 5 \
    -framework AppKit -framework SwiftUI \
    Sources/*.swift -o build/DeskCharm

cp build/DeskCharm "$APP/Contents/MacOS/DeskCharm"

echo "==> Bundling charms"
cp Charms/hd/*.png "$APP/Contents/Resources/Charms/"

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key><string>DeskCharm</string>
    <key>CFBundleDisplayName</key><string>DeskCharm</string>
    <key>CFBundleIdentifier</key><string>local.deskcharm</string>
    <key>CFBundleExecutable</key><string>DeskCharm</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>CFBundleShortVersionString</key><string>1.0</string>
    <key>CFBundleVersion</key><string>1</string>
    <key>LSMinimumSystemVersion</key><string>14.0</string>
    <key>LSUIElement</key><true/>
    <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

echo "==> Signing (ad-hoc, local only)"
codesign --force --deep -s - "$APP" 2>/dev/null

echo "==> Built $APP"
