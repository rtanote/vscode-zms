import { test } from "node:test";
import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * `media/player/zmusic.js` は CI (build-wasm.yml) が submodule +
 * `patches/z-music.js/*.patch` から焼き直す成果物。パッチ側の変更が成果物に
 * 反映されないまま (あるいはその逆で) 片側だけ更新されると、ローカルでは
 * 直っているのに CI 再ビルド後に退行する、という見つけにくい drift になる。
 *
 * 0.1.2 で入れた「プリレンダバッファ破棄」はまさにその形の 1 行修正なので、
 * 両側に生きていることを固定する。
 *
 * バグの中身: audioprocess ハンドラは 1 バッファ (2048 frames ≒ 46ms) 先読み
 * する。`stop()` は `zmusicPlaying` を false にするだけで先読み済みチャンクを
 * 捨てないため、次の `start()` 直後の audioprocess が前回の曲の 46ms を
 * そのまま出力してしまう (初回だけ綺麗なのは初期状態が ready=false だから)。
 */
const repoRoot = path.join(__dirname, "..", "..", "..");
const FLUSH_LINE = "zmusicPrerenderBufferReady = false;";

function startFunctionBody(source: string, where: string): string {
  const at = source.indexOf("start: function () {");
  assert.notStrictEqual(at, -1, `${where}: ZMUSIC.start() not found`);
  const end = source.indexOf("\n  },", at);
  assert.notStrictEqual(end, -1, `${where}: end of ZMUSIC.start() not found`);
  return source.slice(at, end);
}

test("ZMUSIC.start() flushes the look-ahead buffer (built zmusic.js)", () => {
  const built = fs.readFileSync(path.join(repoRoot, "media", "player", "zmusic.js"), "utf-8");
  const body = startFunctionBody(built, "media/player/zmusic.js");
  assert.ok(
    body.includes(FLUSH_LINE),
    "media/player/zmusic.js: ZMUSIC.start() no longer clears the prerender buffer.\n" +
      "Playback #2 and later will replay ~46ms of the previous tune as noise.",
  );
  // start() の中では trap $08 (m_play) より前に捨てないと、
  // キーオン後のチャンクを取りこぼす可能性がある。
  assert.ok(
    body.indexOf(FLUSH_LINE) < body.indexOf("ZMUSIC.trap(0x08"),
    "media/player/zmusic.js: the flush must precede trap $08 (m_play)",
  );
});

test("ZMUSIC.start() flush survives a WASM rebuild (patch 02)", () => {
  const patch = fs.readFileSync(
    path.join(repoRoot, "patches", "z-music.js", "02-public-api-additions.patch"),
    "utf-8",
  );
  assert.ok(
    patch.includes(`+    ${FLUSH_LINE}`),
    "patches/z-music.js/02-public-api-additions.patch: the prerender flush is missing.\n" +
      "A `scripts/build-zmusic.sh` rerun would regenerate media/player/zmusic.js\n" +
      "without it and reintroduce the 0.1.2 playback-restart noise.",
  );
});
