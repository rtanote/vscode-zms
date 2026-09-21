#!/bin/bash
# resources/icon.svg → resources/icon.png (128x128) 変換スクリプト。
# Marketplace は 128x128 PNG (透明背景でも塗り背景でも可) を要求する。
#
# 前提: rsvg-convert (librsvg) または inkscape または ImageMagick のいずれかが
# インストールされていること。以下の順序で試行:
#   1. rsvg-convert (最速・品質良好・macOS では `brew install librsvg`)
#   2. inkscape CLI  (`brew install --cask inkscape`)
#   3. magick / convert (`brew install imagemagick`)

set -euo pipefail

SRC="$(cd "$(dirname "$0")/.."; pwd)/resources/icon.svg"
DST="$(cd "$(dirname "$0")/.."; pwd)/resources/icon.png"

if [[ ! -f "$SRC" ]]; then
  echo "error: $SRC not found" >&2
  exit 1
fi

if command -v rsvg-convert >/dev/null 2>&1; then
  echo "[icon] using rsvg-convert"
  rsvg-convert -w 128 -h 128 "$SRC" -o "$DST"
elif command -v inkscape >/dev/null 2>&1; then
  echo "[icon] using inkscape"
  inkscape --export-type=png --export-width=128 --export-height=128 \
    --export-filename="$DST" "$SRC"
elif command -v magick >/dev/null 2>&1; then
  echo "[icon] using ImageMagick (magick)"
  magick -background none -density 384 "$SRC" -resize 128x128 "$DST"
elif command -v convert >/dev/null 2>&1; then
  echo "[icon] using ImageMagick (convert)"
  convert -background none -density 384 "$SRC" -resize 128x128 "$DST"
else
  cat >&2 <<EOF
error: none of rsvg-convert / inkscape / magick / convert found in PATH.
install one of:
  brew install librsvg          # smallest, recommended
  brew install --cask inkscape  # if you want a GUI too
  brew install imagemagick
EOF
  exit 1
fi

echo "[icon] wrote $DST"
file "$DST"
