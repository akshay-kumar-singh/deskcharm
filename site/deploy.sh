#!/bin/bash
# Builds the download site into build/site: the React app in this folder plus
# the latest DeskCharm.dmg (run ../package.sh first). Upload build/site to any
# static host — Netlify, Cloudflare Pages, GitHub Pages, an S3 bucket.
#
#   SITE_URL=https://deskcharm.example.com ./site/deploy.sh
#
# SITE_URL is where the site will live; install.sh downloads the .dmg from
# there. It defaults to the local preview server.
set -e
SITE_URL="${SITE_URL:-http://localhost:8000}"
SITE_URL="${SITE_URL%/}"
cd "$(dirname "$0")/.."
[ -f DeskCharm.dmg ] || { echo "No DeskCharm.dmg — run ./package.sh first"; exit 1; }
rm -rf build/site
(
    cd site
    [ -d node_modules ] || npm ci
    npm run build -- --outDir ../build/site --emptyOutDir
)
cp DeskCharm.dmg build/site/
sed -i '' "s#__DMG_URL__#$SITE_URL/DeskCharm.dmg#" build/site/install.sh
echo "==> Site ready in build/site ($(du -sh build/site | cut -f1))"
echo "    Preview: python3 -m http.server -d build/site 8000"
echo "    Terminal install: curl -fsSL $SITE_URL/install.sh | bash"
