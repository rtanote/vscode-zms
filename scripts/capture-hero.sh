#!/bin/bash
# docs/screenshots/hero-template.html → docs/screenshots/hero.png (1280x720)
# 4 枚のスクショが揃った後に走らせて Marketplace 用ヒーロー画像を焼く。
#
# 前提: Chrome / Chromium がインストールされていること
# (headless + 開発者ツールでスクリーンショット機能を使う)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.."; pwd)"
SRC="$ROOT/docs/screenshots/hero-template.html"
DST="$ROOT/docs/screenshots/hero.png"

if [[ ! -f "$SRC" ]]; then
  echo "error: $SRC not found" >&2
  exit 1
fi

# macOS の Google Chrome を探す
CHROME=""
if [[ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]]; then
  CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
elif command -v google-chrome >/dev/null 2>&1; then
  CHROME="$(command -v google-chrome)"
elif command -v chromium >/dev/null 2>&1; then
  CHROME="$(command -v chromium)"
else
  cat >&2 <<EOF
error: Google Chrome / Chromium not found.
  brew install --cask google-chrome
または既にあれば PATH に通してください。
EOF
  exit 1
fi

echo "[hero] using $CHROME"
"$CHROME" \
  --headless=new \
  --disable-gpu \
  --window-size=1280,720 \
  --hide-scrollbars \
  --screenshot="$DST" \
  "file://$SRC"

echo "[hero] wrote $DST"
file "$DST" 2>/dev/null || ls -la "$DST"
