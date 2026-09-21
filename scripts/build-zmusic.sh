#!/usr/bin/env bash
# forked z-music.js (WASM emulator) を Docker の emscripten/emsdk で再現ビルドする。
# 出力: media/player/zmusic.js + media/player/zmusic.wasm
#
# 前提:
#   - third_party/z-music.js/ を submodule として初期化済
#     (git submodule update --init --recursive)
#   - patches/z-music.js/*.patch の差分
#   - Docker が動く環境 (macOS / Linux / Windows WSL)
#
# 使い方:
#   ./scripts/build-zmusic.sh          # patch → build → copy
#   ./scripts/build-zmusic.sh --clean  # third_party を綺麗にしてから
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SUBMODULE="$REPO_ROOT/third_party/z-music.js"
PATCHES="$REPO_ROOT/patches/z-music.js"
OUT_DIR="$REPO_ROOT/media/player"
EMSDK_IMAGE="emscripten/emsdk:3.1.61"

if [[ ! -d "$SUBMODULE/.git" && ! -f "$SUBMODULE/.git" ]]; then
  echo "ERROR: $SUBMODULE is not initialized. Run:" >&2
  echo "  git submodule update --init --recursive" >&2
  exit 1
fi

# CI (or a re-run locally) may leave the submodule dirty from a prior patch.
# Reset to the recorded commit so patches apply from a known-clean base.
echo "==> Resetting submodule to pristine state"
(cd "$SUBMODULE" && git reset --hard HEAD && git clean -fdx)

if [[ "${1:-}" == "--clean" ]]; then
  echo "==> Deep clean already done above"
fi

# Upstream z-music.js Makefile / src files ship with CRLF line endings.
# Our patches are LF-only (enforced via .gitattributes on our side).
# Normalize the three touched files to LF before applying patches so that
# the diff context matches — otherwise `git apply` silently rejects with
# "patch does not apply" because context bytes differ.
echo "==> Normalizing target files to LF"
for f in Makefile src/prolog.js src/zmusic.cpp; do
  full="$SUBMODULE/$f"
  if [[ -f "$full" ]]; then
    tr -d '\r' < "$full" > "$full.tmp" && mv "$full.tmp" "$full"
  fi
done

echo "==> Applying patches from $PATCHES"
for p in "$PATCHES"/*.patch; do
  [[ -f "$p" ]] || continue
  echo "  - $(basename "$p")"
  # git apply is loud on failure — don't swallow. If it fails the whole build
  # should abort (set -e handles this).
  (cd "$SUBMODULE" && git apply "$p")
done

echo "==> Building with $EMSDK_IMAGE"
# Build only the WASM target. Upstream `make all` also builds zmusic.asm.js
# which uses the removed --memory-init-file flag; we don't need it.
docker run --rm \
  -v "$SUBMODULE":/src \
  -w /src \
  "$EMSDK_IMAGE" \
  bash -c "make clean && make zmusic.js"

mkdir -p "$OUT_DIR"
cp "$SUBMODULE/zmusic.js" "$OUT_DIR/zmusic.js"
cp "$SUBMODULE/out/zmusic.wasm" "$OUT_DIR/zmusic.wasm"

echo "==> Done. Output:"
ls -la "$OUT_DIR/zmusic.js" "$OUT_DIR/zmusic.wasm"
