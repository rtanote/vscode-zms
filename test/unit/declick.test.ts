import { test } from "node:test";
import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * 0.1.2 のクリックノイズ対策 (サンプル領域のフェードイン / フェードアウト) の
 * 挙動テスト。
 *
 * 文字列一致で「行があること」を見るだけだと、符号ミス・off-by-one・0 除算の
 * NaN を素通ししてしまう。ここでは出荷される `media/player/zmusic.js` から
 * ランプ部分を実際に切り出して実行し、波形として正しいか (端点・単調性・
 * NaN なし) を検査する。
 *
 * 背景: 2 回目以降の再生はエミュレータが前曲を途中停止した内部状態から再開
 * するため、先頭サンプルがほぼゼロにならない。無音 (0) から 1 サンプルで
 * そこへ跳ぶ段差がプチノイズの正体。停止側も同様に波形を切り落とす。
 */
const ZMUSIC_JS = path.join(__dirname, "..", "..", "..", "media", "player", "zmusic.js");
const source = fs.readFileSync(ZMUSIC_JS, "utf-8");

function extract(startAnchor: string, endAnchor: string, what: string): string {
  const from = source.indexOf(startAnchor);
  assert.notStrictEqual(from, -1, `zmusic.js: ${what} not found — the de-click code is gone?`);
  const to = source.indexOf(endAnchor, from);
  assert.notStrictEqual(to, -1, `zmusic.js: end of ${what} not found`);
  return source.slice(from, to + endAnchor.length);
}

const BUF = 2048;
const RAMP = 176; // ≒ 4ms @44.1kHz — zmusicReady が sampleRate から算出する値

function assertClean(values: number[], what: string): void {
  for (let i = 0; i < values.length; i++) {
    assert.ok(Number.isFinite(values[i]), `${what}: sample ${i} is ${values[i]} (NaN/Infinity)`);
    assert.ok(values[i] >= 0 && values[i] <= 1, `${what}: sample ${i} out of range: ${values[i]}`);
  }
}

test("stop ramps the output down to silence (no hard cut)", () => {
  const body = extract("var zmusicEmitFadeOut = function (outputBuffer) {", "\n};", "zmusicEmitFadeOut");
  const ones = new Float32Array(BUF).fill(1);
  const out = [new Float32Array(BUF), new Float32Array(BUF)];
  const make = new Function(
    "zmusicPrerenderBuffer",
    "audioBufferSize",
    "zmusicFadeOutSamples",
    `${body} return zmusicEmitFadeOut;`,
  );
  make([ones, ones], BUF, RAMP)({ getChannelData: (c: number) => out[c] });

  const g = Array.from(out[0]);
  assertClean(g, "fade-out");
  // 直前のバッファは gain=1 で終わっているので、継ぎ目は 1 から始まらないと段差になる
  assert.strictEqual(g[0], 1, "fade-out must start at unity to stay continuous with the previous buffer");
  for (let i = 1; i < RAMP; i++) {
    assert.ok(g[i] < g[i - 1], `fade-out must decrease monotonically (broke at ${i})`);
  }
  assert.ok(g[RAMP - 1] <= 1 / RAMP + 1e-9, "fade-out must land on (near) zero");
  assert.ok(
    g.slice(RAMP).every((v) => v === 0),
    "everything past the ramp must be silence",
  );
});

test("start ramps the output up from silence (no step into the waveform)", () => {
  const body = extract(
    "    for (var i = 0; i < audioBufferSize; ++i) {\n      var g = 1;",
    "\n    }",
    "fade-in loop",
  );
  const ones = new Float32Array(BUF).fill(1);
  const dl = new Float32Array(BUF);
  const dr = new Float32Array(BUF);
  new Function(
    "audioBufferSize",
    "sl",
    "sr",
    "dl",
    "dr",
    "zmusicFadeInTotal",
    "zmusicFadeInRemaining",
    body,
  )(BUF, ones, ones, dl, dr, RAMP, RAMP);

  const g = Array.from(dl);
  assertClean(g, "fade-in");
  assert.strictEqual(g[0], 0, "fade-in must start at exactly zero");
  for (let i = 1; i <= RAMP; i++) {
    assert.ok(g[i] > g[i - 1], `fade-in must increase monotonically (broke at ${i})`);
  }
  assert.ok(
    g.slice(RAMP).every((v) => v === 1),
    "the ramp must reach unity and stay there — anything else attenuates the tune",
  );
  assert.deepStrictEqual(Array.from(dr), g, "both channels must get the same ramp");
});

test("a zero-length ramp degrades to a plain copy instead of NaN", () => {
  // zmusicFadeSamples は sampleRate から算出するので 0 にはならない想定だが、
  // 0 除算で全サンプル NaN (= 無音どころか壊れた出力) になる書き方だけは避ける。
  const body = extract(
    "    for (var i = 0; i < audioBufferSize; ++i) {\n      var g = 1;",
    "\n    }",
    "fade-in loop",
  );
  const ones = new Float32Array(8).fill(1);
  const dl = new Float32Array(8);
  const dr = new Float32Array(8);
  new Function("audioBufferSize", "sl", "sr", "dl", "dr", "zmusicFadeInTotal", "zmusicFadeInRemaining", body)(
    8, ones, ones, dl, dr, 0, 0,
  );
  assert.deepStrictEqual(Array.from(dl), new Array(8).fill(1));
});

test("de-click survives a WASM rebuild (patch 02 carries it)", () => {
  const patch = fs.readFileSync(
    path.join(__dirname, "..", "..", "..", "patches", "z-music.js", "02-public-api-additions.patch"),
    "utf-8",
  );
  for (const line of [
    "+var zmusicEmitFadeOut = function (outputBuffer) {",
    "+    zmusicFadeInRemaining = zmusicFadeSamples;",
    "+    zmusicFadeOutSamples = zmusicPrerenderBufferReady ? zmusicFadeSamples : 0;",
  ]) {
    assert.ok(
      patch.includes(line),
      `patches/z-music.js/02-public-api-additions.patch is missing:\n  ${line}\n` +
        "A `scripts/build-zmusic.sh` rerun would regenerate media/player/zmusic.js\n" +
        "without the de-click and reintroduce the 0.1.2 playback click.",
    );
  }
});
