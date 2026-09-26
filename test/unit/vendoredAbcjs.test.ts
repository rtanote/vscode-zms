import { test } from "node:test";
import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * `media/abcjs-basic-min.js` は npm パッケージ `abcjs` の
 * `dist/abcjs-basic-min.js` を**そのままコピーして同梱**したもの (vendored)。
 *
 * なぜコピーが必要か: `abcjs` は devDependency で、`vsce` は production 依存
 * しか VSIX に入れない。一方 webview は拡張バンドル内のファイルしか読めない
 * ので、ビルド済み JS を `media/` に置くしかない
 * ([sheetMusicPanel.ts](../../src/sheetMusicPanel.ts) が webview URI に変換)。
 *
 * その結果コピーが 2 つになり、**package.json だけ上げても配布物は古いまま**
 * という乖離が起きる。実際 v6.6.2 の同梱物に対して npm 側が 6.7.0 に進んで
 * いた状態を 0.1.2 時点で発見した。テストも lint も通るので気づけない。
 *
 * 更新手順:
 *   npm install --save-dev abcjs@latest
 *   cp node_modules/abcjs/dist/abcjs-basic-min.js media/abcjs-basic-min.js
 *   # THIRD_PARTY_NOTICES.md のバージョンと著作権年も合わせる
 */
const repoRoot = path.join(__dirname, "..", "..", "..");
const VENDORED = path.join(repoRoot, "media", "abcjs-basic-min.js");
const UPSTREAM = path.join(repoRoot, "node_modules", "abcjs", "dist", "abcjs-basic-min.js");

function bannerVersion(file: string): string {
  const head = fs.readFileSync(file).subarray(0, 200).toString("utf-8");
  const m = /abcjs_basic v(\d+\.\d+\.\d+)/.exec(head);
  assert.ok(m, `${path.basename(file)}: バナーからバージョンを読めない`);
  return m[1];
}

test("vendored abcjs は npm の dist と同一である", () => {
  assert.ok(
    fs.existsSync(UPSTREAM),
    "node_modules/abcjs が無い。`npm ci` (devDependencies 込み) を実行してから再実行する",
  );
  const vendored = fs.readFileSync(VENDORED);
  const upstream = fs.readFileSync(UPSTREAM);
  assert.ok(
    vendored.equals(upstream),
    `media/abcjs-basic-min.js が node_modules/abcjs の dist と一致しない\n` +
      `  同梱物 : v${bannerVersion(VENDORED)} (${vendored.length} bytes)\n` +
      `  npm 側 : v${bannerVersion(UPSTREAM)} (${upstream.length} bytes)\n` +
      `配布物にはこの同梱物が入るので、package.json だけ上げても意味がない。\n` +
      `  cp node_modules/abcjs/dist/abcjs-basic-min.js media/abcjs-basic-min.js`,
  );
});

test("THIRD_PARTY_NOTICES.md が同梱している abcjs のバージョンと一致する", () => {
  const version = bannerVersion(VENDORED);
  const notices = fs.readFileSync(path.join(repoRoot, "THIRD_PARTY_NOTICES.md"), "utf-8");
  assert.ok(
    notices.includes(`(v${version})`),
    `THIRD_PARTY_NOTICES.md の abcjs のバージョン表記が同梱物 (v${version}) と食い違っている`,
  );
});

test("vendored abcjs が実際に読み込めて renderAbc を公開している", () => {
  // grep では「文字列が在る」ことしか言えない。UMD バンドルを実際に評価して
  // API が生えているかまで見ることで、コピー漏れ・切り詰め・壊れたファイルを
  // 捕まえる。webview では ABCJS.renderAbc(id, abc, opts) の形で呼ぶ。
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const abcjs = require(VENDORED);
  assert.strictEqual(
    typeof abcjs.renderAbc,
    "function",
    "vendored abcjs が renderAbc を公開していない (sheetMusicPanel の呼び出しが壊れる)",
  );
  assert.ok(
    typeof abcjs.signature === "string" || abcjs.signature !== undefined,
    "vendored abcjs に signature が無い — バンドルが不完全な可能性",
  );
});

test("sheetMusicPanel が参照するのは vendored ファイルである", () => {
  // npm パッケージを import する形に書き換えられると、VSIX から abcjs が
  // 消えて譜面プレビューが無言で壊れる (devDependency は同梱されない)。
  const src = fs.readFileSync(path.join(repoRoot, "src", "sheetMusicPanel.ts"), "utf-8");
  assert.ok(
    src.includes('"abcjs-basic-min.js"'),
    "sheetMusicPanel.ts が media/abcjs-basic-min.js を参照していない",
  );
  assert.ok(
    !/from ['"]abcjs['"]|require\(['"]abcjs['"]\)/.test(src),
    "sheetMusicPanel.ts が npm の abcjs を import している。devDependency は VSIX に入らない",
  );
});
