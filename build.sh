#!/bin/bash
# Builds DeskCharm.app. Locally compiled, so no quarantine flag and no
# notarization needed — Gatekeeper only gates code that arrives from outside.
set -e
cd "$(dirname "$0")"

APP="DeskCharm.app"
rm -rf "$APP" build
mkdir -p build "$APP/Contents/MacOS" "$APP/Contents/Resources/Charms" "$APP/Contents/Resources/Effects"

FRAMEWORKS="-framework AppKit -framework SwiftUI -framework ScreenCaptureKit -framework AVFoundation -framework SceneKit -framework Vision -framework CoreImage"

if [ "$UNIVERSAL" = "1" ]; then
    # For sharing: one binary that runs on both Apple Silicon and Intel Macs.
    for ARCH in arm64 x86_64; do
        echo "==> Compiling ($ARCH)"
        swiftc -O -swift-version 5 -target "$ARCH-apple-macos14.0" $FRAMEWORKS \
            Sources/*.swift -o "build/DeskCharm-$ARCH"
    done
    lipo -create build/DeskCharm-arm64 build/DeskCharm-x86_64 -output build/DeskCharm
else
    echo "==> Compiling"
    swiftc -O -swift-version 5 $FRAMEWORKS Sources/*.swift -o build/DeskCharm
fi

cp build/DeskCharm "$APP/Contents/MacOS/DeskCharm"

echo "==> Bundling charms"
cp Charms/hd/*.png "$APP/Contents/Resources/Charms/"
cp Effects/*.png Effects/*.jpg Effects/*.glb "$APP/Contents/Resources/Effects/"
cp Tools/AppIcon.icns "$APP/Contents/Resources/AppIcon.icns"   # drawn by Tools/AppIcon.swift

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key><string>DeskCharm</string>
    <key>CFBundleDisplayName</key><string>DeskCharm</string>
    <key>CFBundleIdentifier</key><string>local.deskcharm</string>
    <key>CFBundleExecutable</key><string>DeskCharm</string>
    <key>CFBundleIconFile</key><string>AppIcon</string>
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
