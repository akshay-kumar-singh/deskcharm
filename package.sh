#!/bin/bash
# Packages DeskCharm.app into DeskCharm.dmg to share with friends. Opening it
# shows the usual installer window: the app, an arrow and the Applications
# folder to drag it onto. Ad-hoc signed, not notarized, so recipients have to
# clear Gatekeeper once; the window's background says how.
#
# The first run asks to let Terminal control Finder: that's how the window
# gets laid out. The background is drawn by Tools/DMGBackground.swift.
set -e
cd "$(dirname "$0")"

UNIVERSAL=1 ./build.sh

echo "==> Packaging"
VOL="DeskCharm"
STAGE="build/share/$VOL"
RW="build/share/DeskCharm-rw.dmg"
rm -rf build/share DeskCharm.dmg
mkdir -p "$STAGE/.background"
ditto DeskCharm.app "$STAGE/DeskCharm.app"
ln -s /Applications "$STAGE/Applications"
tiffutil -cathidpicheck Tools/DMG/background.png Tools/DMG/background@2x.png \
    -out "$STAGE/.background/background.tiff" 2>/dev/null

# A writable image to lay out, mounted where Finder can see it.
[ -d "/Volumes/$VOL" ] && hdiutil detach "/Volumes/$VOL" -force -quiet
hdiutil create -quiet -srcfolder "$STAGE" -volname "$VOL" -fs HFS+ -format UDRW -ov "$RW"
hdiutil attach -quiet -noautoopen "$RW"

# Window 600 × 400 at 100, 100; icons where Tools/DMGBackground.swift drew
# the arrow between them.
osascript <<APPLESCRIPT
tell application "Finder"
    tell disk "$VOL"
        open
        set current view of container window to icon view
        set toolbar visible of container window to false
        set statusbar visible of container window to false
        set the bounds of container window to {100, 100, 700, 500}
        set opts to the icon view options of container window
        set arrangement of opts to not arranged
        set icon size of opts to 112
        set text size of opts to 13
        set background picture of opts to file ".background:background.tiff"
        set position of item "DeskCharm.app" of container window to {150, 200}
        set position of item "Applications" of container window to {450, 200}
        close
        open
        update without registering applications
        delay 1
        close
    end tell
end tell
APPLESCRIPT

sync
hdiutil detach -quiet "/Volumes/$VOL"
hdiutil convert -quiet "$RW" -format UDZO -imagekey zlib-level=9 -o DeskCharm.dmg
rm -rf build/share
echo "==> Built DeskCharm.dmg ($(du -h DeskCharm.dmg | cut -f1))"
